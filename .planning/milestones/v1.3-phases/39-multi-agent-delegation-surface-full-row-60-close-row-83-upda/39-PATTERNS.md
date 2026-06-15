# Phase 39: Multi-Agent Delegation Surface - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 18 (9 new source/example files, 9 modified)
**Analogs found:** 17 / 18 (rate-limit bucket *algorithm* has no codebase analog; module shape does)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/lattice/src/agent/crew/agent-spec.ts` (new) | type factory | transform (pure value) | `src/tools/tools.ts:12-36` (`defineTool`) | exact |
| `packages/lattice/src/agent/crew/crew-policy.ts` (new) | config + validation | transform | `src/contract/contract.ts:28-33, 91-106` | exact |
| `packages/lattice/src/agent/crew/dispatcher.ts` (new) | service (dispatch chokepoint) | request-response | `src/agent/runtime.ts:295-346` (step 4g) | exact |
| `packages/lattice/src/agent/crew/run-crew.ts` (new) | service (orchestrator) | request-response loop | `src/agent/runtime.ts:67-399` (`runAgent`) | exact |
| `packages/lattice/src/agent/infra/rate-limit-group.ts` (new) | infra primitive | request-response gating | `src/agent/infra/cost-tracker.ts` | role-match (module shape exact; bucket math new) |
| `packages/lattice/src/receipts/cid.ts` (new) | utility (crypto) | transform | `src/storage/fingerprint.ts:14-19` + `src/contract/checkpoint.ts:252-261` | exact (composed) |
| `examples/agent-crew/{package.json,setup.mjs,index.mjs}` (new) | example | batch | `examples/agent-loop/*` | exact |
| `src/agent/crew/*.test.ts`, `src/agent/infra/rate-limit-group.test.ts`, `src/receipts/cid.test.ts` (new) | test | — | colocated `*.test.ts` convention; fake timers at `src/providers/adapters.test.ts:519-531` | exact |
| `test-d/agent-crew.test-d.ts` (new) | test (types) | — | existing `test-d/*.test-d.ts` (e.g. `receipt-v12.test-d.ts`) | exact |
| `packages/lattice/src/runtime/create-ai.ts` (mod) | facade | request-response | own `runAgent` member, lines 116-118 + 152-158 | exact (in-file) |
| `packages/lattice/src/index.ts` (mod) | config (public surface) | — | own agent export blocks, lines 52-131 | exact (in-file) |
| `packages/lattice/src/providers/anthropic.ts` (mod) | provider adapter | request-response | own `execute()`, lines 388-443 | exact (in-file) |
| `packages/lattice/src/receipts/types.ts` + `receipt.ts` (mod) | model (schema) | transform | Phase 38 `modelClass` field: types.ts:54-57, receipt.ts:103 | exact (in-file) |
| `packages/lattice/src/agent/types.ts` (mod) | model (types) | — | own `AgentFailureKind` union, lines 134-138 | exact (in-file) |
| `packages/lattice/src/agent/runtime.ts` (mod) | service (seam extraction) | request-response | own step 4g, lines 295-346 | exact (in-file) |
| `packages/lattice/src/agent/format-tools.ts` (mod) | utility (prompt encoding) | transform | own `buildTask`/`describeForSystem`, lines 179-224 | exact (in-file) |
| `packages/lattice/src/agent/host.ts` (mod) | model (`AgentSnapshot` ancestry field) | — | own interface, lines 47-54 | exact (in-file) |
| `AGENTS.md`, `docs/fsb-integration-gaps.md`, `.planning/REQUIREMENTS.md`, `.changeset/*` (mod) | docs | — | RESEARCH.md §Doc Edits carries exact current→replacement text | exact |

## Pattern Assignments

### `agent/crew/agent-spec.ts` (type factory, pure value)

**Analog:** `packages/lattice/src/tools/tools.ts`

**Core pattern — interface + `kind` discriminant + `Omit<…, "kind">` factory** (tools.ts:12-36):
```typescript
export interface ToolDefinition<TSchema extends StandardSchemaV1 = StandardSchemaV1> {
  readonly kind: "tool";
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: TSchema;
  readonly execute: (
    input: StandardSchemaV1.InferOutput<TSchema>,
    context: ToolExecutionContext,
  ) => Promise<unknown> | unknown;
}

export function defineTool<TSchema extends StandardSchemaV1>(
  definition: Omit<ToolDefinition<TSchema>, "kind">,
): ToolDefinition<TSchema> {
  return {
    kind: "tool",
    ...definition,
  };
}
```
`defineAgent` mirrors this literally with `kind: "agent"` and fields `{ id, intent, tools, childAgents?, summaryReturnSchema }` (D-03). Import style: `import type { StandardSchemaV1 } from "@standard-schema/spec";` (tools.ts:1).

**Validation pattern children reuse** — `runTool` validates via the shared kernel (tools.ts:43-47); `summaryReturnSchema` validation uses the same `validateSchemaOutput` from `../outputs/validate.js`:
```typescript
const validation = await validateSchemaOutput(tool.name, tool.inputSchema, input);
if (!validation.ok) {
  throw new Error(`Invalid input for tool "${tool.name}".`);
}
```

---

### `agent/crew/crew-policy.ts` (config + validation)

**Analog:** `packages/lattice/src/contract/contract.ts`

**`BudgetInvariant` reused verbatim as `CrewPolicy.budget`** (contract.ts:28-33):
```typescript
export interface BudgetInvariant {
  readonly maxCostUsd?: number;
  readonly maxIterations?: number;
  readonly maxWallTimeMs?: number;
  readonly p95LatencyMs?: number;
}
```

**Exact-optional-safe frozen factory** (contract.ts:91-106) — the template for any `crewPolicy()`-style normalizer:
```typescript
export function contract(input: CapabilityContractInput = {}): CapabilityContract {
  return Object.freeze({
    kind: "capability-contract" as const,
    ...(input.budget !== undefined ? { budget: Object.freeze({ ...input.budget }) } : {}),
    ...(input.invariants !== undefined
      ? { invariants: Object.freeze(input.invariants.map((inv) => Object.freeze({ ...inv }))) }
      : {}),
    ...(input.requiredPrivacy !== undefined ? { requiredPrivacy: input.requiredPrivacy } : {}),
  });
}
```
Structural caps (`maxTotalIterations`, `maxIterationsPerAgent`, `maxConcurrentChildren`, `maxDepth`) sit beside `budget`. `maxConcurrentChildren > 1` rejection: throw a typed error at `runAgentCrew` entry (fail-fast precedent: `runTool` throws on invalid input, tools.ts:46).

---

### `agent/crew/dispatcher.ts` (dispatch chokepoint)

**Analog:** `packages/lattice/src/agent/runtime.ts` step 4g — the exact loop section the seam is extracted from.

**Core pattern — tool lookup, dispatch, error shape, tool-result turn** (runtime.ts:303-346):
```typescript
for (const req of toolUseRequests) {
  const tool = intent.tools.find((t) => t.name === req.name);
  let resultContent: string;
  if (tool === undefined) {
    resultContent = JSON.stringify({ error: `Unknown tool: ${req.name}` });
  } else {
    try {
      await pipeline.run("BEFORE_TOOL", { iterationIndex, toolName: req.name, args: req.args });
      toolResult = await runTool(tool, req.args);
      resultContent = stringifyArtifactValue(toolResult.artifact.value);
      await pipeline.run("AFTER_TOOL", { iterationIndex, toolName: req.name, args: req.args, result: toolResult.artifact.value });
    } catch (error) {
      resultContent = JSON.stringify({
        error: error instanceof Error ? error.message : "Tool execution failed",
      });
    }
  }
  conversation.push({
    role: "tool",
    content: resultContent,
    toolCallId: req.id,
    toolName: req.name,
  });
  toolCallRecords.push({ id: req.id, name: req.name, argsHash: stableHash(req.args), resultHash });
}
```
The CrewDispatcher branches BEFORE `intent.tools.find(...)`: if `req.name` matches a `childAgents[].id`, run the child loop instead of `runTool`, then push the same `role: "tool"` turn with `content: JSON.stringify({ summary, artifacts, receipts })` (validated against `summaryReturnSchema`). Structured failure (D-09) extends the existing `JSON.stringify({ error: ... })` convention to `JSON.stringify({ error: { kind, reason, terminal } })`.

**Re-entry rendering is free** — `buildTask` renders tool turns as (format-tools.ts:204-206):
```typescript
const idHint = turn.toolCallId !== undefined ? ` id=${turn.toolCallId}` : "";
const nameHint = turn.toolName !== undefined ? ` name=${turn.toolName}` : "";
lines.push(`TOOL_RESULT (${nameHint.trim() || "tool"}${idHint}):\n${turn.content}`);
```

**Caution:** do NOT copy `stableHash` (runtime.ts:493-504) for anything cryptographic — it is djb2, not sha256.

---

### `agent/crew/run-crew.ts` (orchestrator)

**Analog:** `packages/lattice/src/agent/runtime.ts` (`runAgent`).

**Imports pattern** (runtime.ts:34-55) — relative `.js`-suffixed imports, `import type` for type-only:
```typescript
import { BAND, type HookPipeline, createHookPipeline } from "../contract/bands.js";
import type { LatticeConfig } from "./../runtime/config.js";
import type { ProviderAdapter, ProviderRunResponse, Usage } from "../providers/provider.js";
import { runTool, type ToolCallResult } from "../tools/tools.js";
import { createNoopAgentHost, type AgentHost, type AgentSnapshot } from "./host.js";
```

**Budget pre-check pattern incl. `costUsd: null` guard** (runtime.ts:138-162) — crew-pool checks copy this shape:
```typescript
while (iterationIndex < maxIterations) {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= maxWallTimeMs) {
    return buildFailure({
      kind: "agent-wall-time-exceeded",
      reason: `Wall-time budget ${maxWallTimeMs}ms exceeded after ${elapsedMs}ms`,
      iterations,
      usage: cumulativeUsage,
    });
  }
  if (cumulativeUsage.costUsd !== null && cumulativeUsage.costUsd >= maxCostUsd) {
    return buildFailure({ kind: "no-contract-match", reason: `Cost budget $${maxCostUsd} exceeded at $${cumulativeUsage.costUsd}`, iterations, usage: cumulativeUsage });
  }
```
Cost arithmetic only when `costUsd !== null` (also cost-tracker.ts:42-44, runtime.ts:451-453) — Pitfall 4.

**Transport seam call site** (runtime.ts:221-229) — exactly where the rate-limit wrapper takes effect:
```typescript
const providerRequest = {
  task,
  artifacts: [],
  outputs: ["answer"],
  ...(intent.policy !== undefined ? { policy: intent.policy } : {}),
};
response = host.transport !== undefined
  ? await host.transport.call(provider, providerRequest)
  : await provider.execute(providerRequest);
```

**Failure constructor pattern** (runtime.ts:468-482) — `CrewResult` failure path copies this conditional-spread shape:
```typescript
function buildFailure(input: { kind: AgentFailure["kind"]; reason?: string; cause?: unknown; iterations: readonly IterationRecord[]; usage: {...} }): AgentFailure {
  return {
    kind: input.kind,
    usage: snapshotUsage(input.usage),
    iterations: Object.freeze([...input.iterations]),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.cause !== undefined ? { cause: input.cause } : {}),
  };
}
```

**Default-host fallback** (runtime.ts:76): `const host: AgentHost = intent.host ?? createNoopAgentHost();` — children use `hosts.childHost` the same way.

**Internal seam extraction note:** the seam lands as an injectable `dispatchToolUse?` on a non-public loop entry; `src/index.ts` must NOT re-export it (export list at index.ts:52-131 is the audited public surface).

---

### `agent/infra/rate-limit-group.ts` (standalone infra primitive)

**Analog:** `packages/lattice/src/agent/infra/cost-tracker.ts` — the locked precedent (D-12) for module shape.

**Module shape — doc header, type-only deps, `kind`-tagged closure factory** (cost-tracker.ts:1-57, abbreviated):
```typescript
/**
 * CostTracker — Phase 21 (v1.2).
 *
 * Pure accumulator over per-iteration `Usage`. Standalone (no dependency
 * on the agent runtime); callers can plug it in via a hook handler or
 * read it after a run completes.
 */
