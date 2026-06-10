/**
 * CrewDispatcher — Phase 39 (v1.3). The single chokepoint where ALL crew
 * concerns live (D-01/D-02).
 *
 * Hybrid dispatch model (D-01): the parent's MODEL sees each child agent as
 * a named tool (synthesized `ToolDefinition`-shaped declarations derived
 * from the child's `id`, `intent`, and `summaryReturnSchema`), but the
 * RUNTIME branches on the `kind: "agent"` discriminant at this chokepoint —
 * dispatch is routed through the 39-03 `runAgentInternal` seam
 * (`dispatchToolUse`), never through a tool closure. No policy logic is
 * smuggled into tool `execute` bodies (D-02): budget derivation, ancestry
 * cycle/depth enforcement, summary-return validation, classified failure
 * routing, and receipt minting all live HERE.
 *
 * Re-entry contract (D-04): a completed child returns a schema-validated
 * `{ summary, artifacts, receipts }` envelope that re-enters the parent
 * conversation as a standard `role: "tool"` turn over the existing
 * prompt-reencoded tool protocol. Recoverable failures return as structured
 * `{ error: { kind, reason, terminal } }` tool results (D-09); terminal
 * failures (D-10) are never re-dispatched — a per-dispatcher terminal-block
 * set caches the error and short-circuits without running the child.
 *
 * Ancestry convention (D-05): `CrewDispatchContext.ancestry` is the chain
 * of spec ids ABOVE the agent this dispatcher serves (parent-first,
 * exclusive of the agent itself — the root agent's dispatcher receives
 * `[]`). Cycle prevention rejects any dispatch whose target id equals the
 * current agent's id or already appears in the chain; the depth gate
 * rejects dispatch once `ancestry.length >= policy.maxDepth`. The full
 * root-first chain (including the child itself) is persisted on the
 * child's `AgentSnapshot.ancestry` via the survivability seam when
 * snapshots are captured.
 *
 * Receipt chain (research Pattern 2): when a signer is configured the
 * dispatcher mints the child completion receipt directly via
 * `createReceipt` with `parentReceiptCid = crew-root CID` (the anchor
 * minted by the 39-06 orchestrator BEFORE children run — Pitfall 2),
 * using synthetic route identifiers (checkpoint.ts DEFAULT_ROUTE
 * precedent). Per-iteration checkpoint receipts remain UNCHANGED (no
 * parentReceiptCid).
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { BudgetInvariant } from "../../contract/contract.js";
import { validateSchemaOutput } from "../../outputs/validate.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  Usage,
} from "../../providers/provider.js";
import { receiptCid } from "../../receipts/cid.js";
import { createReceipt } from "../../receipts/receipt.js";
import type { ReceiptEnvelope, ReceiptSigner } from "../../receipts/types.js";
import type { LatticeConfig } from "../../runtime/config.js";
import {
  createNoopSurvivabilityAdapter,
  type SurvivabilityAdapter,
} from "../../runtime/survivability.js";
import type { ToolDefinition } from "../../tools/tools.js";

import { formatToolsForProvider } from "../format-tools.js";
import { STUCK_REASONS } from "../infra/action-history.js";
import type { AgentHost, AgentSnapshot, AgentTransport } from "../host.js";
import {
  runAgentInternal,
  type DispatchToolUseContext,
  type RunAgentInternalOptions,
} from "../runtime.js";
import type { AgentFailure, AgentIntent, ToolUseRequest } from "../types.js";

import type { AgentSpec } from "./agent-spec.js";
import type { ValidatedCrewPolicy } from "./crew-policy.js";

/**
 * Context handed to `createCrewDispatcher` by the crew orchestrator
 * (39-06) — or by tests driving the dispatcher directly.
 */
export interface CrewDispatchContext {
  /** Normalized crew policy from `validateCrewPolicy` (39-03). */
  readonly policy: ValidatedCrewPolicy;
  /** Host every child loop runs against (`hosts.childHost`). */
  readonly childHost: AgentHost;
  /**
   * Spec-id chain ABOVE the agent this dispatcher serves, parent-first and
   * exclusive of the agent itself (D-05). Root dispatcher: `[]`.
   */
  readonly ancestry: readonly string[];
  /** Crew-root receipt CID — the chain anchor (absent when no signer). */
  readonly crewRootCid?: string;
  /** Crew-level signer threaded into children + completion receipts. */
  readonly signer?: ReceiptSigner;
  /**
   * Feeds the per-agent tracker + crew aggregator. Called exactly once per
   * child dispatch with the child run's cumulative usage (Pitfall 3).
   */
  readonly recordUsage: (agentId: string, usage: Usage) => void;
  /** Remaining crew pool (D-07). `undefined` = unbounded. */
  readonly remainingBudget: () => BudgetInvariant | undefined;
  /** Byte-stable crew cache prefix ("" = no prefix sharing). */
  readonly sharedPrefix: string;
  /** Collects per-agent completion envelopes for the CrewResult. */
  readonly mintedReceipts: (envelope: ReceiptEnvelope) => void;
  /** Provider config the child loops execute against (createAI config). */
  readonly config: LatticeConfig;
}

