# Architecture Research — Capability Receipts (v1.1)

**Domain:** TypeScript capability runtime SDK, attestation/replay subsystem
**Researched:** 2026-05-11
**Confidence:** HIGH (grounded in existing source code; new components designed against current type surface)
**Scope:** Integration architecture for Capability Contracts, pre-flight contract proof, tripwire invariants, signed receipts, `lattice` CLI, and `lattice eval` CI gate on top of the v1.0 lattice runtime.

## Standard Architecture

### System Overview (v1.1 with new components highlighted)

```
+-----------------------------------------------------------------------+
|                            Public API (lattice)                        |
|                                                                        |
|  createAI({ ... }).run({ task, artifacts, outputs, policy, contract }) |
|                                                  ^^^^^^^^ NEW          |
|                                                                        |
|  + createAI({ ... }).plan(intent)        + replayOffline(envelope)     |
|  + verifyReceipt(receipt, publicKey)  NEW                              |
|  + createReceipt(plan, result, ...)   NEW                              |
+-----------------------------------------------------------------------+
                                  |
+-----------------------------------------------------------------------+
|                       Runtime Orchestrator (create-ai.ts)              |
|                                                                        |
|   buildPlan() ----+----> contract.evaluate()  NEW                      |
|                   |       (pre-flight proof)                           |
|   runWithConfig() |                                                    |
|        |          +----> contract.tripwire()  NEW                      |
|        v                   (mid-stream check, abort)                   |
|   provider exec --> validate output --> sign receipt NEW               |
+-----------------------------------------------------------------------+
            |                    |                  |             |
+-----------+--+   +-------------+--+  +------------+----+ +------+----+
|  Routing /   |   |  Outputs /     |  | Contracts /     | | Receipts |
|  Catalog     |   |  Validation    |  | Tripwires NEW   | | NEW      |
|  (existing)  |   |  (existing)    |  | contract/*.ts   | | receipts/|
|              |   |                |  | tripwire/*.ts   | | *.ts     |
+--------------+   +----------------+  +-----------------+ +----------+
            |                    |                  |             |
+-----------+--------------------+------------------+-------------+----+
|        Artifacts + Storage (existing: fingerprint, lineage, refs)      |
|        Plan + ReplayEnvelope (existing, extended with receiptRef)      |
+-----------------------------------------------------------------------+
                                  |
+-----------------------------------------------------------------------+
|                      Tooling Surface (separate packages) NEW           |
|                                                                        |
|  packages/lattice-cli/         packages/lattice-eval/  (or sub-CLI)    |
|  bin: `lattice`                bin: `lattice eval`                     |
|    - lattice repro <id>          - load receipts + fixtures            |
|    - lattice verify <receipt>    - materialize replay envelopes        |
|    - lattice export              - run regression gates (cost/quality) |
+-----------------------------------------------------------------------+
```

### Component Responsibilities

| Component | New / Modified | Responsibility | Files |
|-----------|----------------|----------------|-------|
| `CapabilityContract` types | NEW | Public type declaring `budget`, `qualityFloor`, `invariants`, `tripwires`; serializable + hashable for receipts. | `packages/lattice/src/contract/contract.ts` (new) |
| `evaluateContractAgainstRoute` | NEW | Pre-flight proof. Given a `RouteDecision` + `CapabilityContract`, returns `{ ok: true, proof } \| { ok: false, reasons }`. Pure, deterministic. | `packages/lattice/src/contract/preflight.ts` (new) |
| `routeDeterministically` | MODIFIED | Carry a new `contract` field on `RouteRequest`; contract-incompatible candidates rejected via new `RouteRejectReason` codes (`contract-budget-exceeded`, `contract-quality-floor`, `contract-modality-missing`). The existing `selected === undefined` branch still drives the result. | `packages/lattice/src/routing/router.ts` |
| `Tripwire` runtime | NEW | Streaming/structured invariant check evaluated after `provider.execute` returns (and ideally during streaming once streaming lands). Aborts with `TripwireViolationError`. | `packages/lattice/src/contract/tripwire.ts` (new) |
| `validateOutputMap` | MODIFIED | After Standard-Schema validation succeeds, run `runTripwires(contract, outputs, plan)`. On violation, return a typed `RunFailure` with `error.kind: "tripwire_violation"`. | `packages/lattice/src/outputs/validate.ts` |
| `CapabilityReceipt` | NEW | Canonical attested record: `{ runId, planId, inputs[], route, packagingPlan, modelVersions, contract, contractVerdict, outputHashes, signature, signerKeyId, issuedAt, redacted }`. | `packages/lattice/src/receipts/receipt.ts` (new) |
| Ed25519 signer | NEW | Web Crypto subtle-based signer (`generateKey`/`sign`/`verify`) with key-id + JWK export, mirroring `fingerprintArtifactValue` style. | `packages/lattice/src/receipts/sign.ts` (new) |
| Replay envelope | MODIFIED | Embed `receipt?: CapabilityReceipt` and `contract?: CapabilityContract` so a receipt fully reconstructs an envelope. | `packages/lattice/src/replay/replay.ts` |
| `LatticeRunError` union | MODIFIED | Add `NoContractMatchError` and `TripwireViolationError`; existing kinds untouched. | `packages/lattice/src/results/errors.ts` |
| Public exports | MODIFIED | Export `contract`, `tripwire`, `createReceipt`, `verifyReceipt`, new types from `runtime/public-types.ts`. | `packages/lattice/src/index.ts` |
| `lattice` CLI | NEW (separate package) | Node bin: `lattice repro <id>`, `lattice verify <receipt>`. Depends on `lattice` runtime via workspace path. | `packages/lattice-cli/` (new) |
| `lattice eval` | NEW (same CLI, sub-command) | CI gate: load receipts + fixtures dir, replay, compare cost/quality vs baselines, exit non-zero on regression. | `packages/lattice-cli/src/commands/eval.ts` (new) |

