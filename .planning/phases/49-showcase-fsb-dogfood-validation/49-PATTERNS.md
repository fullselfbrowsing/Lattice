# Phase 49 Patterns

## Script Pattern

- Use Node ESM `.mjs` scripts.
- Use only built-in Node modules unless the package being validated is the subject under test.
- Print stable `OK` or `FAIL` lines with a script-specific prefix.
- Prefer temp directories under `os.tmpdir()` and clean up by default.
- Return exit code `0` for pass and `1` for validation failure.

## Example Pattern

- Import from `../../packages/lattice/dist/index.js` after running the package build.
- Avoid external credentials and hosted services.
- Emit parseable scenario lines such as `scenario=v14-streaming ok=true`.
- Fail fast with a non-zero exit when an assertion does not hold.

## Test Pattern

- For CLI/package examples, spawn the built script from Vitest instead of importing its internals.
- Keep tests focused on observable stdout/stderr and exit code.
- Add package-level test coverage when a new validation script is part of a public release gate.

## Planning Pattern

- Keep one plan per VAL requirement:
  - `49-01` for offline showcase.
  - `49-02` for tarball/native leak validation.
  - `49-03` for FSB package-candidate dogfood.
  - `49-04` for milestone evidence and closure.

