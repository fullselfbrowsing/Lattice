# Phase 49-03 Summary: FSB Package-Candidate Dogfood

## Status

Complete.

## What Changed

- Added `scripts/dogfood-fsb-candidate.mjs`.
- Added root script `dogfood:fsb`.
- Runner behavior:
  - Builds and packs `@full-self-browsing/lattice`.
  - Installs the packed tarball into an isolated temp consumer with `npm install --ignore-scripts`.
  - Creates a temp FSB copy, excluding `.git`, `node_modules`, embedded `lattice`, and planning artifacts.
  - Links candidate `node_modules` into the temp FSB copy.
  - Runs a generated FSB-side v1.4 smoke that checks new exports, `latticeVersion`, `collectStream`, `evalAgentRun`, and v1.3 receipt verification with `lineageMerkleRoot` and `modelClass`.
  - Runs the compatible legacy FSB provider-surface smoke from the local checkout.
  - Compares FSB `git status --short` before and after to prove the original checkout was not mutated.

## Verification

- `node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation` — passed.

Observed output:

```text
[dogfood-fsb-candidate] test=tests/fsb-v14-candidate-smoke.mjs exit=0 passCount=0
[dogfood-fsb-candidate] test=tests/lattice-providers-smoke.test.js exit=0 passCount=47
[dogfood-fsb-candidate] OK - version=1.3.0 ... dirtyLines=2
```

The two dirty lines are pre-existing FSB generated-file changes; the runner left them unchanged.

## Requirement Coverage

- VAL-02 covered for package-candidate install, v1.4 public exports, version stamping against the packed manifest, and receipt compatibility.

