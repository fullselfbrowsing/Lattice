---
phase: 11-lattice-cli-repro-and-verify
plan: "02"
subsystem: cli
tags: [cli, verify, keyset, mock-argv, redaction, exit-codes]
dependency_graph:
  requires:
    - packages/lattice public surface (verifyReceipt, createMemoryKeySet, createInMemorySigner, generateEd25519KeyPairJwk, createAI, createFakeProvider)
    - plan 11-01 stub seam at packages/lattice-cli/src/commands/verify.ts
    - citty 0.2.2 args.type "string" support for --key
  provides:
    - working `lattice verify <receipt-path> [--key <path>]` subcommand
    - runVerify(args, deps) testable handler (dep-injected stdout/stderr/exit)
    - loadKeySetFromPath(path?) keyset loader with ~ expansion + typed errors
    - drop-in pattern for plan 11-03 (repro will reuse loadKeySetFromPath and follow the same runRepro(args, deps) shape)
  affects:
    - packages/lattice-cli/src/commands/verify.ts (stub replaced)
    - packages/lattice-cli/test/cli.test.ts (verify smoke case updated for real handler)
tech_stack:
  added: []
  patterns:
    - "subcommand handler split: named `runVerify(args, deps)` for tests + default-exported `defineCommand` for citty"
    - "VerifyDeps dependency injection: stdout/stderr/exit are functions, default to process.* but tests pass capturing arrays"
    - "Mock-argv test pattern: tests import runVerify and pass synthetic args objects — no spawnSync, no shell, no dist"
    - "KeysetLoadError as a plain object discriminated by `kind` (mirrors materialize.ts MaterializationError) — no Error subclass"
    - "exactOptionalPropertyTypes-safe conditional spread for citty's `args.key: string | undefined` -> RunVerifyArgs.key?: string"
key_files:
  created:
    - packages/lattice-cli/src/io/keyset-loader.ts
    - packages/lattice-cli/test/keyset-loader.test.ts
    - packages/lattice-cli/test/verify.test.ts
  modified:
    - packages/lattice-cli/src/commands/verify.ts
    - packages/lattice-cli/test/cli.test.ts
decisions:
  - "Receipt fabrication uses createAI({ providers:[createFakeProvider()], signer }).run(...) — same path documented in lattice/src/runtime/create-ai.test.ts Phase-9 integration block. createReceipt is not publicly exported, and the createAI flow exercises the full sign+canonicalize+envelope pipeline, so tests verify real receipts rather than hand-rolled fixtures."
  - "Load failures (keyset missing/malformed, receipt missing/malformed) exit 2 — distinct from verify failures (exit 1). Scripts can branch on 'I cannot verify' vs 'the receipt does not verify' without parsing the FAIL kind."
  - "Plan 11-01's verify smoke test (cli.test.ts) was updated in this plan since 11-02 is the first of 11-02/11-03 to land. The repro smoke case is left intact; plan 11-03 will update it when it replaces the repro stub. Per 11-02-PLAN.md verification section: 'Defer that adjustment to whichever of 11-02 / 11-03 lands second.'"
  - "exactOptionalPropertyTypes forced a conditional spread in defineCommand.run({ args }): citty types `args.key` as `string | undefined`, but RunVerifyArgs is `{ key?: string }` (no explicit undefined). Build conditionally selects the form without `key:` when args.key is undefined."
metrics:
  duration_minutes: 6
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  completed_date: "2026-05-11"
---

# Phase 11 Plan 02: Lattice Verify Subcommand + Keyset Loader Summary

Replaces plan 11-01's `verify` stub with a working `lattice verify <receipt-path>` subcommand that runs `verifyReceipt` from the lattice public surface. Adds a tiny JSON keyset loader with `~/` expansion and typed load errors. Tests drive the handler via mock argv (dependency injection) — no spawnSync, no shell.

## What Shipped

### Keyset loader (`src/io/keyset-loader.ts`)

```ts
export async function loadKeySetFromPath(rawPath?: string): Promise<KeySet>;
export function defaultKeysetPath(): string;        // os.homedir() + .lattice/keyset.json
export function expandTilde(p: string): string;     // "~", "~/foo", "/abs", "./rel"
export function isKeysetLoadError(value: unknown): value is KeysetLoadError;

export interface KeysetLoadError {
  readonly kind: "missing" | "malformed";
  readonly path: string;
  readonly message: string;
}
```

Path resolution:

