# Phase 49: Showcase + FSB Dogfood Validation - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase proves the v1.4 package candidate before milestone close. It adds offline validation scenarios for the new streaming, gateway, observability, and failure-mode surfaces; validates packed tarballs for package hygiene; runs FSB dogfood against the candidate without mutating the FSB checkout; and records a requirement-to-evidence matrix for the milestone audit.

</domain>

<decisions>
## Implementation Decisions

### Validation Scope
- Add a focused v1.4 showcase rather than expanding the older work-inbox script; the existing work-inbox remains the v1.1 contract/receipt e2e.
- Run the showcase against built `packages/lattice/dist` and built CLI output so it validates packaged public entrypoints, not source-only internals.
- Use fake providers, fake fetch functions, and in-memory tracer/span doubles only; no hosted provider credentials or network calls are required.
- Cover both successful and failed paths because VAL-01 explicitly asks for failure-mode behavior.

### FSB Dogfood
- Do not edit `/Users/lakshmanturlapati/Desktop/FSB` directly; copy or stage into a temp directory so existing user changes remain untouched.
- Pack the current Lattice candidate with `pnpm pack` and install from that tarball path; this is the local package-candidate equivalent of the published npm consumer path.
- If the current FSB checkout still imports bare `lattice`, create an isolated compatibility symlink in the temp install rather than changing FSB source.
- Add explicit candidate checks for v1.4 exports, version stamping, and receipt compatibility; existing FSB smoke tests alone are not enough because they cover only the API slice FSB already uses.

### Tarball Guardrails
- Extend the existing tarball inspection scripts instead of adding a second overlapping package audit.
- Keep scripts dependency-free and CI-friendly: Node built-ins plus `pnpm` and `tar`, matching existing repository scripts.
- Fail if the core runtime tarball ships install lifecycle scripts or unwanted native/heavy optional integrations.
- Keep the CLI dependency on the runtime valid while ensuring optional integrations do not leak into core.

### Evidence and Audit
- Produce a phase-local evidence matrix that maps all v1.4 requirements to phase summaries, test commands, package checks, dogfood output, or explicit deferral.
- Prefer zero deferrals for the VAL requirements; if FSB is unavailable locally, document that as a blocker rather than silently counting it as passed.
- Update roadmap, requirements, and state only after verification evidence exists.
- Keep final milestone lifecycle separate from phase implementation; autonomous mode will run audit/complete/cleanup after Phase 49 passes.

### the agent's Discretion
The agent may choose exact file names, helper boundaries, and test placement as long as the validation is offline, deterministic, and package-candidate oriented.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `examples/work-inbox/` already exercises signed receipts, replay sidecars, contract failures, tripwires, and CLI eval/repro/verify.
- `examples/agent-loop/` and `examples/agent-crew/` already run against built `packages/lattice/dist/index.js` and verify agent receipt/eval flows.
- `scripts/check-package-version-surfaces.mjs` packs runtime and CLI tarballs and validates `latticeVersion` plus CLI banner version stamping.
- `scripts/check-tarball-leak.mjs` already packs publishable packages and inspects tarball manifests for stale bare `lattice` references.
- Phase 48 added CLI commands for `lattice eval --agent`, `lattice receipt diff`, and `lattice diagnostics lm-studio`.

### Established Patterns
- Validation scripts are standalone `.mjs` files with zero external dependencies, explicit exit codes, and concise `[script-name] OK/FAIL` output.
- CLI tests use Vitest with spawned built binaries after `pnpm build`.
- Public-surface and tarball checks prefer packed artifacts and extracted `package.json` rather than workspace symlink assumptions.
- Existing examples print parseable `scenario=...` lines and avoid external services.

### Integration Points
- Runtime public exports live in `packages/lattice/src/index.ts`.
- Package scripts live in root `package.json` and per-package manifests.
- CLI command registration lives in `packages/lattice-cli/src/cli.ts`.
- FSB dogfood target is expected at `/Users/lakshmanturlapati/Desktop/FSB/automation`; the script should also accept `--fsb-dir`.

</code_context>

<specifics>
## Specific Ideas

- Add a v1.4 validation example with four scenario labels: streaming, gateway, observability, and failure-mode.
- Add a root package script for tarball validation so the gate is easy to rerun.
- Add a dogfood runner that leaves the original FSB checkout clean even if it has unrelated local modifications.
- Capture dogfood output and final verification commands in the Phase 49 evidence file.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
