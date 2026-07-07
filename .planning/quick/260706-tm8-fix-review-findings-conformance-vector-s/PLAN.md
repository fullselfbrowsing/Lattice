---
status: in_progress
created_at: 2026-07-07T02:19:28Z
---

# Fix review findings

## Scope

- Fix NEG-01 conformance vector so its explicit malformed envelope has exactly one mutation: `payloadType`.
- Regenerate vector files and manifest after the generator change.
- Align published package READMEs with the package manifests shipped in this workspace.

## Verification

- `pnpm --filter @lattice-conformance/generate test`
- `pnpm --filter @lattice-conformance/verify-ts test`
- `cd conformance/vectors && sha256sum --check MANIFEST.sha256`
- `pnpm check:tarball`
- `pnpm check:package-version`
