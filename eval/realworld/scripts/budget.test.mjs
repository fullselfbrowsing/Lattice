import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvaluationBudget, BudgetExceeded, requestCostBound } from "./budget.mjs";

test("unknown charges, restart, and rejected reservations preserve the cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "lattice-budget-"));
  try {
    const path = join(dir, "budget.json");
    const budget = new EvaluationBudget(path, 1);
    const first = budget.reserve("model", 0.6);
    budget.settle(first, null);
    assert.throws(() => budget.reserve("model", 0.5), BudgetExceeded);
    const resumed = new EvaluationBudget(path, 10);
    assert.equal(resumed.state.limitUsd, 1);
    assert.equal(resumed.chargedUsd, 0.6);
    resumed.settle(first, 0.1);
    resumed.reserve("model", 0.9);
    assert.throws(() => resumed.reserve("model", 0.001), BudgetExceeded);
  } finally { rmSync(dir, { recursive: true }); }
});

test("invalid and higher-than-reserved charges fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "lattice-budget-"));
  try {
    const budget = new EvaluationBudget(join(dir, "budget.json"));
    assert.throws(() => budget.reserve("model", NaN));
    const id = budget.reserve("model", 0.1);
    assert.throws(() => budget.settle(id, 0.2), BudgetExceeded);
    assert.equal(budget.confirmedUsd, 0.2);
    const resumed = new EvaluationBudget(join(dir, "budget.json"));
    assert.throws(() => resumed.reserve("model", 0.1), BudgetExceeded);
    assert.throws(() => budget.settle(id, 0));
  } finally { rmSync(dir, { recursive: true }); }
});

test("reservation uses maximum endpoint prices and full context", () => {
  assert.equal(requestCostBound({ context_length: 1000 }, [
    { pricing: { prompt: "0.001", completion: "0.002" } },
    { pricing: { prompt: "0.002", completion: "0.003" } },
  ], 100), 2.3 * 1.25);
  assert.throws(() => requestCostBound({ context_length: 1000 }, [], 100));
});


test("malformed persisted limits cannot bypass the cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "lattice-budget-"));
  try {
    const path = join(dir, "budget.json");
    for (const limitUsd of [null, 0, -1, "10", 11, undefined]) {
      writeFileSync(path, JSON.stringify({ version: 1, limitUsd, entries: [] }));
      assert.throws(() => new EvaluationBudget(path));
    }
    assert.throws(() => requestCostBound({ context_length: 1000 }, [{ pricing: {} }], 100));
  } finally { rmSync(dir, { recursive: true }); }
});
