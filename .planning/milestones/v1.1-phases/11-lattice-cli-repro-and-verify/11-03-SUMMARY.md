---
phase: 11-lattice-cli-repro-and-verify
plan: "03"
subsystem: cli
tags: [cli, repro, replay, materialize, artifact-loader, receipt-loader, mock-argv, redaction, exit-codes, drift-detection]
dependency_graph:
  requires:
    - packages/lattice public surface (verifyReceipt, materializeReplayEnvelope, replayOffline, createMemoryKeySet, createInMemorySigner, generateEd25519KeyPairJwk, createAI, createFakeProvider, artifact)
    - plan 11-01 stub seam at packages/lattice-cli/src/commands/repro.ts
    - plan 11-02 keyset loader (packages/lattice-cli/src/io/keyset-loader.ts) reused as-is
    - Phase 10 materializeReplayEnvelope verify-FIRST ordering contract
    - Phase 9-04 outputHash computation formula (sha256(JSON.stringify(outputs)))
  provides:
    - working `lattice repro <id-or-path> [--key <path>] [--fixtures <dir>]` subcommand
    - runRepro(args, deps) testable handler (dep-injected stdout/stderr/exit)
    - createFilesystemArtifactLoader(fixturesDir) for `<sha256>.bin` content-addressed reads
    - loadReceiptByIdOrPath(target, options) id-or-path heuristic resolver
    - 6-stage pipeline with deterministic exit-code mapping (0 match / 1 drift / 2 anything else)
    - drop-in pattern for Phase 12 (`lattice eval` will batch this over a directory)
  affects:
    - packages/lattice-cli/src/commands/repro.ts (stub replaced)
    - packages/lattice-cli/test/cli.test.ts (repro smoke case updated for real handler)
tech_stack:
  added: []
  patterns:
    - "Path-traversal defense via regex-gate on hash (/^[a-f0-9]{64}$/u) BEFORE any filesystem call"
    - "Body re-obtained via second verifyReceipt call (not a private import) — preserves CLI-06 boundary"
    - "Drift test path: vi.mock on lattice.replayOffline returns synthetic outputs, since real replay is deterministic by construction over a verified envelope"
    - "Receipt id-or-path heuristic: target.includes('/') || target.endsWith('.json') => path; else <receiptsDir>/<id>.json"
    - "ArtifactLoaderError / ReceiptLoadError as plain object literals discriminated by `kind` (mirrors MaterializationError and KeysetLoadError patterns)"
    - "Hash recomputation formula replicated inline (sha256(utf8(JSON.stringify(outputs)))) — same as fingerprintArtifactValue but avoids reaching into lattice/src/storage/fingerprint.ts"
key_files:
  created:
    - packages/lattice-cli/src/io/artifact-loader.ts
    - packages/lattice-cli/src/io/receipt-loader.ts
    - packages/lattice-cli/test/artifact-loader.test.ts
    - packages/lattice-cli/test/repro.test.ts
  modified:
    - packages/lattice-cli/src/commands/repro.ts
    - packages/lattice-cli/test/cli.test.ts
decisions:
  - "Re-running verifyReceipt after materializeReplayEnvelope (microsecond cost) is the cleanest public-surface path for obtaining the typed body. The materializer verifies internally but does not expose the body to its caller, and decodeReceiptPayload is intentionally NOT a public export per 09-04 SUMMARY."
  - "Drift test exercised via vi.mock on lattice.replayOffline. Real-replay determinism means a properly-seeded fixture set will ALWAYS match by construction; the only way to test the drift branch is to inject a divergent outputs map. Documented in the test file's top comment so future maintainers understand why this one branch uses a mock."
  - "Filesystem artifact loader regex-gates hash BEFORE any fs touch. A malicious receipt whose inputHashes contain `../../etc/passwd` is rejected with kind=invalid-hash — the read attempt never happens. The materializer wraps thrown loader errors to MaterializationError{kind:artifact-load-failed} in practice, so the CLI's stderr surfaces the loader's underlying message under a unified failure kind."
  - "Receipt id-or-path heuristic uses target.includes('/') || target.endsWith('.json'). Backslash on Windows is deferred (v1.1 is unix-only per CONTEXT.md Limitations). Tests that need cwd-independent receipt resolution use the test-only `receiptsDir` knob — NOT exposed as a citty arg, per CONTEXT.md."
  - "Failure-receipts (outputHash === null) exit 2 with kind=receipt-had-no-outputhash rather than silently passing. CONTEXT.md: drift detection only makes sense when the receipt records an outputHash."
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_created: 4
  files_modified: 2
  completed_date: "2026-05-11"