/** Seam-compatible dispatch function (39-03 `runAgentInternal` options). */
export type DispatchToolUseFn = NonNullable<RunAgentInternalOptions["dispatchToolUse"]>;

/** The chokepoint surface consumed by the 39-06 orchestrator. */
export interface CrewDispatcher {
  /** Plugs into the 39-03 seam: `runAgentInternal(intent, config, { dispatchToolUse })`. */
  readonly dispatchToolUse: DispatchToolUseFn;
  /**
   * Synthesized child declarations for the parent's `intent.tools` —
   * real `ToolDefinition`-shaped values so `formatToolsForProvider` renders
   * them and Phase 37 `validateToolCalls` registries accept them (Pitfall 5).
   */
  readonly childToolDeclarations: ReadonlyArray<ToolDefinition<StandardSchemaV1>>;
  /**
   * Crew-ceiling signal (D-10): flips to `true` once a dispatch was
   * rejected with terminal `crew-budget-exceeded`. The 39-06 orchestrator
   * reads this to end the crew run. Shared across the recursive child
   * dispatchers of one crew.
   */
  readonly crewBudgetExhausted: () => boolean;
}

/** Structured tool-result error body (D-09 shape). */
export interface CrewDispatchError {
  readonly kind: string;
  readonly reason: string;
  readonly terminal: boolean;
}

/** Crew-run state shared across the recursive dispatcher tree. */
interface CrewSharedState {
  exhausted: boolean;
  readonly runId: string;
}

/**
 * Create the crew dispatch chokepoint for one agent spec.
 *
 * `spec` is the agent whose loop this dispatcher serves (its `childAgents`
 * are the dispatchable targets); `ctx` carries every crew-level concern.
 */
export function createCrewDispatcher(
  spec: AgentSpec,
  ctx: CrewDispatchContext,
): CrewDispatcher {
  return createDispatcherNode(spec, ctx, {
    exhausted: false,
    runId: `lattice-crew-${crypto.randomUUID()}`,
  });
}

