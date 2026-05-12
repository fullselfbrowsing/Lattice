---
phase: 13-showcase-update-and-milestone-validation
plan: "01"
subsystem: showcase
tags: [contracts, tripwires, receipts, ed25519, signing, work-inbox, esm]

requires:
  - phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting
    provides: contract(), inv, BudgetInvariant, preflight no-contract-match path
  - phase: 08-tripwire-invariants-with-terminal-semantics
    provides: inv.noPII + defaultPiiDetectors firing during tripwire evaluation
  - phase: 09-canonical-json-ed25519-signing-and-receipt-issuance
    provides: generateEd25519KeyPairJwk, createInMemorySigner, createMemoryKeySet, signed receipt envelopes
  - phase: 10-receipts-inside-the-replay-envelope
    provides: materializeReplayEnvelope, content-addressed input rehydration contract
  - phase: 11-lattice-cli-repro-and-verify
    provides: lattice verify / repro CLI surface + keyset-loader (array shape), receipt-loader (id-or-path)
  - phase: 12-lattice-eval-ci-gate
    provides: lattice eval --init-baseline CLI surface referenced in next-step output
provides:
  - Three-scenario v1.1 showcase entry (examples/work-inbox/index.mjs)
  - On-disk .lattice/ tree consumed by Plan 13-02 integration test
  - Reusable showcase helpers (setup.mjs) for future end-to-end demos
affects:
  - 13-02-integration-test
  - any future v1.x showcase that needs the same disk layout

tech-stack:
  added: []
  patterns:
    - "ESM .mjs showcase orchestrator delegates to setup.mjs + scenarios/*.mjs"
    - "Content-addressed input fixtures (sha256(value) -> <hex>.bin) for repro rehydration"
    - "Per-run fresh Ed25519 keypair; keyset.json is an array of KeyEntry (CLI loader contract)"

key-files:
  created:
    - examples/work-inbox/setup.mjs
    - examples/work-inbox/scenarios/success.mjs
    - examples/work-inbox/scenarios/tripwire.mjs
    - examples/work-inbox/scenarios/no-contract-match.mjs
  modified:
    - examples/work-inbox/index.mjs
    - .gitignore

key-decisions:
  - "Use 'success' (not 'pass') as the success ContractVerdict literal — matches packages/lattice/src/receipts/types.ts; the plan text used 'pass' but the public API uses 'success'."
  - "Write keyset.json as a JSON array of KeyEntry (not a { version, keys } object) — packages/lattice-cli/src/io/keyset-loader.ts only accepts the array shape."
  - "Mint kid as 'showcase-<uuid>' in the showcase rather than reading it from generateEd25519KeyPairJwk — the generator returns only { privateKeyJwk, publicKeyJwk }."
  - "Load each input fixture as text bytes (not as a path string) so the runtime's value-fingerprint matches the bytes we write content-addressed to .lattice/fixtures/."
  - "Give the no-contract-match scenario a custom capability with non-zero pricing (inputPer1kTokens=1) — the default fake provider has pricing 0, so a 0 estimated cost would never exceed the sub-cent budget, defeating the scenario."
  - "Pass full receipt paths in the 'Next steps' block (rather than bare ids) so 'lattice repro' works from repo root cwd; the bare-id form resolves against './.lattice/receipts/' which does not exist there."

patterns-established:
  - "Showcase setup pattern: createShowcase() returns { ai, signer, keySet, paths } and exposes buildScenarioAI for per-scenario provider customization."
  - "Defensive scenario assertions: each scenario throws if result.ok / error.kind / contractVerdict diverges from the expected outcome — regressions surface loudly, not silently."

requirements-completed:
  - CONTRACT-01
  - CONTRACT-02
  - CONTRACT-04
  - CONTRACT-05
  - CONTRACT-06
  - COST-01
  - TRIP-01
  - TRIP-02
  - TRIP-03
  - TRIP-04
  - RECEIPT-01
  - RECEIPT-02
  - RECEIPT-03
  - RECEIPT-04
  - RECEIPT-05
  - RECEIPT-07
  - RECEIPT-10