## Recommended Project Structure

```
packages/
+-- lattice/                                  # existing runtime, MODIFIED
|   +-- src/
|   |   +-- contract/                         # NEW
|   |   |   +-- contract.ts                   # CapabilityContract types, contract() factory
|   |   |   +-- preflight.ts                  # evaluateContractAgainstRoute()
|   |   |   +-- tripwire.ts                   # Tripwire runtime, runTripwires()
|   |   |   +-- hash.ts                       # canonicalize() + SHA-256 over contract
|   |   |   +-- index.ts
|   |   +-- receipts/                         # NEW
|   |   |   +-- receipt.ts                    # createReceipt(), CapabilityReceipt type
|   |   |   +-- sign.ts                       # Ed25519 sign/verify (Web Crypto subtle)
|   |   |   +-- canonical.ts                  # deterministic JSON canonicalization
|   |   |   +-- redact.ts                     # receipt-specific redaction, reuses replay
|   |   |   +-- index.ts
|   |   +-- routing/router.ts                 # MODIFIED: contract field + new reject codes
|   |   +-- runtime/create-ai.ts              # MODIFIED: preflight + tripwire + receipt hooks
|   |   +-- outputs/validate.ts               # MODIFIED: tripwire stage between schema + return
|   |   +-- replay/replay.ts                  # MODIFIED: envelope carries receipt + contract
|   |   +-- results/errors.ts                 # MODIFIED: new error kinds
|   |   +-- index.ts                          # MODIFIED: new exports
|   +-- package.json
|
+-- lattice-cli/                              # NEW package
|   +-- src/
|   |   +-- bin/lattice.ts                    # shebang entry, argv parser (citty/cac)
|   |   +-- commands/
|   |   |   +-- repro.ts                      # lattice repro <receipt-id>
|   |   |   +-- verify.ts                     # lattice verify <receipt-path>
|   |   |   +-- eval.ts                       # lattice eval (CI gate)
|   |   |   +-- export.ts                     # optional: dump receipt -> fixture
|   |   +-- fixtures/loader.ts                # fixture <-> receipt materialization
|   |   +-- gate/                             # regression thresholds + diff
|   |   |   +-- cost.ts
|   |   |   +-- quality.ts
|   |   +-- index.ts
|   +-- package.json                          # bin: { lattice: dist/bin/lattice.js }
|
+-- examples/                                  # existing work-inbox showcase
    +-- ...                                    # extended to demonstrate contracts/receipts
```

### Structure Rationale

- **`contract/` and `receipts/` as new top-level domains** inside `lattice` — match the existing flat domain layout (`routing/`, `outputs/`, `replay/`, `tracing/`). Avoids cross-cutting placement.
- **`lattice-cli` is a separate package**, not inside `lattice` — keeps the runtime's `dependencies` set to `@standard-schema/spec` and `mime` only (per the current `package.json`); CLI brings in argv parsers and Node-only concerns (`fs`, `path`, `process.argv`) that would otherwise bloat the runtime bundle and break its `sideEffects: false` declaration. CLI also has different release cadence and version policy than the runtime SDK.
- **Single `lattice` bin owning multiple subcommands** (`repro`, `verify`, `eval`, `export`) rather than separate `lattice-repro` / `lattice-eval` binaries — matches how `vitest`/`tsc`/`pnpm` operate; one install, predictable UX for CI.
- **Canonicalization and signing isolated in `receipts/`** so contracts can be hashed (`contract/hash.ts` re-exports `receipts/canonical.ts`) without circular deps; both reuse `crypto.subtle` like `storage/fingerprint.ts`.

## Architectural Patterns

### Pattern 1: Pre-flight contract proof as router-extension, not runtime if-else

**What:** Pass the `CapabilityContract` into `routeDeterministically` and let it produce `RouteRejectReason` entries in the same `noRouteReasons` list that already exists. The runtime keeps its single "no route" branch.

**When to use:** Whenever a constraint can be expressed as a deterministic predicate over `ModelCapability` + `RouteEstimates`. Contract budget, quality floor (mapped to capability tier), required modalities, and required structured-output support all fit.

