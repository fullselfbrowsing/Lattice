# Phase 52: External Execution Audit Layer - Context

## Goal

Let apps keep their existing AI executor while using Lattice receipts, replay fixtures, eval, and diffing.

## Requirements

- AUD-01: Developer can wrap an externally executed AI call with Lattice receipts without replacing the executor.
- AUD-02: Developer can record raw request/response envelopes, model identity, usage, artifacts, outputs, and policy decisions for external execution runs.
- AUD-03: Developer can replay or diff external execution fixtures with the existing CLI where sufficient sidecar data exists.
- AUD-04: Developer can use eval gates against external execution receipts and sidecars without depending on Lattice provider adapters.
- AUD-05: Receipt signing and verification stay JCS/DSSE/Ed25519-compatible with existing v1.2 receipts.

## Current Shape

- `createReceipt` already signs low-level receipt inputs but expects the caller to supply `inputHashes`, `outputHash`, `contractHash`, route, model, and usage.
- `materializeReplayEnvelope` can already rebuild replay envelopes from receipts plus sidecar data and artifact loaders.
- Existing CLI sidecars use `version: "lattice-sidecar/v1"` and tolerate unknown extra fields.
- `audit.ts` already exports receipt/replay primitives and is guarded from importing agent modules.

## Decision

Add a small audit helper that external executors can call after their own model invocation completes:

```ts
const audit = await createExternalExecutionAudit(input, signer);
```

It should return a signed receipt, a sidecar, hashes, and a replay envelope. The helper must not invoke provider adapters or `createAI()`.

## Non-Goals

- Do not create a new CLI command in this phase.
- Do not replace `lattice-sidecar/v1`; use a compatible sidecar with extra external metadata.
- Do not serialize Standard Schema validators into sidecars. External callers can pass raw outputs for replay and simple serializable output specs for CLI sidecars.
