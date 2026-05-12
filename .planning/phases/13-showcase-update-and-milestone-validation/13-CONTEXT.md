# Phase 13: Showcase Update and Milestone Validation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `examples/work-inbox` showcase to exercise the full v1.1 stack end-to-end: declare a contract on `ai.run`, intentionally trigger a tripwire on one fixture, capture signed receipts for both success and failure paths, run those receipts through `lattice repro`, and emit a `lattice eval` regression report. This is the milestone's executable proof that all 36 v1.1 requirements are integrated and observable.

Out of scope: any new public API surface (Phase 13 only orchestrates existing Phase 7-12 APIs). New tests are integration-only against the showcase.
</domain>

<decisions>
## Implementation Decisions

### Showcase Surface
- Update `examples/work-inbox/index.mjs` to demonstrate three scenarios:
  1. **Success run with contract + signed receipt** — a normal customer-support fixture passes through with a contract attached, returns a `RunSuccess` containing a `receipt` field, the receipt is written to `examples/work-inbox/.lattice/receipts/<id>.json`.
  2. **Tripwire violation with failure receipt** — a fixture whose generated output intentionally embeds PII (so `inv.noPII()` fires) produces a `RunFailure` of kind `tripwire-violated`, ALSO carrying a signed receipt with `contractVerdict: "tripwire-violated"`. Written to receipts dir.
  3. **No-contract-match with refusal receipt** — a fixture with an unsatisfiable budget (`maxCostUsd: 0.0000001`) refuses execution, returning `no-contract-match` and a refusal receipt with `usage: { 0, 0, 0 }`.
- Each scenario prints a one-line summary to stdout (no emojis).

### Receipts + Artifacts Output
- Showcase writes signed receipts to `examples/work-inbox/.lattice/receipts/`.
- Input artifact bodies (customer message, screenshot, transcript, PDF) are written content-addressed to `examples/work-inbox/.lattice/fixtures/<sha256>.bin` so `lattice repro` can rehydrate them.
- The showcase generates a fresh Ed25519 keypair via `generateEd25519KeyPairJwk()` at run time and writes the keyset to `examples/work-inbox/.lattice/keyset.json` so the CLI can verify.

### Repro Demonstration
- After all three scenarios complete, the showcase script prints the exact `lattice repro` commands the user can run against the generated receipts. No spawning of the CLI from the script itself — the showcase remains pure-Node and CLI smoke is delegated to the integration test below.

### Eval Demonstration
- Showcase generates an initial `examples/work-inbox/.lattice/baseline.json` on first run (via `lattice eval --init-baseline`). Subsequent runs compare against it.
- An integration test (NOT the showcase script itself) spawns `lattice eval` against the generated fixtures and asserts exit 0 on a clean run + exit 1 when the test artificially regresses a fixture.

### Integration Test
- New file `examples/work-inbox/test/showcase.test.ts` (vitest config in repo root or per-example) — actually, since `examples/` is currently script-based, the test lives at the repo root under a new path: `packages/lattice-cli/test/showcase-e2e.test.ts` (keeps it inside an existing test runner).
- Test flow: clean `.lattice/` dir, run `pnpm example:work-inbox`, assert the three receipts exist, spawn `lattice verify` on each, spawn `lattice repro` on the success receipt, assert outputs match, spawn `lattice eval --init-baseline`, spawn `lattice eval` again and assert exit 0.

### Milestone Audit Surface
- After Phase 13 implementation completes, a verifier-level audit MUST confirm every v1.1 REQ-ID has at least one observable behavior in the showcase or eval fixtures. This audit is the prerequisite for the milestone lifecycle (audit-milestone → complete-milestone).
- Phase 13 SUMMARY.md must include a REQ-coverage matrix showing each of the 36 v1.1 IDs and the showcase/test path that exercises it.

### Claude's Discretion
- Whether to refactor `examples/work-inbox/index.mjs` into multiple modules (recommend: yes, split into `scenarios/`, `setup.mjs`, `index.mjs`) for clarity.
- How to generate the fixture PII content (recommend: deterministic seed, no real PII — the email `test+pii-fixture@example.invalid` should still match the email regex).
- Whether to add a `--regenerate-baseline` flag to the showcase script itself (out of scope; users run `lattice eval --init-baseline` directly).

### Limitations
- The showcase uses a `createFakeProvider` adapter — no real LLM calls. Phase 6's existing fake providers are reused.
- The showcase intentionally seeds artifact hashes deterministically so receipts and the baseline are reproducible across runs.
- The judge in the eval demo is `noopJudge` (always returns 1.0) — real LLM judges are deferred per CONTEXT.md Phase 12.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `examples/work-inbox/index.mjs` — current v1.0 showcase; uses `createAI` + `createFakeProvider` + `replayOffline`.
- `examples/work-inbox/fixtures/` — existing fixture artifacts (text, image, audio, PDF).
- `packages/lattice/src/index.ts` — public exports including `contract`, `inv`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `createMemoryKeySet`, `verifyReceipt`, `materializeReplayEnvelope`.
- `packages/lattice-cli/src/commands/{repro,verify,eval}.ts` — CLI handlers ready to be spawned by the integration test.
- `package.json` (root): existing `example:work-inbox` script — `pnpm --filter lattice build && node examples/work-inbox/index.mjs`. Update if needed but preserve the entry point.

### Established Patterns
- Showcase uses ESM `.mjs` files importing the built lattice package.
- Tests use vitest. CLI integration tests spawn the built bin.
- All new fixtures must be deterministic (seeded), no network calls.

### Integration Points
- `examples/work-inbox/index.mjs` — main entry, drives all three scenarios.
- Test file under `packages/lattice-cli/test/showcase-e2e.test.ts` — spawns showcase + CLI commands.
- Repo root `package.json` `example:work-inbox` script — already exists; verify it still works.
</code_context>

<specifics>
## Specific Ideas

- PII fixture: the fake provider returns an output like `{ answer: "Refund approved for j.doe@example.com", action: { kind: "refund", reason: "duplicate" } }`. The contract attaches `inv.noPII("answer")` and the email regex from `defaultPiiDetectors` matches, fires tripwire.
- The integration test should be marked skip-able when the environment is the GitHub-Actions stage that doesn't have pnpm — gate via `process.env.CI` check if necessary. But default-on for local + CI.
- The showcase should print a final summary like: `Wrote 3 receipts to examples/work-inbox/.lattice/receipts/. Try: lattice repro <id> --fixtures examples/work-inbox/.lattice/fixtures` so a reader copy-pastes the next step.
- The showcase's keyset.json and baseline.json should be gitignored — add `examples/work-inbox/.lattice/` to `.gitignore`.
</specifics>

<deferred>
## Deferred Ideas

- Real LLM judge in the eval demo (caller-supplied; deferred to v1.2).
- Multi-environment fixtures (a "production" fixture set with real-looking provider responses) — deferred.
- A `lattice receipt diff` workflow demo — depends on the v1.2 subcommand.
- Tripwire-as-eval-scorer wiring demo (Phase 12 deferred this; Phase 13 doesn't demonstrate it).
- Showcase in TypeScript (currently `.mjs`; conversion deferred).
</deferred>
