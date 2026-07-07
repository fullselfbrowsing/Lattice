[![npm version](https://img.shields.io/npm/v/@full-self-browsing/lattice.svg)](https://www.npmjs.com/package/@full-self-browsing/lattice)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

# @full-self-browsing/lattice

TypeScript-first capability runtime SDK for multimodal AI applications.

Lattice lets you describe a job, attach artifacts, declare outputs, and set policy constraints. The runtime handles provider routing, context packing, output validation, replay data, and signed receipt verification through one root package import.

## Install

```bash
pnpm add @full-self-browsing/lattice zod
```

```bash
npm install @full-self-browsing/lattice zod
```

Runtime target: Node.js 24 or newer. Package format: ESM.

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

## Receipts

The root package exports receipt signing and verification helpers.

```ts
import {
  createMemoryKeySet,
  verifyReceipt,
} from "@full-self-browsing/lattice";

const result = await verifyReceipt(
  envelope,
  createMemoryKeySet([
    { kid: "local", publicKeyJwk, state: "active" },
  ]),
);

console.log(result.ok);
```

## CLI

Install the CLI package separately when you need terminal workflows for verification, replay, eval, or diagnostics.

```bash
pnpm add -g @full-self-browsing/lattice-cli
lattice --help
```

## Repository

Source, examples, and protocol docs live at:

https://github.com/fullselfbrowsing/Lattice
