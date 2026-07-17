/**
 * runAgentCrew — Phase 39 (v1.3).
 *
 * Opt-in multi-agent orchestration over the existing single-agent runtime.
 * The crew surface composes a literal `AgentSpec` tree, validates a
 * serial-only `CrewPolicy`, shares budget/rate-limit state across parent
 * and children, and anchors per-agent completion receipts under one
 * crew-root receipt. Internal dispatch stays behind `createCrewDispatcher`;
 * public consumers call this function or `createAI(...).runAgentCrew(...)`.
 *
 * Rate-limit coordination keys by `ProviderAdapter` instance identity, not
 * by adapter id. The `policy.limits` map still addresses overrides by
 * `adapter.id`; two instances with the same id receive separate buckets
 * that share the same override values. `coordination: "unmanaged"` skips
 * all wrapping for consumers who already coordinate quota externally.
 */

import type { ArtifactRef } from "../../artifacts/artifact.js";
import type { BudgetInvariant } from "../../contract/contract.js";
import { createCostTracker, type CostTracker } from "../infra/cost-tracker.js";
import type {
  ProviderAdapter,
  ProviderPricingHint,
  ProviderRunRequest,
  ProviderRunResponse,
  Usage,
} from "../../providers/provider.js";
import { receiptCid } from "../../receipts/cid.js";
import { computeArtifactLineageMerkleRoot } from "../../receipts/lineage.js";
import {
  issueReceipt,
  issueReceiptFrom,
  preflightReceiptPolicy,
  resolveReceiptPolicy,
  type EffectiveReceiptPolicy,
  type ReceiptIssuanceMode,
  type ReceiptIssuanceOutcome,
} from "../../receipts/policy.js";
import type { ReceiptEnvelope, ReceiptSigner } from "../../receipts/types.js";
import type { AuditError } from "../../results/errors.js";
import type { LatticeConfig } from "../../runtime/config.js";
import { accumulatedCostExceedsBudget } from "../../routing/cost.js";
import type { TracerLike } from "../../tracing/tracing.js";
import type { HookPipeline } from "../../contract/bands.js";

import { createNoopAgentHost, type AgentHost, type AgentTransport } from "../host.js";
import { runAgentInternal } from "../runtime.js";
import type { AgentFailure, AgentIntent, AgentResult } from "../types.js";

import type { AgentSpec } from "./agent-spec.js";
import {
  composeCrewCachePrefix,
  createCrewDispatcher,
  deriveChildBudget,
} from "./dispatcher.js";
import {
  type CrewPolicy,
  type ValidatedCrewPolicy,
  validateCrewPolicy,
} from "./crew-policy.js";
import {
  createRateLimitGroup,
  type RateLimitGroup,
  type RateLimitGroupOptions,
  withRateLimit,
} from "../infra/rate-limit-group.js";

const ZERO_USAGE: Usage = {
  promptTokens: 0,
  completionTokens: 0,
  costUsd: null,
};

export interface RunAgentCrewOptions {
  readonly root: AgentSpec;
  readonly hosts: { readonly childHost: AgentHost };
  readonly policy?: CrewPolicy;
  /** Crew-level signer threaded into member loops and completion receipts. */
  readonly signer?: ReceiptSigner;
  /** Local receipt policy override. Takes precedence over runtime config. */
  readonly receiptMode?: ReceiptIssuanceMode;
  /** Crew-level tracer threaded into member loops. */
  readonly tracer?: TracerLike;
  /** Crew-level hook pipeline threaded into member loops. */
  readonly pipeline?: HookPipeline;
}

export interface CrewAgentResult {
  readonly id: string;
  readonly usage: Usage;
  readonly iterations: number;
  readonly receiptCids: readonly string[];
}

export interface CrewResult {
  /** Parent result, with parent output untouched on success. */
  readonly result: AgentResult;
  /** Per-agent accounting records, including root parent and completed children. */
  readonly perAgent: ReadonlyArray<CrewAgentResult>;
  /** Crew aggregate usage: parent total + sum(child totals), no double-counting. */
  readonly usage: Usage;
  /** Total iterations across every recorded agent. */
  readonly totalIterations: number;
  /** All crew completion receipts, including the crew-root envelope. */
  readonly receipts: ReadonlyArray<ReceiptEnvelope>;
  readonly crewRootCid?: string;
}

interface AgentAccounting {
  readonly tracker: CostTracker;
  iterations: number;
}

