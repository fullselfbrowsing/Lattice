[![npm version](https://img.shields.io/npm/v/@full-self-browsing/lattice.svg)](https://www.npmjs.com/package/@full-self-browsing/lattice)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

# @full-self-browsing/lattice

TypeScript-first capability runtime SDK for multimodal AI applications.

Lattice lets you describe a job, attach artifacts, declare outputs, and set policy constraints. The runtime handles provider routing, context packing, output validation, replay data, and signed receipt verification through one root package import.

Current SDK version: `1.6.0`.

## Install

```bash
pnpm add @full-self-browsing/lattice@^1.6.0 zod
```

```bash
npm install @full-self-browsing/lattice@^1.6.0 zod
```

Runtime target: Node.js 24 or newer. The release is validated on Node 24 LTS and Node 26
Current. Package format: ESM.

## Quick Start

This example uses the fake provider so it runs without API keys.

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

## Providers

Provider adapters are configured explicitly on the runtime.

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
});

const result = await ai.run({
  task: "Summarize this incident report",
  artifacts: [],
  outputs: { answer: "text" },
});

void result;
```

## Authoritative Runtime State

The provider request, packaging record, input hashes, receipt inputs, attempt evidence, and
replay plan all consume one route-specific materialized context projection. A fallback
route is repacked against its own model limits; omitted, archived, summarized source, and
unselected session artifacts cannot fall through to the adapter.

When storage or sessions are configured, policy can set `tenantId`, `retention`, and
`missingArtifactRef`. Missing selected refs fail before provider work by default. The
explicit `"omit"` policy records the omission and a bounded warning. Built-in stores
preserve store-returned refs, tenant scope, privacy, and retention metadata.

## Receipts

The root package exports receipt signing and verification helpers.

```ts
import {
  createMemoryKeySet,
  verifyReceipt,
} from "@full-self-browsing/lattice";

const compatible = await verifyReceipt(
  envelope,
  createMemoryKeySet([
    { kid: "local", publicKeyJwk, state: "active" },
  ]),
);

const strict = await verifyReceipt(
  envelope,
  createMemoryKeySet([
    { kid: "local", publicKeyJwk, state: "active" },
  ]),
  { legacyPolicy: "reject" },
);

console.log(compatible.ok, strict.ok);
```

SDK 1.6.0 mints only standard DSSE `lattice-receipt/v1.4` bodies with signed
`signatureProfile: "dsse-v1"`. There is no `lattice-receipt/v1.6` body. Direct reads keep
the observable compatibility default for historical v1.1-v1.3 signatures; strict readers
set `legacyPolicy: "reject"`. A v1.4 signature failure never falls back, and no public
issuance API can mint the deprecated profile.

Set `receiptMode` to `off`, `best-effort`, or `required` on `createAI`. Required mode fails
with a bounded audit result if a signer is absent or signing fails, and never repeats the
provider call. Evaluation preserves invalid and unevaluable rows, while the shared cost
estimator distinguishes unknown pricing from known zero cost under `maxCostUsd`.

## Agents and Crews

`ai.runAgent()` and the `@full-self-browsing/lattice/agents` facade expose optional agent
execution. With automatic receipts enabled, iteration records and terminal results contain
the exact issued envelopes. Resumed runs retain stable execution identities and reuse
stored iteration receipts without reminting completed work.

`defineAgent()` and `runAgentCrew()` opt into serial child crews. `CrewResult.receipts`
reuses the same terminal envelopes in crew-root, child-completion, parent-completion order;
per-agent receipt CIDs refer to those envelopes.

## Modular Entrypoints

The package exports `providers`, `audit`, `context`, `artifacts`, `routing`, `tools`,
`storage`, `eval`, `agents`, and `core` subpaths. Every subpath shares the Node `>=24`
package boundary; manifest compatibility labels are `node24-plus` or `adapter-specific`.
See the [modular entrypoint guide](https://github.com/fullselfbrowsing/Lattice/blob/main/docs/modular-entrypoints.md).

## CLI

Install the CLI package separately when you need terminal workflows for verification, replay, eval, or diagnostics.

```bash
pnpm add -g @full-self-browsing/lattice-cli@^1.6.0
lattice --help
```

The 1.6 CLI supports compatibility verification and explicit `--standard-only` reads for
`verify` and `repro`; successful reads report `profile=` and `deprecated=`. Its eval command
retains every invalid or unevaluable fixture row and does not write partial baselines.

## Release Validation

Repository maintainers use `pnpm check:packed-consumer` as the distribution authority. It
packs the runtime and CLI, installs both tarballs into an isolated ESM consumer, rejects
workspace links, and exercises receipt plus CLI behavior. CI runs it on Node 24 LTS and
Node 26 Current.

The optional live provider canary is scheduled/manual only and emits sanitized `not-run`,
`passed`, or `failed` evidence for OpenAI-compatible, Anthropic, and Gemini wire families.
Configuration and incident handling are documented in the
[provider canary runbook](https://github.com/fullselfbrowsing/Lattice/blob/main/docs/provider-canaries.md).

For the full upgrade path, see
[Migrating to SDK v1.6](https://github.com/fullselfbrowsing/Lattice/blob/main/docs/MIGRATION-v1.6.md).

## Repository

Source, examples, and protocol docs live at:

https://github.com/fullselfbrowsing/Lattice
