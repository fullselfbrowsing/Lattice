# Phase 49-01 Summary: Offline v1.4 Validation Showcase

## Status

Complete.

## What Changed

- Added `examples/v14-validation/index.mjs`, an offline built-package showcase for v1.4 validation.
- Covered four parseable scenarios:
  - `v14-streaming`: runtime streaming through `policy.stream`, collected output, and stream event bracketing.
  - `v14-gateway`: LiteLLM/OpenAI-compatible fake fetch, sanitized gateway metadata, requested/observed model reporting.
  - `v14-observability`: `createOtelRunEventSink` with in-memory tracer/span verification.
  - `v14-failure`: streaming failure normalization, `stream.failed`, and no partial chunk leakage in event metadata.
- Added `packages/lattice-cli/test/v14-validation.test.ts` to spawn the example after building runtime dist.
- Added root script `example:v14-validation`.

## Verification

- `pnpm --filter @full-self-browsing/lattice-cli test -- v14-validation` — passed, 17 files / 157 tests.

## Requirement Coverage

- VAL-01 covered for offline streaming, gateway, observability, and failure-mode behavior.

