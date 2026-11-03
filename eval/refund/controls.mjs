import * as L from "../../packages/lattice/dist/index.js";
import { makeIntent, verifyBundle, verifyApplicationRecord, applicationWorkflow, gradeRecommendation } from "./workflow.mjs";

export async function scriptedBundle(example, text) {
  const pair = await L.generateEd25519KeyPairJwk(), kid = "refund-offline-control";
  const trust = { kid, publicKeyJwk: pair.publicKeyJwk, state: "active" };
  const signer = L.createInMemorySigner(pair.privateKeyJwk, { kid, publicKeyJwk: pair.publicKeyJwk });
  const keys = L.createMemoryKeySet([trust]), requestBodies = [];
  const ai = L.createAI({ signer, providers: [L.createOpenAICompatibleProvider({
    id: "openrouter", model: "offline-fixture", baseUrl: "https://fixture.invalid/v1",
    fetch: async (_url, init) => {
      requestBodies.push(init.body);
      return Response.json({ model: "offline-fixture", choices: [{ message: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 } });
    },
  })] });
  const intent = makeIntent(example), result = await ai.run(intent);
  const bundle = { caseId: example.id, model: "offline-fixture", task: intent.task,
    executionPolicy: intent.policy, artifacts: structuredClone(example.artifacts), requestBodies,
    outputs: result.outputs ?? null, rawAnswer: text, receipt: result.receipt ?? null, runtimeOkay: result.ok };
  const v = await verifyBundle(bundle, keys, example);
  bundle.application = applicationWorkflow(example, text, v.evidenceOkay && result.ok);
  return { bundle, keys, trust };
}

export function referenceText(example, changes = {}) {
  const e = example.expected;
  return JSON.stringify({ case_id: example.id, action: e.action, amount_usd: e.amount_usd,
    authority: e.authority, conflict: e.conflict, rule_ids: [e.rule], sources: e.sources,
    reason: "Scripted control output; not a model observation.", ...changes });
}

export async function evidenceControls(bundle, keys, example) {
  const checks = [];
  const original = await verifyBundle(bundle, keys, example);
  checks.push({ name: "unaltered-run-evidence", passed: original.evidenceOkay, observed: original });
  const mutations = [
    ["edited-output", (b) => { b.outputs.answer += "!"; }, "output-hash-mismatch"],
    ["substituted-policy", (b) => { b.artifacts.find((a) => a.source_id === "policy").version = "synthetic-refund-2"; }, "artifact-hash-mismatch:1"],
    ["missing-policy", (b) => { b.artifacts.splice(1, 1); }, "artifact-count-mismatch"],
    ["changed-task-sidecar", (b) => { b.task += "!"; }, "sidecar-input-mismatch"],
    ["changed-execution-policy-sidecar", (b) => { b.executionPolicy.privacy = "restricted"; }, "sidecar-input-mismatch"],
    ["changed-request-body", (b) => { b.requestBodies[0] += " "; }, "execution-binding-mismatch"],
    ["missing-request-body", (b) => { b.requestBodies = []; }, "request-evidence-count"],
    ["foreign-case", (b) => { b.caseId = "another-case"; }, "case-mismatch"],
    ["missing-receipt", (b) => { b.receipt = null; }, "receipt-missing"],
    ["forged-signature", (b) => {
      const bytes = Buffer.from(b.receipt.signatures[0].sig, "base64"); bytes[0] ^= 1;
      b.receipt.signatures[0].sig = bytes.toString("base64");
    }, "signature-invalid"],
  ];
  for (const [name, mutate, expected] of mutations) {
    const b = structuredClone(bundle); mutate(b);
    const observed = await verifyBundle(b, keys, example);
    checks.push({ name, passed: !observed.evidenceOkay && observed.problems.includes(expected), observed });
  }
  const untrusted = await verifyBundle(bundle, L.createMemoryKeySet([]), example);
  checks.push({ name: "untrusted-signing-key", passed: !untrusted.signature && untrusted.problems.includes("key-not-found"), observed: untrusted });
  if (bundle.application.status === "simulated-paid") {
    checks.push({ name: "unaltered-case-record", passed: verifyApplicationRecord(bundle).complete });
    for (const [name, kind] of [["missing-approval", "human-approval-fixture"], ["missing-payment", "payment-fixture"]]) {
      const b = structuredClone(bundle); b.application.events = b.application.events.filter((e) => e.kind !== kind);
      const v = await verifyBundle(b, keys, example), external = verifyApplicationRecord(b);
      checks.push({ name, passed: v.evidenceOkay && !external.complete, signatureStillValid: v.signature, observed: external });
    }
    const noApproval = applicationWorkflow(example, bundle.outputs.answer, true, null);
    checks.push({ name: "no-approval-blocks-payment", passed: noApproval.status === "held" && noApproval.paidUsd === 0 });
    const noReceipt = applicationWorkflow(example, bundle.outputs.answer, false);
    checks.push({ name: "no-run-evidence-blocks-payment", passed: noReceipt.status === "held" && noReceipt.paidUsd === 0 });
    checks.push({ name: "duplicate-payment-blocked", passed: bundle.application.duplicateAttempt === "duplicate-blocked" });
  }
  return checks;
}

export async function wrongSignedControl(example) {
  const text = referenceText(example, { action: "approve", amount_usd: 240, authority: "employee", conflict: false, rule_ids: ["R1"] });
  const { bundle, keys, trust } = await scriptedBundle(example, text);
  const verification = await verifyBundle(bundle, keys, example);
  const grade = gradeRecommendation(text, example);
  return { label: "Offline scripted wrong-answer negative control; not a live-model result.",
    passed: verification.evidenceOkay && !grade.strict && bundle.application.status === "held" && bundle.application.paidUsd === 0,
    verification, grade, bundle, trust };
}