**Trade-offs:**
- Pro: zero new branches in `runWithConfig` — the existing `if (selected === undefined)` block (create-ai.ts:135-153) now also covers no-contract-match.
- Pro: contract reasons appear in `plan.warnings` and `plan.route.noRouteReasons` for free, satisfying inspectability.
- Con: requires a discriminated reason taxonomy so callers can distinguish "no capable model" from "no model under budget" — solved by stable `code` strings (`contract-budget-exceeded`, `contract-quality-floor`, `contract-modality-missing`, `contract-privacy-mismatch`).

**Example:**
```typescript
// router.ts (modified)
export interface RouteRequest {
  // ... existing fields
  readonly contract?: CapabilityContract;     // NEW
}

function addContractRejectReasons(
  reasons: RouteRejectReason[],
  capability: ModelCapability,
  estimates: RouteEstimates,
  contract: CapabilityContract,
): void {
  if (contract.budget?.maxCostUsd !== undefined &&
      estimates.costUsd !== undefined &&
      estimates.costUsd > contract.budget.maxCostUsd) {
    reasons.push({
      code: "contract-budget-exceeded",
      message: `Estimated ${estimates.costUsd} exceeds contract budget ${contract.budget.maxCostUsd}.`,
    });
  }
  if (contract.qualityFloor !== undefined &&
      capability.qualityTier !== undefined &&
      capability.qualityTier < contract.qualityFloor) {
    reasons.push({
      code: "contract-quality-floor",
      message: `${capability.modelId} below required quality floor ${contract.qualityFloor}.`,
    });
  }
  // ... etc
}
```

Then in create-ai.ts, the only change is to add a typed surface — the existing no-route failure becomes:
```typescript
if (selected === undefined) {
  const contractReasons = plan.route.noRouteReasons.filter(r => r.code.startsWith("contract-"));
  const kind = contractReasons.length > 0 ? "no_contract_match" : "no_route";
  // ... return typed failure
}
```

### Pattern 2: Tripwires as a validation-stage decorator

**What:** Tripwires are output predicates that run after Standard Schema validation succeeds but before `validateOutputMap` returns success. Each tripwire receives the validated outputs + the `ExecutionPlan` and returns `{ ok: true } | { ok: false, reason }`.

**When to use:** When invariants are semantic, not structural — "no PII in output", "policy citation count >= 1", "tool action is in allow-list". Schema validation cannot express these.

**Trade-offs:**
- Pro: composes cleanly with existing `validateOutputMap` — adding a second pass after schema-valid is one new branch.
- Pro: tripwire violations produce a typed `RunFailure` with `error.kind: "tripwire_violation"`, plan stays inspectable.
- Pro: stage tracking in `plan.stages` extends naturally — add `"tripwire"` to `ExecutionStageKind` between `"validation"` and `"persistence"`.
- Con: streaming/mid-stream abort is harder than post-execution; v1.1 should specify post-execution semantics first and document "mid-stream" as a forward-compatible extension once streaming providers land.

**Example:**
```typescript
// outputs/validate.ts (modified, after schema loop)
export async function validateOutputMap<TOutputs extends OutputContractMap>(
  contracts: TOutputs,
  rawOutputs: Record<string, unknown>,
  plan: ResultPlan,
  contract?: CapabilityContract,            // NEW optional param
): Promise<RunResult<TOutputs>> {
  // ... existing schema validation produces `outputs`

  if (contract?.tripwires?.length) {
    const violation = await runTripwires(contract.tripwires, outputs, plan);
    if (!violation.ok) {
      return {
        ok: false,
        error: {
          kind: "tripwire_violation",
          message: violation.reason,
          tripwireName: violation.name,
        },
        raw: rawOutputs,
        partialOutputs: outputs,
        plan,
      };
    }
  }

  return { ok: true, outputs, artifacts: [], plan };
}
```

### Pattern 3: Receipt as a post-run side effect with deterministic canonicalization

**What:** A `CapabilityReceipt` is built after the successful (or failed) run terminates inside `runWithConfig` and signed with a configured Ed25519 key. Receipts are returned as part of `RunSuccess` (new `receipt: CapabilityReceipt` field) and embedded in `ReplayEnvelope`. Failed runs may also emit a receipt — the `contractVerdict` field encodes pass/fail.

**When to use:** Always, when a signer key is configured on `LatticeConfig`. When no signer, receipts are still produced but `signature` is omitted and a warning is added to the plan.

**Trade-offs:**
- Pro: receipts are derived data — no new orchestrator branches, just a final `await issueReceipt(...)` call before `return`.
- Pro: canonical JSON enables deterministic hashing and CI fixture round-trips.
- Pro: re-using `redactPlan`/`redactArtifactRef` from `replay.ts` keeps a single redaction surface.
- Con: signing has async overhead and key-material lifecycle concerns — must define `LatticeConfig.signer?: { keyId, sign(bytes), publicKeyJwk }`.

