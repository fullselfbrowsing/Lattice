# Phase 40: Package Version Stamping + Public-Surface Guardrails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 40-package-version-stamping-public-surface-guardrails
**Areas discussed:** Version metadata, Public root export guardrail, Package leak and tarball policy

---

## Version Metadata

Interactive selection UI was unavailable in the current mode. Per the GSD fallback, the conservative default was selected.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-package generated version | Stamp each package's own `package.json` version into its own version module during build/prebuild. Runtime reports runtime package version; CLI reports CLI package version. | yes |
| Shared runtime version | CLI imports or mirrors the runtime `latticeVersion`, assuming runtime and CLI versions always match. | |
| Runtime package.json read | Runtime and CLI read package metadata from the filesystem at execution time. | |

**User's choice:** Default selected by agent because `request_user_input` was unavailable.
**Notes:** Per-package stamping is the least surprising package identity contract and avoids depending on package files that are not published outside `dist`.

---

## Public Root Export Guardrail

Interactive selection UI was unavailable in the current mode. Per the GSD fallback, the conservative default was selected.

| Option | Description | Selected |
|--------|-------------|----------|
| Exact value-export inventory plus targeted tests | Add a central sorted inventory of runtime value exports and require targeted runtime/type coverage when the public surface changes. | yes |
| Incremental phase smoke tests only | Continue adding tests by phase without a global guard against accidental root export drift. | |
| Package lints only | Rely on `publint`, `attw`, and `tsd` without a root-export inventory. | |

**User's choice:** Default selected by agent because `request_user_input` was unavailable.
**Notes:** Existing tests cover many exports but do not force a deliberate edit for every root value export change.

---

## Package Leak and Tarball Policy

Interactive selection UI was unavailable in the current mode. Per the GSD fallback, the conservative default was selected.

| Option | Description | Selected |
|--------|-------------|----------|
| Allowlist plus dist scan plus local tarball smoke | Keep core dependencies allowlisted, scan built output for optional integration leaks, and pack both publishable packages to verify manifest/version surfaces. | yes |
| Existing lint:packages only | Keep the current `publint`/`attw`/CLI-dep checks and defer deeper package smoke to release time. | |
| Downstream dogfood only | Let FSB-via-npm validation catch package identity and dependency leaks in Phase 49. | |

**User's choice:** Default selected by agent because `request_user_input` was unavailable.
**Notes:** Phase 49 still owns full FSB-via-npm validation, but Phase 40 should catch the known version-stamping class locally.

---

## the agent's Discretion

- Exact version-stamping mechanism.
- Exact inventory representation for public value exports.
- Exact split between extending existing hygiene scripts and adding a new small script.

## Deferred Ideas

None.
