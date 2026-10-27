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

[Install](#install) · [Quick Start](#quick-start) · [Runtime](#runtime) · [Contracts](#contracts) · [Modular Entrypoints](#modular-entrypoints) · [Providers](#providers) · [Audit](#audit) · [Agents](#agents) · [CLI](#cli) · [Development](#development)

</div>

## Status

Lattice is published under the `@full-self-browsing` npm scope.

* `@full-self-browsing/lattice`: `1.6.0`
* `@full-self-browsing/lattice-cli`: `1.6.0`
* Runtime target: Node.js `>=24`
* Package format: ESM
* License: MIT
* Registry publishing: npm OIDC Trusted Publisher with provenance attestations

The full runtime targets Node 24 and newer. Several modular facades are validated as Node 20 compatible for applications that want to adopt Lattice one slice at a time.

### Known gaps

* `ai.runAgent` returns no receipt. `AgentSuccess.receipt`, `AgentFailure.receipt`, and `IterationRecord.receipt` are never set, and the loop does not use the signer passed to `createAI`. With a `signer` on the agent intent, each iteration's checkpoint receipt is emitted only as a `step.transition` tracer event (`metadata.envelope`), so a caller without a tracer keeps none. `ai.run` and `runAgentCrew` return their receipts.
* The OpenAI-shaped adapters (`openai`, `openai-compatible`, `xai`, `openrouter`, `lm-studio`, and `litellm`) send every artifact as a text part holding JSON metadata and never send an image part. The artifact's value is included only when it is a string, so a data URL is inlined as text, while a `Blob` or `File` image and the object value of an `artifact.json` or `artifact.toolResult` are dropped. The model never sees a dropped value, yet the receipt still hashes it. Pass JSON as a string (for example `artifact.text(JSON.stringify(value))`) on these adapters. The Anthropic and Gemini adapters send native image parts.
* The OpenAI-shaped adapters send no `temperature` or `max_tokens`, so the provider defaults apply. The Anthropic adapter sends a fixed `max_tokens`, and the Gemini adapter sends a fixed temperature and output token cap.
* `createOpenAIProvider` without a `baseUrl` posts to `https://api.openai.com/chat/completions`, which lacks `/v1`. For OpenAI, use `createOpenAICompatibleProvider` with `baseUrl: "https://api.openai.com/v1"`.

## Why Lattice

Modern AI product work rarely stops at one prompt. A real flow may include a user message, a screenshot, a PDF, a transcript, structured JSON, citations, privacy limits, budget limits, provider choice, retries, replay, and an audit record.

Without a capability runtime, every application rebuilds the same machinery around artifact normalization, context packing, model selection, provider request shapes, schema validation, fallback, logging, and replay.

Lattice puts that machinery behind one TypeScript first runtime while keeping the public API small.

## What Lattice Handles

* Artifacts: text, JSON, files, URLs, images, audio, video, documents, and tool results. The OpenAI-shaped adapters send only string artifact values and drop binary bytes and JSON objects; see [Known gaps](#known-gaps).
* Outputs: plain text, Standard Schema and Zod compatible structured data, citations, and generated artifact refs.
* Routing: deterministic provider and model selection from capability metadata, policy, cost, latency, privacy, and fallback rules.
* Context: artifact refs, summaries, token estimates, and context pack plans.
* Providers: OpenAI, OpenAI compatible gateways, Anthropic, Gemini, xAI, OpenRouter, LiteLLM, LM Studio, AI SDK style providers, and fake providers for tests.
* Audit: JCS canonical receipts, DSSE envelopes, Ed25519 signatures, CIDs, replay envelopes, redaction, and verification.
* Tools: tool definitions, tool execution, MCP shaped resources, MCP shaped prompts, tool results as artifacts, and returned tool call validation.
* Agents: opt in single agent loops and structured crew runs built on the same provider, tool, policy, and event primitives. With a signer, crew runs return receipts, and the single agent loop sends its checkpoint receipts to the tracer only.

## Install

```bash
pnpm add @full-self-browsing/lattice zod
```

```bash
npm install @full-self-browsing/lattice zod
```

Install the CLI only when you need receipt verification, replay, eval, or diagnostics from a terminal.

```bash
pnpm add -g @full-self-browsing/lattice-cli
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

Every run produces a plan with routing, context packing, validation, attempts, fallback, usage, and event data. When a signer is configured, terminal results also include a verifiable receipt. Pass `receipt: { audience, nonce, ttlMs }` on the intent to bind that receipt to a relying party, a single-use value, or a validity window. If the signer fails, the result carries `receiptError` instead of a receipt; set `receipts: { onSignerError: "throw" }` on the config to fail the run instead.

## Contracts

A contract adds a budget and output invariants to a run. Pass it as `contract` on the intent. When an invariant fails, `ai.run` returns a `tripwire-violated` failure, and a configured signer records that verdict in the receipt.

```ts
import { contract, inv } from "@full-self-browsing/lattice";

const checks = contract({
  budget: { maxCostUsd: 0.05 },
  invariants: [
    inv.noPII("answer"),
    inv.mustCite("refund-policy", { inline: true }),
  ],
});
```

### noPII

`inv.noPII(path)` runs four detectors on every string at `path`, including strings nested in objects and arrays. They are a narrow screen for common US formats, not a data-loss-prevention system.

* `email`: `local@domain.tld`.
* `us-ssn`: dashed `123-45-6789`. A spaced `123 45 6789` or an undashed 9-digit run matches only when an SSN cue (`ssn`, `ss#`, `social security`, `social sec`) is the nearest word before it.
* `us-phone`: separated forms such as `415-555-0134`, `415.555.0134`, and `(415) 555-0134`, with an optional `+1` or `1` trunk prefix. A plain 10-digit run matches only when it is a valid NANP number, does not follow a `.`, and comes after a trunk prefix (`+1` followed by a space, dot, or dash, or `1-`) or a phone cue (`phone`, `tel`, `call`, `mobile`, `cell`, `fax`) as the nearest word. Unseparated `+14155551234` is not detected.
* `credit-card`: 13 to 19 digits that pass Luhn, optionally separated by single spaces or dashes. Every digit run is checked, and a card joined to a neighbouring number ("Apt 18 4111 1111 1111 1111", a card followed by its CVV) is still found. Runs that start with 0 or 1 (epoch milliseconds, snowflake ids) are skipped, so UATP cards are not detected. 13-digit runs that start with 978 or 979 (ISBN-13) are skipped too. No issuer prefix list is applied.

Only punctuation and the words `no`, `number`, `num`, `nbr`, `nr`, `is`, `at`, `on`, `me`, and `us` may sit between a cue and a bare value. "call me at 4155551234" is flagged; "call Jane at 4155551234" is not.

`us-ssn`, `us-phone`, and `credit-card` skip a value when the nearest word before it is an identifier label: `order`, `orders`, `ord`, `invoice`, `inv`, `sku`, `ref`, `po`, `isbn`, `pn`, or `txn`, joined to the value only by whitespace, `:`, `#`, `=`, `no.`, `number`, or `is`. `email` never checks labels, so "Order: alice@example.com" is flagged. "Order No. 123-45-6789" is skipped. "Customer SSN 123-45-6789" and "Order 5521, 415-555-0134" are flagged, because `customer` is not a label and a number between label and value breaks the link. A phone with a `+1` or `1` trunk prefix is flagged even right after a label ("SKU +1 415 555 0134"). Cues and labels are read from the 48 characters before a value, cut at the last line break and the last sentence end.

Known trade-offs:

* A real value right after a label is missed ("ref 123-45-6789").
* About one random 13-19 digit number in ten passes Luhn, so a text that lists k long numeric ids (a CSV column, a JSON array, log lines) is flagged with probability near 1 - 0.9^k.
* Detectors read string values, not object keys, so `{ ssn: "123456789" }` is not flagged.
* Names, postal addresses, IP addresses, dates of birth, and non-US formats are not detected.

### mustCite

`inv.mustCite(name)` passes when a citations list has an entry naming the artifact: a string equal to `name`, or an object whose `source` equals it. It reads the top-level `citations` list first. When that list is missing or does not name the artifact, it also searches the top-level `evidence` list and any `citations` or `evidence` array nested in objects and arrays. By default it never reads prose. `path` points at one list and turns off the nested search, `keys` compares other object keys, and `caseInsensitive: true` ignores case.

Three options read the output's prose. All are off by default.

* `inline: true` also passes on a `[name]` or `(name)` marker, or on a group where one `;`- or `,`-separated part is the name, with an optional `p. 4` or `§3` locator: `[doc-a; doc-b]` and `(doc-a, p. 4)` cite `doc-a`. It applies only when no located list has entries, so a non-empty list that omits the artifact still fails. Code spans, fenced code, and link text are ignored.
* `rejectUncited: true` fails a list entry that names the artifact when the text carries citation markers and none of them cites it. Markers are numbers and ranges such as `[1]`, `[1, 2]`, and `[2-4]` (resolved by an entry's `label`, `marker`, or `id`, else by 1-based list position; a number past the end cites another source), author-year brackets such as `[Smith 1999]`, and a bracket equal to a list entry. Links, footnotes, `[x]`, `[sic]`, `[INFO]`, `arr[0]`, dates such as `[March 2024]`, timestamps, and code are ignored.
* `textPath` limits the `inline` and `rejectUncited` scan to the strings at one path, such as `answer` or `sections[*].text`. Without it every string in the output is scanned, so a bracketed number in a log line counts as a marker.

The check is syntactic. It confirms that a citation is present, not that the artifact supports the claim. Options are added to the contract only when set, so existing contract hashes do not change. `inv.mustCite("")` and a whitespace-only name throw `TypeError`.

## Modular Entrypoints

Lattice can be adopted one module at a time. The package manifest exposes machine readable compatibility metadata under `lattice.modules`.

| Import path | Compatibility | Use it for |
| --- | --- | --- |
| `@full-self-browsing/lattice/providers` | `adapter-specific` | Provider factories, provider contracts, streaming helpers, capability negotiation, and prompt scaffolds |
| `@full-self-browsing/lattice/audit` | `node20-compatible` | Receipts, signing, verification, CIDs, replay envelopes, redaction, and receipt attributes |
| `@full-self-browsing/lattice/context` | `node20-compatible` | Context packing, token estimates, and artifact reference extraction |
| `@full-self-browsing/lattice/artifacts` | `node20-compatible` | Artifact builders, refs, metadata, fingerprints, storage refs, and lineage |
| `@full-self-browsing/lattice/routing` | `node20-compatible` | Deterministic routing, catalogs, policies, capability profiles, and negotiation |
| `@full-self-browsing/lattice/tools` | `node20-compatible` | Tool definitions, execution, MCP shaped artifacts, and tool call validation |
| `@full-self-browsing/lattice/storage` | `adapter-specific` | Memory and local filesystem artifact stores plus storage contracts |
| `@full-self-browsing/lattice/eval` | `node20-compatible` | Regression gates for agent and executor traces |
| `@full-self-browsing/lattice/agents` | `node24-runtime` | Single agent loops, crew runs, hosts, rate limits, and agent infrastructure |
| `@full-self-browsing/lattice/core` | `node20-compatible` | Non agent artifacts, context, outputs, contracts, routing, providers, storage contracts, and results |

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

await verifyReceipt(
  audited.receipt,
  createMemoryKeySet([
    { kid: "local", publicKeyJwk, state: "active" },
  ]),
);
```

A receipt signs hashes of the input artifacts and the outputs, the contract hash and verdict, the model, the selected route, usage, and redacted tripwire evidence. It does not sign the task or prompt text, the policy, or the routing rationale. The hashes are unsalted SHA-256, so a low-entropy value such as an SSN can be confirmed from a receipt by trying candidates.

`verifyReceipt` takes an optional third argument for verifier policy: `minVersion` raises the accepted schema floor, `expectedAudience` and `expectedNonce` require the receipt's v1.4 binding fields to match, and `now` plus `maxAgeMs` bound the issue time. A receipt that carries `expiresAt` is rejected after that instant whether or not options are passed. Audience, nonce, `maxAgeMs`, and a raised `minVersion` are opt-in, so a receipt that omits them still verifies.

`receiptVerifyAdvisories(verified.body, options)` reports what was not checked as `{ code, severity, message }` objects. A `warn` (`audience-unchecked`, `nonce-unchecked`) means the receipt carries a binding that the verifier did not check. An `info` (`audience-absent`, `nonce-absent`, `expiry-absent`, `version-below-current`) names an optional check the receipt does not use. Gate on `code` and `severity`, not on the message.

Receipts that chain through `parentReceiptCid`, such as a crew root and its agent completion receipts, verify as one tree with `verifyChain`:

```ts
import { verifyChain } from "@full-self-browsing/lattice/audit";

const chain = await verifyChain(receipts, keySet, {
  expectedRunId: "run-1",
  expectedCount: receipts.length,
});
if (!chain.ok) throw new Error(`${chain.error.kind}: ${chain.error.message}`);
```

Dropped leaf receipts are detectable when `expectedCount` or an external anchor supplies an out-of-band commitment, or when the root receipt sets `chainClosure: "member-cids"` and one closing receipt lists every other member in `chainMemberCids`. Crew runs do this. A closed chain that is missing a member or its closer fails with `count-mismatch`. 1.6.x verifiers accept closed chains but ignore the closure fields, so they do not detect a dropped member.

* `requireClosure: true` fails a chain that declares no closure.
* `partial: true` verifies a disclosed subset of a closed chain. The closing receipt must be present and must list every presented receipt. Listed members that were not presented produce a `closure-partial` warning.

A chain with no commitment still verifies, and `chain.advisories` includes a `tail-truncation-unchecked` warning along with each receipt's advisories. `expectedRootCid` detects a replaced root, not a missing leaf.

`runAgentCrew` with a signer returns its receipts in mint order: a crew-start root, a completion receipt for each child run that succeeded, the root agent's completion receipt, and a crew-close receipt. When each of N agents runs once and every child run succeeds, that is N + 2 receipts. A child that never runs or whose run fails gets no completion receipt, so pass `receipts.length` as `expectedCount`. The crew-start receipt's output hash covers the agent id tree, not the intents, tools, or policy. `receipts.onSignerError` applies to every crew receipt after crew-start. Under `"flag"`, the default, the crew result is still returned and `CrewResult.receiptError` lists every failed mint in mint order. A chain missing a completion receipt still verifies, so check `receiptError` before treating `receipts` as the whole crew. Under `"throw"` the crew rejects with `ReceiptSigningError` at the failed mint. A failed crew-start mint always rejects with `ReceiptSigningError`.

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

Agent execution uses the same policy, provider, tool, event, and survivability primitives as normal runs. `ai.runAgent` returns no receipt: with a `signer` on the intent, each iteration's checkpoint receipt is emitted only as a `step.transition` tracer event, so pass a `tracer` to keep them. `runAgentCrew` returns its receipts, as described under [Audit](#audit). Non agent modular entrypoints are checked so they do not pull the agent surface into provider only, audit only, tools only, eval only, or core only adoption paths.

## CLI

The CLI package installs the `lattice` command.

```bash
lattice --help
lattice verify --help
lattice repro --help
lattice eval --help
lattice receipt --help
lattice receipt verify-chain --help
lattice diagnostics lm-studio --help
```

Use it for receipt verification, offline replay, eval gates, receipt inspection, chain verification, and local diagnostics. `lattice verify` accepts `--min-version`, `--audience`, `--nonce`, `--max-age-ms`, and `--quiet`. `lattice receipt verify-chain <dir>` verifies every receipt in a directory as one tree. It accepts the same flags plus `--expect-count`, `--run-id`, `--root-cid`, `--require-closure`, and `--partial`.

On success both commands print advisories to stderr: a `WARN <code>: <message>` line for every warning, and an `INFO <code>: <message>` line for every note unless `--quiet` is passed. `--quiet` never hides `WARN` lines. Advisories do not change the exit code.

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
pnpm check:node20-modules
pnpm example:external-consumer
```

`pnpm check:node20-modules` validates the built facades marked `node20-compatible`. The full runtime remains a Node 24 package by design.

## Documentation

* [Modular entrypoints](docs/modular-entrypoints.md)
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