**Example:**
```typescript
// receipts/receipt.ts (new)
export interface CapabilityReceipt {
  readonly kind: "capability-receipt";
  readonly version: 1;
  readonly id: string;                       // receipt:<uuid>
  readonly runId: string;
  readonly planId: string;
  readonly issuedAt: string;
  readonly runtimeVersion: string;
  readonly catalogVersion: string;
  readonly contract?: CapabilityContractRef; // hash + canonical form
  readonly contractVerdict: "satisfied" | "violated" | "absent";
  readonly route: { providerId: string; modelId: string; score: number };
  readonly modelVersions: Record<string, string>;
  readonly inputs: readonly { artifactId: string; fingerprint: ArtifactFingerprint }[];
  readonly outputHashes: Record<string, ArtifactFingerprint>;
  readonly usage?: UsageRecord;
  readonly redaction: "default" | "none" | "custom";
  readonly signature?: { algorithm: "ed25519"; keyId: string; value: string };
}

export async function createReceipt(input: {
  plan: ExecutionPlan;
  result: RunResult<OutputContractMap>;
  contract?: CapabilityContract;
  signer?: ReceiptSigner;
}): Promise<CapabilityReceipt> { /* ... */ }
```

### Pattern 4: CLI as thin replay-envelope materializer

**What:** `lattice repro <receipt-id>` is a CLI that (a) reads the receipt from a known location (`.lattice/receipts/<id>.json` by convention, or path arg), (b) rebuilds a `ReplayEnvelope` from receipt + referenced artifact fixtures, (c) calls `replayOffline(envelope)` from the runtime. CLI never re-implements runtime logic.

**When to use:** Local repro of a production thumbs-down ("I have receipt-abc, what did this run actually do?"), CI regression checks.

**Trade-offs:**
- Pro: CLI surface stays tiny — argv parsing + filesystem IO + a single runtime call.
- Pro: keeps runtime free of `process`/`fs` imports; runtime stays runnable in workers/edge.
- Con: receipts must reference artifact storage in a portable way — `ArtifactStorageRef` already supports `local`/`memory`, but CLI needs a stable convention for fixture directory layout (proposed `.lattice/fixtures/<sha256>.bin`).

### Pattern 5: `lattice eval` regression gates as plan-comparison

**What:** `lattice eval` walks a directory of receipts treated as fixtures, replays each, and compares replay outcome against the recorded receipt on three axes: contract verdict (must still be `"satisfied"`), cost (`usage.costUsd` within threshold), and quality floor (any new tripwire violation fails the gate). Exits non-zero on regression.

**When to use:** CI on every PR for any project that has captured production receipts as fixtures.

**Trade-offs:**
- Pro: fixtures *are* receipts — no parallel fixture format to maintain.
- Pro: leverages `replayOffline` and `rerunLive` already in `replay/replay.ts`.
- Con: fake-provider configuration must be reconstructable from receipts when running offline; live re-run requires real provider config + cost budget for CI.

## Data Flow

### Request Flow (new components annotated NEW)

```
ai.run({ task, artifacts, outputs, policy, contract })       (NEW: contract)
    |
    v
buildPlan()
    |
    +-> prepareArtifacts (existing)
    +-> mergePolicy (existing)
    +-> createCapabilityCatalog (existing)
    +-> routeDeterministically(catalog, { ..., contract })   (NEW: contract field)
    |        |
    |        +-> evaluateCapability (existing) + addContractRejectReasons (NEW)
    |        +-> RouteDecision { selected?, noRouteReasons }
    |
    +-> buildContextPack (existing)
    +-> packageArtifactsForProvider (existing)
    +-> createExecutionPlan (existing; warnings now include contract reasons)
    |
    v
runWithConfig()
    |
    +-> selected === undefined ?
    |      \-- YES: classify reasons; return RunFailure with
    |              error.kind = "no_contract_match" | "no_route"          (NEW kind)
    |              + still emit receipt with contractVerdict="absent"     (NEW)
    |
    +-> for each route in [selected, ...fallbackChain]:
    |      adapter.execute(request)
    |      validateOutputMap(outputs, rawOutputs, plan, contract)         (NEW: contract)
    |          +-> schema validation (existing)
    |          +-> runTripwires(contract.tripwires, outputs, plan)        (NEW)
    |                  \-- on violation: return RunFailure
    |                          error.kind = "tripwire_violation"          (NEW)
    |                          + emit receipt with contractVerdict="violated"
    |
    +-> on success:
    |      createReceipt({ plan, result, contract, signer })              (NEW)
    |      attach receipt to RunResult                                    (NEW)
    |      emit run.complete event with receiptId                         (NEW)
    |
    v
RunResult { ok, outputs?, artifacts, plan, events, receipt }              (NEW: receipt)
```

### Receipt -> Repro Flow

