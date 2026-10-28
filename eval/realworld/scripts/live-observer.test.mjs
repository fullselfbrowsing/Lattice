import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as L from "../../../packages/lattice/dist/index.js";
import { EvaluationBudget } from "./budget.mjs";
import { createObservedFetch } from "./live-observer.mjs";

function fixture(limit, network) {
  const dir = mkdtempSync(join(tmpdir(), "lattice-live-observer-"));
  const budget = new EvaluationBudget(join(dir, "budget.json"), limit);
  const active = { calls: [], preparedBodies: [], backoffMs: 0 };
  const control = { stopped: null, networkCalls: 0 };
  const fetch = createObservedFetch({ BASE: "https://example.test/v1", MODELS: ["mock"],
    modelCatalog: new Map([["mock", { context_length: 1000 }]]),
    endpointCatalog: { mock: [{ pricing: { prompt: "0.001", completion: "0.001" } }] }, budget,
    getActive: () => active, getStopped: () => control.stopped,
    setStopped: (value) => { control.stopped = value; },
    fetch: async (...args) => { control.networkCalls++; return network(...args); },
  });
  return { active, control, budget, fetch, dispose: () => rmSync(dir, { recursive: true }) };
}
const body = JSON.stringify({ model: "mock", max_tokens: 16, messages: [{ role: "user", content: "pong" }] });
const url = "https://example.test/v1/chat/completions";

test("unknown transport failure halts subsequent egress and retains one reservation", async () => {
  const f = fixture(10, () => { throw new Error("connection closed"); });
  try {
    await assert.rejects(f.fetch(url, { body }), /evaluation halted/);
    const reserved = f.budget.chargedUsd;
    await assert.rejects(f.fetch(url, { body }), /evaluation halted/);
    assert.equal(f.control.networkCalls, 1);
    assert.equal(f.budget.state.entries.length, 1);
    assert.equal(f.budget.chargedUsd, reserved);
    assert.equal(f.active.calls[0].transportError, "connection closed");
  } finally { f.dispose(); }
});

test("budget denial binds preparation without claiming HTTP egress or replayable output", async () => {
  const f = fixture(0.1, () => { throw new Error("network must not run"); });
  try {
    const pair = await L.generateEd25519KeyPairJwk();
    const signer = L.createInMemorySigner(pair.privateKeyJwk, { kid: "test", publicKeyJwk: pair.publicKeyJwk });
    const keySet = L.createMemoryKeySet([{ kid: "test", publicKeyJwk: pair.publicKeyJwk, state: "active" }]);
    const result = await L.createAI({ signer, providers: [L.createOpenAICompatibleProvider({ model: "mock", baseUrl: "https://example.test/v1", fetch: f.fetch })] })
      .run({ task: "Reply pong", outputs: { answer: "text" }, generation: { maxOutputTokens: 16 } });
    assert.equal(result.ok, false);
    assert.equal(f.control.networkCalls, 0);
    assert.equal(f.budget.state.entries.length, 0);
    assert.deepEqual(f.active.calls, []);
    assert.equal(f.active.preparedBodies.length, 1);
    assert.equal(f.active.preparedBodies[0], createHash("sha256").update(f.active.lastBody).digest("hex"));
    const verified = await L.verifyReceipt(result.receipt, keySet, {
      expectedTaskHash: await L.hashCanonicalForReceipt("Reply pong"),
      expectedPolicyHash: await L.hashCanonicalForReceipt({}),
      expectedProviderRequestHashes: f.active.preparedBodies,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.body.outputHash, null);
    assert.notEqual(verified.body.contractVerdict, "success");
  } finally { f.dispose(); }
});

test("payload mismatch fails before reserving or contacting a provider", async () => {
  const f = fixture(10, () => { throw new Error("network must not run"); });
  try {
    f.active.expectedBody = "different";
    await assert.rejects(f.fetch(url, { body }), /Matched request bodies differ/);
    assert.equal(f.control.networkCalls, 0);
    assert.equal(f.budget.state.entries.length, 0);
  } finally { f.dispose(); }
});
