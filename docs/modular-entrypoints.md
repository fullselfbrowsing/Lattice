# Lattice Modular Entrypoints

Phase 50 defines the public modular adoption contract for `@full-self-browsing/lattice`. The root package export remains supported, but new subpaths let applications import the piece they need without treating the full agent runtime as the default integration path.

This does not lower the package-level engine. The package manifest still declares Node `>=24` for the full runtime. The compatibility labels below describe each module facade's intended support target and are validated by later milestone phases where Node 20 execution is in scope.

## Module Table

| Import Path | Compatibility | Intended Surface |
|-------------|---------------|------------------|
| `@full-self-browsing/lattice/providers` | `adapter-specific` | Provider factories, provider contracts, streaming helpers, capability negotiation, and prompt scaffold helpers. |
| `@full-self-browsing/lattice/audit` | `node20-compatible` | Capability receipts, signing, verification, CID, replay envelopes, redaction, materialization, and receipt OTel attributes. |
| `@full-self-browsing/lattice/context` | `node20-compatible` | Context packing, token estimates, and artifact reference extraction. |
| `@full-self-browsing/lattice/artifacts` | `node20-compatible` | Artifact builders, refs, metadata, storage references, and lineage types. |
| `@full-self-browsing/lattice/routing` | `node20-compatible` | Deterministic routing, catalogs, policy, capability profiles, and negotiation helpers. |
| `@full-self-browsing/lattice/tools` | `node20-compatible` | Tool definitions, tool execution, MCP-like imports, and tool-call validation types. |
| `@full-self-browsing/lattice/storage` | `adapter-specific` | Memory and Node filesystem artifact stores plus storage contracts. |
| `@full-self-browsing/lattice/eval` | `node20-compatible` | Standalone evaluation kernels for regression checks. |
| `@full-self-browsing/lattice/agents` | `node24-runtime` | Opt-in single-agent, crew, host, and agent infrastructure runtime surfaces. |
| `@full-self-browsing/lattice/core` | `node20-compatible` | Non-agent artifact, context, output, contract, routing, provider-contract, storage-contract, and result primitives. |

The machine-readable source of truth for this table is `packages/lattice/package.json` under `lattice.modules`.

## Provider-Only

Provider-only adoption is for callers that want Lattice provider contracts or adapter factories without adopting the Lattice runtime.

Use the provider facade when an application already owns orchestration and wants Lattice provider contracts or first-party adapter factories.

```ts
import {
  collectStream,
  createOpenAICompatibleProvider,
  type ProviderRunRequest,
} from "@full-self-browsing/lattice/providers";

const provider = createOpenAICompatibleProvider({
  id: "gateway",
  baseUrl: "https://gateway.example/v1",
  apiKey: process.env.GATEWAY_API_KEY,
});

const request: ProviderRunRequest = {
  task: "Summarize this support case",
  artifacts: [],
  outputs: ["answer"],
};

const stream = provider.executeStream?.(request);
if (stream !== undefined) {
  await collectStream(await stream);
}
```

This path does not require `createAI()` or `runAgent()`.

## Audit-Only

Use the audit facade when another execution layer performs model calls and Lattice should provide receipts, replay envelopes, or verification utilities.

```ts
import {
  createInMemorySigner,
  createMemoryKeySet,
  createReceipt,
  generateEd25519KeyPairJwk,
  verifyReceipt,
} from "@full-self-browsing/lattice/audit";

const keyPair = await generateEd25519KeyPairJwk();
const signer = createInMemorySigner(keyPair.privateKeyJwk, {
  kid: "local",
  publicKeyJwk: keyPair.publicKeyJwk,
});

const receipt = await createReceipt(
  {
    runId: "run-1",
    model: { requested: "external-model", observed: "external-model" },
    route: {
      providerId: "external",
      capabilityId: "external-model",
      attemptNumber: 1,
    },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  },
  signer,
);

await verifyReceipt(
  receipt,
  createMemoryKeySet([{ kid: "local", publicKeyJwk: signer.publicKeyJwk, state: "active" }]),
);
```

This path does not require the Lattice runtime to choose or execute a model.

## Core-Only

Use the core facade for artifacts, context packing, output contracts, deterministic routing primitives, and storage contracts without agent runtime imports.

```ts
import {
  artifact,
  buildContextPack,
  output,
  prepareCoreRun,
  routeDeterministically,
} from "@full-self-browsing/lattice/core";

const document = artifact.text("Support case body");
const context = buildContextPack({
  task: "Extract the refund reason",
  artifacts: [document],
});

const outputs = {
  answer: output.citations(),
};

const prepared = await prepareCoreRun({
  task: "Extract the refund reason",
  artifacts: [document],
  outputs,
  catalog: { version: "external-runtime", models: [] },
});

void context;
void outputs;
void prepared;
void routeDeterministically;
```

This path is for applications that already have a model execution layer and only need Lattice's shared primitives. `prepareCoreRun` returns a non-executing prepared core record with artifact refs, context pack, advisory route decision, input hashes, warnings, and an execution plan that downstream executors, audit helpers, and debugging tools can inspect.

## Tools/MCP-Only

Use the tools facade when an application wants tool declarations, returned tool-call validation, or MCP-shaped content conversion without importing the agent loop.

```ts
import {
  defineTool,
  mcpPromptArtifact,
  mcpResourceArtifact,
  mcpToolResultArtifact,
  validateToolCallRequests,
} from "@full-self-browsing/lattice/tools";
import { z } from "zod";

const lookup = defineTool({
  name: "lookup",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: `found:${query}` }),
});

const validCalls = await validateToolCallRequests(
  [{ id: "call-1", name: "lookup", args: { query: "refund policy" } }],
  { tools: [lookup] },
);

const resource = mcpResourceArtifact({
  uri: "file:///case.md",
  mimeType: "text/markdown",
  text: "# Support case",
});
const prompt = mcpPromptArtifact({
  name: "summarize-case",
  messages: [{ role: "user", content: "Summarize the case." }],
});
const toolResult = mcpToolResultArtifact({
  toolName: "lookup",
  callId: "call-1",
  content: [{ type: "text", text: "Refund policy found." }],
});

void validCalls;
void resource;
void prompt;
void toolResult;
```

The returned MCP artifacts are ordinary Lattice artifacts, so downstream context packing, replay, external audit, and receipt signing can inspect the same refs and metadata without requiring `runAgent()`.

## Agent Opt-In

Agent and crew APIs live under `@full-self-browsing/lattice/agents`. Importing providers, audit, context, artifacts, routing, tools, storage, eval, or core should not transitively import `src/agent/**`. The `check:module-boundaries` script enforces that separation for provider-only, audit-only, tools-only, and core-only entrypoints.

When callers intentionally opt into the agent surface, `runAgent` can return typed final outputs from declared output contracts.

```ts
import { runAgent } from "@full-self-browsing/lattice/agents";
import { z } from "zod";

const result = await runAgent({
  task: "Return the build command",
  tools: [],
  outputs: {
    build: z.object({ command: z.string() }),
  },
});

if (result.kind === "success") {
  result.output.build.command;
}
```

Importing `@full-self-browsing/lattice/agents` is the explicit opt-in point for agent and crew runtime behavior. The `check:module-boundaries` script enforces provider-only, audit-only, tools-only, and core-only separation from agent modules.