duration: ~30 min
completed: 2026-05-12
---

# Phase 13 Plan 01: Showcase v1.1 Three-Scenario Refactor Summary

**Refactored examples/work-inbox/ from a single v1.0 script into a contract-aware three-scenario v1.1 demo (success / tripwire / no-contract-match) that emits signed Ed25519 receipts + content-addressed input artifacts under .lattice/ for Plan 13-02 to ingest.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-05-12
- **Tasks:** 3 (plus one inline fix commit for the next-step path form)
- **Files created:** 4 (setup.mjs + 3 scenario modules)
- **Files modified:** 2 (index.mjs, .gitignore)

## Accomplishments

- `pnpm example:work-inbox` from a clean checkout now runs three scenarios sequentially and exits 0.
- The success scenario yields `RunSuccess` with a signed receipt whose decoded body has `contractVerdict: "success"` (NOT "pass" — see Deviations below).
- The tripwire scenario fires `inv.noPII("answer")` against a fake provider whose `answer` contains `j.doe@example.com`; result is `RunFailure { kind: "tripwire-violated" }` with a matching signed receipt.
- The no-contract-match scenario uses `maxCostUsd: 0.0000001` against a capability with non-zero `inputPer1kTokens`; result is `RunFailure { kind: "no-contract-match" }` with a refusal receipt that has zero token usage.
- Every input artifact body is written content-addressed to `.lattice/fixtures/<sha256>.bin` so `lattice repro` can rehydrate the inputs by the hashes recorded in `inputHashes`.
- A fresh Ed25519 keypair is generated per run and written to `.lattice/keyset.json` in the CLI-loader-compatible KeyEntry-array shape.
- The final stdout block prints copy-pastable `lattice verify`, `lattice repro`, and `lattice eval --init-baseline` commands that substitute the actual success receipt id and the real on-disk paths.
- `.gitignore` ignores `examples/work-inbox/.lattice/` so generated state never enters version control.

## Task Commits

1. **Task 1: setup.mjs + .gitignore** — `b49ef44` (feat) — Disk layout helpers, fresh Ed25519 keypair, KeyEntry-array keyset, writeReceipt, writeArtifactContentAddressed.
2. **Task 2: Three scenario modules** — `c190948` (feat) — success.mjs, tripwire.mjs, no-contract-match.mjs each export `async run(ctx)`, assert verdict shape, persist signed receipt.
3. **Task 3: Rewrite index.mjs as orchestrator** — `826840f` (feat) — Sequential invocation of three scenarios, summary line per scenario, copy-pastable next-step block.
4. **Inline fix: receipt path form in next-step** — `87eea5c` (fix) — `lattice repro` next-step now passes a full receipt path so it resolves from repo-root cwd.

## Files Created/Modified

- **examples/work-inbox/setup.mjs** (created) — Shared helpers: `createShowcase`, `buildScenarioAI`, `writeArtifactContentAddressed`, `writeReceipt`.
- **examples/work-inbox/scenarios/success.mjs** (created) — Customer-support fixture run; expects `contractVerdict: "success"`.
- **examples/work-inbox/scenarios/tripwire.mjs** (created) — Email-PII fake output; expects `contractVerdict: "tripwire-violated"`.
- **examples/work-inbox/scenarios/no-contract-match.mjs** (created) — Sub-cent budget vs priced capability; expects `contractVerdict: "no-contract-match"`.
- **examples/work-inbox/index.mjs** (modified) — Thin orchestrator replacing the v1.0 single-scenario script.
- **.gitignore** (modified) — Added `examples/work-inbox/.lattice/`.

## On-disk Layout Produced

After `pnpm example:work-inbox`:

```
examples/work-inbox/.lattice/
  keyset.json                        # [{ kid: "showcase-<uuid>", state: "active", publicKeyJwk: {...} }]
  receipts/
    <success-id>.json                # contractVerdict: "success"
    <tripwire-id>.json               # contractVerdict: "tripwire-violated"
    <no-contract-match-id>.json      # contractVerdict: "no-contract-match", usage zero
  fixtures/
    <sha256-of-message-text>.bin
    <sha256-of-package-photo-text>.bin
    <sha256-of-call-transcript-text>.bin
    <sha256-of-return-policy-text>.bin
    <sha256-of-privacy-fixture-text>.bin
```