- No argument -> `${os.homedir()}/.lattice/keyset.json`
- `"~"` -> homedir itself
- `"~/<rest>"` -> `path.join(homedir(), <rest>)`
- Anything else -> `path.resolve(...)` (absolute or cwd-relative)

Shape validation is intentionally minimal: an array of objects with `kid: string`, `state in {active, retired, revoked}`, and `publicKeyJwk: object`. The JWK is NOT deep-validated — `crypto.subtle.importKey` is the source of truth at verify time, and CONTEXT.md mandates "keep the loader tiny." Missing file -> `kind: "missing"`. JSON parse error or shape failure -> `kind: "malformed"`.

The error contract is a plain throwable object literal, NOT an `Error` subclass — mirrors the `MaterializationError` pattern in `packages/lattice/src/replay/materialize.ts:75-80`. Callers pattern-match on `err.kind` via `isKeysetLoadError(err)`.

10 vitest cases cover: default path, explicit path, `~/` expansion, bare `~`, `defaultKeysetPath()` composition, missing file, malformed JSON, non-array JSON, missing fields, invalid state value. The `~` tests use `process.env.HOME = sandbox` + `os.homedir()` (which honors `$HOME` on POSIX) rather than `vi.spyOn` — no existing test in the repo uses vi mocks, and the env approach matches Node's own homedir semantics.

### Verify subcommand (`src/commands/verify.ts`)

Replaces the plan 11-01 stub. The export split is:

```ts
export async function runVerify(
  args: { receipt: string; key?: string },
  deps: VerifyDeps = defaultDeps,   // { stdout, stderr, exit }
): Promise<void>;

export default defineCommand({       // citty wrapper
  meta: { name: "verify", description: "..." },
  args: {
    receipt: { type: "positional", required: true, description: "..." },
    key:     { type: "string",     description: "..." },
  },
  async run({ args }) { await runVerify(/* conditional spread of args.key */); },
});
```

`runVerify` is the testable seam. `VerifyDeps` is `{ stdout(line), stderr(line), exit(code) }` — tests pass capturing arrays, production uses `process.stdout.write / process.stderr.write / process.exit`. No globals are touched on the testable path. This is the "subcommand handlers tested via mock argv (no spawn)" pattern from 11-CONTEXT.md.

Pipeline (first match wins):

1. `loadKeySetFromPath(args.key)` — failure -> stderr `FAIL kind=keyset-load-failed reason=<kind at path: message>`, exit 2.
2. Read receipt JSON, parse, structurally validate envelope shape (`payloadType` literal, `payload: string`, `signatures: Array`). Any failure -> stderr `FAIL kind=receipt-load-failed reason=<err.message>`, exit 2.
3. `verifyReceipt(envelope, keySet)`.
   - `result.ok === true` -> stdout `OK kid=<body.kid> verdict=<body.contractVerdict>`, exit 0.
   - `result.ok === false` -> stderr `FAIL kind=<error.kind> reason=<error.message>`, exit 1.

The `result.ok` branch precedes the FAIL branch so TypeScript narrows the union — `body` is only accessed on the success arm, `error` only on the failure arm. `exactOptionalPropertyTypes + verbatimModuleSyntax` would flag the alternative.

### Mock-argv test harness (`test/verify.test.ts`)

```ts
function captureDeps() {
  const bag = { stdout: [] as string[], stderr: [] as string[], exitCode: null as number | null };
  return {
    bag,
    deps: {
      stdout: (line: string) => bag.stdout.push(line),
      stderr: (line: string) => bag.stderr.push(line),
      exit:   (code: number) => { bag.exitCode = code; },
    },
  };
}
```

Each test writes a fixture receipt + keyset to a per-test `mkdtemp`, calls `await runVerify({ receipt, key }, deps)`, then asserts against `bag.stdout / bag.stderr / bag.exitCode`. No process spawn, no `process.exit` actually called, no global state touched. The cli.test.ts smoke test in plan 11-01 remains the only spawn-based test (it validates the shebang + bin field).

#### Real receipt fabrication

Tests do NOT hand-roll envelopes — they drive the full sign+canonicalize+envelope pipeline via the public surface:

```ts
const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
const ai = createAI({ providers: [createFakeProvider()], signer });
const result = await ai.run({ task: "x", outputs: { text: "text" as const } });
// result.receipt is a real ReceiptEnvelope
```

