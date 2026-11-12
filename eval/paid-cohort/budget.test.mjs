import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaidBudget, BudgetExceeded, requestBound, admit, stageCeiling, CircuitBreaker, maxPrices, standardEndpoints, standardUsageCost } from "./budget.mjs";

const withDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "paid-budget-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true }); }
};

test("reserve over the limit throws and settle releases down to the actual charge", () => withDir((dir) => {
  const budget = new PaidBudget(join(dir, "b.json"), 1);
  assert.throws(() => budget.reserve("m", 1.5), BudgetExceeded);
  const id = budget.reserve("m", 0.6);
  assert.throws(() => budget.reserve("m", 0.5), BudgetExceeded);
  budget.settle(id, 0.1);
  assert.equal(budget.chargedUsd, 0.1);
  assert.equal(budget.remainingUsd, 0.9);
  budget.reserve("m", 0.9);
  assert.equal(statSync(join(dir, "b.json")).mode & 0o777, 0o600);
}));

test("an unknown cost keeps the whole reservation across restarts", () => withDir((dir) => {
  const path = join(dir, "b.json");
  const budget = new PaidBudget(path, 1);
  const id = budget.reserve("m", 0.6);
  budget.settle(id, null);
  assert.equal(budget.chargedUsd, 0.6);
  assert.throws(() => budget.reserve("m", 0.5), BudgetExceeded);
  const resumed = new PaidBudget(path, 17);
  assert.equal(resumed.state.limitUsd, 1, "a resumed ledger can only tighten");
  assert.equal(resumed.chargedUsd, 0.6);
}));

test("a charge above the reservation halts the cohort permanently", () => withDir((dir) => {
  const path = join(dir, "b.json");
  const budget = new PaidBudget(path, 5);
  const id = budget.reserve("m", 0.1);
  assert.throws(() => budget.settle(id, 0.2), BudgetExceeded);
  assert.equal(budget.confirmedUsd, 0.2);
  assert.throws(() => budget.reserve("m", 0.01), BudgetExceeded);
  assert.throws(() => new PaidBudget(path).reserve("m", 0.01), BudgetExceeded, "the halt survives a restart");
  assert.throws(() => budget.settle(id, 0));
  assert.equal(budget.admit(0.01, 100), false);
}));

test("limits above 20 dollars and malformed ledgers are rejected", () => withDir((dir) => {
  assert.throws(() => new PaidBudget(join(dir, "a.json"), 20.01), TypeError);
  assert.throws(() => new PaidBudget(join(dir, "a.json"), 0), TypeError);
  assert.doesNotThrow(() => new PaidBudget(join(dir, "ok.json"), 20));
  const path = join(dir, "bad.json");
  for (const limitUsd of [null, 0, -1, "10", 21, undefined]) {
    writeFileSync(path, JSON.stringify({ version: 1, limitUsd, entries: [] }));
    assert.throws(() => new PaidBudget(path));
  }
  const budget = new PaidBudget(join(dir, "n.json"));
  assert.throws(() => budget.reserve("m", NaN));
  const id = budget.reserve("m", 0.1);
  assert.throws(() => budget.settle(id, -1));
  assert.throws(() => budget.settle(id, Infinity));
}));

const endpoints = [
  { pricing: { prompt: "0.000002", completion: "0.00001", request: "0" } },
  { pricing: { prompt: "0.000003", completion: "0.000008", internal_reasoning: "0.000012", request: "0.001" } },
];

test("requestBound uses component-wise maxima, images, fee and the 1.25 margin", () => {
  const body = JSON.stringify({ model: "m", max_tokens: 100, messages: [{ role: "user", content: [{ type: "text", text: "hi" }, { type: "image_url", image_url: { url: "x" } }] }] });
  const bytes = Buffer.byteLength(body);
  const expected = ((bytes + 1000 + 2048) * 0.000003 + 100 * 0.000012 + 0.001) * 1.25;
  assert.ok(Math.abs(requestBound(body, endpoints, 100) - expected) < 1e-12);
  assert.deepEqual(maxPrices(endpoints).completion, 0.00001);
  assert.throws(() => requestBound(body, [], 100));
  assert.throws(() => requestBound(body, [{ pricing: {} }], 100));
  assert.throws(() => requestBound(body, endpoints, 0));
  assert.throws(() => requestBound(body, [{ pricing: { prompt: "-1", completion: "1" } }], 10));
});

