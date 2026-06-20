---
id: 54-01
phase: 54
name: Standalone Tools/MCP Helpers and Typed Agent Finals
status: complete
completed_at: 2026-06-20
commit: 6786999
---

# Summary 54-01: Standalone Tools/MCP Helpers and Typed Agent Finals

## Completed

- Added structural MCP artifact helpers under `@full-self-browsing/lattice/tools`:
  - `mcpResourceArtifact`
  - `mcpPromptArtifact`
  - `mcpToolResultArtifact`
- Exported `validateToolCallRequests` from the tools facade so returned tool-call validation is standalone.
- Extended `runAgent` final-answer handling to:
  - default to `{ answer: "text" }` for existing callers,
  - send declared output names to providers,
  - validate final `rawOutputs` through shared output-contract validation,
  - return typed final `output` values on success,
  - return agent failure kind `"validation"` on malformed final outputs.
- Added a reusable `validateOutputMapValues` helper for output-contract validation without requiring a full `RunResult` plan.
- Extended module-boundary enforcement so `@full-self-browsing/lattice/tools` cannot import `src/agent/**`.
- Updated modular entrypoint tests, type tests, and docs for tools-only MCP adoption and typed agent final outputs.

## Requirements Closed

- TOOL-01: Tools/MCP helpers are importable from `@full-self-browsing/lattice/tools` without enabling the agent loop.
- TOOL-02: Returned tool-call validation is exported and type-tested from the standalone tools facade.
- TOOL-03: MCP resources, prompts, and tool results can be represented as Lattice artifacts.
- AGNT-01: Boundary checks now enforce tools-only separation from agent modules.
- AGNT-02: `runAgent` callers can declare output contracts and receive typed final outputs.

## Review

Code review status: clean.

Pre-report remediation fixed one source-compatibility risk by keeping `AgentIntent` and `AgentResult` default generics broad while giving the public `runAgent` function and `AI.runAgent` method typed defaults for no-output callers.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- mcp-artifacts runtime`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `node scripts/check-lattice-module-boundaries.mjs`
- `pnpm --filter @full-self-browsing/lattice test:types`
- `pnpm --filter @full-self-browsing/lattice lint:packages`
