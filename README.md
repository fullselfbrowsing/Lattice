<div align="center">

<img src="assets/logo-mark-spin.gif" alt="Lattice" width="220" />

# Lattice

**Capability-first runtime SDK for multimodal AI applications**

Describe the job. Attach any mix of artifacts. Declare the outputs you want. Set policy constraints. Lattice owns the route, the packaging, the validation, the signed audit trail, and the inspectable plan.

![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-%3E%3D24-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![ESM](https://img.shields.io/badge/ESM-native-000000?style=for-the-badge)
![Standard Schema](https://img.shields.io/badge/Standard_Schema-compatible-8B5CF6?style=for-the-badge)
![Version](https://img.shields.io/badge/version-v1.2.0-22C55E?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-F5C518?style=for-the-badge)

![Stars](https://img.shields.io/github/stars/fullselfbrowsing/Lattice?style=flat-square&logo=github&label=Stars)
![Forks](https://img.shields.io/github/forks/fullselfbrowsing/Lattice?style=flat-square&logo=github&label=Forks)
![Issues](https://img.shields.io/github/issues/fullselfbrowsing/Lattice?style=flat-square&logo=github&label=Issues)
![Last Commit](https://img.shields.io/github/last-commit/fullselfbrowsing/Lattice?style=flat-square&logo=github&label=Last%20Commit)

[Overview](#overview) · [Quick Start](#quick-start) · [What's New in v1.2](#whats-new-in-v12) · [Receipts](#capability-receipts) · [Agents](#agent-capability) · [Providers](#provider-adapters) · [CLI](#cli) · [Architecture](#architecture) · [Roadmap](#roadmap)

</div>

---

## Overview

Lattice is a TypeScript-first capability runtime SDK for AI applications. It is built for developers who want to process mixed text, images, audio, video, files, JSON, and tool results without wiring together separate chat, transcription, speech, file, memory, provider, routing, receipt, agent, and replay abstractions by hand.

The beginner path is intentionally small.

```ts
await ai.run({
  task: "Resolve this support case",
  artifacts: [artifact.text("Customer was charged twice.")],
  outputs: {
    answer: "text",
    action: z.object({
      kind: z.enum(["refund", "replace", "escalate", "clarify"]),
      reason: z.string(),
    }),
  },
  policy: { maxCostUsd: 2, privacy: "sensitive" },
});
```

The v1.2 surface adds two things on top of the same call. A **capability contract** with pre-flight checks, tripwires, signed receipts, replay envelopes, and a CLI for verify and eval. A **runtime-agnostic agent loop** with a tool-use protocol that works across seven provider adapters, per-iteration signed receipts, and host seams for scheduler, transport, and storage.

<div align="center">

<img src="assets/social-card.png" alt="Lattice v1.2.0" width="720" />

</div>

> **Status:** v1.2.0 shipped on 2026-05-31. Track A (FSB Integration, Phases 14 to 18) backfilled five FSB-integration extensions onto canonical Lattice. Track B (Agent Capability, Phases 19 to 22) opened the previously out-of-scope Delegation surface as a runtime-agnostic single-agent capability. The Phase 23 milestone audit closed with 46 of 46 REQ-IDs WIRED end-to-end and 733 of 733 workspace tests passing. See [`.planning/milestones/v1.2-MILESTONE-AUDIT.md`](.planning/milestones/v1.2-MILESTONE-AUDIT.md) and [`.planning/v1.2-MILESTONE-INTEGRATION.md`](.planning/v1.2-MILESTONE-INTEGRATION.md) for the full audit trail.

---

## The Problem

Modern AI features are rarely just "send a prompt to a model." A real product flow might need a user message, a screenshot or product photo, a PDF policy document, a call recording or transcript, structured JSON output, citations back to source artifacts, budget and privacy and latency and provider constraints, a tamper-evident audit trail of what the model actually did, and a plan that explains what happened when something fails.

Without a runtime layer, every app rebuilds the same machinery. File normalization. Model selection. Prompt packing. Provider-specific message shapes. Schema validation. Retries. Fallbacks. Logging. Replay. Audit. Survival across service-worker eviction or worker freeze. Multi-iteration agent loops with cost ceilings.

## The Lattice Approach

Lattice treats the job as a capability request instead of a provider call.

| You provide | Lattice owns |
|---|---|
| Task intent | Runtime plan and execution boundary |
| Artifacts | Artifact references, metadata, lineage, transport choices |
| Desired outputs | Text, Standard Schema/Zod JSON, citations, generated artifact refs |
| Policy | Budget, latency, privacy, provider allow/deny, upload/logging constraints |
| Capability contract (optional) | Pre-flight budget check, tripwire invariants, signed receipts |
| Tool registry (optional) | Multi-iteration agent loop with native tool-use protocol |
| Host adapter (optional) | Scheduler, transport, storage seams for runtime-agnostic execution |

The result is a typed `RunResult` (or `AgentResult` for the agent loop) with either validated outputs or a structured failure. The execution plan grows into the audit trail. The receipt is the signed, JCS-canonical, DSSE-enveloped record of what actually happened.

---

## What's New in v1.2

v1.2 ships two complete tracks on top of the v1.1 Capability Receipts foundation.

### Track A: FSB Integration (Phases 14 to 18)

Five extensions landed as canonical Lattice surface.

| Phase | Surface | What it adds |
|---|---|---|
| 14 | Public surface index + packaging | `createReceipt` reachable via the bare `lattice` specifier. `pnpm-workspace` `catalog:` specifiers resolved to concrete versions so npm 11 can install via `file:`. |
| 15 | Receipt v1.1 schema + tripwire band pipeline + lifecycle events | `CapabilityReceiptBody.version` widens to `v1` or `v1.1` literal union with six optional step-marker fields. `createHookPipeline` ships SAFETY, OBSERVABILITY, EXTENSION bands with per-handler budget, frozen contexts, irreversible freeze. `HookLifecycleEvent` vocabulary. |
| 16 | Step-transition tracing + checkpoint hook | `step.transition` joins `RunEventKind`. `createCheckpointHook` emits exactly one event and (when a signer is configured) mints exactly one v1.1 receipt per invocation, threading step-markers as a linked list. |
| 17 | Provider adapters + INV-03 parity | Five new adapters: Anthropic Messages API, Gemini `generateContent`, xAI, OpenRouter, LM Studio. INV-03 parity smoke iterates all seven logical providers under a fake fetch and asserts the same `ProviderAdapter` contract. |
| 18 | Survivability adapter | `SurvivabilityAdapter<TState>` defines what "execution context can be evicted mid-flow" means for any runtime. `SerializedSnapshot` JSON round-trips byte-equal and survives DSSE + JCS round-trip when the payload embeds a v1.1 `ReceiptEnvelope` minted with real Ed25519. `createNoopSurvivabilityAdapter()` ships as the reference impl. |

### Track B: Agent Capability (Phases 19 to 22)

The previously out-of-scope Delegation surface opens as a runtime-agnostic single-agent capability. Multi-agent crews remain Out of Scope.

| Phase | Surface | What it adds |
|---|---|---|
| 19 | Delegation policy flip + agent runtime entrypoint | `AGENTS.md` flips from "multi-agent: Out of Scope" to "agent execution: First-class, runtime-agnostic." `ai.runAgent(intent)` ships on the `createAI` runtime. `formatToolsForProvider` drives a uniform prompt-reencoded tool-use protocol across all seven provider adapters. SAFETY-band hooks can veto an iteration before provider invoke. |
| 20 | Pluggable `AgentHost` + recovery markers | `AgentHost` interface with three optional seams: scheduler, transport, storage. `createNoopAgentHost()` is the Node-test reference impl. Storage composes with `SurvivabilityAdapter` so the loop re-enters at the recorded step on resume. `RunEventKind` gains `recovery.start`, `recovery.complete`, `recovery.failed` markers, closing the one Important row left open by the v1.1 audit. |
| 21 | Agent infrastructure primitives | Five small standalone modules. `createCostTracker` (budget-aware). `createTranscriptStore` (filtered tail reads). `createGoalProgressTracker` (stuck detection). `createActionHistory` (consecutive-identical + ping-pong dedup with `STUCK_REASONS` vocabulary). `createPermissionContext` (per-tool, per-iteration, per-resource gating with a SAFETY-band hook helper). |
| 22 | Showcase + eval helper | `examples/agent-loop` exercises every surface end-to-end against a fake provider and a fake tool registry. Real Ed25519 signing. Three per-iteration receipts verified. `evalAgentRun(baseline, current, options?)` ships as a pure regression-gate kernel for iterations-to-goal and cost. |

### Test posture

| Workspace | Tests |
|---|---:|
| `packages/lattice` | 589 / 589 |
| `packages/lattice-cli` | 144 / 144 |
| **Workspace total** | **733 / 733** |

Strict `tsc --noEmit` clean across both workspaces.

### Documented v1.2 limitation

Native tool-use (Anthropic Messages-API `tools[]`, OpenAI Chat-Completions `tools[]`, Gemini `function_declarations`) is deferred to v1.3. Uniform prompt-reencoded mode satisfies the Phase 19 AGENT-02 contract across all seven providers (proved by 84 `describe.each(ALL_PROVIDERS)` cases). Admitting native tool-use cleanly requires an additive extension to the `ProviderAdapter` interface that preserves the Phase 17 INV-03 7-provider parity contract.

---

## Quick Start

### Requirements

* Node.js 24 or newer
* pnpm 10 or newer
* TypeScript 6

### Use from this repository

```bash
git clone https://github.com/fullselfbrowsing/Lattice.git
cd Lattice
pnpm install
pnpm build
pnpm test
```

### Install via tag pin

Distribution for v1.2.0 is tag plus GitHub release. Mainline npm publish of `@fullselfbrowsing/lattice@1.2.0` is deferred until at least one external consumer requests it. Consume via a git submodule pinned at `v1.2.0`, or via a `file:` dependency under npm 11 (PKG-01 makes this work).

```bash
# submodule
git submodule add https://github.com/fullselfbrowsing/Lattice.git vendor/lattice
git -C vendor/lattice checkout v1.2.0
pnpm add file:./vendor/lattice/packages/lattice
```

### Hello world (synchronous run)

```ts
import { z } from "zod";
import { artifact, createAI, output, type ProviderAdapter } from "lattice";

const fixtureProvider = {
  id: "fixture",
  kind: "provider-adapter",
  execute: async (request) => ({
    rawOutputs: {
      answer: "Refund approved.",
      action: { kind: "refund", reason: "duplicate charge" },
      evidence: [{ artifactId: "artifact:text:case-note", label: "case note" }],
      generated: [],
    },
  }),
} satisfies ProviderAdapter;

const ai = createAI({
  providers: [fixtureProvider],
  defaults: { policy: { maxCostUsd: 5, latency: "interactive" } },
});

const result = await ai.run({
  task: "Resolve this support case",
  artifacts: [artifact.text("Customer was charged twice.", { id: "artifact:text:case-note", label: "case note" })],
  outputs: {
    answer: "text",
    action: z.object({ kind: z.literal("refund"), reason: z.string() }),
    evidence: output.citations(),
    generated: output.artifacts({ artifactKind: "file" }),
  },
  policy: { maxCostUsd: 2, privacy: "sensitive", noLogging: true },
});

if (result.ok) {
  console.log(result.outputs.answer);
  console.log(result.outputs.action.reason);
} else {
  console.error(result.error);
  console.error(result.plan);
}
```

### Hello agent (multi-iteration tool-use loop)

```ts
import { createAI, createInMemorySigner, defineTool, generateEd25519KeyPairJwk } from "lattice";
import { z } from "zod";

const { jwk, kid } = await generateEd25519KeyPairJwk();
const signer = await createInMemorySigner({ jwk, kid });

const ai = createAI({ providers: [fixtureProvider], signer });

const result = await ai.runAgent({
  goal: "Find the total revenue from last quarter and send a summary email.",
  tools: [
    defineTool({ name: "query_sales", input: z.object({ quarter: z.string() }), output: z.object({ totalUsd: z.number() }), run: async () => ({ totalUsd: 384210 }) }),
    defineTool({ name: "send_email", input: z.object({ to: z.string(), body: z.string() }), output: z.object({ ok: z.boolean() }), run: async () => ({ ok: true }) }),
  ],
  outputs: { summary: "text" },
  contract: { budget: { maxIterations: 6, maxCostUsd: 0.50 } },
});

if (result.ok) {
  console.log(result.outputs.summary);
  console.log(`iterations=${result.iterations.length} receipts=${result.receipts.length}`);
}
```

Each iteration emits a `step.transition` event through the hook pipeline. When a signer is configured, the auto-registered checkpoint hook on `BAND.OBSERVABILITY` mints exactly one v1.1 capability receipt per iteration. The receipt body carries `stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, and `timestamp` so receipts thread as a linked list across the agent run.

---

## Capability Receipts

A capability receipt is a JCS-canonicalized, DSSE-enveloped record of one execution boundary. Receipts cover the success path and every failure path, so a tripwire violation or a contract rejection produces a verifiable receipt the same way a success does.

```ts
import { contract, inv, createInMemorySigner, generateEd25519KeyPairJwk, verifyReceipt, createMemoryKeySet } from "lattice";

const myContract = contract({
  task: "support-refund",
  budget: { maxCostUsd: 0.10 },
  invariants: [
    inv.noPII("answer"),
    inv.mustCite("answer", { fromArtifacts: ["case-note"] }),
    inv.qualityFloor("answer", { minScore: 0.8, suite: "examples/work-inbox/.lattice/quality-suite" }),
  ],
});

const { jwk, kid } = await generateEd25519KeyPairJwk();
const ai = createAI({
  providers: [fixtureProvider],
  signer: await createInMemorySigner({ jwk, kid }),
});

const result = await ai.run({ task: "...", contract: myContract, /* ... */ });

// Later, in another process:
const keySet = createMemoryKeySet([{ kid, jwk, state: "active" }]);
const verdict = await verifyReceipt(result.receipt!, keySet);
verdict.ok; // true
```

The receipt body commits to:

* The contract hash (sha256 of canonical contract).
* The route the runtime took, including pricing and pre-flight estimate.
* The normalized usage (prompt tokens, completion tokens, cost USD as I-JSON string).
* The model both requested and observed.
* The output hash on success, or a typed failure on tripwire violation or no-contract-match.
* When step-markers are populated, the receipt auto-bumps to `lattice-receipt/v1.1` with the six step-marker fields threading the linked list.

---

## Agent Capability

`ai.runAgent(intent)` drives a tool-use loop with native composition surfaces.

### Composition surfaces

* `pipeline?` is the Phase 15 `HookPipeline`. The runtime creates one if absent.
* `signer?` is the Phase 9 `ReceiptSigner`. When present, the runtime auto-registers `createCheckpointHook` on `BAND.OBSERVABILITY` for per-iteration receipts.
* `tracer?` is the Phase 5 `TracerLike`. Flows through the pipeline.
* `outputs?` is a final-answer schema map. Validated only on the final assistant message.
* `contract?` is the Phase 7 `CapabilityContract`. Budget invariants enforced pre-iteration.
* `host?` is the Phase 20 `AgentHost`. Scheduler, transport, storage seams plug in additively.
* `survivabilityAdapter?` is the Phase 18 `SurvivabilityAdapter<TState>`. Composes with `host.storage` for cross-process resume.

### Agent infrastructure primitives

Five small, pure, composable modules. Wire them into the loop through hook handlers.

| Primitive | What it does |
|---|---|
| `createCostTracker` | Accumulates per-iteration `Usage`. Reports `ok`, `warning`, `exceeded` against `contract.budget`. |
| `createTranscriptStore` | Records the message log. Tail reads preserve the first user turn under token-budget pressure. |
| `createGoalProgressTracker` | Caller declares a goal. Tracker reports `progressing`, `stalled`, `regressed`. |
| `createActionHistory` | Detects consecutive-identical and ping-pong tool-call patterns. Exposes the `STUCK_REASONS` vocabulary. |
| `createPermissionContext` | Gates tool execution per tool, per iteration, per resource pattern. SAFETY-band hook helper integrates with `controls.deny(reason)`. |

### Cross-process resume (survivability)

```ts
import { createNoopAgentHost, createNoopSurvivabilityAdapter, runAgent } from "lattice";

const survivabilityAdapter = createNoopSurvivabilityAdapter<AgentSnapshot>();
const host = createNoopAgentHost({ storage: chromeStorageSessionAdapter });

const result = await ai.runAgent({
  goal: "...",
  tools,
  host,
  survivabilityAdapter,
});
```

On run start, `runAgent` calls `host.storage?.load()`. If a snapshot exists, the adapter deserializes it, the loop re-enters at the recorded iteration index, cumulative usage carries across the process boundary, and the tracer emits `recovery.start` followed by `recovery.complete` (or `recovery.failed` if the snapshot is corrupt, in which case storage is cleared and the loop starts fresh).

### Eval gate

```ts
import { evalAgentRun } from "lattice";

const eval_ = evalAgentRun(baseline, current, {
  iterationToleranceFactor: 1.5,
  maxCostRatio: 1.10,
});

if (!eval_.ok) {
  console.error(eval_.regressions);
  process.exit(1);
}
```

---

## Provider Adapters

| Provider | Factory | Notes |
|---|---|---|
| OpenAI | `createOpenAIProvider` | v1.0 baseline |
| OpenAI-compatible gateways | `createOpenAICompatibleProvider` | v1.0 baseline |
| AI SDK | `createAISdkProvider` | v1.0 baseline |
| Anthropic | `createAnthropicProvider` | v1.2 Phase 17. `/v1/messages` with top-level `system` field, `x-api-key` and `anthropic-version: 2023-06-01` headers. |
| Gemini | `createGeminiProvider` | v1.2 Phase 17. `/v1beta/models/{model}:generateContent`, four `HARM_CATEGORY` safety settings at `BLOCK_NONE`, `user` / `model` role mapping. |
| xAI | `createXaiProvider` | v1.2 Phase 17. Thin wrapper around `createOpenAICompatibleProvider` pinned to `api.x.ai/v1`. Preserves the `reasoning_tokens` quirk. |
| OpenRouter | `createOpenRouterProvider` | v1.2 Phase 17. Thin wrapper pinned to `openrouter.ai/api/v1`. |
| LM Studio | `createLmStudioProvider` | v1.2 Phase 17. Thin wrapper pinned to `localhost:1234/v1`. `apiKey` optional. |

The INV-03 parity smoke (`providers/parity.test.ts`) iterates all seven logical providers under a fake fetch and asserts the same `ProviderAdapter` contract: shape, `rawOutputs` population, normalized `Usage`, provider-name in error on non-OK, `AbortSignal` propagation, `rawResponse` preservation, distinct request ids.

---

## CLI

`packages/lattice-cli` ships three subcommands.

```bash
# Verify the Ed25519 signature on every receipt in a directory.
lattice verify --receipts ./.lattice/receipts --key ./keyset.json

# Replay a receipt against a sidecar to confirm the output hash matches.
lattice repro <receipt-id> \
  --sidecar-dir ./.lattice/sidecars \
  --fixtures ./.lattice/fixtures \
  --key ./keyset.json

# Run an eval suite with baseline-relative regression gating.
lattice eval \
  --fixtures ./.lattice/fixtures \
  --sidecar-dir ./.lattice/sidecars \
  --baseline ./.lattice/baseline.json \
  --key ./keyset.json
```

`lattice eval --agent` for the agent-loop kernel is deferred to v1.3. The `evalAgentRun` regression gate ships in the package surface so callers can wire it into their own CI.

---

## Showcases

### `examples/work-inbox` (v1.1)

Four scenarios. Success, tripwire-violated, no-contract-match, quality-floor. Each writes a signed Ed25519 receipt and a sidecar to `./.lattice/`. Replayable via `lattice repro`. Evaluable via `lattice eval`.

```bash
pnpm example:work-inbox
```

### `examples/agent-loop` (v1.2)

The Phase 22 showcase. A fake provider, two fake tools (`query_sales`, `send_email`), a hook pipeline with PermissionContext at SAFETY and the auto-registered checkpoint hook at OBSERVABILITY, all five infrastructure primitives wired through hooks, real Ed25519 signing, and `evalAgentRun` as the final gate.

```bash
node examples/agent-loop/index.mjs
# iterations=3 receipts=3 verified=true
# cost.total=0.0006 goalProgress=progressing eval.ok=true
```

---

## Architecture

<div align="center">

<img src="assets/logo-mark.png" alt="" width="120" />

</div>

```mermaid
graph TB
    subgraph App["Application Code"]
        DEV["Developer intent"]
        RUN["ai.run(...) / ai.runAgent(...)"]
        OUT["Typed outputs / AgentResult"]
    end

    subgraph PublicAPI["Lattice Public API"]
        CREATE["createAI(config)"]
        ART["artifact helpers"]
        CONTRACTS["output contracts"]
        POLICY["policy constraints"]
        CONTRACT["capability contract"]
        TOOLS["tool registry"]
    end

    subgraph Runtime["Runtime Spine"]
        PLAN["execution plan"]
        ROUTER["deterministic router + preflight"]
        PACK["context and artifact packing"]
        VALIDATE["output validation"]
        TRIPWIRE["tripwire stage"]
        AGENT["runAgent loop"]
        EVENTS["RunEvent + tracer"]
    end

    subgraph Hooks["Hook Pipeline (v1.2 Phase 15)"]
        SAFETY["BAND.SAFETY"]
        OBS["BAND.OBSERVABILITY"]
        EXT["BAND.EXTENSION"]
    end

    subgraph Receipts["Receipts (v1.1 + v1.2)"]
        MINT["createReceipt"]
        DSSE["DSSE + JCS + Ed25519"]
        VERIFY["verifyReceipt"]
        CHECKPOINT["createCheckpointHook"]
    end

    subgraph Host["Agent Host (v1.2 Phase 20)"]
        SCHED["scheduler"]
        TRANS["transport"]
        STORAGE["storage"]
    end

    subgraph Survive["Survivability (v1.2 Phase 18)"]
        SURV["SurvivabilityAdapter"]
        SNAP["SerializedSnapshot"]
    end

    subgraph Providers["Provider Adapters (7)"]
        OAI["OpenAI"]
        OAIC["OpenAI-compat"]
        AISDK["AI SDK"]
        ANTH["Anthropic"]
        GEM["Gemini"]
        XAI["xAI"]
        OR["OpenRouter"]
        LMS["LM Studio"]
    end

    subgraph Replay["Replay + CLI"]
        JOURNAL["replay envelope + sidecar"]
        CLI["lattice verify / repro / eval"]
    end

    DEV --> RUN
    RUN --> CREATE
    RUN --> ART
    RUN --> CONTRACTS
    RUN --> POLICY
    RUN --> CONTRACT
    RUN --> TOOLS
    CREATE --> PLAN
    CONTRACT --> ROUTER
    ROUTER --> Providers
    Providers --> VALIDATE
    VALIDATE --> TRIPWIRE
    TRIPWIRE --> MINT
    MINT --> DSSE
    DSSE --> VERIFY
    VERIFY --> CLI
    AGENT --> Hooks
    Hooks --> CHECKPOINT
    CHECKPOINT --> MINT
    AGENT --> Host
    STORAGE --> SURV
    SURV --> SNAP
    SNAP --> JOURNAL
    EVENTS --> JOURNAL
    OUT --> JOURNAL
```

### Package shape

```text
Lattice/
|-- packages/
|   |-- lattice/                # core package
|   |   `-- src/
|   |       |-- agent/          # runAgent, AgentHost, format-tools, infra primitives, evalAgentRun
|   |       |-- artifacts/      # artifact references and helpers
|   |       |-- contract/       # contract, invariants, bands, checkpoint, preflight, tripwire
|   |       |-- outputs/        # output contracts, inference, validation
|   |       |-- plan/           # execution plan
|   |       |-- policy/         # policy contracts and merging
|   |       |-- providers/      # 7 provider adapters + parity smoke
|   |       |-- receipts/       # JCS, DSSE, Ed25519, KeySet, createReceipt, verifyReceipt
|   |       |-- replay/         # replay envelope, materialize, replayOffline, rerunLive
|   |       |-- results/        # typed run / agent success and failure unions
|   |       |-- runtime/        # createAI facade, survivability adapter
|   |       |-- sessions/       # session refs
|   |       |-- storage/        # artifact store
|   |       |-- tools/          # defineTool, runTool, importMcpTools
|   |       `-- tracing/        # RunEventKind, TracerLike
|   `-- lattice-cli/            # verify, repro, eval subcommands
|-- examples/
|   |-- work-inbox/             # v1.1 showcase (four scenarios)
|   `-- agent-loop/             # v1.2 showcase (fake provider + signed iteration receipts)
|-- assets/                     # brand assets (mark, wordmark, app icon, favicons, social card, spin gif)
|-- tools/
|   `-- gen-assets.mjs          # regenerate brand assets from the design-canvas renderer
|-- .planning/                  # GSD project plans, state, milestone audits
|-- package.json
|-- pnpm-workspace.yaml
`-- tsconfig.base.json
```

---

## Roadmap

| Milestone | Goal | Status |
|---|---|---|
| v1.0 | Runtime API, output contracts, artifacts, deterministic routing, sessions, provider packaging, tools, replay, work-inbox showcase | Shipped (2026-04-22) |
| v1.1 Capability Receipts | Capability contract, tripwires, JCS canonicalization, Ed25519 signing, receipt verification, replay envelope, `lattice` CLI, eval CI gate, sidecar support | Shipped (2026-05-12) |
| **v1.2 FSB Integration + Agent Capability** | **Receipt v1.1 schema extension, hook bands, checkpoint hook, 5 new providers + INV-03 parity, survivability adapter, agent runtime, agent host, agent infrastructure primitives, agent-loop showcase, eval helper** | **Shipped (2026-05-31)** |
| v1.3 (planned) | Native tool-use across providers, `lattice eval --agent` CLI, multi-scenario agent-loop showcase, KMS adapters for `ReceiptSigner`, lineage merkle root in receipts, `lattice receipt diff` subcommand, OpenTelemetry exporter | Planned |

Multi-agent crews (parent-child loops, summary-return, cache-prefix sharing, rate-limit-group coordination) remain Out of Scope.

---

## Development

```bash
# Install workspace dependencies
pnpm install

# Build all packages
pnpm build

# Typecheck all packages
pnpm typecheck

# Run unit tests (733 across the workspace)
pnpm test

# Run declaration / type API tests
pnpm test:types

# Verify package publishing shape
pnpm lint:packages

# Regenerate brand assets after a design change
node tools/gen-assets.mjs
```

### Quality gates

* TypeScript strict mode
* `exactOptionalPropertyTypes`
* `noUncheckedIndexedAccess`
* Vitest runtime tests
* Vitest typecheck tests
* `tsd` declaration tests
* `publint`
* `@arethetypeswrong/cli`
* INV-03 7-provider parity smoke

---

## Brand assets

Direction C ("Shell") from the [Claude.ai Design](https://claude.ai/design) bundle. Isometric wireframe lattice cube, hollow faces, glowing depth-scaled nodes, ink `#0b1220` on white. Wordmark in Outfit Medium with `-0.03em` tracking.

| Asset | File |
|---|---|
| Animated mark (in-plane rotation, light) | [`assets/logo-mark-spin.gif`](assets/logo-mark-spin.gif) |
| Animated mark (in-plane rotation, dark) | [`assets/logo-mark-spin-dark.gif`](assets/logo-mark-spin-dark.gif) |
| Animated mark, SMIL SVG (browsers, GitHub raw) | [`assets/logo-mark-spin.svg`](assets/logo-mark-spin.svg) |
| Static mark, light | [`assets/logo-mark.svg`](assets/logo-mark.svg) · [`assets/logo-mark.png`](assets/logo-mark.png) |
| Static mark, dark | [`assets/logo-mark-dark.svg`](assets/logo-mark-dark.svg) · [`assets/logo-mark-dark.png`](assets/logo-mark-dark.png) |
| Wordmark, light | [`assets/logo-wordmark.svg`](assets/logo-wordmark.svg) · [`assets/logo-wordmark.png`](assets/logo-wordmark.png) |
| Wordmark, dark | [`assets/logo-wordmark-dark.svg`](assets/logo-wordmark-dark.svg) · [`assets/logo-wordmark-dark.png`](assets/logo-wordmark-dark.png) |
| App icon | [`assets/app-icon.svg`](assets/app-icon.svg) · [`assets/app-icon-1024.png`](assets/app-icon-1024.png) · [`assets/app-icon-512.png`](assets/app-icon-512.png) · [`assets/app-icon-256.png`](assets/app-icon-256.png) |
| Favicons | [`assets/favicon-48.svg`](assets/favicon-48.svg) · [`assets/favicon-32.svg`](assets/favicon-32.svg) · [`assets/favicon-16.svg`](assets/favicon-16.svg) |
| Social card (1200 × 630) | [`assets/social-card.svg`](assets/social-card.svg) · [`assets/social-card.png`](assets/social-card.png) |

To regenerate the assets after a design change, edit `tools/gen-assets.mjs` and run `node tools/gen-assets.mjs`. The script ports the parametric isometric 3D renderer from the original design bundle's `lattice-core.js` so every asset stays driven by the same real 3D math (rotate, project, depth-sort, fixed-fit projection for constant silhouette under in-plane spin).

---

## Design Principles

* **Capability first.** Users describe the job and the outputs they want, not the provider-specific API call.
* **Small public surface.** The beginner path stays one `run` call with artifacts, outputs, and policy.
* **Provider-neutral core.** Provider SDK types stay behind adapters. The seven shipped adapters all conform to one `ProviderAdapter` contract.
* **Deterministic routing.** Early routing is explainable and reproducible, not opaque model magic.
* **Artifacts everywhere.** Inputs, outputs, tool results, transcripts, generated files, and provider handles all become traceable artifacts.
* **Inspectable execution.** Every run explains model choice, context packing, artifact transforms, cost, latency, fallbacks, and validation.
* **Signed audit trail.** Every execution boundary that ships a contract emits a JCS-canonicalized, DSSE-enveloped, Ed25519-signed receipt. Success and failure both produce verifiable receipts.
* **Runtime-agnostic.** The agent loop, the host adapter, and the survivability adapter compose without coupling to `chrome.*`, `importScripts`, or service-worker idioms.

---

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Run `pnpm install`.
4. Make focused changes that preserve the small public API.
5. Run `pnpm typecheck`, `pnpm test`, and `pnpm test:types`.
6. Open a pull request with the behavior change, test coverage, and any public API implications.

Architecture notes for contributors. Keep `packages/lattice/src/index.ts` intentionally small. Keep provider SDK details out of public exports. Treat `.planning/` as the source of roadmap, phase context, and milestone audits.

---

## License

[MIT](LICENSE)

---

<div align="center">

<img src="assets/logo-wordmark.png" alt="Lattice" width="240" />

Built by [Lakshman Turlapati](https://github.com/LakshmanTurlapati). Maintained at [`fullselfbrowsing/Lattice`](https://github.com/fullselfbrowsing/Lattice).

If Lattice helps you build cleaner multimodal AI features, consider giving it a star.

[Back to top](#lattice)

</div>
