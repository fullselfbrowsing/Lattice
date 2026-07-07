---
status: complete
completed_at: 2026-07-07T02:24:00Z
---

# Summary

Fixed the review findings from the workspace review.

## Changes

- NEG-01 now writes a DSSE base64 signature in its explicit malformed envelope, leaving `payloadType` as the single intended envelope mutation.
- Added a generator test that prevents regressing explicit envelope signatures back to raw hex.
- Regenerated `conformance/vectors/negative/neg-01-envelope-malformed.json` and `conformance/vectors/MANIFEST.sha256`.
- Replaced package-page READMEs with package-specific docs that match the current root-only runtime export surface and CLI package identity.

## Verification

- `pnpm --filter @lattice-conformance/generate test`
- `pnpm --filter @lattice-conformance/verify-ts test`
- `pnpm --filter @lattice-conformance/generate typecheck`
- `pnpm --filter @lattice-conformance/verify-ts typecheck`
- `cd conformance/vectors && sha256sum --check MANIFEST.sha256`
- `pnpm check:tarball`
- `pnpm check:package-version`
- `UV_PROJECT_ENVIRONMENT=.context/uv/clients-python uv run --project clients/python --extra test python -m pytest -q`
- `PYTHON=.context/uv/clients-python/bin/python LATTICE_RUN_CROSS_MINT=1 pnpm --filter @lattice-conformance/verify-ts test -- src/cross_mint_parity.test.ts`
