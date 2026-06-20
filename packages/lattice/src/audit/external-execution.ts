import canonicalize from "canonicalize";

import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import type { CapabilityContract } from "../contract/contract.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { ExecutionPlan, UsageRecord } from "../plan/plan.js";
import { createExecutionPlan, withPlanStatus } from "../plan/plan.js";
import type { PolicySpec } from "../policy/policy.js";
import type {
  ContractVerdict,
  ReceiptEnvelope,
  ReceiptModel,
  ReceiptRoute,
  ReceiptSigner,
} from "../receipts/types.js";
import { computeArtifactLineageMerkleRoot } from "../receipts/lineage.js";
import { createReceipt } from "../receipts/receipt.js";
import type { ReplayEnvelope } from "../replay/replay.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import { latticeVersion } from "../version.js";

export type ExternalExecutionSidecarOutputSpec =
  | "text"
  | { readonly kind: "citations" }
  | { readonly kind: "artifacts" };

export interface ExternalExecutionUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number | null;
}

export interface ExternalExecutionAuditInput<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly task: string;
  readonly artifacts?: readonly ArtifactInput[];
  readonly outputSpecs?: Record<string, ExternalExecutionSidecarOutputSpec>;
  readonly outputs?: TOutputs;
  readonly policy: PolicySpec;
  readonly contract: CapabilityContract;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: ExternalExecutionUsage;
  readonly rawRequest?: unknown;
  readonly rawResponse?: unknown;
  readonly contractVerdict?: ContractVerdict;
  readonly runId?: string;
  readonly receiptId?: string;
  readonly issuedAt?: string;
  readonly catalogVersion?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ExternalExecutionMetadata {
  readonly kind: "external-execution";
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: ExternalExecutionUsage;
  readonly rawRequest?: unknown;
  readonly rawResponse?: unknown;
  readonly rawRequestHash?: string;
  readonly rawResponseHash?: string;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface ExternalExecutionSidecar<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly version: "lattice-sidecar/v1";
  readonly task: string;
  readonly outputs: Record<string, ExternalExecutionSidecarOutputSpec>;
  readonly policy: PolicySpec;
  readonly contract: CapabilityContract;
  readonly rawOutputs?: TOutputs;
  readonly externalExecution: ExternalExecutionMetadata;
}

export interface ExternalExecutionAuditResult<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly receipt: ReceiptEnvelope;
  readonly sidecar: ExternalExecutionSidecar<TOutputs>;
  readonly replayEnvelope: ReplayEnvelope<OutputContractMap>;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
}

