import type { ArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { InferOutputMap } from "../outputs/infer.js";
import type { ExecutionPlan, UsageRecord } from "../plan/plan.js";
import type { Usage } from "../providers/provider.js";
import type { RunResult } from "../results/result.js";
import type { AI, RunIntent } from "../runtime/create-ai.js";
import type { RunEvent } from "../tracing/tracing.js";
import { latticeVersion } from "../version.js";

export interface ReplayEnvelope<TOutputs extends OutputContractMap = OutputContractMap> {
  readonly kind: "replay-envelope";
  readonly version: 1;
  readonly runtimeVersion: string;
  readonly catalogVersion: string;
  readonly createdAt: string;
  readonly plan: ExecutionPlan;
  readonly artifacts: readonly ArtifactRef[];
  readonly outputs?: InferOutputMap<TOutputs>;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly usage?: UsageRecord;
  readonly events: readonly RunEvent[];
}

export function createReplayEnvelope<TOutputs extends OutputContractMap>(
  result: RunResult<TOutputs>,
): ReplayEnvelope<TOutputs> {
  if (result.plan.kind !== "execution-plan") {
    throw new Error("Replay envelopes require an execution plan.");
  }

  const usage = result.plan.attempts.at(-1)?.usage;

  return {
    kind: "replay-envelope",
    version: 1,
    runtimeVersion: latticeVersion,
    catalogVersion: result.plan.route.catalogVersion,
    createdAt: new Date().toISOString(),
    plan: redactPlan(result.plan),
    artifacts: result.ok ? result.artifacts : result.plan.artifactRefs,
    ...(result.ok ? { outputs: result.outputs } : {}),
    warnings: result.plan.warnings,
    errors: result.ok ? [] : [result.error.message],
    ...(usage !== undefined ? { usage } : {}),
    events: result.events ?? [],
  };
}

export async function replayOffline<TOutputs extends OutputContractMap>(
  envelope: ReplayEnvelope<TOutputs>,
): Promise<RunResult<TOutputs>> {
  const replayedUsage = envelopeUsage(envelope);
  if (envelope.outputs === undefined) {
    return {
      ok: false,
      error: {
        kind: "execution_unavailable",
        message: "Replay envelope does not contain successful outputs.",
      },
      usage: replayedUsage,
      plan: envelope.plan,
      events: envelope.events,
    };
  }

  return {
    ok: true,
    outputs: envelope.outputs,
    artifacts: envelope.artifacts,
    usage: replayedUsage,
    plan: envelope.plan,
    events: envelope.events,
  };
}

function envelopeUsage(envelope: ReplayEnvelope<OutputContractMap>): Usage {
  if (envelope.usage === undefined) {
    return { promptTokens: 0, completionTokens: 0, costUsd: null };
  }
  return {
    promptTokens: envelope.usage.inputTokens ?? 0,
    completionTokens: envelope.usage.outputTokens ?? 0,
    costUsd: envelope.usage.costUsd ?? null,
  };
}

export async function rerunLive<TOutputs extends OutputContractMap>(
  ai: AI,
  envelope: ReplayEnvelope<TOutputs>,
  intent: RunIntent<TOutputs>,
): Promise<RunResult<TOutputs>> {
  const result = await ai.run(intent);

  if (result.plan.kind === "execution-plan") {
    return {
      ...result,
      plan: {
        ...result.plan,
        warnings: [
          ...result.plan.warnings,
          `Live rerun of ${envelope.plan.id}: provider behavior, model versions, cost, and latency may differ.`,
        ],
      },
    };
  }

  return result;
}

export function redactReplayEnvelope<TOutputs extends OutputContractMap>(
  envelope: ReplayEnvelope<TOutputs>,
): ReplayEnvelope<TOutputs> {
  return {
    ...envelope,
    plan: redactPlan(envelope.plan),
    artifacts: envelope.artifacts.map(redactArtifactRef),
    events: envelope.events.map((event) => {
      const metadata = redactRecord(event.metadata);

      return {
        ...event,
        ...(metadata !== undefined ? { metadata } : {}),
      };
    }),
  };
}

export function redactPlan(plan: ExecutionPlan): ExecutionPlan {
  return {
    ...plan,
    task: redactText(plan.task),
    artifactRefs: plan.artifactRefs.map(redactArtifactRef),
    ...(plan.providerPackaging !== undefined
      ? {
          providerPackaging: {
            ...plan.providerPackaging,
            artifacts: plan.providerPackaging.artifacts.map((item) => ({
              ...item,
              warnings: item.warnings.map(redactText),
            })),
            warnings: plan.providerPackaging.warnings.map(redactText),
          },
        }
      : {}),
    warnings: plan.warnings.map(redactText),
  };
}

export function redactArtifactRef(ref: ArtifactRef): ArtifactRef {
  const redactedMetadata = redactRecord(ref.metadata);

  return {
    ...ref,
    ...(redactedMetadata !== undefined ? { metadata: redactedMetadata } : {}),
    ...(ref.source === "url"
      ? {
          metadata: {
            ...redactedMetadata,
            redactedSource: "url",
          },
        }
      : {}),
  };
}

function redactRecord(
  record: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (record === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactValue(value),
    ]),
  );
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (typeof value === "object" && value !== null) {
    return redactRecord(value as Record<string, unknown>);
  }

  return value;
}

function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gu, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s)]+/gu, "[redacted-url]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, "[redacted-email]");
}

function shouldRedactKey(key: string): boolean {
  return /api.?key|authorization|token|secret|password|credential|signed.?url|raw|body|transcript/iu.test(key);
}
