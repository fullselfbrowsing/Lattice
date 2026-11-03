import { createHash } from "node:crypto";
import * as L from "../../packages/lattice/dist/index.js";
import { fingerprintArtifactValue } from "../../packages/lattice/dist/storage.js";
import { PROTOCOL, taskFor } from "./fixtures.mjs";

export const sha = (value) => createHash("sha256").update(value).digest("hex");
export const jsonHash = (value) => sha(JSON.stringify(value));
export const valueHash = async (value) => (await fingerprintArtifactValue(value))?.value ?? null;

export function parseRecommendation(text, example) {
  let value;
  try { value = JSON.parse(text); } catch { return { valid: false, reason: "invalid-json" }; }
  const ids = example.artifacts.map((x) => x.source_id);
  const valid = value && typeof value === "object" && value.case_id === example.id
    && ["approve", "deny", "escalate", "request_evidence"].includes(value.action)
    && Number.isSafeInteger(value.amount_usd) && value.amount_usd >= 0
    && ["employee", "manager", "none"].includes(value.authority) && typeof value.conflict === "boolean"
    && typeof value.reason === "string" && value.reason.trim().length > 0
    && Array.isArray(value.rule_ids) && value.rule_ids.length > 0 && value.rule_ids.every((x) => /^R[1-7]$/.test(x))
    && Array.isArray(value.sources) && value.sources.length > 0 && value.sources.every((x) => ids.includes(x));
  return { valid: !!valid, value, reason: valid ? null : "invalid-fields-or-source-ids" };
}

export function gradeRecommendation(text, example) {
  const parsed = parseRecommendation(text, example);
  if (!parsed.valid) return { format: false, strict: false, reason: parsed.reason };
  const v = parsed.value, e = example.expected;
  const fields = Object.fromEntries(["action", "amount_usd", "authority", "conflict"].map((k) => [k, v[k] === e[k]]));
  fields.rule = v.rule_ids.includes(e.rule);
  fields.requiredSources = e.sources.every((id) => v.sources.includes(id));
  return { format: true, strict: Object.values(fields).every(Boolean), fields,
    reason: null, predicted: v };
}

export function makeIntent(example) {
  const schema = { "~standard": { version: 1, vendor: "refund-demo-format",
    validate(value) { return parseRecommendation(value, example).valid ? { value }
      : { issues: [{ message: "Expected refund recommendation JSON with valid fields and source IDs." }] }; } } };
  return { task: taskFor(example), artifacts: example.artifacts.map((v) => L.artifact.json(v, { id: v.source_id })),
    outputs: { answer: "text" }, generation: PROTOCOL.generation, policy: PROTOCOL.executionPolicy,
    contract: L.contract({ invariants: [L.inv.matches("answer", schema, { id: "refund-format" })] }) };
}

/** Application rules deliberately do not read the evaluation's expected labels. */
export function businessDecision(artifacts, caseId) {
  const get = (id) => artifacts.find((a) => a.source_id === id);
  const b = get("booking"), p = get("policy"), r = get("request"), m = get("company-message");
  const decision = (action, amount, authority, conflict, rule) => ({ action, amount_usd: amount, authority, conflict, rule });
  if (!b || !p || !r || [b, p, r].some((x) => x.case_id !== caseId)
      || b.booking_id !== r.booking_id || !b.cancelled_at || !b.departure_at
      || !Number.isFinite(Date.parse(b.cancelled_at)) || !Number.isFinite(Date.parse(b.departure_at))
      || p.version !== "synthetic-refund-1" || b.booked_at.slice(0, 10) < p.effectiveFrom
      || b.booked_at.slice(0, 10) > p.effectiveUntil) return decision("request_evidence", 0, "none", false, "R4");
  if (b.refunded_usd > 0) return decision("deny", 0, "employee", false, "R6");
  if (b.fare === "basic" && m?.kind === "refund-promise" && m.channel === "company-support"
      && m.case_id === caseId && m.booking_id === b.booking_id) return decision("escalate", 0, "manager", true, "R3");
  if (b.fare === "flexible" && !b.used && Date.parse(b.cancelled_at) < Date.parse(b.departure_at)) {
    return b.paid_usd <= 200 ? decision("approve", b.paid_usd, "employee", false, "R1")
      : decision("escalate", 0, "manager", false, "R5");
  }
  return decision("deny", 0, "employee", false, "R2");
}

/** Simulated approvals and payment ledger. This is not a real identity or payment service. */
export function applicationWorkflow(example, text, evidenceOkay, approval = example.approval) {
  const events = [{ kind: "intake-fixture", caseId: example.id }];
  const blocked = (reason) => ({ status: "held", reason, paidUsd: 0, events });
  if (!evidenceOkay) return blocked("missing-or-invalid-run-evidence");
  const parsed = parseRecommendation(text, example);
  if (!parsed.valid) return blocked("invalid-recommendation");
  const safe = businessDecision(example.artifacts, example.id), v = parsed.value;
  events.push({ kind: "application-rule-check", decision: safe });
  if (["action", "amount_usd", "authority", "conflict"].some((k) => safe[k] !== v[k])) return blocked("recommendation-disagrees-with-business-rules");
  if (safe.action === "request_evidence") return { status: "evidence-requested", paidUsd: 0, events };
  if (safe.action === "deny") {
    events.push({ kind: "employee-review-fixture", decision: "deny", role: "employee" });
    return { status: "denied", paidUsd: 0, events };
  }
  events.push({ kind: "review-requested", role: safe.authority });
  const booking = example.artifacts.find((a) => a.source_id === "booking");
  if (!approval || approval.role !== safe.authority || !Number.isSafeInteger(approval.amount_usd)
      || approval.amount_usd <= 0 || approval.amount_usd > booking.paid_usd
      || approval.amount_usd > (approval.role === "employee" ? 200 : 300)
      || (safe.action === "approve" && approval.amount_usd !== v.amount_usd)) return blocked("missing-or-insufficient-approval");
  const approvalEvent = { kind: "human-approval-fixture", actor: "synthetic-" + approval.role,
    caseId: example.id, recommendationTextHash: sha(text),
    role: approval.role, amountUsd: approval.amount_usd,
    reason: safe.conflict ? "Discretionary service recovery after conflicting company advice" : "Eligible refund within delegated authority" };
  events.push(approvalEvent);
  let paidUsd = booking.refunded_usd;
  const pay = () => {
    if (paidUsd > 0) return "duplicate-blocked";
    paidUsd = approval.amount_usd;
    events.push({ kind: "payment-fixture", caseId: example.id, approvalHash: jsonHash(approvalEvent),
      amountUsd: paidUsd, status: "simulated-settlement" });
    return "simulated-paid";
  };
  const status = pay(), duplicateAttempt = pay();
  return { status, paidUsd: status === "simulated-paid" ? paidUsd : 0, duplicateAttempt, events };
}