```
production run --> createReceipt() --> sign --> RunResult.receipt
                                                  |
                                                  v
                                         (developer or CI stores .lattice/receipts/<id>.json
                                          and any referenced artifacts at .lattice/fixtures/<sha256>.bin)
                                                  |
                                                  v
              `lattice repro receipt-abc`
                                                  |
                                                  v
              loader: read receipt + verify signature + load fixtures
                                                  |
                                                  v
              materializeReplayEnvelope(receipt, fixtures) -> ReplayEnvelope
                                                  |
                                                  v
              replayOffline(envelope) -> RunResult (deterministic)
                                                  |
                                                  v
              CLI prints diff vs receipt.outputHashes; exits 0/1
```

### `lattice eval` Flow

```
.lattice/fixtures/*.receipt.json --> loader --> [Receipt, Fixture[]]
                                                |
                                                v
                            for each: replayOffline()
                                                |
                                                v
                                regression diff:
                                  - contract verdict still "satisfied" ?
                                  - cost within thresholds.cost.maxDelta ?
                                  - tripwires still pass ?
                                  - output hashes match ?
                                                |
                                                v
                            summary table -> exit 0 (pass) or 1 (regression)
```

### Key Data Flows

1. **Contract proof flow:** `CapabilityContract` flows from `RunIntent` -> `buildPlan` -> `RouteRequest` -> `evaluateCapability` -> `RouteRejectReason[]` -> `RouteDecision.noRouteReasons` -> `RunFailure.error`. No new orchestrator branch; only a refinement of the existing `selected === undefined` branch.
2. **Tripwire flow:** Contract flows from `RunIntent` -> `runWithConfig` -> `validateOutputMap(contract)` -> `runTripwires` -> `RunFailure` (on violation) or continued success path.
3. **Receipt flow:** Plan + result + contract + signer -> `createReceipt` -> canonical JSON -> Ed25519 sign -> attach to `RunResult` and to `ReplayEnvelope`.
4. **Replay reconstruction:** `Receipt` -> `materializeReplayEnvelope` -> `ReplayEnvelope` -> `replayOffline` -> deterministic `RunResult`.

## Public API Impact

### `index.ts` exports (new)

```typescript
// Value exports
export { contract } from "./contract/contract.js";
export { tripwire } from "./contract/tripwire.js";
export { createReceipt, verifyReceipt } from "./receipts/receipt.js";
export { createEd25519Signer, generateEd25519KeyPair } from "./receipts/sign.js";

// Type exports
export type {
  CapabilityContract,
  CapabilityContractBudget,
  CapabilityContractRef,
  Tripwire,
  TripwireResult,
} from "./runtime/public-types.js";
export type {
  CapabilityReceipt,
  ReceiptSigner,
  ReceiptVerification,
} from "./runtime/public-types.js";
```

### `RunIntent` extension (modified)

```typescript
export interface RunIntent<TOutputs extends OutputContractMap> {
  // ... existing fields
  readonly contract?: CapabilityContract;     // NEW, optional -> backwards compatible
}
```

### `RunSuccess` / `RunFailure` extension (modified)

```typescript
export interface RunSuccess<TOutputs extends OutputContractMap> {
  // ... existing fields
  readonly receipt?: CapabilityReceipt;       // NEW, optional
}

export interface RunFailure {
  // ... existing fields
  readonly receipt?: CapabilityReceipt;       // NEW, optional
}
```

### `LatticeRunError` union (modified)

```typescript
export interface NoContractMatchError {
  readonly kind: "no_contract_match";
  readonly message: string;
  readonly contractReasons: readonly { code: string; message: string }[];
}
export interface TripwireViolationError {
  readonly kind: "tripwire_violation";
  readonly message: string;
  readonly tripwireName: string;
}
export type LatticeRunError =
  | ValidationError
  | ExecutionUnavailableError
  | NoRouteError
  | ProviderExecutionError
  | TimeoutError
  | NoContractMatchError      // NEW
  | TripwireViolationError;   // NEW
```

### `ReplayEnvelope` extension (modified)

```typescript
export interface ReplayEnvelope<TOutputs extends OutputContractMap = OutputContractMap> {
  // ... existing fields
  readonly contract?: CapabilityContract;     // NEW
  readonly receipt?: CapabilityReceipt;       // NEW
}
```

### `LatticeConfig` extension (modified)

```typescript
export interface LatticeConfig {
  // ... existing fields
  readonly signer?: ReceiptSigner;            // NEW, optional
  readonly defaults?: {                       // existing
    // ...
    readonly contract?: CapabilityContract;   // NEW
  };
}
```

### Backwards Compatibility

- All new `RunIntent`, `RunSuccess`, `RunFailure`, `ReplayEnvelope`, `LatticeConfig` fields are **optional** -> v1.0 consumer code compiles unchanged.
- New `LatticeRunError` variants are additive; v1.0 callers that exhaustively switch on `error.kind` will see TypeScript flag missing branches but only at compile time, never at runtime — code without `default` clauses still receives a typed object.
- `validateOutputMap` adds an optional `contract` parameter -> existing call sites in `create-ai.ts` continue compiling; the new behavior is opt-in.
- `routeDeterministically`'s new `contract` field on `RouteRequest` is optional; existing callers (only one: `buildPlan`) keep working.
- New `RouteRejectReason.code` values are strings; the existing taxonomy is untouched and the reason code space is open.
- `lattice-cli` is a separate package — zero impact on `lattice` runtime consumers who do not install the CLI.

