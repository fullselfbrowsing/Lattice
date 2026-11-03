import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const FREE_MODELS = ["nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free"];
export const FREE_JUDGE = "dots-studio/dots-3-note-preview:free";
export const FREE_COUNTS = { transport: 10, privacy: 10, agents: 2, citations: 60, latency: 20, warmups: 2 };

export function evaluationPaths(root, cache, cohort, stage) {
  if (!["paid", "free"].includes(cohort) || !["smoke", "full", "judge"].includes(stage)) throw new Error("Invalid evaluation profile.");
  const prefix = cohort === "free" ? "validated-free" : "validated";
  return { out: resolve(root, "eval/realworld/results", prefix + "-" + stage + ".json"),
    private: resolve(cache, prefix + "-" + stage + "-private.json"),
    ledger: resolve(root, cohort === "free" ? ".context/free-request-ledger.json" : ".context/hosted-budget.json") };
}

function zeroPrices(pricing) {
  if (!pricing || pricing.prompt == null || pricing.completion == null) throw new Error("Free model prices are missing.");
  for (const [name, value] of Object.entries(pricing)) {
    if (name === "discount") continue;
    if (value === null || value === "" || !["string", "number"].includes(typeof value) || Number(value) !== 0) {
      throw new Error("Nonzero or unknown free model price: " + name);
    }
  }
}

export function assertFreeModel(model, endpoints) {
  if (!model?.id?.endsWith(":free")) throw new Error("A pinned :free catalog model is required.");
  zeroPrices(model.pricing);
  if (!endpoints?.length) throw new Error("Free endpoint prices are required.");
  for (const endpoint of endpoints) zeroPrices(endpoint.pricing);
}

export function assertFreeRequest(body, model, endpoints) {
  if (body.model !== model?.id) throw new Error("Free model selection differs from catalog.");
  assertFreeModel(model, endpoints);
  if (["models", "route", "plugins", "web_search_options", "provider", "preset", "service_tier"].some((key) => key in body)) {
    throw new Error("Free evaluation forbids routing overrides, fallbacks, and extensions.");
  }
}

/** Counts free requests separately; never opens or changes the paid cost ledger. */
export class FreeRequestLedger {
  constructor(path, { maxRequests = 900, remainingToday = 0 } = {}) {
    if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 900
        || !Number.isSafeInteger(remainingToday) || remainingToday < 0) throw new Error("Invalid free request quota.");
    this.path = path;
    this.remainingToday = remainingToday;
    this.state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8"))
      : { version: "free-requests/v1", maxRequests, entries: [] };
    if (this.state.version !== "free-requests/v1" || !Array.isArray(this.state.entries)
        || !Number.isSafeInteger(this.state.maxRequests) || this.state.maxRequests < 1 || this.state.maxRequests > 900
        || this.state.entries.some((e) => !e || typeof e.id !== "string" || !e.model?.endsWith(":free")
          || !Number.isFinite(e.startedAt) || !(e.costUsd === null || (typeof e.costUsd === "number" && Number.isFinite(e.costUsd) && e.costUsd >= 0)))) {
      throw new Error("Invalid free request ledger.");
    }
    this.state.maxRequests = Math.min(this.state.maxRequests, maxRequests);
    this.persist();
  }
  async pace() {
    const last = this.state.entries.at(-1)?.startedAt ?? 0;
    const delay = Math.max(0, 3200 - (Date.now() - last));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  reserve(model) {
    if (this.state.haltedReason) throw new Error(this.state.haltedReason);
    if (!model.endsWith(":free")) throw new Error("Paid model rejected before egress.");
    if (this.state.entries.length >= this.state.maxRequests || this.remainingToday < 1) throw new Error("Free request quota exhausted; no request sent.");
    const id = randomUUID();
    this.state.entries.push({ id, model, startedAt: Date.now(), costUsd: null });
    this.remainingToday--;
    this.persist();
    return id;
  }
  settle(id, actualUsd) {
    const entry = this.state.entries.find((e) => e.id === id);
    if (!entry || entry.costUsd !== null) throw new Error("Unknown or settled free request.");
    if (actualUsd == null) return;
    if (!Number.isFinite(actualUsd) || actualUsd < 0) throw new Error("Invalid free request cost.");
    entry.costUsd = actualUsd;
    if (actualUsd !== 0) this.state.haltedReason = "Nonzero charge reported on free route; halted.";
    this.persist();
    if (this.state.haltedReason) throw new Error(this.state.haltedReason);
  }
  get confirmedUsd() { return this.state.entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0); }
  summary() {
    return { mode: "free-only", limitUsd: 0, confirmedUsd: this.confirmedUsd,
      requests: this.state.entries.length, maxRequests: this.state.maxRequests,
      unreportedCosts: this.state.entries.filter((e) => e.costUsd === null).length,
      remainingAtStartupMinusRequests: this.remainingToday };
  }
  persist() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + ".tmp", JSON.stringify(this.state, null, 2) + "\n", { mode: 0o600 });
    renameSync(this.path + ".tmp", this.path);
  }
}
