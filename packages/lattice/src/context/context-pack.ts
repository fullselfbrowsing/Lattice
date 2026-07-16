import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import type {
  ContextPackItemPlan,
  ContextPackPlan,
  SelectedRoute,
} from "../plan/plan.js";
import type { SessionRecord } from "../sessions/session.js";

export type TrustLabel = "developer" | "user" | "tool" | "model-summary";

export interface ContextPack extends ContextPackPlan {
  readonly kind: "context-pack";
}

export interface BuildContextPackInput {
  readonly task: string;
  readonly artifacts: readonly ArtifactInput[];
  readonly route?: SelectedRoute;
  readonly session?: SessionRecord;
  readonly tokenBudget?: number;
}

export interface ContextSummarizer {
  summarize(input: {
    readonly artifacts: readonly ArtifactRef[];
    readonly budgetTokens: number;
  }): Promise<readonly ArtifactRef[]> | readonly ArtifactRef[];
}

export function buildContextPack(input: BuildContextPackInput): ContextPack {
  const tokenBudget = resolveTokenBudget(input.route, input.tokenBudget);
  const remainingBudget = Math.max(0, tokenBudget - estimateTokens(input.task));
  const included: ContextPackItemPlan[] = [];
  const summarized: ContextPackItemPlan[] = [];
  const archived: ContextPackItemPlan[] = [];
  const omitted: ContextPackItemPlan[] = [];
  const warnings: string[] = [];
  const claimedArtifactIds = new Set<string>();
  const claimedTurnIds = new Set<string>();
  const summaryCoveringTurn = new Map<string, string>();
  let usedTokens = 0;

  for (const artifact of input.artifacts) {
    if (claimedArtifactIds.has(artifact.id)) {
      warnings.push(`Duplicate artifact ${artifact.id} ignored by context classification.`);
      continue;
    }

    claimedArtifactIds.add(artifact.id);
    const artifactTokens = estimateArtifactTokens(artifact);
    const item: ContextPackItemPlan = {
      artifactId: artifact.id,
      reason: "Run artifact included for provider consideration.",
      estimatedTokens: artifactTokens,
      trust: trustForArtifact(artifact),
    };

    if (usedTokens + artifactTokens <= remainingBudget) {
      included.push(item);
      usedTokens += artifactTokens;
      continue;
    }

    if (artifact.kind === "text" || artifact.kind === "document" || artifact.kind === "json") {
      const summaryReserve = Math.min(artifactTokens, SUMMARY_TOKEN_RESERVE);

      if (usedTokens + summaryReserve <= remainingBudget) {
        summarized.push({
          ...item,
          estimatedTokens: summaryReserve,
          reason: "Artifact exceeded live context budget and needs summary packaging.",
        });
        usedTokens += summaryReserve;
        continue;
      }
    }

    omitted.push({
      ...item,
      reason: "Artifact exceeded context budget and cannot be summarized by the default packer.",
    });
    warnings.push(`Artifact ${artifact.id} omitted from live context budget.`);
  }

  for (const summary of input.session?.summaries ?? []) {
    const artifactId = summary.artifactRef.id;

    if (claimedArtifactIds.has(artifactId)) {
      warnings.push(`Duplicate artifact ${artifactId} ignored by context classification.`);
      continue;
    }

    claimedArtifactIds.add(artifactId);
    const summaryTokens = estimateArtifactTokens(summary.artifactRef);
    const sourceTurnIds = stableUnique(summary.sourceTurnIds);
    const item: ContextPackItemPlan = {
      artifactId,
      reason: `Prior session summary covers turns: ${sourceTurnIds.join(", ")}.`,
      estimatedTokens: summaryTokens,
      trust: "model-summary",
    };

    if (usedTokens + summaryTokens <= remainingBudget) {
      included.push(item);
      usedTokens += summaryTokens;

      for (const turnId of sourceTurnIds) {
        if (!summaryCoveringTurn.has(turnId)) {
          summaryCoveringTurn.set(turnId, summary.id);
        }
      }
    } else {
      archived.push({
        ...item,
        reason: `Prior session summary archived because the run budget was exhausted; covers turns: ${sourceTurnIds.join(", ")}.`,
      });
    }
  }

  for (const turn of input.session?.turns ?? []) {
    if (claimedTurnIds.has(turn.id)) {
      warnings.push(`Duplicate session turn ${turn.id} ignored by context classification.`);
      continue;
    }

    claimedTurnIds.add(turn.id);
    const uniqueRefs = stableUniqueRefs([
      ...turn.artifactRefs,
      ...turn.outputArtifactRefs,
    ]);
    const unclaimedRefs = uniqueRefs.filter(
      (ref) => !claimedArtifactIds.has(ref.id),
    );
    const artifactIds = unclaimedRefs.map((ref) => ref.id);
    const turnTokens =
      estimateTokens(turn.task) +
      unclaimedRefs.reduce(
        (total, ref) => total + estimateArtifactTokens(ref),
        0,
      );
    const item: ContextPackItemPlan = {
      sessionTurnId: turn.id,
      artifactIds,
      reason: "Prior session turn retained for continuity.",
      estimatedTokens: turnTokens,
      trust: "user",
    };
    const coveringSummaryId = summaryCoveringTurn.get(turn.id);

    for (const ref of unclaimedRefs) {
      claimedArtifactIds.add(ref.id);
    }

    if (coveringSummaryId !== undefined) {
      archived.push({
        ...item,
        reason: `Prior session turn archived because selected summary ${coveringSummaryId} covers it.`,
      });
      continue;
    }

    if (usedTokens + turnTokens <= remainingBudget) {
      included.push(item);
      usedTokens += turnTokens;
    } else {
      archived.push({
        ...item,
        reason: "Prior session turn archived because the run budget was exhausted.",
      });
    }
  }

  return {
    id: createContextPackId(),
    kind: "context-pack",
    tokenBudget,
    estimatedTokens: usedTokens,
    included,
    summarized,
    archived,
    omitted,
    warnings,
  };
}

