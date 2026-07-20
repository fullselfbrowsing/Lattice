# Lattice Modular Entrypoints

The root `@full-self-browsing/lattice` export remains supported, while public subpaths let
applications import the piece they need without treating the full agent runtime as the
default integration path.

Every entrypoint shares the package-level Node `>=24` boundary. Lattice 1.6.0 is validated
on Node 24 LTS and Node 26 Current. The compatibility labels distinguish portable
Node-24-plus modules from surfaces whose actual support also depends on the selected
provider or storage adapter.

## Module Table

| Import Path | Compatibility | Intended Surface |
|-------------|---------------|------------------|
| `@full-self-browsing/lattice/providers` | `adapter-specific` | Provider factories, provider contracts, streaming helpers, capability negotiation, and prompt scaffold helpers. |
| `@full-self-browsing/lattice/audit` | `node24-plus` | Capability receipts, signing, verification, CID, replay envelopes, redaction, materialization, and receipt OTel attributes. |
| `@full-self-browsing/lattice/context` | `node24-plus` | Context packing, token estimates, and artifact reference extraction. |
| `@full-self-browsing/lattice/artifacts` | `node24-plus` | Artifact builders, refs, metadata, storage references, and lineage types. |
| `@full-self-browsing/lattice/routing` | `node24-plus` | Deterministic routing, catalogs, policy, capability profiles, and negotiation helpers. |
| `@full-self-browsing/lattice/tools` | `node24-plus` | Tool definitions, tool execution, MCP-like imports, and tool-call validation types. |
| `@full-self-browsing/lattice/storage` | `adapter-specific` | Memory and Node filesystem artifact stores plus storage contracts. |
| `@full-self-browsing/lattice/eval` | `node24-plus` | Standalone evaluation kernels for regression checks. |
| `@full-self-browsing/lattice/agents` | `node24-plus` | Opt-in single-agent, crew, host, and agent infrastructure runtime surfaces. |
| `@full-self-browsing/lattice/core` | `node24-plus` | Non-agent artifact, context, output, contract, routing, provider-contract, storage-contract, and result primitives. |

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
  model: "gpt-4o-mini",
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

const verification = await verifyReceipt(
  receipt,
  createMemoryKeySet([{ kid: "local", publicKeyJwk: signer.publicKeyJwk, state: "active" }]),
  { legacyPolicy: "reject" },
);

if (!verification.ok) throw new Error(verification.error.message);
```

This path does not require the Lattice runtime to choose or execute a model.

Lattice SDK 1.6.0 mints standard DSSE `lattice-receipt/v1.4` bodies. There is no
`lattice-receipt/v1.6` body. `verifyReceipt` keeps observable historical compatibility by
default; `legacyPolicy: "reject"` disables only the deprecated signature fallback. New
issuance cannot select a historical signature profile.
The sibling CLI maps `--standard-only` to the same strict read policy.

### Alternative signing

Use `createNobleEd25519Signer` when a pure JavaScript Ed25519 signing path is preferable to
the WebCrypto-backed `createInMemorySigner`:

```ts
import { createNobleEd25519Signer } from "@full-self-browsing/lattice/audit";

const privateKeyJwk = await loadPrivateSigningJwkFromKeyManagement();
const publicKeyJwk = await loadPublicSigningJwkFromKeyManagement();

const signer = createNobleEd25519Signer(privateKeyJwk, {
  kid: "local",
  publicKeyJwk,
});
```

`createNobleEd25519Signer` uses `@noble/ed25519` for signing. Verification and key
generation continue to use WebCrypto Ed25519. Both signer choices emit the same standard
v1.4 receipt profile.

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

This path is for applications that already have a model execution layer and only need Lattice's shared primitives. `prepareCoreRun` returns a non-executing prepared core record with artifact refs, context pack, advisory route decision, input hashes, warnings, and an execution plan that downstream executors, audit helpers, and debugging tools can inspect. Full runtime execution additionally materializes one route-specific provider projection and uses it consistently for packaging, hashes, attempts, receipts, and replay evidence.

## Context/Artifact-Only

Use the context and artifacts facades when an application only needs normalized artifact refs and context-pack inspection.

```ts
import { artifact } from "@full-self-browsing/lattice/artifacts";
import { buildContextPack } from "@full-self-browsing/lattice/context";