This is the same path documented in `packages/lattice/src/runtime/create-ai.test.ts` "Phase 9 receipts integration" block. `createReceipt` is internal (not in `lattice/src/index.ts`'s exports), so this is the public-surface path. The fixture's receipt has a real Ed25519 signature over a canonicalized v1 body — every error case below is a real failure mode of `verifyReceipt`, not a stubbed branch.

### Test coverage (9 cases in `verify.test.ts`)

| Test | Scenario                                | Expected exit | Expected output                                   |
| ---- | --------------------------------------- | ------------- | ------------------------------------------------- |
| 1    | OK: real signed receipt + matching key  | 0             | stdout: `^OK kid=ok-kid-1 verdict=success$`       |
| 2    | signature-invalid: sig byte flipped     | 1             | stderr: `^FAIL kind=signature-invalid reason=`    |
| 3    | key-not-found: keyset has different kid | 1             | stderr: `^FAIL kind=key-not-found reason=`        |
| 4    | key-revoked: matching kid, state=revoked| 1             | stderr: `^FAIL kind=key-revoked reason=`          |
| 5    | keyset-load-failed: --key /missing      | 2             | stderr: `^FAIL kind=keyset-load-failed reason=`   |
| 6    | receipt-load-failed: missing path       | 2             | stderr: `^FAIL kind=receipt-load-failed reason=`  |
| 6b   | receipt-load-failed: file is not JSON   | 2             | stderr: `^FAIL kind=receipt-load-failed reason=`  |
| 6c   | receipt-load-failed: wrong shape        | 2             | stderr: `^FAIL kind=receipt-load-failed reason=`  |
| 7    | redaction discipline                    | 0             | stdout single line; hashes/payload/sig NOT in it  |

### Exit-code matrix (CLI-03 + CONTEXT.md)

| Exit | Meaning                                | Output channel | Output line                                   |
| ---- | -------------------------------------- | -------------- | --------------------------------------------- |
| 0    | Verify succeeded                       | stdout         | `OK kid=<kid> verdict=<contractVerdict>`      |
| 1    | Verify failed (any VerifyErrorKind)    | stderr         | `FAIL kind=<VerifyErrorKind> reason=<msg>`    |
| 2    | Could not load keyset or receipt       | stderr         | `FAIL kind=(keyset\|receipt)-load-failed ...` |

`VerifyErrorKind` is the canonical union from `packages/lattice/src/receipts/types.ts`: `key-not-found | key-revoked | canonicalization-mismatch | signature-invalid | envelope-malformed | version-mismatch`. The CLI passes them through verbatim — no remapping, no flattening.

### Redaction discipline (CLI-05) — concrete assertion

Test 7 builds a real receipt, side-channels `verifyReceipt` to learn the body's `inputHashes`, `outputHash`, and `contractHash`, then asserts the printed line contains NONE of those substrings, NOR the envelope's base64 `payload`, NOR the signature bytes:

```ts
if (body.outputHash !== null)   expect(line.includes(body.outputHash)).toBe(false);
for (const h of body.inputHashes) expect(line.includes(h)).toBe(false);
if (body.contractHash !== null)  expect(line.includes(body.contractHash)).toBe(false);
expect(line.includes(fixture.envelope.payload)).toBe(false);
expect(line.includes(fixture.envelope.signatures[0]!.sig)).toBe(false);
expect(line).toMatch(/^OK kid=\S+ verdict=\S+$/);
```

This is stronger than "the regex passes" — it pins the output to exactly the redacted-body subset (`kid`, `contractVerdict`) by negating every other field that could conceivably leak.

### cli.test.ts smoke-case update

Plan 11-01's verify smoke case asserted exit 2 + `/not-implemented/`. After this plan, the verify handler exits 2 but with `FAIL kind=(keyset|receipt)-load-failed reason=...` when fixture paths are missing. Updated assertion:

```ts
it("verify subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
  const { status, stderr } = runBin(["verify", "./fixture.json"]);
  expect(status).toBe(2);
  expect(stderr).toMatch(/^FAIL kind=(keyset|receipt)-load-failed reason=/m);
});
```

The repro smoke case is intentionally left as-is (still expects `/not-implemented/`) — plan 11-03 will replace the repro stub and update that case at the same time. Per 11-02-PLAN.md verification section: "Defer that adjustment to whichever of 11-02 / 11-03 lands second."

## Verification Results

End-of-plan sweep (all exited 0):

```bash
cd packages/lattice-cli && pnpm tsc --noEmit       # exit 0
cd packages/lattice-cli && pnpm exec vitest run    # 22/22 pass (3 cli.test.ts + 10 keyset-loader.test.ts + 9 verify.test.ts)
cd packages/lattice-cli && pnpm build              # 7 dist files, shebang preserved
pnpm --filter lattice lint:packages                # publint + attw + check-cli-deps all green
```

The lattice runtime depcheck (CLI-06) still passes: `[check-cli-deps] OK — no forbidden CLI deps found in .../packages/lattice/dist.` The CLI imports `verifyReceipt`, `createMemoryKeySet`, etc. only from `"lattice"` (public export), never from `"lattice/src/*"`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale cli.test.ts verify smoke assertion**
- **Found during:** Task 2 final test sweep
- **Issue:** Plan 11-01's smoke test asserted `expect(stderr).toMatch(/not-implemented/)` for the verify subcommand. With the real handler in place, the verify subcommand no longer prints "not-implemented" — it prints a `FAIL kind=...-load-failed` line. The exit code (2) is unchanged.
- **Fix:** Updated the assertion to match the real handler's load-failure output (`/^FAIL kind=(keyset|receipt)-load-failed reason=/m`). Comment in the test points to plan 11-02 and explains why repro's stub assertion is intentionally untouched.
- **Files modified:** packages/lattice-cli/test/cli.test.ts
- **Commit:** 5cca548 (folded into Task 2 commit since the test was tightly coupled to the handler swap)

**2. [Rule 1 - Bug] exactOptionalPropertyTypes: citty `args.key` -> RunVerifyArgs.key shape mismatch**
- **Found during:** Task 2 typecheck
- **Issue:** `pnpm tsc --noEmit` flagged `TS2379` at the `await runVerify({ receipt: args.receipt, key: args.key })` call inside `defineCommand.run`. Citty types parsed args as `string | undefined`, but `RunVerifyArgs.key?: string` (under `exactOptionalPropertyTypes`) does NOT accept an explicit `undefined` value.
- **Fix:** Conditional spread — when `args.key === undefined`, build the call args without a `key` field at all; otherwise include `key: args.key`. Both branches produce a value of type `RunVerifyArgs`.
- **Files modified:** packages/lattice-cli/src/commands/verify.ts
- **Commit:** 5cca548

Both deviations were inline-correctness fixes (Rule 1), not architectural. No checkpoints were needed.

## Forward Links

Plan 11-03 (repro) inherits the seam this plan established:

- **Reuse `loadKeySetFromPath`** for the `--key` flag default (same `~/.lattice/keyset.json` semantics).
- **Mirror `runRepro(args, deps): Promise<void>`** with the same `VerifyDeps`-shaped injection so its tests can use the identical `captureDeps()` harness.
- **Exit-code contract** stays 0 = match, 1 = drift, 2 = verify/materialize/load failure. The `FAIL kind=...-load-failed` prefix can carry forward (e.g. `kind=artifact-load-failed`, `kind=materialize-failed`).
- **Update the `repro` cli.test.ts smoke case** at the same time it replaces the repro stub — same pattern as this plan's verify update.
- **Redaction discipline** (CLI-05) requires that repro's structured summary surface only redacted-body fields. Test 7's "negate every hash" pattern in this plan is the template.

## Commits

- `8c2fc82` — feat(11-02): keyset file loader with ~ expansion and shape validation
- `5cca548` — feat(11-02): lattice verify subcommand with mock-argv tested handler

## Self-Check: PASSED

All success-criteria items verified:
- packages/lattice-cli/src/io/keyset-loader.ts FOUND, exports loadKeySetFromPath/defaultKeysetPath/expandTilde/isKeysetLoadError, returns KeySet via createMemoryKeySet.
- packages/lattice-cli/src/commands/verify.ts FOUND, replaces the Wave 1 stub with citty defineCommand carrying positional `receipt` + `--key` flag; default keyset `~/.lattice/keyset.json`; OK/FAIL output exactly as specified.
- Tests use mock argv (runVerify(args, deps) imported directly); no spawnSync inside verify.test.ts or keyset-loader.test.ts.
- `pnpm tsc --noEmit` exit 0.
- `pnpm exec vitest run` exit 0, 22/22 cases pass.
- `pnpm build` exit 0, dist/cli.js + dist/verify-*.js produced, shebang preserved.
- Commits 8c2fc82 and 5cca548 present in git log.
