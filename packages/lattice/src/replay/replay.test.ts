import { describe, expect, it } from "vitest";

import type { ArtifactRef } from "../artifacts/artifact.js";
import type {
  ContextPackPlan,
  ContextProjectionPlan,
  ExecutionPlan,
  ProviderPackagingPlan,
} from "../plan/plan.js";
import type { RunEvent } from "../tracing/tracing.js";
import { estimateCost } from "../routing/cost.js";
import {
  redactPlan,
  redactReplayEnvelope,
  type ReplayEnvelope,
} from "./replay.js";

const SECRET_SENTINELS = [
  "SECRET_ARTIFACT_LABEL",
  "SECRET_METADATA_VALUE",
  "SECRET_SIGNED_URL",
  "SECRET_TENANT_ID",
  "SECRET_STORAGE_KEY",
  "SECRET_PARENT_LABEL",
  "SECRET_TRANSFORM_NAME",
  "SECRET_CONTEXT_REASON",
  "SECRET_WARNING_TEXT",
  "SECRET_PACKAGING_REASON",
  "SECRET_METADATA_KEY",
  "SECRET_ATTEMPT_ERROR",
  "SECRET_RAW_CAUSE",
  "SECRET_PLAN_METADATA",
  "SECRET_ENVELOPE_ERROR",
  "secret.example.test",
] as const;

describe("redactPlan", () => {
  it("reconstructs top-level and primary/fallback evidence from explicit safe fields", () => {
    const plan = unsafePlan();
    const redacted = redactPlan(plan);
    const serialized = JSON.stringify(redacted);

    for (const sentinel of SECRET_SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }

    expect(redacted).toMatchObject({
      id: "plan:replay-redaction",
      status: "failed",
      task: "redacted-task",
      contextProjection: {
        id: "projection:fallback",
        inputHashes: ["sha256:fallback-safe"],
      },
      attempts: [
        {
          providerId: "primary",
          status: "failed",
          error: "redacted-attempt-error",
          contextProjection: {
            id: "projection:primary",
            inputHashes: ["sha256:primary-safe"],
          },
        },
        {
          providerId: "fallback",
          status: "succeeded",
          contextProjection: {
            id: "projection:fallback",
            inputHashes: ["sha256:fallback-safe"],
          },
        },
      ],
    });
    expect(redacted.contextProjection?.artifactRefs[0]).toMatchObject({
      id: "artifact:fallback",
      fingerprint: { algorithm: "sha256", value: "sha256:fingerprint-safe" },
      metadata: {
        trust: "model-summary",
        sourceArtifactIds: ["artifact:source:safe"],
        redactedSource: "url",
      },
    });
    expect(redacted.contextProjection?.artifactRefs[0]?.storage).toBeUndefined();
    expect(redacted.providerPackaging?.artifacts[0]?.providerRequest).toMatchObject({
      reason: "redacted-packaging-reason",
      reference: { kind: "url" },
    });
    expect(redacted.route.fallbackChain[0]?.estimates?.costEstimate).toEqual(
      plan.route.fallbackChain[0]?.estimates?.costEstimate,
    );
    expect(
      redacted.stages.find((stage) => stage.kind === "persistence")?.metadata,
    ).toEqual({
      reports: [
        {
          lifecycle: "input",
          status: "stored",
          artifactId: "artifact:fallback",
        },
      ],
      failure: {
        lifecycle: "provider-output",
        artifactId: "artifact:output:failed",
      },
    });
  });
});

