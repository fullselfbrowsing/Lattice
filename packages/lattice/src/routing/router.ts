import type { ArtifactInput } from "../artifacts/artifact.js";
import type { CapabilityContract } from "../contract/contract.js";
import { evaluateContractAgainstRoute } from "../contract/preflight.js";
import type { OutputContract, OutputContractMap } from "../outputs/contracts.js";
import type { PolicySpec } from "../policy/policy.js";
import type {
  CapabilityModality,
  ModelCapability,
} from "../providers/provider.js";
import type {
  RouteCandidate,
  RouteDecision,
  RouteEstimates,
  RouteRejectReason,
} from "../plan/plan.js";
import { estimateArtifactTokens, estimateTokens } from "../context/context-pack.js";
import type { CapabilityCatalog } from "./catalog.js";

export interface RouteRequest {
  readonly task: string;
  readonly artifacts: readonly ArtifactInput[];
  readonly outputs: OutputContractMap;
  readonly policy?: PolicySpec;
  readonly provider?: string;
  readonly model?: string;
  readonly contract?: CapabilityContract;
}

export function routeDeterministically(
  catalog: CapabilityCatalog,
  request: RouteRequest,
): RouteDecision {
  const requiredInputs = requiredInputModalities(request.artifacts);
  const requiredOutputs = requiredOutputModalities(request.outputs);
  const requiresStructuredOutput = outputRequiresStructuredOutput(request.outputs);
  const estimatedInputTokens =
    estimateTokens(request.task) +
    request.artifacts.reduce((total, artifact) => total + estimateArtifactTokens(artifact), 0);
  const candidates = catalog.models
    .map((capability, index) =>
      evaluateCapability(capability, {
        requiredInputs,
        requiredOutputs,
        requiresStructuredOutput,
        estimatedInputTokens,
        ...(request.policy !== undefined ? { policy: request.policy } : {}),
        ...(request.provider !== undefined ? { provider: request.provider } : {}),
        ...(request.model !== undefined ? { model: request.model } : {}),
        ...(request.contract !== undefined ? { contract: request.contract } : {}),
        index,
      }),
    )
    .sort(compareCandidates);
  const accepted = candidates.filter((candidate) => candidate.accepted);
  const selected = accepted[0];

  return {
    catalogVersion: catalog.version,
    ...(selected !== undefined
      ? {
          selected: {
            providerId: selected.providerId,
            modelId: selected.modelId,
            score: selected.score,
            estimates: selected.estimates,
            inputModalities: selected.capability.inputModalities,
            outputModalities: selected.capability.outputModalities,
            fileTransport: selected.capability.fileTransport,
          },
        }
      : {}),
    candidates,
    rejected: candidates.filter((candidate) => !candidate.accepted),
    fallbackChain: accepted.slice(1).map((candidate) => ({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      score: candidate.score,
      reason: "policy-preserving-fallback",
    })),
    noRouteReasons:
      selected === undefined
        ? summarizeNoRouteReasons(candidates)
        : [],
  };
}

