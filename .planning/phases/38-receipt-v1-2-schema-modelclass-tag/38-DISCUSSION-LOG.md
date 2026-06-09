# Phase 38: Receipt v1.2 Schema + modelClass Tag - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-09T22:48:53Z
**Phase:** 38-receipt-v1-2-schema-modelclass-tag
**Areas discussed:** v1.2 issuance policy, modelClass source of truth, receipt coverage surface, downgrade and compatibility tests

---

## v1.2 Issuance Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Always v1.2 | Every newly minted receipt uses v1.2; `modelClass` stays optional when unknown. | yes |
| Only if known | Mint v1.2 only when `modelClass` is known; otherwise keep v1.1. | |
| Caller option | Expose an explicit version option to callers. | |

**User's choice:** Always v1.2.
**Notes:** This keeps issuance behavior simple and avoids mixed v1.1/v1.2 minting after Phase 38.

---

## modelClass Source of Truth

| Option | Description | Selected |
|--------|-------------|----------|
| Strict route lookup | Use `getCapabilityProfile("${providerId}:${modelId}")` from the selected route and omit `modelClass` when unknown. | yes |
| Fuzzy fallback | Try strict lookup first, then `findCapabilityProfile(modelId)` if strict misses. | |
| Adapter-provided | Let adapters return `modelClass` directly in `ProviderRunResponse`. | |

**User's choice:** Strict route lookup.
**Notes:** Fuzzy matching was rejected because it can pick the wrong adapter-specific profile.

---

## Receipt Coverage Surface

| Option | Description | Selected |
|--------|-------------|----------|
| ai.run terminal receipts first | Add `modelClass` to normal run success/failure receipts; checkpoint receipts only get it if caller explicitly passes model context later. | yes |
| All receipts possible | Try to populate `modelClass` everywhere, including checkpoint/agent iteration receipts. | |
| Receipt API only | Only support `modelClass` through `createReceipt` input; leave runtime wiring to a later phase. | |

**User's choice:** ai.run terminal receipts first.
**Notes:** Synthetic checkpoint receipts do not reliably carry real provider route context today.

---

## Downgrade and Compatibility Tests

| Option | Description | Selected |
|--------|-------------|----------|
| Full crypto/compat matrix | Prove v1 is rejected, forged v1+`modelClass` is rejected, v1.1 verifies, v1.2 verifies, DSSE/JCS round-trip stays byte-stable, and runtime receipts include/omit `modelClass` correctly. | yes |
| Minimum roadmap tests | Prove v1.1/v1.2 verify and v1 rejects; leave forged `modelClass` and runtime omit cases to planner discretion. | |
| Runtime-focused tests | Emphasize `ai.run` behavior and only smoke-test verifier compatibility. | |

**User's choice:** Full crypto/compat matrix.
**Notes:** The forged downgrade case is explicitly required so `modelClass` cannot be used to bypass CRYPTO-01.

---

## the agent's Discretion

- Exact helper names and test file split.
- Whether to place strict lookup helper inside `runtime/create-ai.ts` or a small receipt utility.
- Which known registry profile is used for runtime include tests, provided it is stable and local to the repo.

## Deferred Ideas

- `parentReceiptCid` and crew receipt chains for Phase 39.
- Automatic `modelClass` on checkpoint/agent iteration receipts when real route context exists.
- Verifier-side registry consistency checks.
