# Phase 54: Tools/MCP and Agent Optionality - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Keep MCP/tool helpers independently useful for applications that already own execution, while making the opt-in agent path return validated typed final outputs when callers declare output contracts.

</domain>

<decisions>
## Implementation Decisions

### Standalone Tools/MCP Surface
- Keep `@full-self-browsing/lattice/tools` as the primary non-agent facade for tool definitions, MCP-like imports, tool execution, returned tool-call parsing, and returned tool-call validation.
- Add MCP artifact conversion helpers beside the existing tools helpers instead of introducing a new MCP package.
- Represent MCP resources, prompts, and tool results as normal Lattice artifacts with MCP metadata, so existing context packing, replay, external audit, and receipt flows can consume them.
- Do not add a hard dependency on the official MCP SDK in core tools; accept lightweight MCP-shaped records so consumers can adapt SDK objects without pulling the SDK into this package path.

### Agent Optionality Boundary
- Extend the module-boundary guard so the `tools` facade is checked against `src/agent/**`, matching the docs promise that tools-only imports do not pull in agent or crew code.
- Keep agent and crew exports isolated under `@full-self-browsing/lattice/agents`; non-agent facades should not re-export `runAgent`, `runAgentCrew`, `AgentHost`, or crew dispatcher types.
- Update modular type tests to prove tools helpers can be imported from the tools subpath and agent types remain opt-in through the agents subpath.
- Avoid root API reshaping unless needed for existing public-surface compatibility.

### Typed Agent Final Outputs
- Preserve existing default `runAgent` behavior for callers with no `outputs`: return `{ answer: string }`.
- When `intent.outputs` is provided, send those output names to the provider and validate the final provider `rawOutputs` through the same output-contract validation kernels used by `ai.run()`.
- Do not force provider-native structured output on every agent iteration because the agent loop still uses prompt-encoded tool envelopes; native structured-output forcing could conflict with intermediate tool-call responses.
- Surface validation failures as the existing agent failure union kind `"validation"` with enough reason/cause detail for callers to diagnose bad final outputs.

### the agent's Discretion
The agent may choose exact helper names and result metadata fields as long as the tools facade stays standalone, MCP-shaped records become artifacts, and `runAgent` materializes typed final outputs from declared output contracts.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/tools/tools.ts` already exposes `defineTool`, `runTool`, `importMcpTools`, and `toolArtifactRef` without importing agent code.
- `packages/lattice/src/tools/tool-call-validation.ts` already validates returned tool calls independently of provider adapters and agent runtime.
- `packages/lattice/src/tools/tool-use.ts` already parses JSON tool-use envelopes independently.
- `packages/lattice/src/artifacts/artifact.ts` already has `artifact.text`, `artifact.json`, and `artifact.toolResult`, plus refs, metadata, fingerprints, and lineage.
- `packages/lattice/src/outputs/validate.ts` already validates `OutputContractMap` values for `ai.run()` and can be shared by `runAgent`.

### Established Patterns
- Module facades are explicit source files such as `src/tools.ts`, `src/core.ts`, and `src/agents.ts`.
- Type coverage for modular entrypoints lives in `packages/lattice/test-d/modular-entrypoints.test-d.ts`.
- Source-level facade coverage lives in `packages/lattice/test/modular-entrypoints.test.ts`.
- `scripts/check-lattice-module-boundaries.mjs` is the enforcement point for non-agent facade import graphs.

### Integration Points
- New MCP artifact helpers should be exported from `packages/lattice/src/tools.ts`; root export can remain unchanged unless public-surface tests require it.
- Agent final output validation belongs in `packages/lattice/src/agent/runtime.ts` and should reuse validation code rather than duplicating output-contract semantics.
- Docs in `docs/modular-entrypoints.md` should show a tools-only MCP artifact conversion example and update the Agent Opt-In boundary statement.

</code_context>

<specifics>
## Specific Ideas

- GitFly-style consumers should be able to import tools/MCP helpers, validate returned model tool calls, and package MCP content as artifacts without touching `runAgent`.
- Typed final agent outputs should close the current comment in `agent/runtime.ts` that says full `OutputContractMap` materialization was deferred.
- Boundary verification should fail if `@full-self-browsing/lattice/tools` ever reaches `src/agent/**`.

</specifics>

<deferred>
## Deferred Ideas

- Full official MCP client/server adapter packages are out of scope for this phase.
- Node 20 matrix execution and GitFly dogfood examples are deferred to Phase 55.
- Provider-native structured output behavior inside multi-iteration agents can be revisited after there is a deliberate design for native tool calling in agents.

</deferred>
