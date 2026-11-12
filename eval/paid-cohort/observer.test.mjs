import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as L from "../../packages/lattice/dist/index.js";
import { PaidBudget } from "./budget.mjs";
import { createPaidObserver, ALLOWED_MODELS } from "./observer.mjs";

const MODEL = "anthropic/claude-sonnet-5.5";
const BASE = "https://example.test/v1";
const url = BASE + "/chat/completions";
const prices = { [MODEL]: [{ pricing: { prompt: "0.000002", completion: "0.00001" } }],
  "x-ai/grok-4.7": [{ pricing: { prompt: "0.000002", completion: "0.000006" } }] };
const make = (overrides = {}) => ({ model: MODEL, max_tokens: 64, messages: [{ role: "user", content: "pong" }], ...overrides });
const reply = (extra = {}, status = 200, headers = {}) => new Response(JSON.stringify({ id: "gen-1", model: MODEL, provider: "P",
  choices: [{ message: { content: "pong" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 2 }, cost: 0.0001 }, ...extra }),
{ status, headers: { "content-type": "application/json", ...headers } });

function fixture(limit, network, { breaker = null, models } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "paid-observer-"));
  const budget = new PaidBudget(join(dir, "budget.json"), limit);
  const active = { calls: [], preparedBodies: [], backoffMs: 0 };
  const control = { stopped: null, networkCalls: 0 };
  const fetch = createPaidObserver({ BASE, ...(models ? { MODELS: models } : {}), endpointCatalog: prices, budget, breaker,
    getActive: () => active, getStopped: () => control.stopped, setStopped: (v) => { control.stopped = v; },
    fetch: async (...args) => { control.networkCalls++; return network(...args); } });
  return { active, control, budget, fetch, dispose: () => rmSync(dir, { recursive: true }) };
}

test("requests outside the five-model allowlist never leave the process", async () => {
  const f = fixture(10, () => reply());
  try {
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ model: "openai/gpt-4.1-mini" })) }), /unlisted model/);
    assert.equal(f.control.networkCalls, 0);
    assert.throws(() => fixture(10, () => reply(), { models: [MODEL, "some/other"] }), /allowlist/);
    assert.equal(ALLOWED_MODELS.length, 5);
  } finally { f.dispose(); }
});

test("missing or oversized caps and forbidden routing fields are rejected before egress", async () => {
  const f = fixture(10, () => reply());
  try {
    const { max_tokens, ...noCap } = make();
    await assert.rejects(f.fetch(url, { body: JSON.stringify(noCap) }), /bounded token cap/);
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ max_tokens: 4097 })) }), /bounded token cap/);
    for (const key of ["models", "route", "provider", "plugins", "preset", "service_tier", "web_search_options"]) {
      await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ [key]: key === "route" ? "fallback" : {} })) }), /forbidden/, key);
    }
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ tools: [{ type: "web_search" }] })) }), /Server-side tools/);
    await assert.rejects(f.fetch(BASE + "/other", { body: JSON.stringify(make()) }), /Unexpected inference endpoint/);
    assert.equal(f.control.networkCalls, 0);
    assert.equal(f.budget.state.entries.length, 0);
    // reasoning is permitted (it is not a routing field)
    await f.fetch(url, { body: JSON.stringify(make({ max_tokens: 4096, reasoning: { max_tokens: 1024 } })) });
    assert.equal(f.control.networkCalls, 1);
  } finally { f.dispose(); }
});

test("429 and 5xx get exactly one attempt and are measured, not retried", async () => {
  for (const status of [429, 500, 503]) {
    const f = fixture(10, () => new Response(JSON.stringify({ error: { code: status, message: "busy" } }), { status, headers: { "retry-after": "1" } }));
    try {
      const response = await f.fetch(url, { body: JSON.stringify(make()) });
      assert.equal(response.status, status);
      assert.equal(f.control.networkCalls, 1);
      assert.equal(f.active.calls.length, 1);
      assert.equal(f.active.calls[0].errorCode, status);
      assert.equal(f.active.calls[0].attempt, 0);
      assert.equal(f.control.stopped, null, "a throttled call does not stop the cohort");
      assert.ok(f.budget.chargedUsd > 0.0001, "the unknown cost keeps the whole reservation");
      // the identical body cannot be sent again within the run
      await assert.rejects(f.fetch(url, { body: JSON.stringify(make()) }), /retries are not permitted/);
      assert.equal(f.control.networkCalls, 1);
    } finally { f.dispose(); }
  }
});

test("401, 402 and 403 halt later calls", async () => {
  for (const status of [401, 402, 403]) {
    const f = fixture(10, () => new Response(JSON.stringify({ error: { code: status, message: "no" } }), { status }));
    try {
      const response = await f.fetch(url, { body: JSON.stringify(make()) });
      assert.equal(response.status, status);
      assert.match(f.control.stopped, new RegExp("HTTP " + status));
      await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ max_tokens: 32 })) }), /HTTP/);
      assert.equal(f.control.networkCalls, 1);
    } finally { f.dispose(); }
  }
});