export async function createExternalExecutionAudit<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
>(
  input: ExternalExecutionAuditInput<TOutputs>,
  signer: ReceiptSigner,
): Promise<ExternalExecutionAuditResult<TOutputs>> {
  const runId = input.runId ?? createId("external-run");
  const receiptId = input.receiptId ?? createId("external-receipt");
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const artifacts = input.artifacts ?? [];
  const artifactRefs = artifacts.map(toArtifactRef);
  const outputSpecs = input.outputSpecs ?? inferOutputSpecs(input.outputs);
  const inputHashes = await hashInputArtifacts(artifacts);
  const outputHash = input.outputs === undefined ? null : await hashUnknown(input.outputs);
  const contractHash = await hashCanonical(input.contract);
  const lineageMerkleRoot = await computeArtifactLineageMerkleRoot(artifacts);
  const rawRequestHash = input.rawRequest === undefined
    ? undefined
    : (await hashUnknown(input.rawRequest)) ?? undefined;
  const rawResponseHash = input.rawResponse === undefined
    ? undefined
    : (await hashUnknown(input.rawResponse)) ?? undefined;
  const contractVerdict = input.contractVerdict ?? "success";

  const receipt = await createReceipt(
    {
      runId,
      receiptId,
      issuedAt,
      model: input.model,
      route: input.route,
      ...(lineageMerkleRoot !== undefined ? { lineageMerkleRoot } : {}),
      usage: input.usage,
      contractVerdict,
      contractHash,
      inputHashes,
      outputHash,
    },
    signer,
  );

  const sidecar: ExternalExecutionSidecar<TOutputs> = {
    version: "lattice-sidecar/v1",
    task: input.task,
    outputs: outputSpecs,
    policy: input.policy,
    contract: input.contract,
    ...(input.outputs !== undefined ? { rawOutputs: input.outputs } : {}),
    externalExecution: {
      kind: "external-execution",
      model: input.model,
      route: input.route,
      usage: input.usage,
      ...(input.rawRequest !== undefined ? { rawRequest: input.rawRequest } : {}),
      ...(input.rawResponse !== undefined ? { rawResponse: input.rawResponse } : {}),
      ...(rawRequestHash !== undefined ? { rawRequestHash } : {}),
      ...(rawResponseHash !== undefined ? { rawResponseHash } : {}),
      inputHashes,
      outputHash,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  };

  return {
    receipt,
    sidecar,
    replayEnvelope: createExternalReplayEnvelope({
      runId,
      task: input.task,
      artifacts: artifactRefs,
      outputSpecs,
      outputs: input.outputs,
      catalogVersion: input.catalogVersion ?? "external",
      route: input.route,
      usage: input.usage,
      receipt,
      contract: input.contract,
      contractVerdict,
      metadata: input.metadata,
    }),
    inputHashes,
    outputHash,
  };
}

function createExternalReplayEnvelope(input: {
  readonly runId: string;
  readonly task: string;
  readonly artifacts: readonly ArtifactRef[];
  readonly outputSpecs: Record<string, ExternalExecutionSidecarOutputSpec>;
  readonly outputs: Record<string, unknown> | undefined;
  readonly catalogVersion: string;
  readonly route: ReceiptRoute;
  readonly usage: ExternalExecutionUsage;
  readonly receipt: ReceiptEnvelope;
  readonly contract: CapabilityContract;
  readonly contractVerdict: ContractVerdict;
  readonly metadata: Record<string, unknown> | undefined;
}): ReplayEnvelope<OutputContractMap> {
  const plan = withPlanStatus(
    createExecutionPlan({
      task: input.task,
      artifacts: input.artifacts,
      outputs: input.outputSpecs as OutputContractMap,
      route: {
        catalogVersion: input.catalogVersion,
        selected: {
          providerId: input.route.providerId,
          modelId: input.route.capabilityId,
          score: 0,
          estimates: {
            inputTokens: input.usage.promptTokens,
            outputTokens: input.usage.completionTokens,
            ...(input.usage.costUsd !== null ? { costUsd: input.usage.costUsd } : {}),
          },
          inputModalities: [],
          outputModalities: [],
          fileTransport: [],
        },
        candidates: [],
        rejected: [],
        fallbackChain: [],
        noRouteReasons: [],
      },
      metadata: {
        externalExecution: true,
        runId: input.runId,
        contractVerdict: input.contractVerdict,
        ...(input.metadata !== undefined ? { external: input.metadata } : {}),
      },
    }),
    "completed",
    {
      stages: markAllStagesCompleted,
      attempts: [
        {
          providerId: input.route.providerId,
          modelId: input.route.capabilityId,
          status: "succeeded",
          usage: usageRecord(input.usage),
          metadata: { externalExecution: true },
        },
      ],
    },
  );

  return {
    kind: "replay-envelope",
    version: 1,
    runtimeVersion: latticeVersion,
    catalogVersion: input.catalogVersion,
    createdAt: new Date().toISOString(),
    plan,
    artifacts: input.artifacts,
    ...(input.outputs !== undefined ? { outputs: input.outputs } : {}),
    warnings: [],
    errors: input.contractVerdict === "success" ? [] : [input.contractVerdict],
    usage: usageRecord(input.usage),
    events: [],
    receipt: input.receipt,
    contract: input.contract,
  };
}

function usageRecord(usage: ExternalExecutionUsage): UsageRecord {
  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens,
    ...(usage.costUsd !== null ? { costUsd: usage.costUsd } : {}),
  };
}

function inferOutputSpecs(
  outputs: Record<string, unknown> | undefined,
): Record<string, ExternalExecutionSidecarOutputSpec> {
  if (outputs === undefined) {
    return {};
  }

  return Object.fromEntries(Object.keys(outputs).map((name) => [name, "text" as const]));
}

async function hashInputArtifacts(
  artifacts: readonly ArtifactInput[],
): Promise<readonly string[]> {
  const hashes: string[] = [];
  for (const artifact of artifacts) {
    hashes.push(artifact.fingerprint?.value ?? await hashUnknown(artifact.value) ?? "");
  }

  return hashes;
}

async function hashUnknown(value: unknown): Promise<string | null> {
  return (await fingerprintArtifactValue(value))?.value ?? null;
}

async function hashCanonical(value: unknown): Promise<string | null> {
  const canonical = canonicalize(value);
  if (canonical === undefined) {
    return null;
  }

  return hashUnknown(canonical);
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

const markAllStagesCompleted: ExecutionPlan["stages"] = [
  {
    id: "stage:analysis",
    kind: "analysis",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:transforms",
    kind: "transforms",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:context-packing",
    kind: "context-packing",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:provider-packaging",
    kind: "provider-packaging",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:tool-execution",
    kind: "tool-execution",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:execution",
    kind: "execution",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:validation",
    kind: "validation",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:tripwire",
    kind: "tripwire",
    status: "completed",
    warnings: [],
  },
  {
    id: "stage:persistence",
    kind: "persistence",
    status: "completed",
    warnings: [],
  },
];