function evaluateCapability(
  capability: ModelCapability,
  input: {
    readonly requiredInputs: readonly CapabilityModality[];
    readonly requiredOutputs: readonly CapabilityModality[];
    readonly requiresStructuredOutput: boolean;
    readonly estimatedInputTokens: number;
    readonly policy?: PolicySpec;
    readonly provider?: string;
    readonly model?: string;
    readonly contract?: CapabilityContract;
    readonly index: number;
  },
): RouteCandidate {
  const reasons: RouteRejectReason[] = [];

  if (capability.available === false) {
    reasons.push({
      code: "provider-unavailable",
      message: `${capability.providerId}/${capability.modelId} is not available.`,
    });
  }

  if (input.provider !== undefined && capability.providerId !== input.provider) {
    reasons.push({
      code: "provider-forced-mismatch",
      message: `Provider override requires ${input.provider}.`,
    });
  }

  if (input.model !== undefined && capability.modelId !== input.model) {
    reasons.push({
      code: "model-forced-mismatch",
      message: `Model override requires ${input.model}.`,
    });
  }

  for (const modality of input.requiredInputs) {
    if (!capability.inputModalities.includes(modality)) {
      reasons.push({
        code: "input-modality-unsupported",
        message: `${capability.modelId} does not support ${modality} input.`,
      });
    }
  }

  for (const modality of input.requiredOutputs) {
    if (!capability.outputModalities.includes(modality)) {
      reasons.push({
        code: "output-modality-unsupported",
        message: `${capability.modelId} does not support ${modality} output.`,
      });
    }
  }

  if (input.requiresStructuredOutput && !capability.structuredOutput) {
    reasons.push({
      code: "structured-output-unsupported",
      message: `${capability.modelId} does not support structured output contracts.`,
    });
  }

  if (input.estimatedInputTokens > capability.contextWindow) {
    reasons.push({
      code: "context-window-exceeded",
      message: `Estimated input ${input.estimatedInputTokens} tokens exceeds ${capability.contextWindow}.`,
    });
  }

  const estimates = estimateRoute(capability, input.estimatedInputTokens);
  addPolicyRejectReasons(reasons, capability, estimates, input.policy);

  // Phase 7 contract preflight — reuse the router's own output-token estimate
  // so preflight and the router agree on the projected output size (one source
  // of truth, consumed by Phase 9 receipts).
  const contractResult = evaluateContractAgainstRoute(input.contract, {
    capability,
    estimatedInputTokens: input.estimatedInputTokens,
    estimatedOutputTokens: estimates.outputTokens,
  });
  for (const reason of contractResult.reasons) {
    reasons.push(reason);
  }

  const score = scoreCapability(capability, estimates, input.index);

  return {
    providerId: capability.providerId,
    modelId: capability.modelId,
    capability,
    score,
    accepted: reasons.length === 0,
    reasons,
    estimates,
  };
}

function addPolicyRejectReasons(
  reasons: RouteRejectReason[],
  capability: ModelCapability,
  estimates: RouteEstimates,
  policy?: PolicySpec,
): void {
  if (policy === undefined) {
    return;
  }

  if (
    policy.providerAllowList !== undefined &&
    !policy.providerAllowList.includes(capability.providerId)
  ) {
    reasons.push({
      code: "provider-not-allowed",
      message: `${capability.providerId} is not in the provider allow list.`,
    });
  }

  if (policy.providerDenyList?.includes(capability.providerId) === true) {
    reasons.push({
      code: "provider-denied",
      message: `${capability.providerId} is in the provider deny list.`,
    });
  }

  if (
    policy.privacy !== undefined &&
    !capability.dataPolicy.privacy.includes(policy.privacy)
  ) {
    reasons.push({
      code: "privacy-unsupported",
      message: `${capability.modelId} does not satisfy ${policy.privacy} privacy.`,
    });
  }

  if (policy.noLogging === true && capability.dataPolicy.supportsNoLogging !== true) {
    reasons.push({
      code: "no-logging-unsupported",
      message: `${capability.modelId} cannot satisfy noLogging.`,
    });
  }

  if (
    policy.noUpload === true &&
    capability.fileTransport.length > 0 &&
    capability.fileTransport.every((transport) => transport === "provider-upload")
  ) {
    reasons.push({
      code: "no-upload-violated",
      message: `${capability.modelId} requires an upload transport disallowed by policy.`,
    });
  }

  if (policy.latency !== undefined && capability.latency !== policy.latency) {
    reasons.push({
      code: "latency-class-mismatch",
      message: `${capability.modelId} latency class is ${capability.latency}, not ${policy.latency}.`,
    });
  }

  if (
    policy.maxCostUsd !== undefined &&
    estimates.costUsd !== undefined &&
    estimates.costUsd > policy.maxCostUsd
  ) {
    reasons.push({
      code: "budget-exceeded",
      message: `${capability.modelId} estimated cost ${estimates.costUsd} exceeds maxCostUsd ${policy.maxCostUsd}.`,
    });
  }
}

