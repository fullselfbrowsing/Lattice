import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export class BudgetExceeded extends Error {}

/** No ledger may ever be configured above the money added to the account. */
export const HARD_CAP_USD = 20;
/** Balance always left untouched when admitting a stage. */
export const ADMIT_RESERVE_USD = 0.5;
/** Safety factor on every per-request and per-stage worst case. */
export const BOUND_MARGIN = 1.25;
export const INPUT_MARGIN = 1.35;

/**
 * Persist reservations before egress. A crash, an unknown charge or a charge above
 * the reservation never frees money; the last one halts the whole cohort permanently.
 */
export class PaidBudget {
  constructor(path, limitUsd = 17) {
    if (!Number.isFinite(limitUsd) || limitUsd <= 0 || limitUsd > HARD_CAP_USD) throw new TypeError("Budget must be in (0, 20].");
    this.path = path;
    this.state = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { version: 1, limitUsd, entries: [] };
    if (this.state.version !== 1 || !Array.isArray(this.state.entries)
        || !Number.isFinite(this.state.limitUsd) || this.state.limitUsd <= 0 || this.state.limitUsd > HARD_CAP_USD) throw new TypeError("Invalid budget ledger.");
    for (const entry of this.state.entries) {
      if (!entry || typeof entry.id !== "string" || typeof entry.settled !== "boolean"
          || !Number.isFinite(entry.reservedUsd) || entry.reservedUsd <= 0
          || !Number.isFinite(entry.chargedUsd) || entry.chargedUsd < 0) throw new TypeError("Invalid ledger charge.");
    }
    // A persisted ledger can only be tightened, never loosened.
    this.state.limitUsd = Math.min(limitUsd, this.state.limitUsd);
    this.persist();
  }
  get chargedUsd() { return this.state.entries.reduce((sum, entry) => sum + entry.chargedUsd, 0); }
  get confirmedUsd() { return this.state.entries.filter((e) => e.settled).reduce((sum, e) => sum + e.chargedUsd, 0); }
  get remainingUsd() { return this.state.limitUsd - this.chargedUsd; }
  get halted() { return this.state.haltedReason ?? null; }
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
  /** Pure admission rule against this ledger; see admit(). */
  admit(ceilingUsd, balanceUsd) { return !this.halted && admit(ceilingUsd, balanceUsd, this.remainingUsd); }
  persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    renameSync(temporary, this.path);
  }
  summary() {
    return { limitUsd: this.state.limitUsd, confirmedUsd: this.confirmedUsd, chargedOrReservedUsd: this.chargedUsd,
      requests: this.state.entries.length, unresolvedRequests: this.state.entries.filter((e) => !e.settled).length,
      halted: this.halted };
  }
}

const price = (value, label) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new TypeError("Unbounded endpoint price: " + label);
  return n;
};

/** Component-wise maxima over every listed endpoint (the router may pick any of them). */
export function maxPrices(endpoints) {
  if (!Array.isArray(endpoints) || !endpoints.length) throw new TypeError("Endpoint prices are required before inference.");
  const max = { prompt: 0, completion: 0, internal_reasoning: 0, request: 0, image: 0, input_cache_write: 0 };
  for (const endpoint of endpoints) {
    const p = endpoint?.pricing;
    if (p?.prompt == null || p?.completion == null) throw new TypeError("Missing endpoint price.");
    for (const key of Object.keys(max)) max[key] = Math.max(max[key], price(p[key], key));
  }
  return max;
}

/**
 * ((request bytes + 1000 per image part) x max input price
 *   + maxTokens x max(completion, internal_reasoning) + request fee) x 1.25.
 * A byte is never fewer tokens than the text it came from, so this cannot undercut a
 * response that stays within max_tokens.
 */
export function requestBound(body, endpoints, maxTokens) {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) throw new TypeError("Invalid request limits.");
  const max = maxPrices(endpoints);
  const text = typeof body === "string" ? body : JSON.stringify(body);
  let images = 0;
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    images = (parsed?.messages ?? []).flatMap((m) => Array.isArray(m?.content) ? m.content : []).filter((p) => p?.type === "image_url").length;
  } catch { /* the byte length alone is then used */ }
  const input = (Buffer.byteLength(text) + 1000 * images) * Math.max(max.prompt, max.input_cache_write);
  const output = maxTokens * Math.max(max.completion, max.internal_reasoning);
  const bound = (input + output + max.request + images * max.image) * BOUND_MARGIN;
  return Math.max(0.000001, bound);
}

/** True iff the stage's worst case fits in both the ledger and the spendable balance. */
export function admit(ceilingUsd, balanceUsd, remainingUsd) {
  if (![ceilingUsd, balanceUsd, remainingUsd].every(Number.isFinite)) return false;
  return Math.min(remainingUsd, balanceUsd - ADMIT_RESERVE_USD) >= ceilingUsd;
}

/** Worst case: every call writes its full allowance with inputs 35% above the largest measured. */
export function stageCeiling(calls, maxInputTokens, inPrice, cap, maxOutPrice) {
  return calls * (maxInputTokens * INPUT_MARGIN * inPrice + cap * maxOutPrice);
}

/** After `after` calls, trips when the mean cost per call is above `factor` times the expectation. */
export class CircuitBreaker {
  constructor({ expectedPerCall, after = 10, factor = 2 }) {
    if (!Number.isFinite(expectedPerCall) || expectedPerCall <= 0) throw new TypeError("Expected cost per call is required.");
    Object.assign(this, { expectedPerCall, after, factor, calls: 0, totalUsd: 0, reason: null });
  }
  get tripped() { return this.reason !== null; }
  record(costUsd) {
    if (typeof costUsd !== "number" || !Number.isFinite(costUsd)) return this.tripped;
    this.calls++;
    this.totalUsd += costUsd;
    const mean = this.totalUsd / this.calls;
    if (this.calls >= this.after && mean > this.factor * this.expectedPerCall && !this.tripped) {
      this.reason = `Circuit breaker: mean cost per call ${mean.toFixed(5)} USD exceeds ${this.factor}x the expected ${this.expectedPerCall} USD after ${this.calls} calls.`;
    }
    return this.tripped;
  }
}