---

# Phase 11 Plan 03: Lattice Repro Subcommand + Filesystem Artifact Loader Summary

Replaces plan 11-01's `repro` stub with a working `lattice repro <id-or-path>` subcommand that loads a signed receipt, verifies it via Phase 10's materializer (verify-FIRST), materializes a `ReplayEnvelope` from on-disk `<sha256>.bin` fixtures, replays it offline, and diffs the result's outputHash against the receipt body's recorded `outputHash`. Ships two tiny `io/` loaders (filesystem artifact + receipt id-or-path) and an 8-case mock-argv test suite covering match / drift / all four exit-2 failure modes.

## Performance

- **Duration:** ~8 min
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files created:** 4 (artifact-loader.ts, receipt-loader.ts, artifact-loader.test.ts, repro.test.ts)
- **Files modified:** 2 (repro.ts stub replaced, cli.test.ts repro smoke updated)
- **Test count:** 43/43 across the whole lattice-cli suite (3 cli.test.ts + 10 keyset-loader + 9 verify + 13 artifact-loader + 8 repro)

## What Shipped

### Filesystem ArtifactLoader (`src/io/artifact-loader.ts`)

```ts
export interface ArtifactLoaderError {
  readonly kind: "missing" | "invalid-hash";
  readonly hash: string;
  readonly path?: string;
  readonly message: string;
}

export function isArtifactLoaderError(value: unknown): value is ArtifactLoaderError;
export function createFilesystemArtifactLoader(fixturesDir: string): (hash: string) => Promise<ArtifactInput>;
```

The returned loader is the exact callback shape `materializeReplayEnvelope` expects. Pipeline:

1. Regex-gate hash against `/^[a-f0-9]{64}$/u` (lowercase sha256-hex shape). Anything else (including `"../../etc/passwd"`, uppercase, short/long hex) is rejected with `kind: "invalid-hash"` BEFORE any filesystem call.
2. Read `<fixturesDir>/<hash>.bin` and stat it in parallel.
3. Construct an `ArtifactInput { id: hash, kind: "file", source: "file", privacy: "standard", mediaType: "application/octet-stream", size: { bytes }, value: new Uint8Array(bytes) }`.
4. Missing file -> rejects with `kind: "missing"`, surfacing the underlying fs message.

Error contract is a plain object literal (no `Error` subclass) — mirrors `MaterializationError` and `KeysetLoadError`. Callers narrow via `isArtifactLoaderError(err)`.

13 vitest cases cover: positive read, missing file, path-traversal regex gate, uppercase-hex rejection, empty 0-byte file, plus the `isArtifactLoaderError` narrowing helper.

### Receipt id-or-path loader (`src/io/receipt-loader.ts`)

```ts
export interface ReceiptLoadError {
  readonly kind: "missing" | "malformed";
  readonly resolvedPath: string;
  readonly message: string;
}

export function loadReceiptByIdOrPath(
  target: string,
  options?: { receiptsDir?: string },
): Promise<{ envelope: ReceiptEnvelope; resolvedPath: string; idOrPath: string }>;
```

Heuristic per CONTEXT.md decision:

- `target.includes("/")` OR `target.endsWith(".json")` -> `path.resolve(target)`
- otherwise -> `path.resolve(join(receiptsDir ?? ".lattice/receipts", target + ".json"))`

Validates the JSON shape against the ReceiptEnvelope contract (`payloadType` literal, `payload: string`, `signatures: Array`). Wrong shape -> `kind: "malformed"`. Missing file -> `kind: "missing"`. The deep canonical/signature check is deferred to `verifyReceipt`, which the handler runs next.

10 vitest cases cover: all three id-or-path branches, custom `receiptsDir` override, missing file, malformed JSON, and wrong envelope shape.