describe("redactReplayEnvelope", () => {
  it("keeps bounded post-provider failure diagnostics and drops arbitrary event/error data", () => {
    const plan = unsafePlan();
    const event: RunEvent = {
      kind: "run.failed",
      timestamp: "2026-07-16T00:00:02.000Z",
      runId: "run:replay-redaction",
      planId: plan.id,
      providerId: "fallback",
      modelId: "fallback:model",
      artifactId: "artifact:output:failed",
      metadata: {
        status: "failed",
        reason: "persistence",
        failureKind: "persistence",
        lifecycle: "provider-output",
        persistenceStatus: "failed",
        projectionId: "projection:fallback",
        artifactCount: 1,
        summaryCount: 1,
        omitted: 2,
        inputHashes: ["sha256:fallback-safe"],
        rawCause: "SECRET_RAW_CAUSE",
        harmlessLooking: {
          nested: "SECRET_METADATA_VALUE",
          signedUrl: "https://secret.example.test/output?sig=SECRET_SIGNED_URL",
        },
      },
    };
    const envelope: ReplayEnvelope = {
      kind: "replay-envelope",
      version: 1,
      runtimeVersion: "1.6.0-test",
      catalogVersion: "catalog:test",
      createdAt: "2026-07-16T00:00:03.000Z",
      plan,
      artifacts: [unsafeArtifactRef("artifact:partial-output")],
      warnings: ["SECRET_WARNING_TEXT"],
      errors: ["SECRET_ENVELOPE_ERROR SECRET_RAW_CAUSE"],
      usage: { inputTokens: 7, outputTokens: 3, costUsd: 0.01 },
      events: [event],
    };

    const redacted = redactReplayEnvelope(envelope);
    const serialized = JSON.stringify(redacted);

    for (const sentinel of SECRET_SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(redacted.errors).toEqual(["redacted-error"]);
    expect(redacted.warnings).toEqual(["redacted-warning"]);
    expect(redacted.events[0]?.metadata).toEqual({
      status: "failed",
      failureKind: "persistence",
      reason: "persistence",
      lifecycle: "provider-output",
      persistenceStatus: "failed",
      artifactCount: 1,
      omitted: 2,
      summaryCount: 1,
      projectionId: "projection:fallback",
      inputHashes: ["sha256:fallback-safe"],
    });
  });
});

function unsafePlan(): ExecutionPlan {
  const primaryRef = unsafeArtifactRef("artifact:primary");
  const fallbackRef = unsafeArtifactRef("artifact:fallback");
  const primaryContext = contextFor("primary", primaryRef);
  const fallbackContext = contextFor("fallback", fallbackRef);
  const primaryProjection = projectionFor(
    "primary",
    primaryRef,
    "sha256:primary-safe",
  );
  const fallbackProjection = projectionFor(
    "fallback",
    fallbackRef,
    "sha256:fallback-safe",
  );
  const primaryPackaging = packagingFor("primary", primaryRef.id);
  const fallbackPackaging = packagingFor("fallback", fallbackRef.id);

  return {
    id: "plan:replay-redaction",
    kind: "execution-plan",
    version: 1,
    createdAt: "2026-07-16T00:00:00.000Z",
    status: "failed",
    task: "SECRET_METADATA_VALUE Bearer private-token",
    outputNames: ["answer"],
    artifactRefs: [primaryRef],
    route: {
      catalogVersion: "catalog:test",
      selected: selectedRoute("fallback"),
      candidates: [],
      rejected: [],
      fallbackChain: [
        {
          providerId: "fallback",
          modelId: "fallback:model",
          score: 1,
          estimates: selectedRoute("fallback").estimates,
          reason: "policy-preserving-fallback",
        },
      ],
      noRouteReasons: [],
    },
    stages: [
      {
        id: "stage:persistence",
        kind: "persistence",
        status: "failed",
        warnings: ["SECRET_WARNING_TEXT"],
        metadata: {
          reports: [
            {
              lifecycle: "input",
              status: "stored",
              artifactId: fallbackRef.id,
              storageKey: "SECRET_STORAGE_KEY",
            },
          ],
          failure: {
            lifecycle: "provider-output",
            artifactId: "artifact:output:failed",
            rawCause: "SECRET_RAW_CAUSE",
          },
          harmlessLooking: "SECRET_METADATA_VALUE",
        },
      },
    ],
    context: fallbackContext,
    contextProjection: fallbackProjection,
    providerPackaging: fallbackPackaging,
    attempts: [
      {
        providerId: "primary",
        modelId: "primary:model",
        status: "failed",
        startedAt: "2026-07-16T00:00:00.000Z",
        completedAt: "2026-07-16T00:00:01.000Z",
        error: "SECRET_ATTEMPT_ERROR SECRET_RAW_CAUSE",
        context: primaryContext,
        contextProjection: primaryProjection,
        providerPackaging: primaryPackaging,
        inputHashes: primaryProjection.inputHashes,
        warnings: ["SECRET_WARNING_TEXT"],
        metadata: {
          rawCause: "SECRET_RAW_CAUSE",
          gateway: {
            used: true,
            providerId: "primary",
            requestedModel: "primary:model",
            policy: { authorization: "SECRET_METADATA_VALUE" },
          },
        },
      },
      {
        providerId: "fallback",
        modelId: "fallback:model",
        status: "succeeded",
        startedAt: "2026-07-16T00:00:01.000Z",
        completedAt: "2026-07-16T00:00:02.000Z",
        usage: { inputTokens: 7, outputTokens: 3, costUsd: 0.01 },
        context: fallbackContext,
        contextProjection: fallbackProjection,
        providerPackaging: fallbackPackaging,
        inputHashes: fallbackProjection.inputHashes,
        warnings: ["SECRET_WARNING_TEXT"],
        metadata: { harmlessLooking: "SECRET_METADATA_VALUE" },
      },
    ],
    warnings: ["SECRET_WARNING_TEXT"],
    metadata: {
      summaryArtifactIds: ["artifact:summary:safe"],
      harmlessLooking: "SECRET_PLAN_METADATA",
      tenantId: "SECRET_TENANT_ID",
    },
  };
}

function unsafeArtifactRef(id: string): ArtifactRef {
  const parent: ArtifactRef = {
    id: `${id}:parent`,
    kind: "url",
    source: "url",
    privacy: "sensitive",
    label: "SECRET_PARENT_LABEL",
    metadata: {
      harmlessLooking: "SECRET_METADATA_VALUE",
      signedUrl: "https://secret.example.test/parent?sig=SECRET_SIGNED_URL",
    },
    fingerprint: { algorithm: "sha256", value: "sha256:parent-safe" },
    storage: {
      storeId: "store:safe",
      key: "SECRET_STORAGE_KEY",
      tenantId: "SECRET_TENANT_ID",
      retention: "durable",
    },
  };

  return {
    id,
    kind: "url",
    mediaType: "text/plain",
    source: "url",
    label: "SECRET_ARTIFACT_LABEL",
    privacy: "sensitive",
    metadata: {
      trust: "model-summary",
      sourceArtifactIds: ["artifact:source:safe"],
      harmlessLooking: "SECRET_METADATA_VALUE",
      signedUrl: "https://secret.example.test/file?sig=SECRET_SIGNED_URL",
    },
    size: { bytes: 12, characters: 12 },
    fingerprint: { algorithm: "sha256", value: "sha256:fingerprint-safe" },
    storage: {
      storeId: "store:safe",
      key: "SECRET_STORAGE_KEY",
      tenantId: "SECRET_TENANT_ID",
      retention: "durable",
    },
    lineage: {
      parents: [parent],
      transform: {
        kind: "generated",
        name: "SECRET_TRANSFORM_NAME",
        metadata: { harmlessLooking: "SECRET_METADATA_VALUE" },
      },
    },
  };
}

function contextFor(providerId: string, ref: ArtifactRef): ContextPackPlan {
  return {
    id: `context:${providerId}`,
    tokenBudget: 1_000,
    estimatedTokens: 10,
    included: [
      {
        artifactId: ref.id,
        reason: "SECRET_CONTEXT_REASON",
        estimatedTokens: 10,
        trust: "user",
      },
    ],
    summarized: [],
    archived: [],
    omitted: [],
    warnings: ["SECRET_WARNING_TEXT"],
  };
}

function projectionFor(
  providerId: string,
  ref: ArtifactRef,
  hash: string,
): ContextProjectionPlan {
  return {
    id: `projection:${providerId}`,
    providerId,
    modelId: `${providerId}:model`,
    artifactRefs: [ref],
    summaryArtifactRefs: [ref],
    inputHashes: [hash],
    omittedArtifactIds: ["artifact:omitted:safe"],
    warnings: ["SECRET_WARNING_TEXT"],
  };
}

function packagingFor(providerId: string, artifactId: string): ProviderPackagingPlan {
  return {
    providerId,
    modelId: `${providerId}:model`,
    artifacts: [
      {
        artifactId,
        transport: "url",
        mediaType: "text/plain",
        lineageTransform: "provider-packaging",
        providerRequest: {
          shape: `${providerId}:url.reference`,
          sourceType: "url",
          reason: "SECRET_PACKAGING_REASON",
          reference: { kind: "url", metadataKey: "SECRET_METADATA_KEY" },
        },
        warnings: ["SECRET_WARNING_TEXT"],
      },
    ],
    warnings: ["SECRET_WARNING_TEXT"],
  };
}

function selectedRoute(providerId: string) {
  const costEstimate = estimateCost({
    pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    inputTokens: 10,
    outputTokens: 5,
  });
  return {
    providerId,
    modelId: `${providerId}:model`,
    score: 1,
    estimates: {
      inputTokens: 10,
      outputTokens: 5,
      costEstimate,
      costUsd: costEstimate.totalCostUsd!,
    },
    contextWindow: 4_096,
    inputModalities: ["text"] as const,
    outputModalities: ["text"] as const,
    fileTransport: ["inline"] as const,
  };
}
