import { createHash } from "node:crypto";
import { BudgetExceeded, requestCostBound } from "./budget.mjs";
import { assertFreeRequest } from "./free-eval.mjs";
const sha = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Observe exact submissions and reserve cost before network egress. */
export function createObservedFetch({ BASE, MODELS, modelCatalog, endpointCatalog, budget,
  getActive, getStopped, setStopped, scrub = String, fetch = globalThis.fetch, freeOnly = false }) {
return async function observedFetch(url, init = {}) {
  if (getStopped()) throw new BudgetExceeded(getStopped());
  const active = getActive();
  if (String(url) !== BASE + "/chat/completions") throw new Error("Unexpected inference endpoint.");
  if (active.expectedBody && init.body !== active.expectedBody) throw new Error("Matched request bodies differ before egress.");
  active.preparedBodies.push(sha(init.body));
  active.lastBody = init.body;
  const body = JSON.parse(init.body);
  const maximum = body.max_tokens ?? body.max_completion_tokens;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > (freeOnly ? 4096 : 1024)) throw new Error("Every inference call needs a bounded token cap.");
  if (!MODELS.includes(body.model) || body.tools?.some((tool) => tool.type !== "function")) throw new Error("Unpriced model or server-side tool.");
  if (body.plugins || body.web_search_options) throw new Error("Unpriced server-side extension.");
  const model = modelCatalog.get(body.model);
  if (freeOnly) assertFreeRequest(body, model, endpointCatalog[body.model]);
  const bound = requestCostBound(model, endpointCatalog[body.model], maximum);
  const attempts = freeOnly ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (getStopped()) throw new BudgetExceeded(getStopped());
    if (freeOnly) {
      const before = performance.now();
      await budget.pace();
      active.pacingMs = (active.pacingMs ?? 0) + performance.now() - before;
    }
    let reservation;
    try { reservation = budget.reserve(body.model, bound); }
    catch (error) { setStopped(error.message); throw error; }
    const started = performance.now();
    let response;
    let bytes;
    try {
      response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000) });
      bytes = await response.arrayBuffer();
    } catch (error) {
      const detail = scrub(error?.message ?? "unknown transport error").slice(0, 200);
      active.calls.push({ bodyHash: sha(init.body), model: body.model, status: null, httpMs: performance.now() - started, costUsd: null, attempt, transportError: detail });
      setStopped("Provider transport failed; evaluation halted and reservation retained: " + detail);
      throw new Error(getStopped());
    }
    let parsed;
    try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { parsed = null; }
    const actualCost = parsed?.usage?.cost;
    const call = {
      bodyHash: sha(init.body), model: body.model, status: response.status,
      httpMs: performance.now() - started, costUsd: typeof actualCost === "number" ? actualCost : null,
      promptTokens: parsed?.usage?.prompt_tokens ?? null, completionTokens: parsed?.usage?.completion_tokens ?? null,
      ...(freeOnly ? { reasoningTokens: parsed?.usage?.completion_tokens_details?.reasoning_tokens ?? null } : {}),
      provider: parsed?.provider ?? null, observedModel: parsed?.model ?? null, generationId: parsed?.id ?? null,
      finishReason: parsed?.choices?.[0]?.finish_reason ?? null, attempt,
      errorCode: parsed?.error?.code ?? null, errorMessage: parsed?.error?.message ? scrub(parsed.error.message).slice(0, 200) : null,
      retryAfter: response.headers.get("retry-after"),
      imageParts: (body.messages ?? []).flatMap((m) => Array.isArray(m.content) ? m.content : []).filter((p) => p.type === "image_url").length,
    };
    active.calls.push(call);
    active.lastBody = init.body;
    active.lastOutput = parsed?.choices?.[0]?.message?.content ?? "";
    try { budget.settle(reservation, call.costUsd); }
    catch (error) { setStopped(error.message); throw error; }
    if ([401, 402, 403].includes(response.status)) {
      setStopped("Provider refused the request with HTTP " + response.status);
    }
    if (freeOnly && response.status === 429 && /free-models-per-day|daily|per day/i.test(call.errorMessage ?? "")) {
      setStopped("Free daily quota reached; no paid fallback attempted.");
    }
    if ((response.status === 429 || response.status >= 500) && attempt + 1 < attempts && !getStopped()) {
      const retryAfter = response.headers.get("retry-after");
      const requested = retryAfter === null ? 10000 : /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
      // A long server wait is returned as a measured failure, never retried early.
      if (requested > 60000) return new Response(bytes, { status: response.status, headers: response.headers });
      const delay = Number.isFinite(requested) ? Math.max(1000, requested) : 10000;
      const before = performance.now();
      await sleep(delay);
      active.backoffMs += performance.now() - before;
      continue;
    }
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  throw new Error("Provider retry exhausted.");
}

}