interface MutableUsage {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

type MutableBudgetInvariant = {
  -readonly [K in keyof BudgetInvariant]: BudgetInvariant[K];
};

/**
 * Execute a crew rooted at `options.root`.
 */
export async function runAgentCrew(
  options: RunAgentCrewOptions,
  config: LatticeConfig = {},
): Promise<CrewResult> {
  const policy = validateCrewPolicy(options.policy);
  const runId = `runAgentCrew-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = Date.now();
  const receiptPolicy = resolveCrewReceiptPolicy(options, config);
  const receiptPreflight = preflightReceiptPolicy(receiptPolicy);
  if (receiptPreflight?.status === "failed") {
    emitCrewReceiptOutcome(options.tracer, "root", receiptPreflight);
    return emptyAuditCrewResult(receiptPreflight.error);
  }

  const accounting = new Map<string, AgentAccounting>();
  const providerPricing = firstCrewProviderPricing(config);
  const receipts: ReceiptEnvelope[] = [];
  const receiptCidsByAgent = new Map<string, string[]>();

  const crewRootOutcome = await issueCrewRoot({
    runId,
    root: options.root,
    policy: receiptPolicy,
  });
  emitCrewReceiptOutcome(options.tracer, "root", crewRootOutcome);
  if (
    crewRootOutcome.status === "failed" &&
    receiptPolicy.mode === "required"
  ) {
    return emptyAuditCrewResult(crewRootOutcome.error);
  }

  const crewRoot =
    crewRootOutcome.status === "issued"
      ? {
          envelope: crewRootOutcome.envelope,
          cid: await receiptCid(crewRootOutcome.envelope),
        }
      : undefined;
  if (crewRoot !== undefined) {
    receipts.push(crewRoot.envelope);
  }

  const groupForProvider = createRateLimitGroupResolver(policy);
  const childHost = wrapHostWithRateLimits(
    options.hosts.childHost,
    groupForProvider,
  );

  function recordUsage(agentId: string, usage: Usage): void {
    entryFor(accounting, agentId, providerPricing).tracker.recordIteration(usage);
  }

  function recordAgentResult(agentId: string, result: AgentResult): void {
    const entry = entryFor(accounting, agentId, providerPricing);
    entry.iterations += result.iterations.length;
  }

  function remainingBudget(): BudgetInvariant | undefined {
    return deriveRemainingBudget({
      policy,
      usage: totalUsage(accounting),
      iterations: totalIterations(accounting),
      startedAt,
    });
  }

  const dispatcher = createCrewDispatcher(options.root, {
    policy,
    childHost,
    ancestry: [],
    recordUsage,
    recordAgentResult,
    remainingBudget,
    sharedPrefix: composeSharedPrefix(options.root),
    collectReceipt(_agentId, envelope, _cid) {
      receipts.push(envelope);
    },
    config,
    ...(crewRoot !== undefined ? { crewRootCid: crewRoot.cid } : {}),
    receiptMode: receiptPolicy.mode,
    ...(receiptPolicy.signer !== undefined
      ? { signer: receiptPolicy.signer }
      : {}),
    ...(options.tracer !== undefined ? { tracer: options.tracer } : {}),
    ...(options.pipeline !== undefined ? { pipeline: options.pipeline } : {}),
  });

  const parentBudget = deriveChildBudget(
    options.root.contract?.budget,
    remainingBudget(),
    policy.maxIterationsPerAgent,
  );
  const parentContract =
    parentBudget !== undefined
      ? {
          ...(options.root.contract ?? { kind: "capability-contract" as const }),
          budget: parentBudget,
        }
      : options.root.contract;
  const parentIntent: AgentIntent = {
    task: options.root.intent,
    tools: [...options.root.tools, ...dispatcher.childToolDeclarations],
    host: wrapHostWithRateLimits(createNoopAgentHost(), groupForProvider),
    ...(parentContract !== undefined ? { contract: parentContract } : {}),
    receiptMode: receiptPolicy.mode,
    ...(receiptPolicy.signer !== undefined
      ? { signer: receiptPolicy.signer }
      : {}),
    ...(options.tracer !== undefined ? { tracer: options.tracer } : {}),
    ...(options.pipeline !== undefined ? { pipeline: options.pipeline } : {}),
  };

  const parentResult = await runAgentInternal(parentIntent, config, {
    dispatchToolUse: dispatcher.dispatchToolUse,
    remainingBudget,
  });
  recordUsage(options.root.id, parentResult.usage);
  recordAgentResult(options.root.id, parentResult);

  let parentCompletionError: AuditError | undefined;
  if (parentResult.kind !== "audit" && crewRoot !== undefined) {
    const parentOutcome = await issueAgentCompletionReceipt({
      runId,
      agentId: options.root.id,
      usage: parentResult.usage,
      policy: receiptPolicy,
      parentReceiptCid: crewRoot.cid,
      success: parentResult.kind === "success",
      artifacts: parentResult.kind === "success" ? parentResult.artifacts ?? [] : [],
    });
    emitCrewReceiptOutcome(options.tracer, "parent-completion", parentOutcome);
    if (parentOutcome.status === "issued") {
      receipts.push(parentOutcome.envelope);
    } else if (
      parentOutcome.status === "failed" &&
      receiptPolicy.mode === "required"
    ) {
      parentCompletionError = parentOutcome.error;
    }
  }

  await populateReceiptCidIndex(receipts, receiptCidsByAgent);

  const budgetExceeded =
    dispatcher.crewBudgetExhausted() ||
    crewBudgetViolated({
      policy,
      usage: totalUsage(accounting),
      iterations: totalIterations(accounting),
      startedAt,
    });
  const result =
    parentCompletionError !== undefined
      ? buildCrewAuditFailure(parentCompletionError, parentResult)
      : parentResult.kind === "audit"
        ? parentResult
        : budgetExceeded
          ? buildCrewBudgetFailure(parentResult)
          : parentResult;

  return freezeCrewResult({
    result,
    perAgent: buildPerAgent(accounting, receiptCidsByAgent),
    usage: totalUsage(accounting),
    totalIterations: totalIterations(accounting),
    receipts,
    ...(crewRoot !== undefined ? { crewRootCid: crewRoot.cid } : {}),
  });
}

function entryFor(
  accounting: Map<string, AgentAccounting>,
  agentId: string,
  pricing?: ProviderPricingHint,
): AgentAccounting {
  let entry = accounting.get(agentId);
  if (entry === undefined) {
    entry = {
      tracker: createCostTracker(
        pricing !== undefined ? { pricing } : undefined,
      ),
      iterations: 0,
    };
    accounting.set(agentId, entry);
  }
  return entry;
}

function firstCrewProviderPricing(
  config: LatticeConfig,
): ProviderPricingHint | undefined {
  for (const provider of config.providers ?? []) {
    if (
      typeof provider !== "string" &&
      provider.kind === "provider-adapter" &&
      provider.execute !== undefined
    ) {
      return provider.capabilities?.find(
        (capability) => capability.available !== false,
      )?.pricing;
    }
  }
  return undefined;
}

function totalUsage(accounting: Map<string, AgentAccounting>): Usage {
  const total: MutableUsage = {
    promptTokens: 0,
    completionTokens: 0,
    costUsd: null,
  };
  for (const entry of accounting.values()) {
    accumulate(total, entry.tracker.total());
  }
  return snapshot(total);
}

function totalIterations(accounting: Map<string, AgentAccounting>): number {
  let total = 0;
  for (const entry of accounting.values()) {
    total += entry.iterations;
  }
  return total;
}

function accumulate(total: MutableUsage, usage: Usage): void {
  total.promptTokens += usage.promptTokens;
  total.completionTokens += usage.completionTokens;
  if (usage.costUsd !== null) {
    total.costUsd = (total.costUsd ?? 0) + usage.costUsd;
  }
}

function snapshot(usage: MutableUsage): Usage {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: usage.costUsd,
  };
}

function deriveRemainingBudget(input: {
  readonly policy: ValidatedCrewPolicy;
  readonly usage: Usage;
  readonly iterations: number;
  readonly startedAt: number;
}): BudgetInvariant | undefined {
  const remaining: MutableBudgetInvariant = {};
  const budget = input.policy.budget;
  const iterationCeiling = minDefined(
    budget?.maxIterations,
    input.policy.maxTotalIterations,
  );
  if (iterationCeiling !== undefined) {
    remaining.maxIterations = iterationCeiling - input.iterations;
  }
  if (budget?.maxWallTimeMs !== undefined) {
    remaining.maxWallTimeMs = budget.maxWallTimeMs - (Date.now() - input.startedAt);
  }
  if (budget?.maxCostUsd !== undefined && input.usage.costUsd !== null) {
    remaining.maxCostUsd = budget.maxCostUsd - input.usage.costUsd;
  } else if (budget?.maxCostUsd !== undefined && input.usage.costUsd === null) {
    // Preserve the cap for measured descendants without treating null-cost
    // usage as zero-spend evidence that can exhaust the pool.
    remaining.maxCostUsd = budget.maxCostUsd;
  }
  if (budget?.p95LatencyMs !== undefined) {
    remaining.p95LatencyMs = budget.p95LatencyMs;
  }
  return Object.keys(remaining).length > 0 ? remaining : undefined;
}

function crewBudgetViolated(input: {
  readonly policy: ValidatedCrewPolicy;
  readonly usage: Usage;
  readonly iterations: number;
  readonly startedAt: number;
}): boolean {
  const iterationCeiling = minDefined(
    input.policy.budget?.maxIterations,
    input.policy.maxTotalIterations,
  );
  if (iterationCeiling !== undefined && input.iterations > iterationCeiling) {
    return true;
  }
  const maxWallTimeMs = input.policy.budget?.maxWallTimeMs;
  if (maxWallTimeMs !== undefined && Date.now() - input.startedAt > maxWallTimeMs) {
    return true;
  }
  const maxCostUsd = input.policy.budget?.maxCostUsd;
  return (
    maxCostUsd !== undefined &&
    input.usage.costUsd !== null &&
    accumulatedCostExceedsBudget(input.usage.costUsd, maxCostUsd)
  );
}

function minDefined(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (a !== undefined && b !== undefined) return Math.min(a, b);
  return a ?? b;
}

function createRateLimitGroupResolver(
  policy: ValidatedCrewPolicy,
): (provider: ProviderAdapter) => RateLimitGroup | undefined {
  if (policy.coordination === "unmanaged") {
    return () => undefined;
  }
  const groups = new Map<ProviderAdapter, RateLimitGroup>();
  return (provider) => {
    let group = groups.get(provider);
    if (group === undefined) {
      group = createRateLimitGroup(rateLimitOptionsFor(policy, provider));
      groups.set(provider, group);
    }
    return group;
  };
}

function rateLimitOptionsFor(
  policy: ValidatedCrewPolicy,
  provider: ProviderAdapter,
): RateLimitGroupOptions {
  const override = policy.limits?.[provider.id];
  return {
    ...(override?.requestsPerMinute !== undefined
      ? { requestsPerMinute: override.requestsPerMinute }
      : {}),
    ...(override?.tokensPerMinute !== undefined
      ? { tokensPerMinute: override.tokensPerMinute }
      : {}),
  };
}

function wrapHostWithRateLimits(
  host: AgentHost,
  groupForProvider: (provider: ProviderAdapter) => RateLimitGroup | undefined,
): AgentHost {
  return {
    ...host,
    transport: wrapTransport(host.transport, groupForProvider),
  };
}

function wrapTransport(
  inner: AgentTransport | undefined,
  groupForProvider: (provider: ProviderAdapter) => RateLimitGroup | undefined,
): AgentTransport {
  return {
    call(
      provider: ProviderAdapter,
      request: ProviderRunRequest,
    ): Promise<ProviderRunResponse> {
      const group = groupForProvider(provider);
      if (group !== undefined) {
        return withRateLimit(group, inner).call(provider, request);
      }
      if (inner !== undefined) {
        return inner.call(provider, request);
      }
      if (provider.execute === undefined) {
        throw new Error(`AgentTransport: provider ${provider.id} has no execute() method.`);
      }
      return provider.execute(request);
    },
  };
}

function composeSharedPrefix(root: AgentSpec): string {
  const firstChild = root.childAgents?.[0];
  return composeCrewCachePrefix(firstChild?.tools ?? root.tools);
}

function resolveCrewReceiptPolicy(
  options: RunAgentCrewOptions,
  config: LatticeConfig,
): EffectiveReceiptPolicy {
  const mode = options.receiptMode ?? config.receiptMode;
  const signer = options.signer ?? config.signer;
  return resolveReceiptPolicy({
    ...(mode !== undefined ? { mode } : {}),
    ...(signer !== undefined ? { signer } : {}),
  });
}

async function issueCrewRoot(input: {
  readonly runId: string;
  readonly root: AgentSpec;
  readonly policy: EffectiveReceiptPolicy;
}): Promise<ReceiptIssuanceOutcome> {
  return issueReceipt(
    {
      runId: input.runId,
      model: { requested: "lattice-crew/root", observed: null },
      route: {
        providerId: "lattice-crew",
        capabilityId: "lattice-crew/run",
        attemptNumber: 1,
      },
      usage: ZERO_USAGE,
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      stepName: `crew-start:${input.root.id}`,
    },
    input.policy,
    "pre-execution",
  );
}

async function issueAgentCompletionReceipt(input: {
  readonly runId: string;
  readonly agentId: string;
  readonly usage: Usage;
  readonly policy: EffectiveReceiptPolicy;
  readonly parentReceiptCid: string;
  readonly success: boolean;
  readonly artifacts?: readonly ArtifactRef[];
}): Promise<ReceiptIssuanceOutcome> {
  return issueReceiptFrom(
    async () => {
      const lineageMerkleRoot = await computeArtifactLineageMerkleRoot(
        input.artifacts ?? [],
      );
      return {
        runId: input.runId,
        model: { requested: "lattice-crew/agent-completion", observed: null },
        route: {
          providerId: "lattice-crew",
          capabilityId: "lattice-crew/agent-completion",
          attemptNumber: 1,
        },
        parentReceiptCid: input.parentReceiptCid,
        ...(lineageMerkleRoot !== undefined ? { lineageMerkleRoot } : {}),
        usage: input.usage,
        contractVerdict: input.success ? "success" : "execution-failed",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        stepName: `crew-agent-completion:${input.agentId}`,
      };
    },
    input.policy,
    "post-execution",
  );
}

function emitCrewReceiptOutcome(
  tracer: TracerLike | undefined,
  scope: "root" | "parent-completion",
  outcome: ReceiptIssuanceOutcome,
): void {
  tracer?.event?.("receipt.issuance", {
    scope,
    status: outcome.status,
    ...(outcome.status === "skipped" ? { reason: outcome.reason } : {}),
    ...(outcome.status === "failed"
      ? { code: outcome.error.code, stage: outcome.error.stage }
      : {}),
  });
}

async function populateReceiptCidIndex(
  receipts: readonly ReceiptEnvelope[],
  byAgent: Map<string, string[]>,
): Promise<void> {
  for (const envelope of receipts) {
    const body = decodeReceiptBody(envelope);
    const agentId = parseCompletionAgentId(body.stepName);
    if (agentId === null) continue;
    const cids = byAgent.get(agentId) ?? [];
    cids.push(await receiptCid(envelope));
    byAgent.set(agentId, cids);
  }
}

function decodeReceiptBody(envelope: ReceiptEnvelope): { readonly stepName?: string } {
  return JSON.parse(atob(envelope.payload)) as { readonly stepName?: string };
}

function parseCompletionAgentId(stepName: string | undefined): string | null {
  const prefix = "crew-agent-completion:";
  if (stepName?.startsWith(prefix) !== true) return null;
  return stepName.slice(prefix.length);
}

function buildPerAgent(
  accounting: Map<string, AgentAccounting>,
  receiptCidsByAgent: Map<string, string[]>,
): ReadonlyArray<CrewAgentResult> {
  return Object.freeze(
    Array.from(accounting.entries(), ([id, entry]) =>
      Object.freeze({
        id,
        usage: Object.freeze(entry.tracker.total()),
        iterations: entry.iterations,
        receiptCids: Object.freeze([...(receiptCidsByAgent.get(id) ?? [])]),
      }),
    ),
  );
}

function freezeCrewResult(result: CrewResult): CrewResult {
  return Object.freeze({
    result: Object.freeze(result.result),
    perAgent: Object.freeze([...result.perAgent]),
    usage: Object.freeze({ ...result.usage }),
    totalIterations: result.totalIterations,
    receipts: Object.freeze([...result.receipts]),
    ...(result.crewRootCid !== undefined ? { crewRootCid: result.crewRootCid } : {}),
  });
}

function emptyAuditCrewResult(error: AuditError): CrewResult {
  return freezeCrewResult({
    result: buildCrewAuditFailure(error),
    perAgent: [],
    usage: ZERO_USAGE,
    totalIterations: 0,
    receipts: [],
  });
}

function buildCrewAuditFailure(
  error: AuditError,
  source?: AgentResult,
): AgentFailure {
  return Object.freeze({
    ...error,
    reason: error.message,
    usage: Object.freeze({ ...(source?.usage ?? ZERO_USAGE) }),
    iterations: Object.freeze([...(source?.iterations ?? [])]),
  });
}

function buildCrewBudgetFailure(parentResult: AgentResult): AgentFailure {
  return {
    kind: "crew-budget-exceeded",
    reason: "Crew budget pool exhausted — the crew run ended with terminal semantics.",
    usage: parentResult.usage,
    iterations: Object.freeze([...parentResult.iterations]),
    ...(parentResult.receipt !== undefined ? { receipt: parentResult.receipt } : {}),
  };
}
