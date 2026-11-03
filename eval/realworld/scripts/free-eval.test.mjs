import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertFreeRequest, FreeRequestLedger } from "./free-eval.mjs";
import { createObservedFetch } from "./live-observer.mjs";

const model = { id: "test/model:free", context_length: 1000, pricing: { prompt: "0", completion: "0" } };
const endpoints = [{ pricing: { prompt: "0", completion: "0", discount: 0 } }];
const body = { model: model.id, max_tokens: 16, messages: [{ role: "user", content: "pong" }] };

test("free guard rejects paid routes, missing prices, paid endpoints and optional charges", () => {
  assert.doesNotThrow(() => assertFreeRequest(body, model, endpoints));
  assert.throws(() => assertFreeRequest(body, { ...model, id: "test/model" }, endpoints));
  for (const pricing of [{ prompt: "0" }, { prompt: "0", completion: "1" }, { ...model.pricing, image: "0.01" }, { ...model.pricing, request: null }]) {
    assert.throws(() => assertFreeRequest(body, { ...model, pricing }, endpoints));
    assert.throws(() => assertFreeRequest(body, model, [{ pricing }]));
  }
  for (const field of ["models", "route", "plugins", "provider", "web_search_options", "preset", "service_tier"]) {
    assert.throws(() => assertFreeRequest({ ...body, [field]: [] }, model, endpoints));
  }
});

test("free request quota persists across stages and nonzero cost blocks restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "lattice-free-"));
  const path = join(dir, "free.json");
  try {
    const budget = new FreeRequestLedger(path, { maxRequests: 2, remainingToday: 10 });
    budget.reserve(model.id);
    const resumed = new FreeRequestLedger(path, { remainingToday: 9 });
    const id = resumed.reserve(model.id);
    assert.throws(() => resumed.reserve(model.id), /quota exhausted/);
    assert.throws(() => resumed.settle(id, 0.001), /Nonzero charge/);
    const halted = new FreeRequestLedger(path, { remainingToday: 8 });
    assert.throws(() => halted.reserve(model.id), /Nonzero charge/);
    assert.equal(JSON.parse(readFileSync(path)).entries.length, 2);
  } finally { rmSync(dir, { recursive: true }); }
});

test("daily quota denies egress, unknown costs remain unreported, and zero costs settle", () => {
  const dir = mkdtempSync(join(tmpdir(), "lattice-free-"));
  try {
    const budget = new FreeRequestLedger(join(dir, "free.json"), { remainingToday: 2 });
    budget.settle(budget.reserve(model.id), null);
    budget.settle(budget.reserve(model.id), 0);
    assert.throws(() => budget.reserve(model.id), /quota exhausted/);
    assert.equal(budget.summary().confirmedUsd, 0);
    assert.equal(budget.summary().unreportedCosts, 1);
  } finally { rmSync(dir, { recursive: true }); }
});

test("free observer preserves exact body, records pacing and stops daily limits without retry", async () => {
  let stopped = null;
  let requests = 0;
  const active = { calls: [], preparedBodies: [], backoffMs: 0 };
  const serialized = JSON.stringify(body);
  const fetch = createObservedFetch({ BASE: "https://example.test/v1", MODELS: [model.id],
    modelCatalog: new Map([[model.id, model]]), endpointCatalog: { [model.id]: endpoints }, freeOnly: true,
    budget: { pace: async () => {}, reserve: () => "id", settle: () => {} }, getActive: () => active,
    getStopped: () => stopped, setStopped: (value) => { stopped = value; },
    fetch: async (_url, init) => {
      requests++;
      assert.equal(init.body, serialized);
      return Response.json({ error: { message: "Rate limit exceeded: free-models-per-day" } }, { status: 429 });
    },
  });
  const url = "https://example.test/v1/chat/completions";
  assert.equal((await fetch(url, { body: serialized })).status, 429);
  await assert.rejects(fetch(url, { body: serialized }), /daily quota/);
  assert.equal(requests, 1);
  assert.equal(active.calls.length, 1);
  assert.ok(active.pacingMs >= 0);
});
