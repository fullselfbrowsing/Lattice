# Phase 35 Verification

**Status:** PASS

## Goal

Ship deterministic, version-pinned prompt scaffold helpers for structured-output and tool-use prompts across the five `RecommendedPromptStrategy` values, with explicit `open_weight` guards for the `session_1780792387779` internal-envelope leak.

## Requirement Evidence

- **SCAFF-01:** `packages/lattice/src/prompts/scaffolds.ts` exports `getStructuredOutputContract` and `getToolUseContract`, both typed against Phase 33 `RecommendedPromptStrategy`.
- **SCAFF-02:** `PROMPT_SCAFFOLD_VERSION` is `lattice.prompt-scaffold/v1`; payloads are canonicalized with `canonicalize`; deterministic key-order tests and snapshots pass.
- **SCAFF-03:** `open_weight` structured-output and tool-use fragments include explicit meta-instruction guard text and good/bad examples.
- **SCAFF-04:** `packages/lattice/test/prompt-scaffolds.test.ts` contains per-strategy snapshots, fake provider stubs, and the `session_1780792387779` anchor regression.

## Verification Commands

- `pnpm --filter @full-self-browsing/lattice typecheck` — PASS
- `pnpm --filter @full-self-browsing/lattice test prompt-scaffolds -- -u` — PASS, wrote 10 snapshots
- `pnpm --filter @full-self-browsing/lattice test prompt-scaffolds` — PASS, 18 tests
- `pnpm --filter @full-self-browsing/lattice test prompt-scaffolds public-surface` — PASS, 47 tests
- `pnpm --filter @full-self-browsing/lattice build` — PASS
- `pnpm --filter @full-self-browsing/lattice test:types` — PASS, 75 files / 912 tests / no type errors
- `pnpm --filter @full-self-browsing/lattice lint:packages` — PASS, build + publint + attw + CLI dep check

## Commits

- `0887bd2` — `feat(phase-35): add prompt scaffold helpers`
- `5e38c31` — `test(phase-35): cover prompt scaffold helpers`

## Self-Check: PASSED