## Suggested Build Order (respects dependencies)

Phases are ordered so each phase only depends on prior phases.

1. **Phase A — Contract Types & Pre-flight Proof** (depends on: existing router only)
   - Add `contract/contract.ts` (types + `contract()` factory).
   - Add `contract/preflight.ts` (`addContractRejectReasons`).
   - Extend `routing/router.ts` `RouteRequest` with optional `contract`.
   - Extend `runtime/create-ai.ts` `buildPlan` to pass `intent.contract` through.
   - Extend `runWithConfig` no-route branch to classify `no_contract_match`.
   - Extend `LatticeRunError` with `NoContractMatchError`.
   - Tests: catalog with all candidates over-budget -> `no_contract_match`.

2. **Phase B — Tripwire Runtime** (depends on: A for contract type)
   - Add `contract/tripwire.ts` (`tripwire()` factory + `runTripwires`).
   - Modify `outputs/validate.ts` to take optional `contract` and run tripwires after schema validation.
   - Modify `runWithConfig` provider-loop validation call to pass `intent.contract`.
   - Extend `ExecutionStageKind` with `"tripwire"`; insert stage between `validation` and `persistence`.
   - Extend `LatticeRunError` with `TripwireViolationError`.
   - Tests: a fake provider returns output, schema valid, tripwire fails -> `tripwire_violation`.

3. **Phase C — Receipt Issuance + Signing** (depends on: A, B; also depends on `plan/plan.ts` + `storage/fingerprint.ts`)
   - Add `receipts/canonical.ts` (deterministic JSON).
   - Add `receipts/sign.ts` (Ed25519 via `crypto.subtle`; mirrors `fingerprintArtifactValue` style).
   - Add `receipts/receipt.ts` (`createReceipt`, `verifyReceipt`).
   - Add `LatticeConfig.signer` and `defaults.contract`.
   - In `runWithConfig`, after success and after failure paths, call `createReceipt` and attach to result.
   - Add tests for: receipt determinism (same plan + result -> same canonical bytes), signature round-trip, redaction.

4. **Phase D — Replay Envelope Integration** (depends on: C)
   - Extend `ReplayEnvelope` with `contract` + `receipt`.
   - Modify `createReplayEnvelope` to copy receipt from `result.receipt`.
   - Add `materializeReplayEnvelope(receipt, artifactLoader)` helper for CLI use.
   - Tests: round-trip receipt -> envelope -> `replayOffline` -> matching outputs.

5. **Phase E — `lattice` CLI scaffolding** (depends on: C, D)
   - Create `packages/lattice-cli/` workspace package.
   - Wire `bin: { lattice: dist/bin/lattice.js }` and `dependencies: { lattice: "workspace:*", citty: "^x" }` (or similar small argv parser).
   - Implement `lattice repro <receipt-id|path>` -> load -> materialize -> `replayOffline` -> diff vs receipt.outputHashes.
   - Implement `lattice verify <receipt-path>` -> verify signature against provided public key (`--key` flag or `.lattice/keys/`).
   - Tests: snapshot the CLI output for a fixture receipt.

6. **Phase F — `lattice eval` CI gate** (depends on: E)
   - Implement `lattice eval [--fixtures dir] [--thresholds file]`.
   - Implement gate diffs: `gate/cost.ts`, `gate/quality.ts`.
   - Document fixture layout: `.lattice/fixtures/<name>.receipt.json` + `.lattice/fixtures/artifacts/<sha256>.bin`.
   - Tests: a fixture with a baseline + a fake provider that costs more -> exit 1 with diff table.

7. **Phase G — Showcase update** (depends on: A-F)
   - Update `examples/work-inbox` to declare a contract, exercise a tripwire, capture a receipt, and run `lattice eval` on its fixtures.
   - Verify the end-to-end demo: contract refusal, tripwire abort, signed receipt, repro CLI, eval gate.

## Architectural Decisions to Lock Before Implementation