Five fixture .bin files are produced — four from the success scenario (message, package-photo, call-transcript, return-policy) and one from the tripwire + refusal scenarios which share the adversarial-privacy-case fixture (so it is written once; `writeArtifactContentAddressed` is idempotent on hash collision).

## Scenario Shapes

| Scenario | Contract | Fake provider `answer` | Expected result.error.kind | Receipt verdict |
|---|---|---|---|---|
| success | `{ budget: { maxCostUsd: 0.05 } }` | normal customer-support response | none (ok=true) | `success` |
| tripwire | `{ budget: { maxCostUsd: 0.05 }, invariants: [inv.noPII("answer")] }` | `"Refund approved for j.doe@example.com per ticket review."` | `tripwire-violated` | `tripwire-violated` |
| no-contract-match | `{ budget: { maxCostUsd: 0.0000001 } }` against capability with `inputPer1kTokens: 1` | `"(unreachable)"` | `no-contract-match` | `no-contract-match` |

## Decisions Made

See `key-decisions` in frontmatter. The most consequential ones:

1. **Verdict literal `"success"` not `"pass"`.** The plan text referenced `contractVerdict: 'pass'` throughout. The actual public-typed union in `packages/lattice/src/receipts/types.ts` is `"success" | "tripwire-violated" | "no-contract-match" | "execution-failed" | "validation-failed"`. The scenarios assert against the real API.
2. **Keyset format is `KeyEntry[]` not `{ version, keys }`.** The CLI's keyset-loader (`packages/lattice-cli/src/io/keyset-loader.ts`) only accepts a top-level JSON array. The plan's `<interfaces>` block sketched a `{ version, keys: [...] }` object — that shape is rejected by the loader.
3. **Custom capability for the refusal scenario.** Default fake provider pricing is zero. With zero pricing the estimated cost is zero, which is NOT greater than the sub-cent budget — the contract would PASS, defeating the scenario. We give the refusal-scenario provider an explicit `pricing: { inputPer1kTokens: 1, outputPer1kTokens: 1 }` so `estimateRouteCost` returns a positive number that the 0.0000001 budget rejects.
4. **Load fixture bytes for input hashing.** v1.0's `index.mjs` passed file paths (strings) into `artifact.image/audio/document`. The runtime hashes the value bytes — so the path string is what gets hashed, not the file content. For `lattice repro` to rehydrate from `.lattice/fixtures/<hash>.bin`, the hash must match the actual content bytes. Each scenario reads the fixture via `readFile` and passes the string content to `artifact.text(...)`, so the runtime hash equals sha256(file-content), and the showcase writes the same bytes to disk under that hash.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan text used `contractVerdict: 'pass'` but the runtime union uses `"success"`**
- **Found during:** Task 2 (scenarios) and Task 3 (assertion wiring)
- **Issue:** The plan's success_criteria, frontmatter, and task body all said `contractVerdict: 'pass'`. The actual `ContractVerdict` type in `packages/lattice/src/receipts/types.ts` is `"success" | "tripwire-violated" | "no-contract-match" | "execution-failed" | "validation-failed"`. The runtime emits `"success"`. Asserting against `'pass'` would fail every run.
- **Fix:** Scenarios assert and document `"success"`. SUMMARY uses `"success"` everywhere.
- **Files modified:** examples/work-inbox/scenarios/success.mjs
- **Verification:** Decoded receipt body shows `"contractVerdict":"success"` after a clean run.
- **Committed in:** c190948 (Task 2)

