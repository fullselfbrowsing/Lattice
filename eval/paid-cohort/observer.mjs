import { createHash } from "node:crypto";
import { BudgetExceeded, requestBound, standardUsageCost, promptOverheadTokens } from "./budget.mjs";

/** A call billed above this multiple of its usage at standard prices was served by an opt-in tier. */
export const TIER_TOLERANCE = 1.5;

const sha = (value) => createHash("sha256").update(value).digest("hex");

export const TESTED_MODELS = ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol", "google/gemini-4-carbon"];
export const JUDGE_MODELS = ["x-ai/grok-4.7", "qwen/qwen3.8-max-0902"];
export const ALLOWED_MODELS = [...TESTED_MODELS, ...JUDGE_MODELS];
export const MAX_OUTPUT_TOKENS = 4096;
export const FORBIDDEN_KEYS = ["models", "route", "provider", "plugins", "preset", "service_tier", "web_search_options"];

/** Same extraction as the SDK's openAIMessageText: strings as is, arrays of parts joined by their text. */
export function messageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.flatMap((part) => part && typeof part === "object" && typeof part.text === "string" ? [part.text] : []).join("");
  return "";
}

/** Usage the request could not legitimately produce: halt the whole cohort. */
export function usageAnomaly(call, maxTokens, promptTokenBound) {
  if (typeof call.completionTokens === "number" && call.completionTokens > 1.25 * maxTokens + 32)
    return `Anomaly: completion_tokens ${call.completionTokens} exceeds 1.25 x max_tokens ${maxTokens} + 32; cohort halted.`;
  if (typeof call.promptTokens === "number" && call.promptTokens > promptTokenBound)
    return `Anomaly: prompt_tokens ${call.promptTokens} exceeds the request token bound ${promptTokenBound}; cohort halted.`;
  return null;
}

/**
 * Observe exact submissions and reserve cost before network egress. Exactly one HTTP
 * attempt is made per request: 429 and 5xx are measured outcomes, never retried.
 */
export function createPaidObserver({ BASE, MODELS = ALLOWED_MODELS, endpointCatalog, budget, getActive, getStopped, setStopped,
  scrub = String, fetch = globalThis.fetch, breaker = null, timeoutMs = 120000 }) {
  if (MODELS.some((m) => !ALLOWED_MODELS.includes(m))) throw new Error("Model outside the paid-cohort allowlist.");
  return async function observedFetch(url, init = {}) {
    if (getStopped()) throw new BudgetExceeded(getStopped());
    const active = getActive();
    if (String(url) !== BASE + "/chat/completions") throw new Error("Unexpected inference endpoint.");
    if (active.expectedBody && init.body !== active.expectedBody) throw new Error("Matched request bodies differ before egress.");
    active.requestBodies?.push(init.body);
    const bodyHash = sha(init.body);
    const duplicate = active.preparedBodies.includes(bodyHash);
    active.preparedBodies.push(bodyHash);
    active.lastBody = init.body;
    const body = JSON.parse(init.body);
    if (duplicate) throw new Error("An identical request was already attempted in this run; retries are not permitted.");
    const maximum = body.max_tokens ?? body.max_completion_tokens;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_OUTPUT_TOKENS) throw new Error("Every inference call needs a bounded token cap of at most " + MAX_OUTPUT_TOKENS + ".");
    if (!MODELS.includes(body.model)) throw new Error("Unpriced or unlisted model.");
    if (FORBIDDEN_KEYS.some((key) => key in body)) throw new Error("Routing or server-side extension fields are forbidden.");
    if (body.tools?.some((tool) => tool.type !== "function")) throw new Error("Server-side tools are forbidden.");
    const endpoints = endpointCatalog[body.model];
    const bound = requestBound(init.body, endpoints, maximum);
    const imageParts = (body.messages ?? []).flatMap((m) => Array.isArray(m.content) ? m.content : []).filter((p) => p.type === "image_url").length;
    // Same input-token ceiling the reservation uses: a byte is never fewer than one token.
    const promptTokenBound = Buffer.byteLength(init.body) + 1000 * imageParts + promptOverheadTokens(body.model);
    let reservation;
    try { reservation = budget.reserve(body.model, bound); }
    catch (error) { setStopped(error.message); throw error; }
    const started = performance.now();
    let response;
    let bytes;
    try {
      const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      response = await fetch(url, { ...init, signal });
      bytes = await response.arrayBuffer();
    } catch (error) {
      const detail = scrub(error?.message ?? "unknown transport error").slice(0, 200);
      active.calls.push({ bodyHash, model: body.model, status: null, httpMs: performance.now() - started, costUsd: null,
        attempt: 0, maxTokens: maximum, reservedUsd: bound, transportError: detail });
      setStopped("Provider transport failed; evaluation halted and reservation retained: " + detail);
      throw new Error(getStopped());
    }
    let parsed;
    try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { parsed = null; }
    const actualCost = parsed?.usage?.cost;
    const call = {
      bodyHash, model: body.model, status: response.status, httpMs: performance.now() - started,
      costUsd: typeof actualCost === "number" ? actualCost : null,
      promptTokens: parsed?.usage?.prompt_tokens ?? null, completionTokens: parsed?.usage?.completion_tokens ?? null,
      reasoningTokens: parsed?.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      provider: parsed?.provider ?? null, observedModel: parsed?.model ?? null, generationId: parsed?.id ?? null,
      finishReason: parsed?.choices?.[0]?.finish_reason ?? null, attempt: 0,
      maxTokens: maximum, reservedUsd: bound,
      errorCode: parsed?.error?.code ?? null, errorMessage: parsed?.error?.message ? scrub(parsed.error.message).slice(0, 200) : null,
      retryAfter: response.headers.get("retry-after"),
      imageParts, promptTokenBound,
    };
    active.calls.push(call);
    active.lastOutput = messageText(parsed?.choices?.[0]?.message);
    try { budget.settle(reservation, call.costUsd); }
    catch (error) { setStopped(error.message); throw error; }
    const anomaly = usageAnomaly(call, maximum, promptTokenBound);
    if (anomaly) { budget.halt?.(anomaly); setStopped(anomaly); }
    // Admission assumed standard-tier prices; a call billed well above them pauses the stage.
    const standardCost = standardUsageCost(call, endpoints);
    call.standardCostUsd = standardCost;
    if (standardCost !== null && call.costUsd !== null && call.costUsd > TIER_TOLERANCE * standardCost + 0.000001) {
      setStopped("Billed $" + call.costUsd + " against $" + standardCost.toFixed(6) + " at standard prices; an opt-in service tier may have served it. Stage paused for inspection.");
    }
    if ([401, 402, 403].includes(response.status)) setStopped("Provider refused the request with HTTP " + response.status);
    if (breaker?.record(call.costUsd)) setStopped(breaker.reason);
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