test("a transport error halts, retains one reservation and is not retried", async () => {
  const f = fixture(10, () => { throw new Error("connection closed"); });
  try {
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make()) }), /evaluation halted/);
    const reserved = f.budget.chargedUsd;
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ max_tokens: 32 })) }), /evaluation halted/);
    assert.equal(f.control.networkCalls, 1);
    assert.equal(f.budget.state.entries.length, 1);
    assert.equal(f.budget.chargedUsd, reserved);
    assert.equal(f.active.calls[0].transportError, "connection closed");
  } finally { f.dispose(); }
});

test("a successful call settles to usage.cost and records the observed fields", async () => {
  const f = fixture(10, () => reply());
  try {
    const body = JSON.stringify(make());
    const response = await f.fetch(url, { body });
    assert.equal((await response.json()).choices[0].message.content, "pong");
    assert.equal(f.budget.chargedUsd, 0.0001);
    assert.equal(f.budget.confirmedUsd, 0.0001);
    const call = f.active.calls[0];
    assert.equal(call.bodyHash, createHash("sha256").update(body).digest("hex"));
    assert.deepEqual([call.model, call.status, call.costUsd, call.promptTokens, call.completionTokens, call.reasoningTokens, call.provider, call.observedModel, call.finishReason, call.generationId],
      [MODEL, 200, 0.0001, 10, 3, 2, "P", MODEL, "stop", "gen-1"]);
    assert.equal(f.active.lastOutput, "pong");
    assert.ok(call.reservedUsd >= call.costUsd && call.maxTokens === 64 && typeof call.httpMs === "number");
  } finally { f.dispose(); }
});

test("a null cost keeps the reservation and a charge above it halts permanently", async () => {
  const noCost = fixture(10, () => reply({ usage: { prompt_tokens: 1 } }));
  try {
    await noCost.fetch(url, { body: JSON.stringify(make()) });
    assert.equal(noCost.active.calls[0].costUsd, null);
    assert.equal(noCost.budget.chargedUsd, noCost.active.calls[0].reservedUsd);
  } finally { noCost.dispose(); }
  const over = fixture(10, () => reply({ usage: { cost: 5 } }));
  try {
    await assert.rejects(over.fetch(url, { body: JSON.stringify(make()) }), /exceeded the conservative reservation/);
    await assert.rejects(over.fetch(url, { body: JSON.stringify(make({ max_tokens: 32 })) }), /halted|exceeded/);
    assert.equal(over.control.networkCalls, 1);
  } finally { over.dispose(); }
});

test("an exhausted ledger refuses before egress but still binds the prepared body", async () => {
  const f = fixture(0.0001, () => reply());
  try {
    const body = JSON.stringify(make());
    await assert.rejects(f.fetch(url, { body }), /budget exhausted/);
    assert.equal(f.control.networkCalls, 0);
    assert.equal(f.active.preparedBodies[0], createHash("sha256").update(body).digest("hex"));
    assert.deepEqual(f.active.calls, []);
  } finally { f.dispose(); }
});

test("the matched-body check and signed receipts line up with observed submissions", async () => {
  const f = fixture(10, () => reply());
  try {
    const pair = await L.generateEd25519KeyPairJwk();
    const signer = L.createInMemorySigner(pair.privateKeyJwk, { kid: "t", publicKeyJwk: pair.publicKeyJwk });
    const keySet = L.createMemoryKeySet([{ kid: "t", publicKeyJwk: pair.publicKeyJwk, state: "active" }]);
    const ai = L.createAI({ signer, providers: [L.createOpenAICompatibleProvider({ id: "openrouter", model: MODEL, baseUrl: BASE, fetch: f.fetch })] });
    const result = await ai.run({ task: "Reply pong", outputs: { answer: "text" }, generation: { maxOutputTokens: 64 } });
    assert.equal(result.ok, true);
    const verified = await L.verifyReceipt(result.receipt, keySet, { expectedProviderRequestHashes: f.active.preparedBodies });
    assert.equal(verified.ok, true);
    f.active.expectedBody = "something else";
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ max_tokens: 16 })) }), /Matched request bodies differ/);
  } finally { f.dispose(); }
});

test("the circuit breaker stops the stage when cost per call runs away", async () => {
  const { CircuitBreaker } = await import("./budget.mjs");
  const f = fixture(10, () => reply({ usage: { cost: 0.04 } }), { breaker: new CircuitBreaker({ expectedPerCall: 0.01 }) });
  try {
    for (let i = 0; i < 10; i++) await f.fetch(url, { body: JSON.stringify(make({ max_tokens: 4096 - i })) });
    assert.match(f.control.stopped, /Circuit breaker/);
    await assert.rejects(f.fetch(url, { body: JSON.stringify(make({ max_tokens: 99 })) }), /Circuit breaker/);
  } finally { f.dispose(); }
});
