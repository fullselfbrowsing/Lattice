# Contributing to Lattice

Thank you for your interest in contributing to Lattice.

For deep architectural context, the decision log, and the full internal contributor guide, read [AGENTS.md](./AGENTS.md) first. This file is the lightweight summary.

## Development Setup

**Node version.** Lattice requires Node 24 or newer. The receipt signing path uses `crypto.subtle.generateKey("Ed25519", ...)`, which landed stable in Node 24. Older Node versions will fail at receipt-mint time, not at install time, so please install the right version up front.

**Package manager.** `pnpm` is the workspace package manager. Install it via Corepack, which ships with Node:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Or follow the official instructions at `https://pnpm.io/installation`.

**Initial install.** Clone the repository, then install dependencies from the lockfile:

```bash
pnpm install --frozen-lockfile
```

**Workspace layout.**

- `packages/lattice` is the runtime SDK published as `@full-self-browsing/lattice`.
- `packages/lattice-cli` is the CLI published as `@full-self-browsing/lattice-cli` (bin name stays `lattice`).
- `examples/` contains executable showcases against the public surface.

## Pre-PR Checks

Run these four commands locally before opening a pull request. They are the same gates `ci.yml` runs on every PR:

```bash
pnpm -r typecheck
pnpm -r test
pnpm -r test:types
pnpm -r lint:packages
```

`lint:packages` wraps `publint` and `@arethetypeswrong/cli`, so it catches package-shape regressions (broken `exports`, missing `files` entries, ESM/CJS interop hazards). All four commands must pass green locally before opening a PR. If a check fails, please fix it locally rather than opening a draft PR to ask CI to run it for you.

## Commit Conventions

Lattice uses [Conventional Commits](https://www.conventionalcommits.org). The accepted type prefixes are:

- `feat:` new feature or new public surface.
- `fix:` bug fix.
- `docs:` documentation-only change.
- `refactor:` code change that neither fixes a bug nor adds a feature.
- `test:` adding or correcting tests.
- `chore:` tooling, dependencies, or repository housekeeping.
- `ci:` continuous-integration configuration.
- `build:` build system or external dependency changes.

Optionally include a scope in parentheses, for example `feat(receipts): add KMS signer adapter`.

**Changesets.** Lattice uses `changesets` to drive npm version bumps and changelog entries. Every pull request that touches published code should include a changeset entry. Run:

```bash
pnpm changeset
```

The interactive prompt asks which packages changed and at what semver level (patch, minor, major), then writes a markdown file under `.changeset/` that you commit alongside your code change.

## Pull Request Flow

1. Fork the repository, or create a topic branch off `main` if you have write access.
2. Make your change. Add or update tests in the same commit as the behavior change.
3. Run the pre-PR checks listed above. All four must pass green.
4. Push your branch and open a pull request against `main`. CI runs the same gates plus the SHA-pinned third-party action checks documented in `SECURITY.md`.
5. Sign off your commits. DCO-style sign-off (`git commit -s`) is sufficient; full GPG signing is not required.
6. For non-trivial changes, please link to an existing planning thread under `.planning/`, or open a new one before the PR. The `.planning/` directory captures the design rationale for each phase, and a brief context-gathering step prevents PRs from stalling on architectural questions.

Small fixes, typo corrections, and documentation tweaks can skip the planning step.

## Code of Conduct

Contributors are expected to act with good faith and respect. Harassment, discrimination, and abusive behavior are not tolerated in issues, pull requests, code review, or any other project space.

Concerns can be raised privately to `lakshmantvnm@gmail.com`. Reports are handled confidentially. The maintainer reserves the right to remove contributions, revert commits, or restrict project access in response to credible reports.

## License

Contributions are licensed MIT under the project `LICENSE`. By opening a pull request you agree that your contribution may be distributed under those terms.
