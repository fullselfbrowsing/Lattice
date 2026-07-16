---
quick_id: 260620-382
slug: patch-external-audit-failure-replay-sema
status: complete
completed_at: "2026-06-20T07:21:15.000Z"
---

# Patch External Audit Failure Replay Semantics

## Outcome

- Updated `createExternalExecutionAudit` replay envelope construction so only
  success verdicts include replayable outputs.
- Non-success verdicts now produce failed replay plans and failed attempt
  records while preserving sidecar raw outputs, output hashes, receipt evidence,
  and raw request/response hashes.
- Added regression coverage for failed external executions with and without raw
  outputs.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- external-execution`
- `pnpm --filter @full-self-browsing/lattice typecheck`
