# Phase 52 Patterns: External Execution Audit Layer

## External Audit Result

Return:

- `receipt`: signed `ReceiptEnvelope`
- `sidecar`: `lattice-sidecar/v1` object with extra `externalExecution` metadata
- `replayEnvelope`: replayable envelope containing raw outputs when present
- `inputHashes` and `outputHash`: inspectable hash values used in the receipt

## Sidecar Shape

Keep existing fields:

- `version`
- `task`
- `outputs`
- `policy`
- `contract`
- `rawOutputs`

Add external-only metadata:

- `externalExecution.model`
- `externalExecution.route`
- `externalExecution.usage`
- `externalExecution.rawRequest`
- `externalExecution.rawResponse`
- `externalExecution.rawRequestHash`
- `externalExecution.rawResponseHash`
- `externalExecution.inputHashes`
- `externalExecution.outputHash`

## Boundary Rule

The implementation may import artifact, plan, receipt, replay, storage, policy, and contract modules. It must not import provider adapter factories, runtime `createAI`, `runAgent`, or crew modules.
