[![npm version](https://img.shields.io/npm/v/@full-self-browsing/lattice.svg)](https://www.npmjs.com/package/@full-self-browsing/lattice)
![npm provenance](https://img.shields.io/badge/provenance-attested-success.svg)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

<div align="center">

<img src="assets/logo-wordmark.png" alt="Lattice" width="340" />

# Lattice

**Capability runtime SDK for multimodal AI applications**

Lattice lets developers describe a job, attach artifacts, declare outputs, and set policy constraints. It returns typed outputs, an inspectable execution plan, optional signed receipts, and the provider evidence needed to understand what happened.

![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-%3E%3D24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![ESM](https://img.shields.io/badge/ESM-only-000000?style=for-the-badge)
![Standard Schema](https://img.shields.io/badge/Standard_Schema-compatible-8B5CF6?style=for-the-badge)
![Version](https://img.shields.io/badge/version-1.6.0-0078D4?style=for-the-badge)

[Install](#install) · [Quick Start](#quick-start) · [Runtime](#runtime) · [Modular Entrypoints](#modular-entrypoints) · [Providers](#providers) · [Audit](#audit) · [Agents](#agents) · [CLI](#cli) · [Development](#development)

</div>

## Status

Lattice is published under the `@full-self-browsing` npm scope.

* `@full-self-browsing/lattice`: `1.6.0`
* `@full-self-browsing/lattice-cli`: `1.6.0`
* Runtime target: Node.js `>=24`; validated on Node 24 LTS and Node 26 Current
* Package format: ESM
* License: MIT
* Registry publishing: npm OIDC Trusted Publisher with provenance attestations

Every published entrypoint shares the Node 24-or-newer package boundary. Modular facades
still keep provider, audit, context, storage, evaluation, and agent concerns independently
importable.

## Why Lattice

Modern AI product work rarely stops at one prompt. A real flow may include a user message, a screenshot, a PDF, a transcript, structured JSON, citations, privacy limits, budget limits, provider choice, retries, replay, and an audit record.

Without a capability runtime, every application rebuilds the same machinery around artifact normalization, context packing, model selection, provider request shapes, schema validation, fallback, logging, and replay.

Lattice puts that machinery behind one TypeScript first runtime while keeping the public API small.

## What Lattice Handles

* Artifacts: text, JSON, files, URLs, images, audio, video, documents, and tool results.
* Outputs: plain text, Standard Schema and Zod compatible structured data, citations, and generated artifact refs.
* Routing: deterministic provider and model selection from capability metadata, policy, cost, latency, privacy, and fallback rules.
* Context: route-specific materialized projections, scoped session history, summaries, token estimates, and context pack plans.
* Providers: OpenAI, OpenAI compatible gateways, Anthropic, Gemini, xAI, OpenRouter, LiteLLM, LM Studio, AI SDK style providers, and fake providers for tests.
* Audit: standard DSSE receipts, Ed25519 signatures, explicit issuance modes, CIDs, replay envelopes, redaction, and observable compatibility verification.
* Tools: tool definitions, tool execution, MCP shaped resources, MCP shaped prompts, tool results as artifacts, and returned tool call validation.
* Agents: opt in single agent loops and structured crew runs built on the same provider, tool, policy, event, and receipt primitives.

## Install

```bash
pnpm add @full-self-browsing/lattice@^1.6.0 zod
```

```bash
npm install @full-self-browsing/lattice@^1.6.0 zod
```

Install the CLI only when you need receipt verification, replay, eval, or diagnostics from a terminal.

```bash
pnpm add -g @full-self-browsing/lattice-cli@^1.6.0
lattice --version
```

## Quick Start

This example uses the fake provider so it runs without API keys. Replace it with a real provider when you wire Lattice into an application.

```ts
import { z } from "zod";
import {
  artifact,
  createAI,
  createFakeProvider,
  output,
} from "@full-self-browsing/lattice";

const ai = createAI({
  providers: [
    createFakeProvider({
      response: {
        rawOutputs: {
          answer: "Refund the duplicate charge and note the billing error.",
          action: {
            kind: "refund",
            reason: "The customer was charged twice for one order.",
          },
          citations: [],
        },
      },
    }),
  ],
});

const result = await ai.run({
  task: "Resolve this support case",
  artifacts: [
    artifact.text("Customer was charged twice for one order.", {
      label: "support case",
      privacy: "sensitive",
    }),
  ],
  outputs: {
    answer: "text",
    action: z.object({
      kind: z.enum(["refund", "replace", "escalate", "clarify"]),
      reason: z.string(),
    }),
    citations: output.citations(),
  },
  policy: {
    maxCostUsd: 2,
    privacy: "sensitive",
  },
});

if (!result.ok) {
  throw new Error(result.error.message);
}

console.log(result.outputs.action.kind);
console.log(result.plan.status);
```

## Runtime

Use the root package when you want Lattice to plan, route, execute, validate, trace, and return the run.

```ts
import {
  createAI,
  createOpenAICompatibleProvider,
} from "@full-self-browsing/lattice";

const ai = createAI({
  providers: [
    createOpenAICompatibleProvider({
      id: "gateway",
      model: "gpt-4o-mini",
      baseUrl: "https://gateway.example/v1",
      apiKey: process.env.GATEWAY_API_KEY,
    }),
  ],
  defaults: {
    policy: {
      maxCostUsd: 1,
      privacy: "standard",
    },
  },
});

const plan = await ai.plan({
  task: "Summarize this incident report",
  artifacts: [],
  outputs: { answer: "text" },
});

const result = await ai.run({
  task: "Summarize this incident report",
  artifacts: [],
  outputs: { answer: "text" },
});

void plan;
void result;
```

Every run produces a plan with routing, context packing, validation, attempts, fallback,
usage, and event data. The provider request and each attempt's input hashes, receipt inputs,
packaging, and replay evidence come from the same route-specific materialized context
projection. Fallback routes are packed again against their own limits.

With storage or sessions configured, Lattice preserves store-returned references and
enforces tenant, privacy, retention, and selected-session boundaries before provider work.
Missing selected references fail by default; `missingArtifactRef: "omit"` is an explicit
compatibility policy that records an omission without exposing content.

## Modular Entrypoints

Lattice can be adopted one module at a time. The package manifest exposes machine readable compatibility metadata under `lattice.modules`.

| Import path | Compatibility | Use it for |
| --- | --- | --- |
| `@full-self-browsing/lattice/providers` | `adapter-specific` | Provider factories, provider contracts, streaming helpers, capability negotiation, and prompt scaffolds |
| `@full-self-browsing/lattice/audit` | `node24-plus` | Receipts, signing, verification, CIDs, replay envelopes, redaction, and receipt attributes |
| `@full-self-browsing/lattice/context` | `node24-plus` | Context packing, token estimates, and artifact reference extraction |
| `@full-self-browsing/lattice/artifacts` | `node24-plus` | Artifact builders, refs, metadata, fingerprints, storage refs, and lineage |
| `@full-self-browsing/lattice/routing` | `node24-plus` | Deterministic routing, catalogs, policies, capability profiles, and negotiation |
| `@full-self-browsing/lattice/tools` | `node24-plus` | Tool definitions, execution, MCP shaped artifacts, and tool call validation |
| `@full-self-browsing/lattice/storage` | `adapter-specific` | Memory and local filesystem artifact stores plus storage contracts |
| `@full-self-browsing/lattice/eval` | `node24-plus` | Regression gates for agent and executor traces |
| `@full-self-browsing/lattice/agents` | `node24-plus` | Single agent loops, crew runs, hosts, rate limits, and agent infrastructure |
| `@full-self-browsing/lattice/core` | `node24-plus` | Non agent artifacts, context, outputs, contracts, routing, providers, storage contracts, and results |

See [docs/modular-entrypoints.md](docs/modular-entrypoints.md) for focused examples.

## Providers

Provider adapters can run through the full runtime or be used directly from the provider facade.

```ts
import {
  collectStream,
  createOpenAICompatibleProvider,
} from "@full-self-browsing/lattice/providers";

const provider = createOpenAICompatibleProvider({
  id: "gateway",
  model: "gpt-4o-mini",
  baseUrl: "https://gateway.example/v1",
  apiKey: process.env.GATEWAY_API_KEY,
});

if (provider.execute === undefined) {
  throw new Error("Provider does not support direct execution.");
}

const response = await provider.execute({
  task: "Summarize this support case",
  artifacts: [],
  outputs: ["answer"],
});

const stream = provider.executeStream?.({
  task: "Stream a short answer",
  artifacts: [],
  outputs: ["answer"],
  policy: { stream: true },
});

if (stream !== undefined) {
  await collectStream(await stream, { defaultOutput: "answer" });
}

void response;
```

The provider surface includes native structured output requests, native tool definitions, provider tool choice metadata, streaming finish details, gateway metadata, and capability negotiation.

## Audit

Use the audit facade when another executor performs the model call and Lattice should provide receipts, replay envelopes, and verification.

```ts
import {
  createExternalExecutionAudit,
  createMemoryKeySet,
  createNobleEd25519Signer,
  generateEd25519KeyPairJwk,
  verifyReceipt,
} from "@full-self-browsing/lattice/audit";
import { contract } from "@full-self-browsing/lattice/core";

const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
const signer = createNobleEd25519Signer(privateKeyJwk, {
  kid: "local",
  publicKeyJwk,
});

const audited = await createExternalExecutionAudit(
  {
    runId: "run-1",
    task: "Audit external executor output",
    artifacts: [],
    outputSpecs: { answer: "text" },
    outputs: { answer: "External executor answer." },
    policy: { privacy: "standard" },
    contract: contract(),
    model: { requested: "external-model", observed: "external-model" },
    route: {
      providerId: "external",
      capabilityId: "external-model",
      attemptNumber: 1,
    },
    usage: { promptTokens: 10, completionTokens: 5, costUsd: null },
    rawRequest: { model: "external-model" },
    rawResponse: { answer: "External executor answer." },
  },
  signer,
);

const verification = await verifyReceipt(
  audited.receipt,
  createMemoryKeySet([
    { kid: "local", publicKeyJwk, state: "active" },
  ]),
  { legacyPolicy: "reject" },
);

if (!verification.ok) throw new Error(verification.error.message);
```

Lattice SDK 1.6.0 emits `lattice-receipt/v1.4` with signed
`signatureProfile: "dsse-v1"`; SDK and receipt schema versions are independent, and there
is no `lattice-receipt/v1.6` body. New issuance is standard-only. Direct verification uses
the observable compatibility bridge by default, while `legacyPolicy: "reject"` disables
only the deprecated historical signature fallback.

Runtime receipt policy is explicit: `off`, `best-effort`, or `required`. Required mode
fails without repeating provider work, evaluation keeps invalid and unevaluable rows, and
the shared cost estimator distinguishes missing pricing from known free pricing. A hard
`maxCostUsd` therefore fails closed when required pricing is unknown.

## Tools and MCP

Tool helpers are available without importing the agent runtime.

```ts
import {
  defineTool,
  mcpResourceArtifact,
  validateToolCallRequests,
} from "@full-self-browsing/lattice/tools";
import { z } from "zod";

const lookup = defineTool({
  name: "lookup",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: `found:${query}` }),
});

const calls = await validateToolCallRequests(
  [{ id: "call-1", name: "lookup", args: { query: "refund policy" } }],
  { tools: [lookup] },
);

const policy = mcpResourceArtifact({
  uri: "file:///refund-policy.md",
  mimeType: "text/markdown",
  text: "# Refund policy",
});

void calls;
void policy;
```

MCP resources, prompts, and tool results become ordinary Lattice artifacts. They can be packed, replayed, audited, and signed like any other artifact.

## Agents

Single agent execution is available through `ai.runAgent()` and the explicit `@full-self-browsing/lattice/agents` facade. Multi agent crews are opt in through `defineAgent()` and `runAgentCrew()`.

```ts
import {
  contract,
  createAI,
  createFakeProvider,
  defineTool,
} from "@full-self-browsing/lattice";
import { z } from "zod";

const ai = createAI({
  providers: [
    createFakeProvider({
      response: {
        rawOutputs: {
          final: { command: "pnpm test" },
        },
      },
    }),
  ],
});

const result = await ai.runAgent({
  task: "Return the command that verifies this package",
  tools: [
    defineTool({
      name: "noop",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    }),
  ],
  outputs: {
    final: z.object({ command: z.string() }),
  },
  contract: contract({ budget: { maxIterations: 3 } }),
});

if (result.kind === "success") {
  console.log(result.output.final.command);
}
```

Agent execution uses the same policy, provider, tool, event, receipt, and survivability
primitives as normal runs. When receipts are enabled, each iteration and terminal result
carries the exact envelope issued for it. Resume restores stable iteration identities and
stored envelopes without reminting completed work. Crew results reuse those terminal
envelopes in root, serial child, then parent order and expose CIDs for the same objects.

Non agent modular entrypoints are checked so they do not pull the agent surface into
provider only, audit only, tools only, eval only, or core only adoption paths.

## CLI

The CLI package installs the `lattice` command.

```bash
lattice --help
lattice verify receipt.json --key keyset.json
lattice verify receipt.json --key keyset.json --standard-only
lattice repro receipt.json --standard-only
lattice eval --help
lattice receipt --help
lattice diagnostics lm-studio --help
```

Use it for receipt verification, offline replay, complete eval gates, receipt inspection,
and local diagnostics. Compatibility reads report `profile=` and `deprecated=`; strict
mode maps to the same legacy rejection policy as the SDK.

## Development

```bash
git clone https://github.com/fullselfbrowsing/Lattice.git
cd Lattice
pnpm install
pnpm build
pnpm test
pnpm test:types
pnpm lint:packages
```

Useful targeted checks:

```bash
pnpm check:package-version
pnpm check:module-boundaries
pnpm check:core-boundary
pnpm check:packed-consumer
pnpm check:comment-hygiene
node scripts/check-workflow-safety.mjs
pnpm example:external-consumer
```

`pnpm check:packed-consumer` packs both published packages, installs their tarballs into an
isolated ESM project, rejects unresolved workspace dependencies, and exercises current and
historical receipt plus CLI behavior. CI runs that distribution check on Node 24 LTS and
Node 26 Current.

The live OpenAI-compatible, Anthropic, and Gemini provider canary is an optional
scheduled/manual maintainer signal. It uses protected credentials, one bounded request per
configured family, strict receipt verification, and sanitized tri-state evidence. It is
not a pull-request gate or a substitute for the deterministic fake-server suite.

## Documentation

* [Modular entrypoints](docs/modular-entrypoints.md)
* [Migrating to SDK v1.6](docs/MIGRATION-v1.6.md)
* [Provider canaries](docs/provider-canaries.md)
* [Receipt v1.4 protocol migration](spec/MIGRATION-v1.4.md)
* [OpenTelemetry observability](docs/observability-otel.md)
* [External consumer example](examples/external-consumer/index.mjs)
* [Agent loop example](examples/agent-loop/index.mjs)
* [Agent crew example](examples/agent-crew/index.mjs)

## License

MIT. See [LICENSE](LICENSE).

## Design Principles

* Capability first API.
* Deterministic and inspectable routing.
* Explicit artifacts and outputs.
* Standard Schema at public boundaries.
* Provider adapters behind Lattice contracts.
* MCP shaped tools and context instead of a proprietary plugin protocol.
* Optional agent behavior through explicit surfaces.
* Verifiable receipts and replay friendly execution records.