import type { BudgetInvariant } from "../../contract/contract.js";
import type { Usage } from "../../providers/provider.js";

export interface CostTracker {
  readonly kind: "cost-tracker";
  recordIteration(usage: Usage): void;
  total(): Usage;
  budgetStatus(budget?: BudgetInvariant): CostBudgetStatus;
}

export function createCostTracker(): CostTracker {
  let promptTokens = 0;
  // ... closure state ...
  return {
    kind: "cost-tracker" as const,
    recordIteration(usage: Usage): void { /* mutate closure state */ },
    total(): Usage { return { promptTokens, completionTokens, costUsd }; },
  };
}
```
`createRateLimitGroup` follows: `kind: "rate-limit-group"`, closure state for both buckets, injectable `now?: () => number` option. RESEARCH.md Pattern 4 carries the full interface sketch (`acquire(estimate)` → `RateLimitLease.release(actual)`).

**Transport wrapper analog** — `createNoopAgentHost().transport` (host.ts:144-156) is the pass-through to wrap:
```typescript
transport: {
  async call(provider: ProviderAdapter, request: ProviderRunRequest): Promise<ProviderRunResponse> {
    if (provider.execute === undefined) {
      throw new Error(`AgentTransport: provider ${provider.id} has no execute() method.`);
    }
    return provider.execute(request);
  },
},
```
`AgentTransport` interface at host.ts:83-88. INV-03: wrap `call()`, never touch `ProviderAdapter`.

**No timers pinning the loop:** lazy refill from `now()` delta; single `setTimeout` for the exact deficit only. **No analog exists for the bucket math** — use RESEARCH.md Pattern 4 + defaults (50 RPM / 30k input TPM).

**Test pattern** — fake timers (adapters.test.ts:519-531 precedent; skeleton in RESEARCH.md):
```typescript
vi.useFakeTimers();
const group = createRateLimitGroup({ requestsPerMinute: 2, tokensPerMinute: 1000 });
await group.acquire({ inputTokens: 400 });
await group.acquire({ inputTokens: 400 });
const third = group.acquire({ inputTokens: 400 });
await vi.advanceTimersByTimeAsync(30_000);
await third;
```

---

### `receipts/cid.ts` (CID helper)

**Analogs:** `src/storage/fingerprint.ts` (sha256-hex via `crypto.subtle`) + `src/contract/checkpoint.ts:252-261` (Buffer-free base64 decode).

**Digest + hex pattern** (fingerprint.ts:14-19):
```typescript
const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
return {
  algorithm: "sha256",
  value: toHex(new Uint8Array(digest)),
};
// toHex (fingerprint.ts:48-50):
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

