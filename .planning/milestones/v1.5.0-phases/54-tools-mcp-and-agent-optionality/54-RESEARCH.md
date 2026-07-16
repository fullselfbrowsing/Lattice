# Phase 54 Research: Tools/MCP and Agent Optionality

## Question

What needs to change so MCP/tool helpers are standalone and `runAgent` callers can opt into typed final outputs?

## Current Implementation

- `packages/lattice/src/tools.ts` is already a thin facade over `tools/tool-use.ts`, `tools/schema.ts`, `tools/tools.ts`, and `tools/tool-call-validation.ts`.
- `tools/tools.ts` provides `defineTool`, `runTool`, `importMcpTools`, and `toolArtifactRef`. `runTool` already emits `artifact.toolResult`.
- `tools/tool-call-validation.ts` validates returned `ToolUseRequest` values against declared tool schemas with throw/drop/callback modes.
- `tools/tool-use.ts` parses tool-use envelopes without provider or agent imports.
- `packages/lattice/src/agent/runtime.ts` advertises output validation in comments and types, but the final-answer path still returns `{ answer: responseText } as never`.
- `packages/lattice/src/outputs/validate.ts` already implements the actual output-contract validation used by `ai.run()`.
- `scripts/check-lattice-module-boundaries.mjs` currently checks providers, audit, and core against `src/agent/**`, but not tools.

## Implementation Direction

1. Add standalone MCP artifact helpers under `packages/lattice/src/tools/`.
2. Export those helpers and types from `packages/lattice/src/tools.ts`.
3. Reuse existing artifact constructors:
   - resource text content becomes a text artifact with MCP metadata,
   - resource binary/blob-like content becomes a JSON wrapper artifact with MCP metadata,
   - prompts become JSON artifacts with MCP metadata,
   - tool results become `tool-result` artifacts with MCP metadata.
4. Extend the module-boundary script and source tests so `tools.ts` is guarded against agent imports.
5. Refactor `outputs/validate.ts` minimally to expose a reusable output-map validation result.
6. Update `runAgent` final-answer materialization:
   - default contracts remain `{ answer: "text" }`,
   - provider requests use declared output names,
   - successful final responses return validated `InferOutputMap<TOutputs>`,
   - bad final outputs return agent failure kind `"validation"`.

## Boundary Rules

- The tools facade must not import `src/agent/**`.
- MCP helpers must not import provider adapters, runtime `createAI`, `runAgent`, crew code, or the official MCP SDK.
- Agent typed output work may import output validation but should not change `runAgentCrew` public behavior except through the existing single-agent loop it already uses.
- Existing callers that omit `intent.outputs` must keep receiving `{ answer: string }`.

## Validation Architecture

- Unit tests for MCP artifact helpers should cover text resources, blob resources, prompts, tool results, and artifact refs suitable for context packing.
- Agent runtime tests should cover typed schema outputs, non-answer output names sent to providers, and validation failure for malformed final outputs.
- Modular entrypoint tests should assert tools facade value exports and absence of agent/crew names in tools.
- Type tests should import MCP artifact helpers from `@full-self-browsing/lattice/tools` and type-check typed `runAgent` outputs from `@full-self-browsing/lattice/agents`.
- Boundary verification should include `node scripts/check-lattice-module-boundaries.mjs`.

## Risks

- Forcing native structured outputs in the agent loop could break prompt-encoded tool-call iterations. This phase should validate final raw outputs without enabling native structured mode automatically.
- MCP SDK object shapes may evolve. Keep public inputs lightweight and structural rather than binding to a concrete SDK version.
- `AgentFailure` is not the same object shape as `RunFailure`. Validation detail should be attached through `cause` while preserving the existing agent failure union.

## Out of Scope

- Full MCP transport clients and servers.
- Native provider tool calling inside `runAgent`.
- Phase 55 compatibility matrix and external dogfood examples.