### Repro subcommand (`src/commands/repro.ts`)

The plan 11-01 stub is replaced with `runRepro(args, deps)` + default-exported `defineCommand`. The split mirrors plan 11-02's `runVerify` pattern:

```ts
export async function runRepro(
  args: { target: string; key?: string; fixtures?: string; receiptsDir?: string },
  deps: ReproDeps = defaultDeps,
): Promise<void>;
```

`ReproDeps` is `{ stdout(line), stderr(line), exit(code) }` — tests pass capturing arrays. The `receiptsDir` arg is a test-only knob (cwd-independent receipt resolution); citty's `defineCommand` does NOT expose it as a CLI flag.

#### 6-stage pipeline (each stage maps to one exit-code branch)

| Stage | What runs | Failure -> exit code | FAIL kind |
| ----- | --------- | -------------------- | --------- |
| 1     | `loadReceiptByIdOrPath(target, ...)` | 2 | `receipt-load-failed` |
| 2     | `loadKeySetFromPath(key)` (reused from 11-02) | 2 | `keyset-load-failed` |
| 3     | `createFilesystemArtifactLoader(fixturesDir)` | (pure; no I/O until stage 4 calls it) | — |
| 4     | `materializeReplayEnvelope(envelope, { artifactLoader, keySet })` | 2 | `verify-failed` \| `artifact-load-failed` \| `envelope-malformed` \| `invalid-hash` |
| 5     | second `verifyReceipt` call to obtain typed body for the summary | 2 (defensive; unreachable in practice) | `verify-failed` |
| 6     | `replayOffline(envelopeReplay)` | 2 | `replay-failed` |
| 7     | `sha256(JSON.stringify(result.outputs))` vs `body.outputHash`. `body.outputHash === null` -> 2 (`receipt-had-no-outputhash`); equal -> 0 (`verdict=match`); different -> 1 (`verdict=drift`) | 0/1/2 | — / — / `receipt-had-no-outputhash` |

#### Summary output (redaction discipline — CLI-05)

```
receiptId=<id>
kid=<kid>
contractVerdict=<success|tripwire-violated|...>
model.requested=<modelId>
route.providerId=<providerId>
route.capabilityId=<capabilityId>
usage.costUsd=<string|null>
verdict=<match|drift>
[drift only]
expected.outputHash=<first 200 chars>
actual.outputHash=<first 200 chars>
```

Every field above is already redacted by Phase 9 before signing — printing it does NOT leak anything the signer didn't already commit to. `inputHashes` are NEVER surfaced; outputHash appears only on drift, as the diff target. Test 8 asserts this explicitly: for every real `inputHashes[i]` substring (learned via side-channel verifyReceipt), `expect(stdout.includes(h)).toBe(false)`.

#### Hash recomputation

The handler recomputes the outputHash inline using the same formula Phase 9-04 commits to (`fingerprintArtifactValue(outputs)` = `sha256(JSON.stringify(outputs))`):

```ts
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
const actualHash = await sha256Hex(JSON.stringify(result.outputs));
```

This replicates `fingerprintArtifactValue` for `unknown` values (the `JSON.stringify` branch) without reaching into `lattice/src/storage/fingerprint.ts` — preserves the CLI-06 public-export boundary. ~10 LOC and avoids a private import.

### Test coverage (8 cases in `repro.test.ts`)