1. **CLI package location.** Recommended: separate workspace package `packages/lattice-cli` with a single `lattice` bin owning subcommands. Locks: runtime stays Node-version-agnostic and free of `fs`/`process` imports; CLI can pin Node features without affecting runtime consumers.
2. **`contract` is a first-class `RunIntent` field**, not a member of `policy`. Rationale: policy is provider-routing constraints, contract is run-level attestation. Mixing them confuses semantics and complicates the receipt schema. (Backwards compatible — `policy` unchanged.)
3. **Tripwire timing: post-execution in v1.1.** Defer mid-stream abort to v1.2 once streaming providers land. Document the forward-compat hook so contracts that declare streaming tripwires still load.
4. **Receipts are produced on both success and failure.** A failure receipt with `contractVerdict: "violated"` is more valuable for repro than no receipt; CI can distinguish via `contractVerdict`.
5. **Canonical JSON is internal to `receipts/`.** No public canonicalization helper — keeps the surface small. Receipts are *consumed* via `verifyReceipt`; canonicalization is an implementation detail.
6. **Ed25519 via Web Crypto subtle.** Matches `storage/fingerprint.ts` style (SHA-256 via subtle). Avoids a Node-only crypto dependency and keeps the runtime portable to workers/edge environments.
7. **`signer` is a configuration on `createAI`, not on `ai.run`.** Per-run signer override is out of scope for v1.1; one signer per AI instance keeps key lifecycle predictable.
8. **Fixture directory convention** under `.lattice/` (not project root). Locks CLI defaults; users can override via `--fixtures` flag.
9. **No contract serialization format split — contracts are typed JS values, hashed at runtime.** No YAML/JSON file loader in v1.1; CLI loads contracts indirectly via the embedded contract in receipts. Defer file-format support to v1.2.

## Anti-Patterns

### Anti-Pattern 1: Embedding contract evaluation inside `runWithConfig` as separate guards

**What people do:** Add `if (intent.contract && estimates.costUsd > intent.contract.budget) throw` style guards directly inside the runtime loop, separate from routing.
**Why it's wrong:** Bypasses the deterministic-router invariant. Contract violations would now appear in two places: as a router rejection (good) and as a runtime throw (bad). Also splits the no-route taxonomy.
**Do this instead:** Push the predicate into `evaluateCapability`/`addPolicyRejectReasons`-style helpers; let the existing `noRouteReasons` mechanism surface them. Runtime only classifies the final failure kind.

### Anti-Pattern 2: Putting the CLI in the same package as the runtime

**What people do:** Add `bin: { lattice: dist/bin/lattice.js }` to `packages/lattice/package.json` and import `node:fs`/`node:path` from runtime modules behind feature flags.
**Why it's wrong:** Breaks `sideEffects: false`; forces runtime to depend on Node-only modules; bloats the install for SDK consumers that only want `createAI`; complicates `attw`/`publint` checks already in CI (`lint:packages` script).
**Do this instead:** Separate `lattice-cli` workspace package with `workspace:*` dependency on `lattice`. CLI ships separately and can be installed only where needed (CI, dev tooling).

### Anti-Pattern 3: Treating receipts as opaque logs

**What people do:** Stringify the receipt as JSON and stash it in stdout/log files without canonicalization, signing, or schema.
**Why it's wrong:** Defeats the point. Receipts must be deterministic (so two correct runs hash to the same canonical bytes), signed (so tampering is detectable), and structured (so `lattice eval` can compare). Opaque logs cannot back a CI gate.
**Do this instead:** Always go through `createReceipt()`. Always canonicalize before signing. Always include `runtimeVersion`, `catalogVersion`, `modelVersions` — the three things that invalidate replays.

### Anti-Pattern 4: Schema validation doing tripwire work

**What people do:** Cram semantic checks into the Zod/Standard Schema definition (`.refine(noPii)`, `.refine(hasCitations)`).
**Why it's wrong:** Schemas describe structure; refinements lose the ability to report a stable `tripwireName` and don't compose with contract-level redaction. They also can't be authored separately from output contracts.
**Do this instead:** Keep schemas structural. Express semantic invariants as `tripwire()` declarations on the contract, owned by the same team that owns the contract, not the team that owns the output shape.

### Anti-Pattern 5: Re-implementing replay inside the CLI

**What people do:** Have `lattice repro` build providers, call adapters, validate outputs itself.
**Why it's wrong:** Drift. Any router or validator change must be replicated. Defeats the purpose of `replayOffline` already existing.
**Do this instead:** CLI's only job is artifact + receipt IO -> envelope materialization -> single call to `replayOffline(envelope)`.

## Integration Points

### Existing modules + new touch points

| Existing module | Change | Public-API breaking? |
|-----------------|--------|----------------------|
| `runtime/create-ai.ts` (createAI, buildPlan, runWithConfig) | Add `contract` field through `RunIntent` -> `RouteRequest` -> `validateOutputMap`; call `createReceipt` at terminal branches | No (additive optional fields) |
| `routing/router.ts` (RouteRequest, evaluateCapability) | Add optional `contract`; add `addContractRejectReasons` | No |
| `plan/plan.ts` (ExecutionStageKind) | Add `"tripwire"` stage kind | No (new union variant) |
| `outputs/validate.ts` (validateOutputMap) | Optional `contract` param; run tripwires post-schema | No (param is optional) |
| `replay/replay.ts` (ReplayEnvelope, createReplayEnvelope, redact*) | Carry receipt + contract; reuse `redactPlan`/`redactArtifactRef` for receipts | No |
| `results/result.ts` (RunSuccess, RunFailure) | Add optional `receipt` | No |
| `results/errors.ts` (LatticeRunError) | Add 2 new error kinds | No (additive) |
| `runtime/public-types.ts` | Re-export new types | No |
| `index.ts` | Add new value + type exports | No |
| `storage/fingerprint.ts` | Reused as-is for input/output hashing inside receipts | No |
| `tracing/tracing.ts` (RunEvent kinds) | Add `contract.evaluated`, `tripwire.fired`, `receipt.issued` | No (new event kinds; consumers ignore unknown) |