function createDispatcherNode(
  spec: AgentSpec,
  ctx: CrewDispatchContext,
  shared: CrewSharedState,
): CrewDispatcher {
  const children = spec.childAgents ?? [];
  // D-10 terminal-block set: childId -> cached terminal error content.
  const terminalBlock = new Map<string, string>();
  // Cache-prefix hoist (DELEG-04): every child loop's transport is wrapped
  // so requests whose task starts with the byte-stable crew prefix are
  // hoisted to ProviderRunRequest.cacheSystemPrefix when (and ONLY when)
  // the executing adapter discloses quirks.promptCachingSupported. All
  // gating lives here in crew code — adapters stay dumb.
  const childHost: AgentHost =
    ctx.sharedPrefix.length > 0
      ? {
          ...ctx.childHost,
          transport: withCachePrefixHoist(ctx.sharedPrefix, ctx.childHost.transport),
        }
      : ctx.childHost;

  async function dispatchToolUse(
    req: ToolUseRequest,
    _loopCtx: DispatchToolUseContext,
  ): Promise<{ readonly content: string } | undefined> {
    void _loopCtx;
    const childSpec = children.find((child) => child.id === req.name);
    if (childSpec === undefined) {
      // Not a child agent — fall through to the default lookup/runTool path.
      return undefined;
    }

    // ---- Pre-run checks (Task 2a-c) -------------------------------------

    // (i) Terminal-block short-circuit (D-10): a terminally-failed child is
    // never re-dispatched — return the cached error WITHOUT running it.
    const blocked = terminalBlock.get(childSpec.id);
    if (blocked !== undefined) {
      return { content: blocked };
    }

    // (ii) Cycle check (D-05): reject when the target id equals the
    // dispatching agent's own id or already appears in the ancestry chain.
    if (req.name === spec.id || ctx.ancestry.includes(req.name)) {
      return errorResult({
        kind: "crew-cycle-rejected",
        reason:
          `Dispatch of "${req.name}" rejected: the id already appears in the ` +
          `crew ancestry chain (D-05 cycle prevention).`,
        terminal: false,
      });
    }

    // (iii) Depth check (D-05): ancestry holds the agents ABOVE this one,
    // so its length is this agent's depth — dispatching one level further
    // is rejected once that depth reaches policy.maxDepth.
    if (ctx.ancestry.length >= ctx.policy.maxDepth) {
      return errorResult({
        kind: "crew-depth-exceeded",
        reason:
          `Dispatch of "${req.name}" rejected: crew maxDepth ${ctx.policy.maxDepth} ` +
          `reached (ancestry depth ${ctx.ancestry.length}).`,
        terminal: false,
      });
    }

    // (iv) Crew ceiling (D-10): a fully-drained pool ends the run — emit
    // terminal crew-budget-exceeded and flip the orchestrator signal.
    const pool = ctx.remainingBudget();
    if (isPoolExhausted(pool)) {
      shared.exhausted = true;
      return errorResult({
        kind: "crew-budget-exceeded",
        reason: "Crew budget pool exhausted — the crew run must end (D-10).",
        terminal: true,
      });
    }

    // ---- Child pipeline (Task 1) ----------------------------------------

    // (1) Dispatch args: the model supplies { task: string } per the
    // synthesized declaration schema. Untrusted model output — reject
    // malformed args with a recoverable structured error instead of
    // throwing (T-39-14: failures are structured objects, not raw text).
    const task = extractTaskArg(req.args);
    if (task === null) {
      return errorResult({
        kind: "invalid-dispatch-args",
        reason: `Dispatch args for child agent "${childSpec.id}" must be { "task": string }.`,
        terminal: false,
      });
    }

    // (2) Effective budget (D-07): per-dimension min of the child's
    // contract budget and the remaining crew pool; iterations also capped
    // by policy.maxIterationsPerAgent. Null/absent cost dimensions never
    // poison min() (Pitfall 4).
    const effectiveBudget = deriveChildBudget(
      childSpec.contract?.budget,
      pool,
      ctx.policy.maxIterationsPerAgent,
    );

    // (3) Build the child AgentIntent and run the existing loop. The
    // child's dispatch context threads the extended ancestry chain (D-05);
    // when the child has its own childAgents, a recursive dispatcher node
    // (sharing this crew's state) serves its loop and its declarations
    // join the child's tool surface.
    const childAncestry: readonly string[] = [...ctx.ancestry, spec.id];
    const childNode =
      childSpec.childAgents !== undefined && childSpec.childAgents.length > 0
        ? createDispatcherNode(childSpec, { ...ctx, ancestry: childAncestry }, shared)
        : undefined;
    const childTools =
      childNode !== undefined
        ? [...childSpec.tools, ...childNode.childToolDeclarations]
        : childSpec.tools;

    const childIntent: AgentIntent = {
      task,
      tools: childTools,
      host: childHost,
      // Persist the full root-first chain (including the child itself) on
      // the child's AgentSnapshot when the childHost captures snapshots.
      survivabilityAdapter: withAncestrySnapshot(
        createNoopSurvivabilityAdapter<AgentSnapshot>(),
        [...childAncestry, childSpec.id],
      ),
      ...(effectiveBudget !== undefined
        ? { contract: { kind: "capability-contract", budget: effectiveBudget } }
        : {}),
      ...(ctx.signer !== undefined ? { signer: ctx.signer } : {}),
    };
    const childResult = await runAgentInternal(
      childIntent,
      ctx.config,
      childNode !== undefined ? { dispatchToolUse: childNode.dispatchToolUse } : {},
    );

    // (5) Record child usage exactly once — success AND failure paths both
    // consumed provider budget (Pitfall 3: no double-counting; the crew
    // aggregator never sees this run again).
    ctx.recordUsage(childSpec.id, childResult.usage);

    if (childResult.kind !== "success") {
      // (b) Classified failure routing (D-09/D-10).
      const classified = classifyChildFailure(childSpec.id, childResult);
      const result = errorResult(classified);
      if (classified.terminal) {
        terminalBlock.set(childSpec.id, result.content);
        if (classified.kind === "crew-budget-exceeded") {
          shared.exhausted = true;
        }
      }
      return result;
    }

    // (d) Receipt minting at the seam (D-02): child completion receipt
    // chained to the crew root. Best-effort (checkpoint.ts D-07 precedent) —
    // a mint failure never destroys the child's completed work.
    const receipts: string[] = [];
    if (ctx.signer !== undefined) {
      try {
        const envelope = await createReceipt(
          {
            runId: shared.runId,
            model: { requested: "lattice-crew/agent-completion", observed: null },
            route: {
              providerId: "lattice-crew",
              capabilityId: "lattice-crew/agent-completion",
              attemptNumber: 1,
            },
            ...(ctx.crewRootCid !== undefined
              ? { parentReceiptCid: ctx.crewRootCid }
              : {}),
            usage: childResult.usage,
            contractVerdict: "success",
            contractHash: null,
            inputHashes: [],
            outputHash: null,
            stepName: `crew-agent-completion:${childSpec.id}`,
          },
          ctx.signer,
        );
        ctx.mintedReceipts(envelope);
        receipts.push(await receiptCid(envelope));
      } catch {
        // Best-effort: the summary simply carries no completion CID.
      }
    }

    // (4) Assemble + validate the summary envelope (children only — the
    // root agent's return is NOT schema-validated; research Open Q2).
    const envelope = {
      summary: extractSummary(childResult.output),
      artifacts: extractArtifacts(childResult),
      receipts,
    };
    const validation = await validateSchemaOutput(
      childSpec.id,
      childSpec.summaryReturnSchema,
      envelope,
    );
    if (!validation.ok) {
      return errorResult({
        kind: "summary-validation-failed",
        reason: validation.issue.issues.map((issue) => issue.message).join("; "),
        terminal: false,
      });
    }

    // (6) Re-enter the parent conversation as a standard tool turn (D-04).
    return { content: JSON.stringify(envelope) };
  }

  return {
    dispatchToolUse,
    childToolDeclarations: synthesizeChildDeclarations(children),
    crewBudgetExhausted: () => shared.exhausted,
  };
}

