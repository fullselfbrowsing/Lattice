[![npm version](https://img.shields.io/npm/v/@full-self-browsing/lattice-cli.svg)](https://www.npmjs.com/package/@full-self-browsing/lattice-cli)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

# @full-self-browsing/lattice-cli

Command line tools for Lattice receipt verification, replay, eval gates, receipt inspection, and local diagnostics.

Current CLI version: `1.6.0`. It tracks `@full-self-browsing/lattice` 1.6.0 and the
standard `lattice-receipt/v1.4` receipt bridge. SDK and receipt schema versions are
independent; there is no `lattice-receipt/v1.6` body.

## Install

```bash
pnpm add -g @full-self-browsing/lattice-cli@^1.6.0
```

```bash
npm install -g @full-self-browsing/lattice-cli@^1.6.0
```

Runtime target: Node.js 24 or newer. The release is validated on Node 24 LTS and Node 26
Current. The package installs the `lattice` binary.

```bash
lattice --version
lattice --help
```

## Commands

```bash
lattice verify --help
lattice repro --help
lattice eval --help
lattice receipt --help
lattice diagnostics lm-studio --help
```

## Verify a Receipt

```bash
lattice verify receipt.json --key keyset.json
lattice verify receipt.json --key keyset.json --standard-only
lattice repro receipt.json --standard-only
```

`verify` checks a DSSE Lattice receipt envelope against a keyset and exits with:

- `0` when the receipt verifies
- `1` when verification runs and fails
- `2` when the receipt or keyset cannot be loaded

`verify` and `repro` use the compatibility read policy unless `--standard-only` is set.
Successful reads report `profile=<verificationProfile>` and
`deprecated=<true|false>`. Strict mode rejects the deprecated historical signature path;
it does not reject an older receipt body whose standard DSSE signature verifies. New
issuance remains standard-only.

`lattice eval` retains a result row for every receipt load, verification,
materialization, replay, and unevaluable-output failure. Invalid input returns exit 2 after
the full report is emitted, and `--init-baseline` does not write a partial baseline.

## SDK Package

For application code, install the runtime SDK:

```bash
pnpm add @full-self-browsing/lattice@^1.6.0
```

The runtime provides route-specific authoritative context, scoped persistence, explicit
`off`/`best-effort`/`required` receipt modes, strict evaluation and cost semantics, and
exact agent/crew receipt attachment. The CLI reads that evidence; it does not remint it.

## Release Validation

Repository maintainers use `pnpm check:packed-consumer` to pack and install both tarballs
in an isolated ESM consumer. The gate rejects unresolved workspace links and runs on Node
24 LTS and Node 26 Current.

The optional live provider canary is scheduled/manual only and records sanitized
`not-run`, `passed`, or `failed` evidence. See the
[provider canary runbook](https://github.com/fullselfbrowsing/Lattice/blob/main/docs/provider-canaries.md)
and [SDK v1.6 migration guide](https://github.com/fullselfbrowsing/Lattice/blob/main/docs/MIGRATION-v1.6.md).

## Repository

Source, examples, and protocol docs live at:

https://github.com/fullselfbrowsing/Lattice
