# Phase 29-04 Summary: Stable Release Proof and Closure

## Outcome

Phase 29 is complete. Stable `v1.3.0` is published, provenance is present for both npm packages, the GitHub Release exists, registry tarballs have the expected manifests, and a clean temp consumer install verifies signatures.

GitHub Release:

- URL: https://github.com/fullselfbrowsing/Lattice/releases/tag/v1.3.0
- Tag: `v1.3.0`
- Target commit: `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`
- Draft: `false`
- Prerelease: `false`
- Published at: `2026-06-11T20:55:52Z`
- Body includes changelog-derived notes and npm links for both packages

Release workflow:

- Run: https://github.com/fullselfbrowsing/Lattice/actions/runs/27376721154
- Final run conclusion: failure
- Reason: npm publish succeeded, then release-note extraction failed because the extractor only matched bracketed changelog headings
- Recovery: created the GitHub Release manually from the changelog-derived notes and patched the extractor for future releases
- Rerun status: not rerun, because both npm packages are already published

## Npm Registry Proof

`@full-self-browsing/lattice@1.3.0`:

- `latest`: `1.3.0`
- shasum: `489041096a88ba0618f294c2dcf385f0937e64f3`
- integrity: `sha512-w7cm8b+FFLcN9e1kRWDL0LaDZunAdMhlBFOrsIrryYV5cQifBKfjd0mlStYqwaHYhgm1TQvyw8BIac0lN4JszA==`
- tarball: https://registry.npmjs.org/@full-self-browsing/lattice/-/lattice-1.3.0.tgz
- signature key: `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`
- attestation: https://registry.npmjs.org/-/npm/v1/attestations/@full-self-browsing%2flattice@1.3.0
- provenance predicate: `https://slsa.dev/provenance/v1`

`@full-self-browsing/lattice-cli@1.3.0`:

- `latest`: `1.3.0`
- shasum: `a7579e6c345fa4ef0e47932d3436d1b612e034a2`
- integrity: `sha512-piieFV9NC7+eze8kLQpOFieNHK/DroC9yFhp10YP5obPcNXd6dGhCY0sqlQNSaIR2YqD9bc9E5V6tkjn+lpyrw==`
- tarball: https://registry.npmjs.org/@full-self-browsing/lattice-cli/-/lattice-cli-1.3.0.tgz
- signature key: `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`
- attestation: https://registry.npmjs.org/-/npm/v1/attestations/@full-self-browsing%2flattice-cli@1.3.0
- provenance predicate: `https://slsa.dev/provenance/v1`

## Registry Tarball Proof

`npm pack @full-self-browsing/lattice@1.3.0` produced `full-self-browsing-lattice-1.3.0.tgz`.

Runtime package manifest excerpt:

```json
{
  "name": "@full-self-browsing/lattice",
  "version": "1.3.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"]
}
```

`npm pack @full-self-browsing/lattice-cli@1.3.0` produced `full-self-browsing-lattice-cli-1.3.0.tgz`.

CLI package manifest excerpt:

```json
{
  "name": "@full-self-browsing/lattice-cli",
  "version": "1.3.0",
  "type": "module",
  "bin": {
    "lattice": "./dist/cli.js"
  },
  "dependencies": {
    "citty": "0.2.2",
    "@full-self-browsing/lattice": "^1.3.0"
  },
  "files": ["dist"]
}
```

## Consumer Verification

Temp consumer commands:

```bash
npm init -y
npm install @full-self-browsing/lattice@1.3.0 @full-self-browsing/lattice-cli@1.3.0
npm audit signatures
```

Result:

```text
added 6 packages, and audited 7 packages in 2s
found 0 vulnerabilities
audited 6 packages in 2s
6 packages have verified registry signatures
3 packages have verified attestations
```

## Release-Note Extractor Repair

Patched `scripts/extract-release-notes.mjs` so future releases accept both heading forms:

- `## 1.3.0`
- `## [1.2.0] - 2026-05-31`

Verification:

```bash
node scripts/extract-release-notes.mjs v1.3.0 .context/v1.3.0-extracted-notes.md
node scripts/extract-release-notes.mjs 1.2.0 /tmp/lattice-release-notes-1.2.0.md
```

Both commands exited 0 and generated release-note bodies.

## Planning Closure

Updated:

- `.planning/REQUIREMENTS.md`: PUB-02, PUB-03, and PUB-04 complete
- `.planning/ROADMAP.md`: Phase 29 complete
- `.planning/STATE.md`: next focus is Phase 30 Canary Bootstrap + Layer 1 Fake-Provider Suite

