import { createHash } from "node:crypto";
import * as L from "../../packages/lattice/dist/index.js";
import { fingerprintArtifactValue } from "../../packages/lattice/dist/storage.js";
import { PROTOCOL, taskFor } from "./cases.mjs";
export const sha = (v) => createHash("sha256").update(v).digest("hex");
export const jsonHash = (v) => sha(JSON.stringify(v));
const valueHash = async (v) => (await fingerprintArtifactValue(v))?.value ?? null;

export function parseReview(text, example) {
  let value;
  try { value = JSON.parse(text); } catch { return { valid: false, reason: "invalid-json" }; }
  const ids = new Set(example.artifacts.map((a) => a.source_id));
  const valid = value?.case_id === example.id && value.currency === example.currency
    && value.execution_authority === "review_only" && typeof value.review_note === "string"
    && value.review_note.trim().length > 0 && value.answers && typeof value.answers === "object"
    && Object.keys(value.answers).length === example.questions.length
    && example.questions.every((q) => {
      const a = value.answers[q.id];
      return a && (a.value === null || (q.type === "integer" ? Number.isSafeInteger(a.value) : typeof a.value === q.type))
        && Array.isArray(a.source_ids) && a.source_ids.length > 0 && a.source_ids.every((id) => ids.has(id));
    });
  return { valid: !!valid, reason: valid ? null : "invalid-fields-or-source-ids", value };
}
export function gradeReview(text, example) {
  const parsed = parseReview(text, example);
  if (!parsed.valid) return { format: false, facts: false, citations: false, strict: false, answers: [], reason: parsed.reason };
  const answers = example.questions.map((q) => {
    const answer = parsed.value.answers[q.id];
    return { id: q.id, value: answer.value, sources: answer.source_ids,
      fact: answer.value === q.expected,
      citation: q.acceptablePages.some((p) => answer.source_ids.includes(example.id + "-p" + p)) };
  });
  const facts = answers.every((a) => a.fact), citations = answers.every((a) => a.citation);
  return { format: true, facts, citations, strict: facts && citations, answers, reason: null };
}
export function makeIntent(example) {
  const schema = { "~standard": { version: 1, vendor: "public-refund-review", validate(value) {
    return parseReview(value, example).valid ? { value } : { issues: [{ message: "Invalid review JSON or page references." }] };
  } } };
  return { task: taskFor(example), artifacts: example.artifacts.map((a) => L.artifact.json(a, { id: a.source_id })),
    outputs: { answer: "text" }, generation: PROTOCOL.generation, policy: PROTOCOL.executionPolicy,
    contract: { invariants: [L.inv.matches("answer", schema)] } };
}
export async function verifyBundle(bundle, keys, example) {
  if (!bundle.receipt) return { signature: false, evidenceOkay: false, problems: ["receipt-missing"] };
  const signature = await L.verifyReceipt(bundle.receipt, keys);
  if (!signature.ok) return { signature: false, evidenceOkay: false, problems: [signature.error.kind] };
  const body = signature.body, problems = [];
  const intent = makeIntent(example);
  if (bundle.caseId !== example.id) problems.push("case-mismatch");
  if (bundle.artifacts?.length !== example.artifacts.length || body.inputHashes.length !== example.artifacts.length) problems.push("page-count-mismatch");
  for (const [i, expected] of example.artifacts.entries()) {
    const actual = bundle.artifacts?.[i];
    if (!actual) { problems.push("page-missing:" + i); continue; }
    if (jsonHash(actual) !== jsonHash(expected)) problems.push("unexpected-page:" + i);
    if (await valueHash(actual) !== body.inputHashes[i]) problems.push("page-hash-mismatch:" + i);
  }
  const requests = bundle.requestBodies ?? [];
  if (requests.length !== 1) problems.push("request-count");
  for (const request of requests) {
    let content;
    try { content = JSON.parse(request).messages.flatMap((m) => Array.isArray(m.content) ? m.content : []).map((p) => {
      try { return JSON.parse(p.text)?.value; } catch { return null; }
    }); } catch { problems.push("invalid-request-json"); continue; }
    for (const page of example.artifacts) if (!content.some((v) => v && jsonHash(v) === jsonHash(page))) problems.push("page-not-in-request:" + page.source_id);
  }
  const opts = { expectedTaskHash: await L.hashCanonicalForReceipt(intent.task),
    expectedPolicyHash: await L.hashCanonicalForReceipt(intent.policy),
    ...(requests.length ? { expectedProviderRequestHashes: requests.map(sha) } : {}) };
  const bound = await L.verifyReceipt(bundle.receipt, keys, opts);
  if (!bound.ok) problems.push(bound.error.kind);
  if (bundle.task !== intent.task || jsonHash(bundle.executionPolicy) !== jsonHash(intent.policy)) problems.push("input-binding-mismatch");
  const outputBound = body.outputHash !== null && body.contractVerdict === "success";
  if (outputBound && await valueHash(bundle.outputs) !== body.outputHash) problems.push("output-hash-mismatch");
  if (!outputBound) problems.push("no-successful-output");
  return { signature: true, taskBound: body.taskHash === opts.expectedTaskHash,
    policyBound: body.policyHash === opts.expectedPolicyHash, requestBound: bound.ok && requests.length === 1,
    outputBound, evidenceOkay: problems.length === 0, problems };
}
export async function integrityControls(bundle, keys, example) {
  const original = await verifyBundle(bundle, keys, example);
  const rows = [{ name: "intact-control", passed: original.evidenceOkay, observed: original }];
  for (const [name, mutate] of [
    ["changed-page", (b) => { b.artifacts[0].text += " altered"; }],
    ["missing-page", (b) => { b.artifacts.pop(); }],
    ["changed-output", (b) => { b.outputs.answer += " altered"; }],
    ["changed-request", (b) => { b.requestBodies[0] += " "; }],
    ["changed-task", (b) => { b.task += " altered"; }],
    ["wrong-case", (b) => { b.caseId = "another-case"; }],
    ["missing-receipt", (b) => { b.receipt = null; }],
    ["forged-signature", (b) => { const x = Buffer.from(b.receipt.signatures[0].sig, "base64"); x[0] ^= 1; b.receipt.signatures[0].sig = x.toString("base64"); }],
  ]) {
    const changed = structuredClone(bundle); mutate(changed);
    const observed = await verifyBundle(changed, keys, example);
    rows.push({ name, passed: !observed.evidenceOkay, observed });
  }
  const untrusted = await verifyBundle(bundle, L.createMemoryKeySet([]), example);
  rows.push({ name: "untrusted-key", passed: !untrusted.signature, observed: untrusted });
  return rows;
}
