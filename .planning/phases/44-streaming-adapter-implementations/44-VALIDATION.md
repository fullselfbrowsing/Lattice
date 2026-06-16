# Phase 44 Validation Strategy

**Date:** 2026-06-16
**Status:** Complete

## Requirements

- `SADAPT-01`: Anthropic `executeStream?` normalizes text and tool-input deltas.
- `SADAPT-02`: Gemini `executeStream?` normalizes text and function-call deltas.
- `SADAPT-03`: xAI, OpenRouter, and LM Studio stream through OpenAI-compatible paths where available.
- `SADAPT-04`: Streaming parity tests cover all seven logical providers, including predictable behavior for non-streaming fallback/unavailable paths.

## Automated Gates

1. Provider-specific tests:
   ```bash
   pnpm --filter @full-self-browsing/lattice test -- adapters anthropic gemini xai openrouter lm-studio parity
   ```

2. Runtime streaming regression:
   ```bash
   pnpm --filter @full-self-browsing/lattice test -- create-ai streaming
   ```

3. Package type and compile gates:
   ```bash
   pnpm --filter @full-self-browsing/lattice test:types
   pnpm --filter @full-self-browsing/lattice typecheck
   ```

4. Package boundary:
   ```bash
   node scripts/check-core-package-boundary.mjs
   ```

## Manual/Human Verification

None required. Live provider streaming credentials are intentionally out of scope; fake SSE fixtures provide deterministic parser coverage.

## Success Criteria

- All seven v1.2 logical provider factories expose `executeStream?` or are explicitly documented as unsupported by parity tests.
- Anthropic and Gemini custom parsers pass fake SSE tests for text and tool/function calls.
- OpenAI-compatible wrappers pass fake SSE tests through shared parser inheritance.
- `policy.stream` runtime runs through adapter streams and returns normal validated outputs.
- No runtime dependency is added.

## VALIDATION COMPLETE