// ---------------------------------------------------------------------------
// Budget derivation (D-07, Pitfall 4)
// ---------------------------------------------------------------------------

/**
 * Per-dimension `min(spec.contract?.budget, remaining crew pool)` with the
 * iteration dimension additionally capped by `maxIterationsPerAgent`.
 *
 * Cost-dimension min applies ONLY when both sides are numbers — a pool
 * derived from null-cost (unmeasured) usage omits `maxCostUsd`, and even a
 * literal `null` never poisons the arithmetic (Pitfall 4).
 */
export function deriveChildBudget(
  specBudget: BudgetInvariant | undefined,
  pool: BudgetInvariant | undefined,
  maxIterationsPerAgent?: number,
): BudgetInvariant | undefined {
  const maxIterations = minDefined(
    minDefined(specBudget?.maxIterations, pool?.maxIterations),
    maxIterationsPerAgent,
  );
  const maxWallTimeMs = minDefined(specBudget?.maxWallTimeMs, pool?.maxWallTimeMs);
  const maxCostUsd = minDefined(specBudget?.maxCostUsd, pool?.maxCostUsd);

  if (maxIterations === undefined && maxWallTimeMs === undefined && maxCostUsd === undefined) {
    return undefined;
  }
  return {
    ...(maxIterations !== undefined ? { maxIterations } : {}),
    ...(maxWallTimeMs !== undefined ? { maxWallTimeMs } : {}),
    ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
  };
}

/** min() that only applies when BOTH sides are real numbers (Pitfall 4). */
function minDefined(a: number | null | undefined, b: number | null | undefined): number | undefined {
  const aNum = typeof a === "number" && Number.isFinite(a) ? a : undefined;
  const bNum = typeof b === "number" && Number.isFinite(b) ? b : undefined;
  if (aNum !== undefined && bNum !== undefined) return Math.min(aNum, bNum);
  return aNum ?? bNum;
}

/**
 * Crew-ceiling predicate (D-10): the pool is exhausted when ANY bounded
 * dimension is at/below zero. Null/absent dimensions (unmeasured cost)
 * never count as exhausted (Pitfall 4).
 */
function isPoolExhausted(pool: BudgetInvariant | undefined): boolean {
  if (pool === undefined) return false;
  return (
    (typeof pool.maxIterations === "number" && pool.maxIterations <= 0) ||
    (typeof pool.maxWallTimeMs === "number" && pool.maxWallTimeMs <= 0) ||
    (typeof pool.maxCostUsd === "number" && pool.maxCostUsd <= 0)
  );
}