**2. [Rule 1 - Bug] Plan's `<interfaces>` block described `generateEd25519KeyPairJwk()` returning a `kid` field**
- **Found during:** Task 1 (setup.mjs)
- **Issue:** The plan stated `generateEd25519KeyPairJwk(): Promise<{ kid; publicKeyJwk; privateKeyJwk }>` and showed `createInMemorySigner({ kid, privateKeyJwk, publicKeyJwk })`. The actual signature in `packages/lattice/src/receipts/sign.ts` is `generateEd25519KeyPairJwk(): Promise<{ privateKeyJwk; publicKeyJwk }>` and `createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk })` (positional).
- **Fix:** Showcase mints `kid = 'showcase-<uuid>'` itself, then passes the positional args to `createInMemorySigner`.
- **Files modified:** examples/work-inbox/setup.mjs
- **Verification:** Receipt body's `kid` field matches the keyset entry's `kid` after a run; `lattice verify` returns `OK kid=showcase-<uuid>`.
- **Committed in:** b49ef44 (Task 1)

**3. [Rule 1 - Bug] Plan said keyset file shape was `{ version: "lattice-keyset/v1", keys: [...] }`**
- **Found during:** Task 1 (writing keyset.json)
- **Issue:** The CLI's `loadKeySetFromPath` (`packages/lattice-cli/src/io/keyset-loader.ts`) only accepts a top-level JSON array of `KeyEntry`. A versioned object would be rejected with `malformed: "Keyset file must be a JSON array of KeyEntry { kid, state, publicKeyJwk }."`.
- **Fix:** Write `[{ kid, state: "active", publicKeyJwk }]` directly.
- **Files modified:** examples/work-inbox/setup.mjs
- **Verification:** `node ./packages/lattice-cli/dist/cli.js verify <receipt> --key <keyset>` returns `OK kid=showcase-<uuid> verdict=<v>`.
- **Committed in:** b49ef44 (Task 1)

**4. [Rule 2 - Missing Critical] Default fake provider has zero pricing; the refusal scenario needs a priced capability**
- **Found during:** Task 2 (no-contract-match scenario)
- **Issue:** The plan said attach `contract({ budget: { maxCostUsd: 0.0000001 } })` and expect `no-contract-match`. But `defaultCapabilityForProvider` sets all `pricing` fields to 0, so `estimateRouteCost` returns 0, which is NOT greater than 0.0000001 — the budget is satisfied and the run proceeds normally. The scenario would silently emit a success receipt instead of a refusal receipt.
- **Fix:** The refusal scenario provides an explicit `capabilities: [{ ..., pricing: { inputPer1kTokens: 1, outputPer1kTokens: 1 } }]` to `createFakeProvider`. `buildScenarioAI` was extended with an optional `capabilities` argument to thread this through.
- **Files modified:** examples/work-inbox/setup.mjs, examples/work-inbox/scenarios/no-contract-match.mjs
- **Verification:** Decoded refusal receipt shows `contractVerdict: "no-contract-match"` and `usage: { promptTokens: 0, completionTokens: 0, costUsd: "0" }`.
- **Committed in:** c190948 (Task 2)

**5. [Rule 1 - Bug] `lattice repro <id>` does not have a `--receipts` flag — bare ids resolve against `./.lattice/receipts/`**
- **Found during:** Task 3 (writing the next-step block)
- **Issue:** From repo root, the bare success id resolves to `./.lattice/receipts/<id>.json` — which does not exist (the showcase writes to `examples/work-inbox/.lattice/receipts/`). The next-step `lattice repro <id>` command would always fail with ENOENT.
- **Fix:** Use the full receipt path in the next-step output. The receipt-loader treats anything containing `/` or ending in `.json` as a path.
- **Files modified:** examples/work-inbox/index.mjs
- **Verification:** `node ./packages/lattice-cli/dist/cli.js repro examples/work-inbox/.lattice/receipts/<id>.json --key ... --fixtures ...` invokes the verifier successfully (the replay subsequently surfaces `replay-failed: execution_unavailable` because the receipt-only envelope lacks original task/outputs — a known v1.1 limitation, not a showcase bug).
- **Committed in:** 87eea5c (fix commit)