**Buffer-free payload decode** (checkpoint.ts:254-256):
```typescript
// base64 decode without depending on Node-only Buffer.
const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));
const body = JSON.parse(new TextDecoder().decode(bytes)) as { receiptId?: unknown };
```

Composed (RESEARCH.md's recommended helper): `receiptCid(envelope) = "sha256:" + hex(sha256(atob-decoded envelope.payload bytes))`. `ArrayBuffer` copy idiom for `crypto.subtle` input: fingerprint.ts:52-57 or create-ai.ts:950-953. Prefix-string precedent: `stableHash` returns `` `djb2:${...}` `` (runtime.ts:500) — same `algo:value` format, correct algorithm here is sha256.

---

### `receipts/types.ts` + `receipts/receipt.ts` (add `parentReceiptCid`)

**Analog:** Phase 38's `modelClass` — the exact additive-optional-on-v1.2 template.

**Type field with doc comment** (types.ts:54-57):
```typescript
// Phase 38 v1.2 model-class tag. Optional for legacy v1.1 receipts and
// synthetic/unknown routes; populated from the strict Phase 33 registry when
// runtime issuance has a known selected provider/model.
readonly modelClass?: TrainingClass;
```
Add `readonly parentReceiptCid?: string;` beside it with a Phase 39 comment (stable identifier, not user content — redact.ts leaves such fields alone, same rationale as step-marker fields, types.ts:67-70).

**Input + conditional spread** (receipt.ts:39 input field; receipt.ts:103 body assembly):
```typescript
readonly modelClass?: TrainingClass;          // CreateReceiptInput member
// ...
...(input.modelClass !== undefined ? { modelClass: input.modelClass } : {}),   // body0 spread
```
Copy both lines verbatim with `parentReceiptCid`. Never assign `undefined` literally — JCS canonicalization throws on `undefined` (Pitfall 6).

**Synthetic route for the crew-root receipt** — checkpoint.ts:132-141 DEFAULT_MODEL/DEFAULT_ROUTE precedent:
```typescript
const DEFAULT_ROUTE: ReceiptRoute = {
  providerId: "lattice-checkpoint",
  capabilityId: "lattice-checkpoint/step-transition",
  attemptNumber: 1,
};
```
Crew-root mints with e.g. `providerId: "lattice-crew"`, `capabilityId: "lattice-crew/run"`.

---

### `agent/types.ts` (extend `AgentFailureKind`)

**Analog (in-file):** lines 134-138:
```typescript
export type AgentFailureKind =
  | LatticeRunError["kind"]
  | "agent-iteration-denied"
  | "agent-max-iterations"
  | "agent-wall-time-exceeded";
```
Append `| "crew-budget-exceeded"` (D-10). Terminal-error class template if needed: `AgentDeniedError` (types.ts:172-184) with `readonly terminal = true as const;`.

---

### `agent/host.ts` (AgentSnapshot ancestry field)

**Analog (in-file):** lines 47-54:
```typescript
export interface AgentSnapshot {
  readonly version: "agent-snapshot/v1";
  readonly iterationIndex: number;
  readonly conversation: readonly ConversationTurn[];
  readonly cumulativeUsage: Usage;
  readonly providerName: string;
  readonly capturedAt: string;
}
```
Add ancestry as **optional** (`readonly ancestry?: readonly string[];` — absent = root) to stay v1-compatible; serialization site is runtime.ts:373-383 (Pitfall 8). Test resume of a v1 snapshot without the field.

---

### `runtime/create-ai.ts` (add `runAgentCrew` facade member)

**Analog (in-file):** interface member at 116-118 + implementation at 152-158:
```typescript
runAgent<const TOutputs extends OutputContractMap>(
  intent: import("../agent/types.js").AgentIntent<TOutputs>,
): Promise<import("../agent/types.js").AgentResult<TOutputs>> {
  // Lazy import avoids a hard cycle (agent/runtime.ts imports from
  // ../runtime/config.js for its `LatticeConfig` parameter type only).
  return import("../agent/runtime.js").then((mod) => mod.runAgent(intent, config));
},
```
Copy with `import("../agent/crew/run-crew.js")` and `mod.runAgentCrew(options, config)`. Note it passes the raw `config`, not `normalized`. Also add the doc-commented interface member on `AI` (pattern at 107-118).

---

### `providers/anthropic.ts` (opt-in `cacheSystemPrefix`)

**Analog (in-file):** current `execute()` body, lines 388-410 — this is what changes:
```typescript
body: JSON.stringify({
  model: options.model,
  // D-07: top-level `system` field PRESERVED (Anthropic Messages API
  // contract; NOT folded into the `messages` array).
  system: "",
  messages: [
    {
      role: "user",
      content: request.task,
    },
  ],
  max_tokens: DEFAULT_MAX_TOKENS,
}),
```
When `request.cacheSystemPrefix` is present, replace `system: ""` with `system: [{ type: "text", text: request.cacheSystemPrefix, cache_control: { type: "ephemeral" } }]` (request JSON shape in RESEARCH.md Pattern 3). Gate composition in the dispatcher on `quirks.promptCachingSupported` (`AnthropicQuirks`, quirks.ts:47-51; flag set `true` at anthropic.ts:383). Cache counters assertable via `rawResponse: body` (anthropic.ts:441) — no `Usage` widening. Field addition goes on `ProviderRunRequest` as additive optional (Phase 37 `toolCalls`-on-response precedent; conditional spread at call site, runtime.ts:221-226 shape).

---

### `agent/format-tools.ts` (prefix hoist option)

**Analog (in-file):** `systemBlock` assembly + `buildTask` + `describeForSystem` (lines 179-216):
```typescript
const systemBlock = [system, "", "Available tools:", toolDescriptions || "(none)", "", envelopeInstructions]
  .filter((s) => s !== "" || true)
  .join("\n")
  .replace(/^\n+/, "")
  .trimEnd();

function buildTask(conversation: readonly ConversationTurn[]): string {
  const lines: string[] = [];
  lines.push(systemBlock);   // <- the line a body-only variant omits
  lines.push("");
  lines.push("---");
  // ... per-turn rendering ...
  lines.push("ASSISTANT:");
  return lines.join("\n");
}

function describeForSystem(): string {
  return systemBlock;
}
```
`describeForSystem()` already returns the byte-stable prefix; the new option (or `buildTaskBody()` sibling) skips `lines.push(systemBlock)` so a hoisted Anthropic prefix is not duplicated. The prefix must be byte-identical across all child dispatches (snapshot-test it).

---

### `examples/agent-crew/` (showcase)

**Analog:** `examples/agent-loop/` — copy the whole structure.

**package.json** (examples/agent-loop/package.json, 9 lines — copy with new name):
```json
{
  "name": "lattice-example-agent-loop",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "dependencies": { "@full-self-browsing/lattice": "workspace:^" }
}
```

**setup.mjs — real Ed25519 signer + keyset + receipts dir** (setup.mjs:62-68):
```javascript
const { publicKeyJwk, privateKeyJwk } = await generateEd25519KeyPairJwk();
const kid = "kid:agent-loop-showcase:01";
const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
const keySet = createMemoryKeySet([{ kid, state: "active", publicKeyJwk }]);
const outputDir = mkdtempSync(join(tmpdir(), "lattice-agent-loop-"));
```
Imports come from `"../../packages/lattice/dist/index.js"` (setup.mjs:25-40) — built dist, not src.

**Scripted fake provider** (setup.mjs:42-46, 87-94) — extend the response script so the parent's envelopes name child ids:
```javascript
const SCRIPTED_RESPONSES = [
  '{"tool_calls":[{"id":"c1","name":"lookup","args":{"query":"pi"}}]}',
  // ...
];
const responses = [...SCRIPTED_RESPONSES];
const fake = createFakeProvider({
  id: "showcase-fake",
  response: () => ({
    rawOutputs: { answer: responses.shift() ?? "" },
    normalizedUsage: { ...NULLISH_USAGE_DEFAULTS },
  }),
});
```

**`~standard` stub schema** (setup.mjs:54-60) — the established pattern for example schemas (also for child task-string input schemas):
```javascript
const INPUT_SCHEMA_STUB = {
  "~standard": {
    version: 1,
    vendor: "showcase-stub",
    validate: (value) => ({ value }),
  },
};
```

**index.mjs — run, verify every receipt, eval gate, exit codes** (index.mjs:26-64):
```javascript
const ai = createAI({ providers: [ctx.fake], signer: ctx.signer });
const result = await ai.runAgent({ task: "...", tools: ctx.tools, pipeline: ctx.pipeline, signer: ctx.signer, tracer });
if (result.kind !== "success") {
  process.stderr.write(`agent-loop FAILED: kind=${result.kind} reason=${result.reason ?? ""}\n`);
  process.exit(2);
}
for (const envelope of mintedEnvelopes) {
  const v = await verifyReceipt(envelope, ctx.keySet);
  // ...
}
const evalReport = evalAgentRun(baselineSnapshot, { iterationsToGoal: result.iterations.length, usage: result.usage });
```
The crew version calls `ai.runAgentCrew(...)`, derives the snapshot from `CrewResult` (total iterations across agents + crew aggregate usage), and signs/verifies every per-agent receipt incl. chain CIDs.

---

### `agent/crew/crew-eval.test.ts` (regression gate)

**Analog:** `src/agent/eval.ts` — used as-is, no API change. `AgentRunSnapshot` (eval.ts:20-23):
```typescript
export interface AgentRunSnapshot {
  readonly iterationsToGoal: number;
  readonly usage: Usage;
}
```
Defaults: +1 iteration, +10% cost, `mixed-cost-unknown` when exactly one `costUsd` is null (eval.ts:65-66, 84-93). With the fake provider both snapshots carry numeric `costUsd`, avoiding the mixed-cost guard.

---

### `index.ts` (public exports)

**Analog (in-file):** commented export blocks, lines 52-131. Template (index.ts:89-94):
```typescript
// Agent infrastructure primitives (v1.2 Phase 21) — small, standalone
// ...
export { createCostTracker } from "./agent/infra/cost-tracker.js";
export type { CostTracker, CostBudgetStatus } from "./agent/infra/cost-tracker.js";
```
New blocks: crew (`defineAgent`, `runAgentCrew` types, `AgentSpec`, `CrewPolicy`, `CrewResult`), rate-limit group (`createRateLimitGroup` + types), `receiptCid`. Also update the stale comment at index.ts:52-54 ("Multi-agent crews remain..." — part of the policy flip). Every export needs tsd coverage + publint/attw green.

## Shared Patterns

### Conditional spread for optional fields (exactOptionalPropertyTypes)
**Source:** `receipts/receipt.ts:103,111-123`; `contract/contract.ts:91-106`; `agent/runtime.ts:479-480`
**Apply to:** every new file with optional fields (AgentSpec, CrewPolicy, CrewResult, receipt body, provider request)
```typescript
...(input.modelClass !== undefined ? { modelClass: input.modelClass } : {}),
```
Never `field: undefined` — JCS throws on it and typecheck fails.

### `kind`-discriminated interface + closure factory
**Source:** `tools/tools.ts:12-36` (`"tool"`); `agent/infra/cost-tracker.ts:14-38` (`"cost-tracker"`); `agent/host.ts:119-124` (`"agent-host"`)
**Apply to:** `AgentSpec` (`"agent"`), `RateLimitGroup` (`"rate-limit-group"`), any new crew value types.

### `costUsd: null` = unmeasured, never arithmetic on null
**Source:** `agent/runtime.ts:149-152, 451-453`; `agent/infra/cost-tracker.ts:42-44`
**Apply to:** crew pool derivation, rate-limit reconciliation, eval snapshots
```typescript
if (iter.costUsd !== null) {
  cumulative.costUsd = (cumulative.costUsd ?? 0) + iter.costUsd;
}
```

### Web-standard crypto/encoding only (no Node Buffer in src)
**Source:** `storage/fingerprint.ts:14-19,48-57`; `contract/checkpoint.ts:254-256`; `runtime/create-ai.ts:944-957`
**Apply to:** `receipts/cid.ts`, any hashing in crew code. `crypto.subtle.digest` + `atob` + `TextEncoder`/`TextDecoder`.

### Lazy `import()` on the facade
**Source:** `runtime/create-ai.ts:152-158`
**Apply to:** `runAgentCrew` facade member (avoids the runtime↔agent module cycle).

### Error messages never serialize secrets
**Source:** `agent/host.ts:150-152` (message names provider id only); research T-34-02-01 rule
**Apply to:** rate-limit wrapper and dispatcher error paths — `err instanceof Error ? err.message : "..."` only (runtime.ts:233).

### Frozen readonly results
**Source:** `agent/runtime.ts:291,478` (`Object.freeze([...iterations])`); `contract/contract.ts:92`
**Apply to:** `CrewResult.perAgent`, policy normalization, regression lists (eval.ts:118).

### Doc-header module comments with phase provenance
**Source:** every analog (runtime.ts:1-32, cost-tracker.ts:1-7, host.ts:1-29)
**Apply to:** all new modules — `/** X — Phase 39 (v1.3). ... */` with composition-surface notes.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Token-bucket math inside `agent/infra/rate-limit-group.ts` | algorithm | gating | No rate limiter exists anywhere in the codebase. Module shape follows cost-tracker; the dual-bucket lazy-refill algorithm + lease interface come from RESEARCH.md Pattern 4 (interface sketch, defaults 50 RPM / 30k TPM, fake-timer test skeleton). |

Doc edits (`AGENTS.md`, `docs/fsb-integration-gaps.md`) need no code analog — RESEARCH.md §Doc Edits contains exact current→replacement text for all three AGENTS.md surfaces and both gap rows (incl. commit `3794896` backlink for Row 83).

## Metadata

**Analog search scope:** `packages/lattice/src/{agent,tools,contract,receipts,providers,runtime,storage}/`, `examples/agent-loop/`, `packages/lattice/src/index.ts`
**Files scanned:** 16 read in full or targeted (runtime.ts, host.ts, cost-tracker.ts, tools.ts, receipt.ts, receipts/types.ts, fingerprint.ts, contract.ts, agent/types.ts, create-ai.ts, format-tools.ts, eval.ts, anthropic.ts, checkpoint.ts, quirks.ts, index.ts) + 3 example files
**Pattern extraction date:** 2026-06-10