const DEFAULT_CONTEXT_TOKEN_BUDGET = 4_000;
const MAX_LIVE_CONTEXT_TOKENS = 16_000;
const MIN_OUTPUT_TOKEN_RESERVE = 256;
const MAX_OUTPUT_TOKEN_RESERVE = 4_096;
const SUMMARY_TOKEN_RESERVE = 256;

function resolveTokenBudget(
  route: SelectedRoute | undefined,
  requested: number | undefined,
): number {
  const defaultBudget =
    route?.contextWindow === undefined
      ? DEFAULT_CONTEXT_TOKEN_BUDGET
      : Math.min(
          MAX_LIVE_CONTEXT_TOKENS,
          Math.max(0, route.contextWindow - outputTokenReserve(route)),
        );

  if (requested === undefined) {
    return defaultBudget;
  }

  return Math.max(0, Math.min(Math.floor(requested), defaultBudget));
}

function outputTokenReserve(route: SelectedRoute): number {
  return Math.min(
    MAX_OUTPUT_TOKEN_RESERVE,
    Math.max(MIN_OUTPUT_TOKEN_RESERVE, route.estimates.outputTokens),
  );
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function stableUniqueRefs(refs: readonly ArtifactRef[]): readonly ArtifactRef[] {
  const seen = new Set<string>();

  return refs.filter((ref) => {
    if (seen.has(ref.id)) {
      return false;
    }

    seen.add(ref.id);
    return true;
  });
}

export function estimateArtifactTokens(artifact: ArtifactInput | ArtifactRef): number {
  if (artifact.size?.characters !== undefined) {
    return estimateTokensFromCharacters(artifact.size.characters);
  }

  if (artifact.size?.bytes !== undefined) {
    return estimateTokensFromCharacters(Math.ceil(artifact.size.bytes / 2));
  }

  if ("value" in artifact && typeof artifact.value === "string") {
    return estimateTokens(artifact.value);
  }

  if ("value" in artifact && artifact.value !== undefined) {
    const serialized = JSON.stringify(artifact.value);

    return serialized === undefined ? 64 : estimateTokens(serialized);
  }

  return 64;
}

export function estimateTokens(value: string): number {
  return Math.max(1, estimateTokensFromCharacters(value.length));
}

export function toContextArtifactRefs(
  artifacts: readonly ArtifactInput[],
): readonly ArtifactRef[] {
  return artifacts.map(toArtifactRef);
}

function estimateTokensFromCharacters(characters: number): number {
  return Math.ceil(characters / 4);
}

function trustForArtifact(artifact: ArtifactRef): TrustLabel {
  if (artifact.source === "tool") {
    return "tool";
  }

  if (artifact.source === "generated") {
    return "model-summary";
  }

  return "user";
}

function createContextPackId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `context-pack:${crypto.randomUUID()}`;
  }

  return `context-pack:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}
