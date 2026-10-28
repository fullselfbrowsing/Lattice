import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export class BudgetExceeded extends Error {}

/** Persist reservations before egress; a crash or unknown charge never frees money. */
export class EvaluationBudget {
  constructor(path, limitUsd = 10) {
    if (!Number.isFinite(limitUsd) || limitUsd <= 0 || limitUsd > 10) throw new TypeError("Budget must be in (0, 10].");
    this.path = path;
    this.state = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { version: 1, limitUsd, entries: [] };
    if (this.state.version !== 1 || !Array.isArray(this.state.entries)
        || !Number.isFinite(this.state.limitUsd) || this.state.limitUsd <= 0 || this.state.limitUsd > 10) throw new TypeError("Invalid budget ledger.");
    for (const entry of this.state.entries) {
      if (!entry || typeof entry.id !== "string" || typeof entry.settled !== "boolean"
          || !Number.isFinite(entry.reservedUsd) || entry.reservedUsd <= 0
          || !Number.isFinite(entry.chargedUsd) || entry.chargedUsd < 0) throw new TypeError("Invalid ledger charge.");
    }
    this.state.limitUsd = Math.min(limitUsd, this.state.limitUsd);
    this.persist();
  }
  get chargedUsd() { return this.state.entries.reduce((sum, entry) => sum + entry.chargedUsd, 0); }
  get confirmedUsd() { return this.state.entries.filter((e) => e.settled).reduce((sum, e) => sum + e.chargedUsd, 0); }
  reserve(model, upperBoundUsd) {
    if (this.state.haltedReason) throw new BudgetExceeded(this.state.haltedReason);
    if (!Number.isFinite(upperBoundUsd) || upperBoundUsd <= 0) throw new TypeError("A positive finite request cost bound is required.");
    if (this.chargedUsd + upperBoundUsd > this.state.limitUsd) throw new BudgetExceeded("Evaluation budget exhausted; no request sent.");
    const id = randomUUID();
    this.state.entries.push({ id, model, reservedUsd: upperBoundUsd, chargedUsd: upperBoundUsd, settled: false, at: new Date().toISOString() });
    this.persist();
    return id;
  }
  settle(id, actualUsd) {
    const entry = this.state.entries.find((e) => e.id === id);
    if (!entry || entry.settled) throw new TypeError("Unknown or already settled reservation.");
    if (actualUsd == null) return; // Keep the whole reservation, including failed HTTP calls.
    if (!Number.isFinite(actualUsd) || actualUsd < 0) throw new TypeError("Invalid provider cost.");
    entry.chargedUsd = actualUsd;
    entry.settled = true;
    if (actualUsd > entry.reservedUsd || this.chargedUsd > this.state.limitUsd) {
      this.state.haltedReason = "Provider charge exceeded the conservative reservation; evaluation halted.";
      this.persist();
      throw new BudgetExceeded(this.state.haltedReason);
    }
    this.persist();
  }
  persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(temporary, this.path);
  }
  summary() {
    return { limitUsd: this.state.limitUsd, confirmedUsd: this.confirmedUsd, chargedOrReservedUsd: this.chargedUsd,
      requests: this.state.entries.length, unresolvedRequests: this.state.entries.filter((e) => !e.settled).length };
  }
}

/** Full model context at the most expensive listed endpoint, plus output and request fees. */
export function requestCostBound(model, endpoints, maxOutputTokens) {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || !Number.isFinite(model.context_length)) throw new TypeError("Invalid request limits.");
  if (!endpoints.length) throw new TypeError("Endpoint prices are required before inference.");
  const costs = endpoints.map((endpoint) => {
    const prices = endpoint.pricing;
    if (prices?.prompt == null || prices?.completion == null) throw new TypeError("Missing endpoint price.");
    const input = Number(prices.prompt);
    const output = Number(prices?.completion);
    const perRequest = Number(prices?.request ?? 0);
    if (![input, output, perRequest].every((n) => Number.isFinite(n) && n >= 0)) throw new TypeError("Unbounded endpoint price.");
    return model.context_length * input + maxOutputTokens * output + perRequest;
  });
  // Extra margin for catalog drift; reserved balance is released only for reported charges.
  return Math.max(0.000001, Math.max(...costs) * 1.25);
}