// ---------------------------------------------------------------------------
// Cache-prefix sharing (DELEG-04, research Pattern 3)
// ---------------------------------------------------------------------------

/**
 * Compose the byte-stable crew cache prefix for one tool surface: the
 * `describeForSystem()` block (tool descriptions + envelope instructions),
 * derived from deterministic, version-pinned inputs ONLY — no timestamps,
 * random ids, or unsorted keys (Phase 35 scaffold discipline; any
 * non-byte-stable fragment silently zeroes the cache-hit rate).
 *
 * The 39-06 orchestrator composes this ONCE per crew at crew start and
 * threads it as `CrewDispatchContext.sharedPrefix`. All members sharing a
 * tool surface share byte-identical prefix bytes across dispatches.
 */
export function composeCrewCachePrefix(
  tools: ReadonlyArray<ToolDefinition<StandardSchemaV1>>,
): string {
  // The providerName argument does not branch the v1.2+ prompt-reencoded
  // implementation; a fixed literal keeps the bytes provider-independent.
  return formatToolsForProvider("lattice-crew", tools).describeForSystem();
}

/**
 * Transport wrapper implementing the quirks-gated prefix hoist:
 *
 * - Adapter discloses `quirks.promptCachingSupported === true` (Anthropic
 *   block-granular caching) AND the outgoing task starts with the shared
 *   prefix → the prefix is hoisted to `cacheSystemPrefix` and `task`
 *   carries ONLY the conversation body. The 39-03 byte-equality invariant
 *   (`describeForSystem() + "\n" + buildTaskBody(conv) === buildTask(conv)`)
 *   guarantees the stripped remainder IS the body-only rendering — the
 *   prefix is never duplicated.
 * - Any other adapter → the request passes through UNTOUCHED: no
 *   `cacheSystemPrefix` own-property is ever created (Pitfall 6) and the
 *   prefix stays at the head of `task` (OpenAI automatic token-prefix path).
 *
 * Composes over an existing `AgentTransport` (FSB offscreen bridge etc.);
 * when `inner` is absent it dispatches `provider.execute()` directly,
 * matching the runtime's default transport behavior.
 */
export function withCachePrefixHoist(
  sharedPrefix: string,
  inner?: AgentTransport,
): AgentTransport {
  const marker = `${sharedPrefix}\n`;
  return {
    async call(provider, request) {
      const hoist =
        sharedPrefix.length > 0 &&
        supportsPromptCaching(provider) &&
        request.task.startsWith(marker);
      const outbound: ProviderRunRequest = hoist
        ? {
            ...request,
            task: request.task.slice(marker.length),
            cacheSystemPrefix: sharedPrefix,
          }
        : request;
      if (inner !== undefined) {
        return inner.call(provider, outbound);
      }
      if (provider.execute === undefined) {
        throw new Error(
          `CrewDispatcher: provider "${provider.id}" has no execute() method.`,
        );
      }
      return provider.execute(outbound);
    },
  };
}

/** Quirks gate: only adapters that disclose block-granular prompt caching. */
function supportsPromptCaching(provider: ProviderAdapter): boolean {
  const quirks = provider.quirks as
    | { readonly promptCachingSupported?: boolean }
    | undefined;
  return quirks?.promptCachingSupported === true;
}

// ---------------------------------------------------------------------------
// Failure classification (D-09/D-10)
// ---------------------------------------------------------------------------

/**
 * Map a child `AgentFailure` to the structured tool-result error body.
 *
 * Terminal (D-10): tripwire violations and contract no-match (the
 * `isTerminal()` kinds in results/errors.ts — the agent loop reuses
 * `no-contract-match` for child cost-budget exhaustion), crew-ceiling
 * breaches, and non-stuck SAFETY-band denials (AgentDeniedError aligns
 * with TripwireViolationError terminal semantics). Recoverable (D-09):
 * iteration/wall-time exhaustion and STUCK_REASONS stalls — the parent
 * MAY re-dispatch.
 */
export function classifyChildFailure(
  childId: string,
  failure: AgentFailure,
): CrewDispatchError {
  return {
    kind: failure.kind,
    reason:
      failure.reason ?? `Child agent "${childId}" failed with kind "${failure.kind}".`,
    terminal: isTerminalChildFailure(failure),
  };
}