### New modules (boundaries)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `lattice/contract` <-> `lattice/routing` | `routing/router.ts` imports types + `addContractRejectReasons` from `contract/preflight.ts` | One-way dependency. `contract/` never imports from `routing/`. |
| `lattice/contract` <-> `lattice/outputs` | `outputs/validate.ts` imports `runTripwires` from `contract/tripwire.ts` | One-way. |
| `lattice/receipts` <-> `lattice/replay` | `replay/replay.ts` imports `CapabilityReceipt` type; `receipts/` imports `redactPlan` from `replay/`. To break the cycle, move `redactPlan` to a small `redact/` module both depend on, or duplicate the receipt-specific redactor inside `receipts/redact.ts`. **Decision: keep redaction primitives in `replay/replay.ts`; `receipts/` imports from `replay/`, and `replay/` imports types-only from `receipts/` (`import type`).** | type-only import avoids cycle. |
| `lattice-cli` <-> `lattice` | `workspace:*` dep; CLI imports public `createAI`, `replayOffline`, `verifyReceipt`, `createEd25519Signer` | One-way. CLI never reaches into `lattice/src/`. |
| `lattice-cli` <-> filesystem | Node `fs/promises`, `path` | Isolated to `lattice-cli`. Runtime stays portable. |

### External services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Ed25519 (Web Crypto) | `crypto.subtle.generateKey({ name: "Ed25519" })`, `.sign()`, `.verify()` | Available in Node >=24 (already required per `engines.node`), browsers (recent), and modern workers. |
| Filesystem (CLI only) | `node:fs/promises` for receipt + fixture IO | Lives only in `lattice-cli`. |

## Scaling Considerations

The runtime is a per-call SDK rather than a server; "scaling" maps to throughput per process and to receipt-storage growth.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 receipts/day (developer machine) | In-process signing; receipts in-memory or to `.lattice/receipts/`. No optimization needed. |
| 100-100k receipts/day (production app) | Async receipt emission (don't block `ai.run` return on disk write); user provides a `signer` whose `sign(bytes)` may proxy to a KMS. Receipt body is < 4 KB redacted; storage cost is negligible. |
| 100k+ receipts/day (high-volume) | Sampled receipts (configured at `LatticeConfig` with `receipts.sampleRate`); receipt fingerprint index so `lattice eval` can pick representative fixtures without scanning all. Out of scope for v1.1 but the schema's `id` + `issuedAt` already supports it. |

### Scaling Priorities

1. **First bottleneck — signing throughput.** Ed25519 is fast (~30k sig/s on modern CPU), but signing inline still adds latency. Mitigation: make signing post-response with a hook, so `ai.run` returns immediately and the receipt resolves on a follow-up promise. v1.1 keeps it synchronous for determinism; v1.2 can add async mode.
2. **Second bottleneck — receipt storage IO.** When CI fixtures live in git, repos grow. Mitigation: store artifact bodies content-addressed under `.lattice/fixtures/<sha256>.bin`; receipts only carry refs. CLI's loader resolves refs to artifact stores already abstracted by `ArtifactStorageRef`.

## Sources

- Codebase ground truth (read on 2026-05-11):
  - `packages/lattice/src/runtime/create-ai.ts` (lines 119-383 govern run lifecycle)
  - `packages/lattice/src/routing/router.ts` (lines 26-81, 166-238 govern route + policy rejection)
  - `packages/lattice/src/plan/plan.ts` (lines 9-161 govern plan + reason taxonomy)
  - `packages/lattice/src/outputs/validate.ts` (lines 43-78 govern validation entry point)
  - `packages/lattice/src/replay/replay.ts` (lines 25-114 govern envelope + redaction)
  - `packages/lattice/src/results/errors.ts` (lines 36-42 govern run error union)
  - `packages/lattice/src/storage/fingerprint.ts` (entire file; pattern for crypto.subtle usage)
  - `packages/lattice/src/index.ts` (entire file; current public surface)
  - `packages/lattice/package.json` (engines.node >= 24 confirms Ed25519/Web Crypto availability)
  - `.planning/PROJECT.md` (v1.1 milestone goals, constraints, validated phases)
  - `pnpm-workspace.yaml` (workspace shape supports adding `packages/lattice-cli`)
- Web Crypto Ed25519 support in Node >= 24: Node release notes (training-data; HIGH confidence given Node 22+ has Ed25519 in subtle).
- Standard Schema spec: existing dependency `@standard-schema/spec` already used by validation pipeline; no new dep needed for tripwires.

---
*Architecture research for: Capability Receipts (v1.1) integration with Lattice runtime SDK*
*Researched: 2026-05-11*