const caseBody = artifact.text("Customer says the package arrived late.", {
  id: "artifact:case:1",
});
const pack = buildContextPack({
  task: "Summarize the case",
  artifacts: [caseBody],
});

void pack.included;
```

This path is useful for host-owned executors that need Lattice's packing and artifact metadata without routing or execution.

## Routing Advisory

Use the routing facade when the host owns execution but wants Lattice's deterministic model selection advice.

```ts
import {
  createCapabilityCatalog,
  defaultCapabilityForProvider,
  routeDeterministically,
} from "@full-self-browsing/lattice/routing";

const catalog = createCapabilityCatalog([
  defaultCapabilityForProvider("external"),
]);
const route = routeDeterministically(catalog, {
  task: "Classify the case",
  artifacts: [],
  outputs: { answer: "text" },
});

void route.selected;
```

The result is advisory. No provider is called by the routing facade.

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

## Eval-Only

Use the eval facade when an application wants lightweight regression gates for its own agent or executor traces.

```ts
import { evalAgentRun } from "@full-self-browsing/lattice/eval";

const report = evalAgentRun(
  { iterationsToGoal: 2, usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.002 } },
  { iterationsToGoal: 2, usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.002 } },
);

void report.ok;
```

This path does not require Lattice routing, provider adapters, or agent execution.

## Agent Opt-In

Agent and crew APIs live under `@full-self-browsing/lattice/agents`. Importing providers, audit, context, artifacts, routing, tools, storage, eval, or core should not transitively import `src/agent/**`. The `check:module-boundaries` script enforces that separation for provider-only, audit-only, tools-only, eval-only, and core-only entrypoints.

When callers intentionally opt into the agent surface, `runAgent` can return typed final outputs from declared output contracts.

```ts
import { runAgent } from "@full-self-browsing/lattice/agents";
import { createFakeProvider } from "@full-self-browsing/lattice/providers";
import { z } from "zod";

const provider = createFakeProvider({
  response: {
    rawOutputs: {
      build: { command: "pnpm build" },
    },
  },
});

const result = await runAgent(
  {
    task: "Return the build command",
    tools: [],
    outputs: {
      build: z.object({ command: z.string() }),
    },
  },
  { providers: [provider] },
);

if (result.kind === "success") {
  result.output.build.command;
  result.receipt;
  result.iterations[0]?.receipt;
}
```

Importing `@full-self-browsing/lattice/agents` is the explicit opt-in point for agent and crew runtime behavior. Automatic iteration and terminal fields carry the exact issued envelopes; resume reuses the stored ledger, and crew results reuse member terminal envelopes in root, serial-child, parent order. The `check:module-boundaries` script enforces provider-only, audit-only, tools-only, and core-only separation from agent modules.

## Full Runtime

Use the root package when an application wants Lattice to plan, route, execute, validate, and inspect the full run.

```ts
import { createAI } from "@full-self-browsing/lattice";

const ai = createAI();
const result = await ai.run({
  task: "Say hello",
  outputs: { answer: "text" },
});

void result;
```

The full runtime and every modular facade share the Node `>=24` package engine.

## Validation Commands

The v1.6.0 modular and distribution checks are executable:

```bash
pnpm check:module-boundaries
pnpm check:core-boundary
pnpm check:packed-consumer
pnpm example:external-consumer
```

`check:packed-consumer` installs real runtime and CLI tarballs into an isolated ESM project,
rejects unresolved workspace links, and exercises standard and historical receipt plus CLI
behavior. CI runs that gate on Node 24 LTS and Node 26 Current. The optional provider canary
is scheduled/manual only; its protected configuration and sanitized tri-state evidence are
documented in [Provider canaries](./provider-canaries.md).
