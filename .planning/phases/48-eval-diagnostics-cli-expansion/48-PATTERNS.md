# Phase 48 Pattern Map

## Command Handler Pattern

Use the current command shape:

```ts
export interface Deps {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
}

export async function runCommand(args: Args, deps: Deps = defaultDeps): Promise<void> {
  // load, report, deps.exit(...)
}

export default defineCommand({ ... });
```

Handlers should return after calling `deps.exit(code)`. Tests should not inspect process globals.

## Error Pattern

Use one-line stderr failures:

```text
FAIL kind=<kind> reason=<message>
```

Exit-code mapping:
- `0`: report completed and no mismatch/regression
- `1`: report completed and mismatch/regression was found
- `2`: command failed before a valid report could be produced

## JSON Report Pattern

Stdout should contain exactly one JSON line for completed report runs. Include `exitCode` in report bodies before serialization. Keep report `version` strings explicit:
- `lattice-eval/v1` for existing receipt replay eval
- `lattice-agent-eval/v1` for new agent eval
- `lattice-receipt-diff/v1` for receipt diff
- `lattice-diagnostics/lm-studio-latency/v1` for LM Studio diagnostics

## TypeScript Pattern

- Conditional-spread optional values to satisfy `exactOptionalPropertyTypes`.
- Validate unknown JSON structurally before using it as typed data.
- Keep file IO in loader functions; keep comparison/statistics functions pure where possible.
- Use readonly arrays and interfaces to match package style.

## Test Pattern

- Direct handler tests for stdout/stderr/exit behavior.
- Pure module tests for diff/statistics edge cases when useful.
- Bin smoke test only asserts help output includes new command groups.
- Use temp dirs and `writeFile(JSON.stringify(...))` for fixture files.

## Privacy Pattern

- Do not print raw task, prompt, output, artifact bytes, provider raw response, or request headers.
- Receipt diff may print hashes and signatures because the requirement explicitly asks for hashes and signature/key differences.
- Diagnostics should report provider/model/run ids and durations only.
