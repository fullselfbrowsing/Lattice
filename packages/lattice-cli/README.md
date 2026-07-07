[![npm version](https://img.shields.io/npm/v/@full-self-browsing/lattice-cli.svg)](https://www.npmjs.com/package/@full-self-browsing/lattice-cli)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

# @full-self-browsing/lattice-cli

Command line tools for Lattice receipt verification, replay, eval gates, receipt inspection, and local diagnostics.

## Install

```bash
pnpm add -g @full-self-browsing/lattice-cli
```

```bash
npm install -g @full-self-browsing/lattice-cli
```

Runtime target: Node.js 24 or newer. The package installs the `lattice` binary.

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
```

`verify` checks a DSSE Lattice receipt envelope against a keyset and exits with:

- `0` when the receipt verifies
- `1` when verification runs and fails
- `2` when the receipt or keyset cannot be loaded

## SDK Package

For application code, install the runtime SDK:

```bash
pnpm add @full-self-browsing/lattice
```

## Repository

Source, examples, and protocol docs live at:

https://github.com/fullselfbrowsing/Lattice
