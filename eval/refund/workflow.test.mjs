import test from "node:test";
import assert from "node:assert/strict";
import { CASES, PROTOCOL } from "./fixtures.mjs";
import { businessDecision, gradeRecommendation, applicationWorkflow, verifyBundle, verifyApplicationRecord } from "./workflow.mjs";
import { scriptedBundle, referenceText, evidenceControls, wrongSignedControl } from "./controls.mjs";

test("eight frozen cases have explicit labels and yield 32 planned evaluations", () => {
  assert.equal(CASES.length, 8);
  assert.equal(CASES.length * PROTOCOL.models.length * PROTOCOL.repetitions, PROTOCOL.plannedRuns);
  assert.equal(new Set(CASES.map((x) => x.id)).size, 8);
  for (const c of CASES) {
    const actual = businessDecision(c.artifacts, c.id);
    for (const k of ["action", "amount_usd", "authority", "conflict", "rule"]) assert.equal(actual[k], c.expected[k], c.id + ":" + k);
  }
});

test("format validation is weaker than decision correctness and evidence support", () => {
  const c = CASES[0], text = referenceText(c, { action: "deny", amount_usd: 0 });
  const g = gradeRecommendation(text, c);
  assert.equal(g.format, true); assert.equal(g.strict, false);
  assert.equal(gradeRecommendation(referenceText(c, { sources: ["policy"] }), c).strict, false);
  assert.equal(gradeRecommendation(referenceText(c, { sources: ["imaginary"] }), c).format, false);
  const fence = String.fromCharCode(96).repeat(3);
  assert.equal(gradeRecommendation(fence + "json\n" + referenceText(c) + "\n" + fence, c).format, false);
});

test("real Lattice adapter, signing and offline bundle checks preserve a controlled ordinary path", async () => {
  const c = CASES[0], { bundle, keys } = await scriptedBundle(c, referenceText(c));
  assert.equal(bundle.runtimeOkay, true);
  assert.equal((await verifyBundle(bundle, keys, c)).evidenceOkay, true);
  assert.equal(bundle.application.paidUsd, 180);
  assert.equal(verifyApplicationRecord(bundle).complete, true);
  const checks = await evidenceControls(bundle, keys, c);
  for (const row of checks) assert.equal(row.passed, true, JSON.stringify(row));
});

test("a valid signature over a deliberately wrong decision does not authorize payment", async () => {
  const control = await wrongSignedControl(CASES[2]);
  assert.equal(control.passed, true);
});

test("manager authority, absent approvals and duplicate attempts are separate application controls", () => {
  const c = CASES[4], text = referenceText(c);
  assert.equal(applicationWorkflow(c, text, true, { role: "employee", amount_usd: 240 }).paidUsd, 0);
  assert.equal(applicationWorkflow(c, text, true, null).status, "held");
  assert.equal(applicationWorkflow(c, text, false).status, "held");
  const actual = applicationWorkflow(c, text, true);
  assert.equal(actual.paidUsd, 240);
  assert.equal(actual.events.filter((e) => e.kind === "payment-fixture").length, 1);
  assert.equal(actual.duplicateAttempt, "duplicate-blocked");
});

test("missing or inapplicable business policy cannot be substituted by routing-policy integrity", () => {
  const c = CASES[0], artifacts = structuredClone(c.artifacts);
  artifacts[1].effectiveFrom = "2027-01-01";
  assert.equal(businessDecision(artifacts, c.id).action, "request_evidence");
  assert.equal(businessDecision(artifacts.filter((a) => a.source_id !== "policy"), c.id).action, "request_evidence");
});

test("failed format gets a terminal receipt but no successful output commitment", async () => {
  const c = CASES[0], { bundle, keys } = await scriptedBundle(c, "not JSON");
  const v = await verifyBundle(bundle, keys, c);
  assert.equal(bundle.runtimeOkay, false); assert.equal(v.signature, true);
  assert.equal(v.verdict, "tripwire-violated"); assert.equal(v.evidenceOkay, false);
  assert.equal(bundle.application.paidUsd, 0);
});