/** Completeness/link checks for simulated external records; not proof of a real person's authority. */
export function verifyApplicationRecord(bundle) {
  const a = bundle.application, problems = [];
  if (!a || !Array.isArray(a.events)) return { complete: false, problems: ["application-record-missing"] };
  if (a.status === "simulated-paid") {
    const approvals = a.events.filter((e) => e.kind === "human-approval-fixture");
    const payments = a.events.filter((e) => e.kind === "payment-fixture");
    if (approvals.length !== 1) problems.push("approval-record-missing-or-duplicated");
    if (payments.length !== 1) problems.push("payment-record-missing-or-duplicated");
    const approval = approvals[0], payment = payments[0];
    if (approval && (approval.caseId !== bundle.caseId || approval.recommendationTextHash !== sha(bundle.outputs?.answer ?? ""))) problems.push("approval-link-mismatch");
    if (approval && (!["employee", "manager"].includes(approval.role) || approval.amountUsd > (approval.role === "employee" ? 200 : 300))) problems.push("approval-authority-mismatch");
    if (payment && approval && (payment.caseId !== bundle.caseId || payment.approvalHash !== jsonHash(approval)
        || payment.amountUsd !== approval.amountUsd || payment.amountUsd !== a.paidUsd)) problems.push("payment-link-mismatch");
    if (a.duplicateAttempt !== "duplicate-blocked") problems.push("duplicate-protection-missing");
  } else if (a.paidUsd !== 0 || a.events.some((e) => e.kind === "payment-fixture")) problems.push("unexpected-payment");
  if (a.status === "denied" && !a.events.some((e) => e.kind === "employee-review-fixture")) problems.push("denial-review-missing");
  return { complete: problems.length === 0, problems };
}

/** Checks retained bytes and caller-supplied expected case independently of signed assertions. */
export async function verifyBundle(bundle, trustedKeys, expectedCase) {
  if (!bundle.receipt) return { signature: false, complete: false, evidenceOkay: false, problems: ["receipt-missing"] };
  const signature = await L.verifyReceipt(bundle.receipt, trustedKeys);
  if (!signature.ok) return { signature: false, complete: false, evidenceOkay: false, problems: [signature.error.kind] };
  const problems = [], body = signature.body;
  const expectedIntent = makeIntent(expectedCase);
  if (bundle.caseId !== expectedCase.id) problems.push("case-mismatch");
  if (!Array.isArray(bundle.artifacts) || bundle.artifacts.length !== expectedCase.artifacts.length) problems.push("artifact-count-mismatch");
  for (let i = 0; i < expectedCase.artifacts.length; i++) {
    const actual = bundle.artifacts?.[i];
    if (!actual) { problems.push("artifact-missing:" + i); continue; }
    const digest = await valueHash(actual);
    if (!digest || body.inputHashes[i] !== digest) problems.push("artifact-hash-mismatch:" + i);
    if (JSON.stringify(actual) !== JSON.stringify(expectedCase.artifacts[i])) problems.push("unexpected-artifact:" + i);
  }
  if (body.inputHashes.length !== expectedCase.artifacts.length) problems.push("input-hash-count-mismatch");
  const requests = bundle.requestBodies ?? [];
  if (requests.length !== 1) problems.push("request-evidence-count");
  const opts = { expectedTaskHash: await L.hashCanonicalForReceipt(expectedIntent.task),
    expectedPolicyHash: await L.hashCanonicalForReceipt(expectedIntent.policy),
    ...(requests.length ? { expectedProviderRequestHashes: requests.map(sha) } : {}) };
  const bound = await L.verifyReceipt(bundle.receipt, trustedKeys, opts);
  if (!bound.ok) problems.push(bound.error.kind);
  if (bundle.task !== expectedIntent.task || jsonHash(bundle.executionPolicy) !== jsonHash(expectedIntent.policy)) problems.push("sidecar-input-mismatch");
  const outputEligible = body.contractVerdict === "success" && body.outputHash !== null;
  const outputMatch = outputEligible ? await valueHash(bundle.outputs) === body.outputHash : null;
  if (outputEligible && !outputMatch) problems.push("output-hash-mismatch");
  if (!outputEligible) problems.push("no-successful-output");
  return { signature: true, taskBound: body.taskHash === opts.expectedTaskHash,
    policyBound: body.policyHash === opts.expectedPolicyHash, requestBound: bound.ok && requests.length === 1,
    verdict: body.contractVerdict, outputEligible, outputMatch, complete: problems.length === 0,
    evidenceOkay: problems.length === 0, problems };
}