function estimateRoute(
  capability: ModelCapability,
  inputTokens: number,
): RouteEstimates {
  const outputTokens = 512;
  const inputCost =
    capability.pricing?.inputCostPer1M === undefined
      ? undefined
      : (inputTokens / 1_000_000) * capability.pricing.inputCostPer1M;
  const outputCost =
    capability.pricing?.outputCostPer1M === undefined
      ? undefined
      : (outputTokens / 1_000_000) * capability.pricing.outputCostPer1M;

  return {
    inputTokens,
    outputTokens,
    ...(inputCost !== undefined || outputCost !== undefined
      ? { costUsd: (inputCost ?? 0) + (outputCost ?? 0) }
      : {}),
    latencyMs: capability.latency === "interactive" ? 1_000 : 10_000,
  };
}

function scoreCapability(
  capability: ModelCapability,
  estimates: RouteEstimates,
  index: number,
): number {
  const costScore = Math.round((estimates.costUsd ?? 0) * 1_000_000);
  const latencyScore = capability.latency === "interactive" ? 0 : 100_000;
  const contextHeadroom = Math.max(0, capability.contextWindow - estimates.inputTokens);
  const contextScore = Math.max(0, 10_000 - Math.min(contextHeadroom, 10_000));

  return costScore + latencyScore + contextScore + index;
}

function compareCandidates(left: RouteCandidate, right: RouteCandidate): number {
  if (left.accepted !== right.accepted) {
    return left.accepted ? -1 : 1;
  }

  if (left.score !== right.score) {
    return left.score - right.score;
  }

  const provider = left.providerId.localeCompare(right.providerId);

  return provider === 0 ? left.modelId.localeCompare(right.modelId) : provider;
}

function requiredInputModalities(
  artifacts: readonly ArtifactInput[],
): readonly CapabilityModality[] {
  const modalities = new Set<CapabilityModality>(["text"]);

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case "text":
        modalities.add("text");
        break;
      case "json":
        modalities.add("json");
        break;
      case "image":
        modalities.add("image");
        break;
      case "audio":
        modalities.add("audio");
        break;
      case "video":
        modalities.add("video");
        break;
      case "document":
        modalities.add("document");
        break;
      case "url":
        modalities.add("url");
        break;
      case "tool-result":
        modalities.add("tool");
        break;
      case "file":
        modalities.add("file");
        break;
    }
  }

  return [...modalities];
}

function requiredOutputModalities(
  outputs: OutputContractMap,
): readonly CapabilityModality[] {
  const modalities = new Set<CapabilityModality>();

  for (const contract of Object.values(outputs)) {
    if (contract === "text") {
      modalities.add("text");
      continue;
    }

    if (isStructuredContract(contract)) {
      modalities.add("json");
      continue;
    }

    if (isReferenceContract(contract)) {
      modalities.add("json");
    }
  }

  return [...modalities];
}

function outputRequiresStructuredOutput(outputs: OutputContractMap): boolean {
  return Object.values(outputs).some(isStructuredContract);
}

function isStructuredContract(contract: OutputContract): boolean {
  return (
    typeof contract === "object" &&
    contract !== null &&
    "~standard" in contract
  );
}

function isReferenceContract(contract: OutputContract): boolean {
  return (
    typeof contract === "object" &&
    contract !== null &&
    "kind" in contract &&
    (contract.kind === "citations" || contract.kind === "artifacts")
  );
}

function summarizeNoRouteReasons(
  candidates: readonly RouteCandidate[],
): readonly RouteRejectReason[] {
  if (candidates.length === 0) {
    return [
      {
        code: "catalog-empty",
        message: "No provider capabilities are configured.",
      },
    ];
  }

  const unique = new Map<string, RouteRejectReason>();

  for (const candidate of candidates) {
    for (const reason of candidate.reasons) {
      unique.set(reason.code, reason);
    }
  }

  return [...unique.values()];
}
