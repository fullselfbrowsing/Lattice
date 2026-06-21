---
quick_id: 260620-382
slug: patch-external-audit-failure-replay-sema
status: complete
---

# Patch External Audit Failure Replay Semantics

Fix `createExternalExecutionAudit` so non-success external executions keep
sidecar/receipt evidence but do not produce replay envelopes that inspect as
successful offline runs.

## Implementation

- Make `createExternalReplayEnvelope` derive success from
  `contractVerdict === "success"`.
- Preserve current completed plan, succeeded attempt, and replay outputs only
  for success verdicts.
- For non-success verdicts, mark the replay plan and attempt failed, omit replay
  outputs, and keep the verdict in `errors`.
- Add regression coverage for failed external execution with outputs supplied,
  plus failed plan/attempt assertions for the existing no-output failure case.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- external-execution`
- `pnpm --filter @full-self-browsing/lattice typecheck`
