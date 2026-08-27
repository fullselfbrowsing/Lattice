export {
  DEFAULT_CATALOG_VERSION,
  createCapabilityCatalog,
  defaultCapabilityForProvider,
  effectivePer1kPricing,
  modalRank,
} from "./routing/catalog.js";
export type { CapabilityCatalog } from "./routing/catalog.js";
export {
  CANONICAL_PROJECTED_OUTPUT_TOKENS,
  COST_ESTIMATOR_VERSION,
  estimateCost,
} from "./routing/cost.js";
export type {
  CostDimensionEstimate,
  CostEstimate,
  CostEstimateStatus,
  CostPricingSource,
  CostUnknownReason,
  EstimateCostInput,
} from "./routing/cost.js";
export { routeDeterministically } from "./routing/router.js";
export type { RouteRequest } from "./routing/router.js";
export { mergePolicy } from "./policy/policy.js";
export type {
  GatewayMetadataValue,
  GatewayPolicy,
  PolicySpec,
} from "./policy/policy.js";
export {
  estimateRouteCost,
  evaluateContractAgainstRoute,
} from "./contract/preflight.js";
export type {
  ContractPreflightResult,
  EstimateRouteCostInput,
  EvaluateContractInput,
} from "./contract/preflight.js";
export type {
  ExecutionPlan,
  FallbackRoute,
  ProviderAttemptRecord,
  ProviderPackagingPlan,
  RouteCandidate,
  RouteDecision,
  RouteEstimates,
  RouteRejectReason,
  SelectedRoute,
  UsageRecord,
} from "./plan/plan.js";
export {
  NegotiationAuthError,
  negotiateCapabilities,
  synthesizeNegotiatedCapabilitiesFromRegistry,
} from "./capabilities/index.js";
export type { NegotiatedCapabilities } from "./capabilities/index.js";
export {
  findCapabilityProfile,
  getCapabilityProfile,
  stripOpenRouterVariant,
} from "./capabilities/index.js";
export type {
  CapabilityAdapter,
  ModelCapabilityProfile,
  TrainingClass,
} from "./capabilities/index.js";
