// Request builders shared by the live stages and the parity test. No network, no side effects.
import * as L from "../../packages/lattice/dist/index.js";
import { BASE, CAPS } from "./common.mjs";

const schema = (validate) => ({ "~standard": { version: 1, vendor: "lattice-eval", validate } });
export const generation = (cap) => ({ temperature: 0, maxOutputTokens: cap });
export const intent = (task, artifacts, cap) => ({ task, artifacts, outputs: { answer: "text" }, generation: generation(cap) });

export function parseCited(text, ids) {
  let value;
  try { value = JSON.parse(text); } catch { return { valid: false, reason: "invalid-json" }; }
  const valid = typeof value?.answer === "string" && Array.isArray(value.citations) && value.citations.length > 0
    && value.citations.every((item) => typeof item?.source === "string" && ids.includes(item.source))
    && value.citations.every((item) => value.answer.includes("[" + item.source + "]"));
  return { valid, value, reason: valid ? null : "unresolved-or-unused-citation" };
}

/** Prepare the exact body a request would send, without any network. */
export async function captureBody(model, request, id = undefined) {
  let captured;
  const provider = L.createOpenAICompatibleProvider({ ...(id ? { id } : {}), model, baseUrl: BASE, fetch: async (_url, init) => {
    captured = init.body;
    return new Response(JSON.stringify({ choices: [{ message: { content: "pong" } }] }), { headers: { "content-type": "application/json" } });
  } });
  await L.createAI({ providers: [provider] }).run(request);
  if (!captured) throw new Error("Could not prepare direct comparison request.");
  return captured;
}

export function citationRequest(row) {
  const ids = row.docs.map((doc) => doc.id);
  const task = "Answer using only the supplied passages. Return exactly one JSON object, with no markdown fences or surrounding text. Use this shape: {\"answer\":\"A concise answer with [sN] citations after each factual statement.\",\"citations\":[{\"source\":\"sN\"}]}. Use the key source, never id. Escape quotes only once as required by JSON. If the passages cannot answer, state that explicitly; never invent evidence. Question: " + row.question;
  const request = intent(task, row.docs.map((doc) => L.artifact.text(doc.title + "\n" + doc.text, { id: doc.id, label: doc.id })), CAPS.B);
  const validator = schema((value) => parseCited(String(value), ids).valid ? { value } : { issues: [{ message: "Return valid JSON with resolvable, used citation IDs." }] });
  return { ids, request: { ...request, contract: L.contract({ invariants: [L.inv.matches("answer", validator)] }) } };
}