| Test | Scenario                                                    | Exit | Output assertion                                                 |
| ---- | ----------------------------------------------------------- | ---- | ---------------------------------------------------------------- |
| 1    | Match (mocked replayOffline returns receipt's outputs)      | 0    | stdout: all 8 summary fields + `verdict=match`                   |
| 2    | Drift (mocked replayOffline returns synthetic outputs)      | 1    | stdout: `verdict=drift` + `expected.outputHash=` + `actual.outputHash=` |
| 3    | Tampered signature (real)                                   | 2    | stderr: `^FAIL kind=verify-failed reason=`                       |
| 4    | Missing fixture .bin file (real, with input artifact)       | 2    | stderr: `^FAIL kind=artifact-load-failed reason=`                |
| 5    | Nonexistent receipt path                                    | 2    | stderr: `^FAIL kind=receipt-load-failed reason=`                 |
| 6    | Bare id resolves to `.lattice/receipts/<id>.json` under cwd | 0    | stdout: `verdict=match` (id resolution worked)                   |
| 7    | Failure-receipt with `outputHash: null`                     | 2    | stderr: `^FAIL kind=receipt-had-no-outputhash reason=`           |
| 8    | Redaction discipline                                        | 0    | stdout contains NO `inputHashes[i]` substrings, NO envelope payload, NO signature bytes |

All cases drive `runRepro({ ... }, deps)` directly — no `spawnSync`, no shell, no dist read. The cli.test.ts smoke test in plan 11-01 remains the only spawn-based test (it validates shebang + bin field).

### Drift test rationale (vi.mock)

`replayOffline` is deterministic by construction over a verified envelope: same envelope -> same outputs -> same hash. A real fixture set will ALWAYS reproduce the original outputHash. To exercise the drift branch we use a vitest module mock on `lattice`:

```ts
vi.doMock("lattice", async (importOriginal) => {
  const mod = await importOriginal<typeof import("lattice")>();
  return {
    ...mod,
    replayOffline: vi.fn(async () => ({
      ok: true,
      outputs: { text: "DRIFTED-PAYLOAD-NOT-WHAT-WAS-SIGNED" },
      artifacts: [], usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      plan: { kind: "execution-plan" }, events: [],
    })),
  };
});
const { runRepro: mockedRunRepro } = await import("../src/commands/repro.js");
```

Same pattern for Test 1 (match — mock returns the receipt's original outputs so the recomputed hash equals body.outputHash) and Test 7 (no-outputhash — mock returns a body with `outputHash: null`). Documented in the test file's top comment so future maintainers understand why these specific branches use a mock.

### cli.test.ts smoke-case update

Plan 11-01's repro smoke case asserted exit 2 + `/not-implemented/`. After this plan, the repro handler exits 2 but with `FAIL kind=(receipt|keyset)-load-failed reason=...` when fixture paths are missing. Updated assertion:

```ts
it("repro subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
  const { status, stderr } = runBin(["repro", "abc"]);
  expect(status).toBe(2);
  expect(stderr).toMatch(/^FAIL kind=(receipt|keyset)-load-failed reason=/m);
});
```

This completes the cli.test.ts update sequence — plan 11-02 already retired the verify stub's assertion; this plan retires the repro stub's assertion. Both subcommand stubs are now gone.

## Verification Results

End-of-plan sweep (all exited 0):

```bash
cd packages/lattice && pnpm build                    # exit 0 (public surface up to date)
cd packages/lattice-cli && pnpm build                # exit 0 (9 dist files; shebang preserved)
cd packages/lattice-cli && pnpm tsc --noEmit         # exit 0 (no type errors)
cd packages/lattice-cli && pnpm exec vitest run      # exit 0 (43/43 pass)
cd packages/lattice && pnpm lint:packages            # exit 0 (publint + attw + check-cli-deps green)
```

`check-cli-deps` confirms the lattice runtime depcheck (CLI-06) still passes: no forbidden CLI deps in `packages/lattice/dist/`. The repro handler imports `materializeReplayEnvelope`, `replayOffline`, `verifyReceipt`, `CapabilityReceiptBody`, `ReceiptEnvelope` only from `"lattice"` — never from `"lattice/src/*"`.

## Decisions Made

- **Second verifyReceipt for typed body.** The materializer verifies internally but does NOT expose the body to its caller, and `decodeReceiptPayload` is intentionally not a public export per 09-04 SUMMARY's "Intentionally NOT exported" list. Re-running verify (microsecond Ed25519 cost) is the cleanest CLI-06-safe path.
- **Drift test via vi.mock.** Real replay determinism means deterministic fixtures cannot produce drift naturally. The mock approach is documented in the test file's preamble and at each mock-using test site.
- **Hash recomputation inline (~10 LOC) rather than importing fingerprintArtifactValue.** That function is in `packages/lattice/src/storage/fingerprint.ts` and is NOT in `packages/lattice/src/index.ts`. Replicating the JSON.stringify -> SHA-256 -> hex formula inline avoids a private import.
- **Path-traversal regex gate before any fs call.** A malicious receipt could specify `../../etc/passwd` as an inputHash. The `^[a-f0-9]{64}$` gate eliminates this entire class of attack upstream of `readFile`.
- **`receiptsDir` arg is test-only.** CONTEXT.md doesn't ask for a `--receipts-dir` flag, so citty's `defineCommand` does NOT expose one. Tests that need cwd-independent receipt resolution pass `receiptsDir` directly to `runRepro` — this makes test setup cwd-independent without polluting the user-facing flag surface.
- **Failure-receipts exit 2.** `body.outputHash === null` (e.g. `tripwire-violated` receipts) is a real condition for which "match vs drift" is undefined. Exiting 2 with `kind=receipt-had-no-outputhash` signals "I cannot diff this receipt" distinctly from "this receipt drifted".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ArtifactInput shape in plan example was incomplete**

- **Found during:** Task 1 GREEN (implementation)
- **Issue:** The plan's example `ArtifactInput` literal in the `<action>` block used `{ id, kind, mime, value, size }`. The real public type from `packages/lattice/src/artifacts/artifact.ts` is `ArtifactRef & { value?: unknown }`, which requires `id`, `kind`, `source`, `privacy`, plus optional `mediaType`, `size: { bytes }` (NOT a plain `size: number`), `value`. The plan's footnote acknowledged this ("verify against the source once before writing"), so this was anticipated.
- **Fix:** Used the real shape — `{ id: hash, kind: "file", source: "file", privacy: "standard", mediaType: "application/octet-stream", size: { bytes: stats.size }, value: new Uint8Array(bytes) }`. Tests assert against `input.size?.bytes` rather than a flat `size` number.
- **Files modified:** packages/lattice-cli/src/io/artifact-loader.ts, packages/lattice-cli/test/artifact-loader.test.ts
- **Verification:** All 13 artifact-loader cases pass; tsc --noEmit clean.
- **Commit:** a03d1c9 (folded into Task 1 GREEN commit since the test shape was tightly coupled to the loader output shape).

**2. [Rule 1 - Bug] Test 3 originally tampered the envelope before seedSandbox's side-channel verifyReceipt — which broke the helper.**

- **Found during:** Task 2 GREEN (first test run)
- **Issue:** `seedSandbox` runs `verifyReceipt` internally to learn `inputHashes` so it can place fixture bytes at `<hash>.bin`. Test 3's original code tampered the signature BEFORE calling seedSandbox, so the helper's side-channel verify failed with `signature-invalid` and the test threw before runRepro was even invoked.
- **Fix:** Seed with the valid envelope (side-channel verify succeeds), THEN overwrite the on-disk receipt with the tampered signature. This isolates tampering to the actual subject under test (the handler) without breaking the test helper.
- **Files modified:** packages/lattice-cli/test/repro.test.ts
- **Verification:** Test 3 now passes; receipt is loaded then verified by the handler, which exits 2 with `FAIL kind=verify-failed reason=signature-invalid`.
- **Commit:** d903682 (folded into Task 2 GREEN commit).

**3. [Rule 1 - Bug] Test 4 (artifact-load-failed) was hitting replay-failed instead, because the fixture had no input artifacts.**

- **Found during:** Task 2 GREEN (first test run)
- **Issue:** `makeReproFixture()` ran `ai.run({ task, outputs })` with NO `artifacts: [...]` — so the receipt's `inputHashes` was empty. The materializer's loop over `inputHashes` is a no-op, the artifact loader is never invoked, and there's no path to `kind=artifact-load-failed`. Instead the materialized envelope has no `outputs` (Phase 10 v1.1 limitation), so `replayOffline` reports `execution_unavailable` and the handler exits 2 with `kind=replay-failed` instead of `kind=artifact-load-failed`.
- **Fix:** Extended `makeReproFixture` to accept an optional `artifacts: readonly ArtifactInput[]` parameter; Test 4 passes a single `artifact.text(...)` so the receipt has a non-empty inputHashes. With `fixtureBytes: null`, those hashes have no corresponding `.bin` files, the loader throws `kind: "missing"`, materialize re-wraps to `MaterializationError{kind: "artifact-load-failed"}`, and the handler surfaces it on stderr as expected.
- **Files modified:** packages/lattice-cli/test/repro.test.ts
- **Verification:** Test 4 now exits 2 with `FAIL kind=artifact-load-failed reason=...`.
- **Commit:** d903682 (folded into Task 2 GREEN commit).

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All three were inline-correctness fixes (Rule 1) discovered the moment the tests ran. None were architectural. None affected the handler's behavior — only the test fixtures' construction. Plan's stated success criteria all met.

## Issues Encountered

None beyond the three Rule-1 bugs above.

## User Setup Required

None — no external service configuration required for this plan.

## Forward Links

- **Phase 12 (`lattice eval`)** will batch `lattice repro` over a directory of receipts. It can reuse:
  - `createFilesystemArtifactLoader(fixturesDir)` directly (one shared loader across many replays).
  - `loadReceiptByIdOrPath(target)` for either a directory walk or individual receipt selection.
  - `runRepro(args, deps)` invoked per-receipt with a shared `deps` that aggregates results.
  - The same 6-stage exit-code contract (just batched: aggregate verdicts, summary at the end).
- **CLI v1.2 candidates:**
  - `--unsafe-unredacted` flag to surface the raw envelope payload + signature bytes (deferred per CONTEXT.md).
  - `--json` machine-readable output mode (the structured `key=value` lines were chosen partly because they're grep-friendly already, but a JSON mode would suit CI consumers).
  - Drift warnings beyond outputHash (env drift, model fingerprint drift, route drift) — Phase 10's materializer already records this metadata; the CLI just doesn't expose it yet.
  - Windows path support (currently the `idOrPath` heuristic only looks for `/`, not `\\`).

## Commits

- `f8bd3e9` — test(11-03): add failing tests for artifact-loader and receipt-loader
- `a03d1c9` — feat(11-03): filesystem ArtifactLoader + receipt id-or-path loader
- `bd45559` — test(11-03): add failing tests for lattice repro handler
- `d903682` — feat(11-03): lattice repro subcommand with mock-argv tested handler

## Self-Check: PASSED

All success-criteria items verified on disk and in git:

- `packages/lattice-cli/src/io/artifact-loader.ts` FOUND; exports `createFilesystemArtifactLoader(fixturesDir)` returning a `(hash) => Promise<ArtifactInput>` that reads `<fixturesDir>/<hash>.bin` and throws `ArtifactLoaderError` on missing/invalid-hash.
- `packages/lattice-cli/src/io/receipt-loader.ts` FOUND; exports `loadReceiptByIdOrPath(target, { receiptsDir? })` with the id-or-path heuristic from CONTEXT.md.
- `packages/lattice-cli/src/commands/repro.ts` FOUND; the Wave 1 stub is gone, replaced with `runRepro(args, deps)` + default-exported `defineCommand` carrying positional `target` + `--key` + `--fixtures` flags.
- 6-stage pipeline (load receipt -> load keyset -> build loader -> materialize -> verify-for-body -> replay -> diff) maps deterministically to exit codes 0 / 1 / 2.
- Summary output surfaces only redacted-body fields; Test 8 asserts NO `inputHashes` substring appears in stdout (CLI-05).
- Tests use mock argv (`runRepro(args, deps)` imported directly); no `spawnSync` inside repro.test.ts or artifact-loader.test.ts.
- `test/cli.test.ts` repro smoke case retired the `/not-implemented/` assertion; now asserts exit 2 with `FAIL kind=(receipt|keyset)-load-failed reason=`.
- `cd packages/lattice-cli && pnpm tsc --noEmit` exit 0.
- `cd packages/lattice-cli && pnpm exec vitest run` exit 0; 43/43 cases pass.
- `cd packages/lattice-cli && pnpm build` exit 0; 9 dist files; `dist/cli.js` shebang preserved.
- `cd packages/lattice && pnpm lint:packages` exit 0; `check-cli-deps` green (no `citty`/`commander`/`cac`/`yargs` in lattice runtime).
- All 4 commits (f8bd3e9, a03d1c9, bd45559, d903682) present in `git log`.

---
*Phase: 11-lattice-cli-repro-and-verify*
*Completed: 2026-05-11*
