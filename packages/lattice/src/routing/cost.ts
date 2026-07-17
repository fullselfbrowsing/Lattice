import type { ProviderPricingHint } from "../providers/provider.js";

export const COST_ESTIMATOR_VERSION = "lattice-cost/v1" as const;
export const CANONICAL_PROJECTED_OUTPUT_TOKENS = 512;

export type CostEstimateStatus = "known" | "unknown";

export type CostPricingSource =
  | "per-1k"
  | "legacy-per-1m"
  | "missing";

export type CostUnknownReason =
  | "invalid-token-count"
  | "invalid-rate"
  | "missing-rate"
  | "non-finite-cost"
  | "non-finite-total";

export interface CostDimensionEstimate {
  readonly status: CostEstimateStatus;
  readonly tokenCount: number | null;
  readonly ratePer1kUsd: number | null;
  readonly costUsd: number | null;
  readonly source: CostPricingSource;
  readonly unknownReason: CostUnknownReason | null;
}

export interface CostEstimate {
  readonly version: typeof COST_ESTIMATOR_VERSION;
  readonly status: CostEstimateStatus;
  readonly input: CostDimensionEstimate;
  readonly output: CostDimensionEstimate;
  readonly totalCostUsd: number | null;
  readonly unknownReasons: readonly CostUnknownReason[];
}

export interface EstimateCostInput {
  readonly pricing?: ProviderPricingHint;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

interface SelectedRate {
  readonly value: number | undefined;
  readonly source: CostPricingSource;
  readonly divisor: 1 | 1000;
}

export function estimateCost(input: EstimateCostInput): CostEstimate {
  const inputEstimate = estimateDimension(
    input.inputTokens,
    selectRate(input.pricing, "input"),
  );
  const outputEstimate = estimateDimension(
    input.outputTokens,
    selectRate(input.pricing, "output"),
  );
  const unknownReasons = collectUnknownReasons(inputEstimate, outputEstimate);

  if (inputEstimate.status === "unknown" || outputEstimate.status === "unknown") {
    return {
      version: COST_ESTIMATOR_VERSION,
      status: "unknown",
      input: inputEstimate,
      output: outputEstimate,
      totalCostUsd: null,
      unknownReasons,
    };
  }

  const totalCostUsd = inputEstimate.costUsd! + outputEstimate.costUsd!;
  if (!Number.isFinite(totalCostUsd)) {
    return {
      version: COST_ESTIMATOR_VERSION,
      status: "unknown",
      input: inputEstimate,
      output: outputEstimate,
      totalCostUsd: null,
      unknownReasons: [...unknownReasons, "non-finite-total"],
    };
  }

  return {
    version: COST_ESTIMATOR_VERSION,
    status: "known",
    input: inputEstimate,
    output: outputEstimate,
    totalCostUsd,
    unknownReasons,
  };
}

function selectRate(
  pricing: ProviderPricingHint | undefined,
  side: "input" | "output",
): SelectedRate {
  const modern =
    side === "input"
      ? pricing?.inputPer1kTokens
      : pricing?.outputPer1kTokens;
  if (modern !== undefined) {
    return { value: modern, source: "per-1k", divisor: 1 };
  }

  const legacy =
    side === "input"
      ? pricing?.inputCostPer1M
      : pricing?.outputCostPer1M;
  if (legacy !== undefined) {
    return { value: legacy, source: "legacy-per-1m", divisor: 1000 };
  }

  return { value: undefined, source: "missing", divisor: 1 };
}

function estimateDimension(
  tokenCount: number,
  selected: SelectedRate,
): CostDimensionEstimate {
  if (!isFiniteNonnegative(tokenCount)) {
    return unknownDimension(
      null,
      normalizedRate(selected),
      selected.source,
      "invalid-token-count",
    );
  }

  if (selected.value === undefined) {
    if (tokenCount === 0) {
      return knownDimension(tokenCount, null, 0, selected.source);
    }
    return unknownDimension(
      tokenCount,
      null,
      selected.source,
      "missing-rate",
    );
  }

  if (!isFiniteNonnegative(selected.value)) {
    return unknownDimension(
      tokenCount,
      null,
      selected.source,
      "invalid-rate",
    );
  }

  const ratePer1kUsd = selected.value / selected.divisor;
  if (!isFiniteNonnegative(ratePer1kUsd)) {
    return unknownDimension(
      tokenCount,
      null,
      selected.source,
      "invalid-rate",
    );
  }

  const costUsd = (ratePer1kUsd * tokenCount) / 1000;
  if (!isFiniteNonnegative(costUsd)) {
    return unknownDimension(
      tokenCount,
      ratePer1kUsd,
      selected.source,
      "non-finite-cost",
    );
  }

  return knownDimension(
    tokenCount,
    ratePer1kUsd,
    costUsd,
    selected.source,
  );
}

function normalizedRate(selected: SelectedRate): number | null {
  if (selected.value === undefined || !isFiniteNonnegative(selected.value)) {
    return null;
  }
  const normalized = selected.value / selected.divisor;
  return isFiniteNonnegative(normalized) ? normalized : null;
}

function knownDimension(
  tokenCount: number,
  ratePer1kUsd: number | null,
  costUsd: number,
  source: CostPricingSource,
): CostDimensionEstimate {
  return {
    status: "known",
    tokenCount,
    ratePer1kUsd,
    costUsd,
    source,
    unknownReason: null,
  };
}

function unknownDimension(
  tokenCount: number | null,
  ratePer1kUsd: number | null,
  source: CostPricingSource,
  unknownReason: CostUnknownReason,
): CostDimensionEstimate {
  return {
    status: "unknown",
    tokenCount,
    ratePer1kUsd,
    costUsd: null,
    source,
    unknownReason,
  };
}

function collectUnknownReasons(
  input: CostDimensionEstimate,
  output: CostDimensionEstimate,
): readonly CostUnknownReason[] {
  const reasons = new Set<CostUnknownReason>();
  if (input.unknownReason !== null) reasons.add(input.unknownReason);
  if (output.unknownReason !== null) reasons.add(output.unknownReason);
  return [...reasons];
}

function isFiniteNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