**6. [Rule 3 - Blocking] Plan v1.0 fixture pattern hashes file PATHS not file CONTENT**
- **Found during:** Task 2 (success scenario)
- **Issue:** v1.0's `index.mjs` constructed image/audio/document artifacts with the FILE PATH as the value (`artifact.image("examples/work-inbox/fixtures/package-photo.txt", ...)`). The runtime's `fingerprintArtifactValue(value)` hashes the value bytes — so for a path string, the hash is `sha256("examples/work-inbox/fixtures/package-photo.txt")`. The content-addressed file at `.lattice/fixtures/<that-hash>.bin` would contain the literal path string. `lattice repro` would then "rehydrate" by reading the path string back as the artifact body — which is not the file content. Repro would diverge from the original run.
- **Fix:** Each scenario reads the fixture text via `readFile` and passes the content string to `artifact.text(...)`. Hash now equals `sha256(fixture-content)` and the .bin file at that path holds the actual fixture content. Repro rehydration is content-correct.
- **Files modified:** examples/work-inbox/scenarios/success.mjs, examples/work-inbox/scenarios/tripwire.mjs, examples/work-inbox/scenarios/no-contract-match.mjs
- **Verification:** Each `.lattice/fixtures/<hash>.bin` filename equals `sha256` of the file at the corresponding `examples/work-inbox/fixtures/<name>.txt`.
- **Committed in:** c190948 (Task 2)

---

**Total deviations:** 6 auto-fixed (4 plan-vs-API bugs, 1 missing-critical scenario-correctness fix, 1 blocking next-step path form).
**Impact on plan:** All deviations were necessary for the success criteria to be observable. No scope creep — every fix lines up directly with a must_have truth or artifact requirement. The plan's `<interfaces>` block referenced an older/aspirational API spec that did not match the v1.1 source merged into main; this was caught early in Task 1.

## Issues Encountered

- **Worktree branch base correction:** The worktree was created off `main` at `85c9ba0` (v1.0 milestone) rather than the intended `efcd2d1` (Phase 13 plan creation). This is the known Windows `EnterWorktree` issue. The `<worktree_branch_check>` reset to `efcd2d1` made the v1.1 source visible (Phase 7-12 merges were missing under the old base). Resolved with a single `git reset --hard efcd2d1`. No work lost (none had been done yet).

- **`lattice repro` on success receipt currently surfaces `replay-failed: execution_unavailable`.** This is a v1.1 boundary, not a showcase bug. The receipt body does not carry the original task / outputs / policy snapshot (per Phase 10 limitations documented in `packages/lattice/src/replay/materialize.ts`). Plan 11-03's CLI accepts a sidecar JSON to populate these fields; without it, the materialized envelope is verify-only. Receipt verification (`lattice verify`) works end-to-end. Plan 13-02's integration test may need to ship a sidecar or relax the repro assertion — out of scope here.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 13-02 (integration test) can now consume `examples/work-inbox/.lattice/` after a fresh `pnpm example:work-inbox` invocation.
- The signed receipts verify cleanly via the bundled `lattice verify` (confirmed by direct invocation: `node ./packages/lattice-cli/dist/cli.js verify <receipt> --key <keyset>` returns `OK kid=showcase-<uuid> verdict=<v>`).
- The keyset file shape matches the loader contract.
- The fixtures directory contains the exact bytes the receipts' `inputHashes` reference.
- The showcase script is reproducible: each run produces fresh receipt ids (UUIDs) but identical fixture hashes (content-addressed).

## Self-Check: PASSED

All key-files present on disk:
- examples/work-inbox/setup.mjs
- examples/work-inbox/scenarios/success.mjs
- examples/work-inbox/scenarios/tripwire.mjs
- examples/work-inbox/scenarios/no-contract-match.mjs
- examples/work-inbox/index.mjs (modified)
- .gitignore (modified)

All task commits resolvable in `git log --oneline --all`:
- b49ef44 (Task 1)
- c190948 (Task 2)
- 826840f (Task 3)
- 87eea5c (Task 3 fix)

`pnpm example:work-inbox` exits 0 from clean state; produces 3 receipts + 5 fixtures + keyset.json.

---
*Phase: 13-showcase-update-and-milestone-validation*
*Completed: 2026-05-12*