test("the bound never undercuts the cost of any response within max_tokens", () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 500; i++) {
    const eps = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ pricing: {
      prompt: String(rand() * 1e-5), completion: String(rand() * 5e-5), internal_reasoning: String(rand() * 5e-5),
      request: String(rand() * 0.01) } }));
    const maxTokens = 1 + Math.floor(rand() * 4096);
    const body = JSON.stringify({ model: "m", max_tokens: maxTokens, messages: [{ role: "user", content: "x".repeat(Math.floor(rand() * 5000)) }] });
    const bytes = Buffer.byteLength(body);
    const p = maxPrices(eps);
    // Worst response within the cap: every byte a token, every output token at the dearest price.
    const actual = bytes * p.prompt + maxTokens * Math.max(p.completion, p.internal_reasoning) + p.request;
    assert.ok(requestBound(body, eps, maxTokens) >= actual);
  }
});

test("admission needs both the ledger and the balance less 50 cents", () => {
  assert.equal(admit(5, 10, 6), true);
  assert.equal(admit(5.4, 5.9, 100), true);
  assert.equal(admit(5.5, 5.9, 100), false);
  assert.equal(admit(5, 100, 4.99), false);
  assert.equal(admit(NaN, 100, 100), false);
  assert.equal(admit(1, undefined, 100), false);
});

test("stage ceiling is calls x (input x 1.35 x price + cap x output price)", () => {
  assert.ok(Math.abs(stageCeiling(180, 5000, 2e-6, 4096, 1e-5) - 180 * (5000 * 1.35 * 2e-6 + 4096 * 1e-5)) < 1e-9);
  assert.equal(stageCeiling(0, 5000, 2e-6, 4096, 1e-5), 0);
});

test("the circuit breaker trips after ten calls above twice the expected mean", () => {
  const ok = new CircuitBreaker({ expectedPerCall: 0.01 });
  for (let i = 0; i < 30; i++) assert.equal(ok.record(0.019), false);
  const bad = new CircuitBreaker({ expectedPerCall: 0.01 });
  for (let i = 0; i < 9; i++) assert.equal(bad.record(1), false, "not before ten calls");
  assert.equal(bad.record(1), true);
  assert.match(bad.reason, /Circuit breaker/);
  assert.equal(bad.record(null), true);
  assert.throws(() => new CircuitBreaker({ expectedPerCall: 0 }));
});

test("standard endpoints exclude the opt-in priority, fast and ultrafast tiers", () => {
  const eps = [
    { tag: "openai", pricing: { prompt: "0.000002", completion: "0.00001" } },
    { tag: "openai/flex", pricing: { prompt: "0.000001", completion: "0.000005" } },
    { tag: "azure/us", pricing: { prompt: "0.0000022", completion: "0.000011" } },
    { tag: "openai/fast", pricing: { prompt: "0.000004", completion: "0.00002" } },
    { tag: "openai/ultrafast", pricing: { prompt: "0.000012", completion: "0.00006" } },
    { tag: "google-vertex/global/priority", pricing: { prompt: "0.0000036", completion: "0.000018" } },
  ];
  assert.deepEqual(standardEndpoints(eps).map((e) => e.tag), ["openai", "openai/flex", "azure/us"]);
  assert.equal(maxPrices(standardEndpoints(eps)).completion, 0.000011);
  assert.equal(maxPrices(eps).completion, 0.00006, "reservations still see the ultrafast price");
  assert.deepEqual(standardEndpoints([eps[4]]), [eps[4]], "an endpoint list of only opt-in tiers is kept whole (fail safe)");
  const cost = standardUsageCost({ promptTokens: 1000, completionTokens: 100 }, eps);
  assert.ok(Math.abs(cost - (1000 * 0.0000022 + 100 * 0.000011)) < 1e-12);
  assert.equal(standardUsageCost({ promptTokens: null, completionTokens: 5 }, eps), null);
});