function isTerminalChildFailure(failure: AgentFailure): boolean {
  if (
    failure.kind === "tripwire-violated" ||
    failure.kind === "no-contract-match" ||
    failure.kind === "crew-budget-exceeded"
  ) {
    return true;
  }
  if (failure.kind === "agent-iteration-denied") {
    // SAFETY-band stuck detection (STUCK_REASONS) is a recoverable stall;
    // every other denial carries AgentDeniedError's terminal semantics.
    const reason = failure.reason ?? "";
    return !STUCK_REASONS.some((stuck) => reason.includes(stuck));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(body: CrewDispatchError): { readonly content: string } {
  // D-09 exact shape: {"error":{"kind":...,"reason":...,"terminal":...}}.
  // Errors carry kind/reason strings ONLY — never request options, headers,
  // or key material (T-39-18).
  return {
    content: JSON.stringify({
      error: { kind: body.kind, reason: body.reason, terminal: body.terminal },
    }),
  };
}

function extractTaskArg(args: unknown): string | null {
  if (typeof args !== "object" || args === null) return null;
  const task = (args as Record<string, unknown>)["task"];
  return typeof task === "string" ? task : null;
}

function extractSummary(output: unknown): string {
  if (typeof output === "object" && output !== null) {
    const answer = (output as Record<string, unknown>)["answer"];
    if (typeof answer === "string") return answer;
  }
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function extractArtifacts(result: unknown): unknown[] {
  const artifacts = (result as { readonly artifacts?: unknown }).artifacts;
  return Array.isArray(artifacts) ? [...artifacts] : [];
}

/**
 * Wrap a survivability adapter so serialized child snapshots carry the
 * root-first ancestry chain (D-05; AgentSnapshot.ancestry from 39-03).
 * The `agent-snapshot/v1` version literal is unchanged — the field is
 * additive-optional (Pitfall 8).
 */
function withAncestrySnapshot(
  base: SurvivabilityAdapter<AgentSnapshot>,
  ancestry: readonly string[],
): SurvivabilityAdapter<AgentSnapshot> {
  return {
    ...base,
    serialize: (state) => base.serialize({ ...state, ancestry }),
  };
}

// ---------------------------------------------------------------------------
// Child tool declarations (D-01, Pitfall 5)
// ---------------------------------------------------------------------------

function synthesizeChildDeclarations(
  children: ReadonlyArray<AgentSpec>,
): ReadonlyArray<ToolDefinition<StandardSchemaV1>> {
  return children.map((child) => ({
    kind: "tool" as const,
    name: child.id,
    description:
      `Delegate a task to the "${child.id}" child agent. ` +
      `Agent intent: ${child.intent} ` +
      `Returns a JSON summary envelope { "summary": string, "artifacts": array, "receipts": array } ` +
      `validated against the agent's summaryReturnSchema.`,
    inputSchema: makeDispatchArgsSchema(child.id),
    // NEVER invoked: the CrewDispatcher intercepts matching names at the
    // dispatch seam BEFORE the default tool path. The body exists only so
    // the declaration is a real ToolDefinition for Phase 37 registries —
    // policy logic lives at the chokepoint, not in tool closures (D-01/D-02).
    execute: () => {
      throw new Error(
        `Child agent "${child.id}" must be dispatched through the CrewDispatcher ` +
          `(kind:"agent" branch) — direct tool execution is forbidden (D-01/D-02).`,
      );
    },
  }));
}

/**
 * Deterministic `~standard` schema for `{ task: string }` dispatch args.
 * Carries a fixed `toJSONSchema()` so `formatToolsForProvider` renders a
 * meaningful args_schema (byte-stable — no timestamps/random ids; the
 * declarations feed the shared cache prefix).
 */
function makeDispatchArgsSchema(childId: string): StandardSchemaV1 {
  const schema = {
    "~standard": {
      version: 1,
      vendor: "lattice-crew",
      validate: (value: unknown) => {
        if (
          typeof value === "object" &&
          value !== null &&
          typeof (value as Record<string, unknown>)["task"] === "string"
        ) {
          return { value };
        }
        return {
          issues: [
            { message: `Dispatch args for child agent "${childId}" must be { "task": string }.` },
          ],
        };
      },
    },
    toJSONSchema: () => ({
      type: "object",
      properties: {
        task: { type: "string", description: "The task to delegate to this child agent." },
      },
      required: ["task"],
      additionalProperties: false,
    }),
  };
  return schema as unknown as StandardSchemaV1;
}
