export { artifact } from "./artifacts/artifact.js";
export { createHookPipeline, type HookPipeline, type HookLifecycleEvent } from "./contract/bands.js";
export {
  DEFAULT_CHECKPOINT_BAND,
  STEP_TRANSITION_EVENT_NAME,
  createCheckpointHook,
  type CheckpointHookContext,
  type CheckpointHookOptions,
} from "./contract/checkpoint.js";
export { contract } from "./contract/contract.js";
export { inv } from "./contract/invariants.js";
export { defaultPiiDetectors } from "./contract/pii-detectors.js";
export {
  estimateRouteCost,
  evaluateContractAgainstRoute,
} from "./contract/preflight.js";
export { evaluateTripwires } from "./contract/tripwire.js";
export { output } from "./outputs/contracts.js";
export { createMemoryKeySet } from "./receipts/keyset.js";
export {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "./receipts/sign.js";
export { verifyReceipt } from "./receipts/verify.js";
export { createReceipt, type CreateReceiptInput } from "./receipts/receipt.js";
export { isTerminal } from "./results/errors.js";
export {
  createAISdkProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
} from "./providers/adapters.js";
export { createAnthropicProvider } from "./providers/anthropic.js";
export type { AnthropicProviderOptions } from "./providers/anthropic.js";
export { createFakeProvider } from "./providers/fake.js";
export { createGeminiProvider } from "./providers/gemini.js";
export type { GeminiProviderOptions } from "./providers/gemini.js";
export { createLmStudioProvider } from "./providers/lm-studio.js";
export type { LmStudioProviderOptions } from "./providers/lm-studio.js";
export { createOpenRouterProvider } from "./providers/openrouter.js";
export type { OpenRouterProviderOptions } from "./providers/openrouter.js";
export { createXaiProvider } from "./providers/xai.js";
export type { XaiProviderOptions } from "./providers/xai.js";
export { materializeReplayEnvelope } from "./replay/materialize.js";
export {
  createReplayEnvelope,
  redactArtifactRef,
  redactPlan,
  redactReplayEnvelope,
  replayOffline,
  rerunLive,
} from "./replay/replay.js";
// Agent runtime (v1.2 Phase 19) — opens the previously out-of-scope
// Delegation surface as single-agent execution. Multi-agent crews remain
// Out of Scope.
export { runAgent } from "./agent/runtime.js";
export {
  formatToolsForProvider,
  toolSchemaToJsonSchema,
} from "./agent/format-tools.js";
export { AgentDeniedError } from "./agent/types.js";
export type {
  AgentFailure,
  AgentFailureKind,
  AgentHost,
  AgentIntent,
  AgentResult,
  AgentSuccess,
  IterationRecord,
  ToolUseRequest,
} from "./agent/types.js";
export type {
  ConversationTurn,
  FormatToolsMode,
  FormatToolsOptions,
  FormattedToolsHandle,
} from "./agent/format-tools.js";
export type { HookControls, HookDenyDirective } from "./contract/bands.js";
// AgentHost adapter (v1.2 Phase 20) — pluggable scheduler / transport /
// storage seams + recovery markers. Composes with the SurvivabilityAdapter
// shipped in Phase 18 for cross-process resumption.
export { createNoopAgentHost } from "./agent/host.js";
export type {
  AgentScheduler,
  AgentSnapshot,
  AgentStorage,
  AgentTransport,
} from "./agent/host.js";
// Agent infrastructure primitives (v1.2 Phase 21) — small, standalone
// modules for cost tracking, transcript management, stuck detection,
// action-history dedup, and tool-permission gating. Each ships pure
// (no I/O); compose with the agent runtime via hook handlers.
export { createCostTracker } from "./agent/infra/cost-tracker.js";
export type { CostTracker, CostBudgetStatus } from "./agent/infra/cost-tracker.js";
export { createTranscriptStore } from "./agent/infra/transcript-store.js";
export type { TranscriptStore, TokenEstimator } from "./agent/infra/transcript-store.js";
export { createGoalProgressTracker } from "./agent/infra/goal-progress.js";
export type {
  GoalProgressOptions,
  GoalProgressStep,
  GoalProgressTracker,
  ProgressStatus,
} from "./agent/infra/goal-progress.js";
export { createActionHistory, STUCK_REASONS } from "./agent/infra/action-history.js";
export type {
  ActionHistory,
  ActionHistoryOptions,
  ActionRecord,
  StuckReason,
} from "./agent/infra/action-history.js";
export {
  createPermissionContext,
  createPermissionGuardHook,
  permissionGuardRegisterOptions,
} from "./agent/infra/permission-context.js";
export type {
  PermissionContext,
  PermissionDecisionInput,
  PermissionHookContext,
  PermissionRule,
  PermissionVerdict,
} from "./agent/infra/permission-context.js";
export { createAI } from "./runtime/create-ai.js";
export { createNoopSurvivabilityAdapter } from "./runtime/survivability.js";
export { createMemorySessionStore } from "./sessions/session.js";
export { createLocalArtifactStore } from "./storage/local.js";
export { createMemoryArtifactStore } from "./storage/memory.js";
export { defineTool, importMcpTools, runTool, toolArtifactRef } from "./tools/tools.js";
export { latticeVersion } from "./version.js";

export type { AI, RunIntent } from "./runtime/create-ai.js";
export type {
  ArtifactFingerprint,
  ArtifactInput,
  ArtifactKind,
  ArtifactLineage,
  ArtifactOptions,
  ArtifactParentRef,
  ArtifactPrivacy,
  ArtifactRef,
  ArtifactSize,
  ArtifactSource,
  ArtifactStorageRef,
  ArtifactStore,
  ArtifactTransformDescriptor,
  ArtifactTransformKind,
  BudgetInvariant,
  CapabilityContract,
  CapabilityContractInput,
  CapabilityReceiptBody,
  ContractRejectReasonCode,
  ContractVerdict,
  ExecutionPlanStub,
  FieldFromTableInvariant,
  InferOutput,
  InferOutputMap,
  InvariantDeclaration,
  InvariantOptions,
  KeyEntry,
  KeySet,
  KeyState,
  LatticeConfig,
  LatticeRunError,
  MatchesInvariant,
  MaterializationError,
  MaterializeReplayEnvelopeOptions,
  MustCiteInvariant,
  NoPiiInvariant,
  NormalizedLatticeConfig,
  OutputContract,
  OutputContractMap,
  PiiDetector,
  PiiDetectorResult,
  PolicySpec,
  ProviderAdapter,
  ProviderRef,
  ProviderRunRequest,
  ProviderRunResponse,
  QualityFloorInvariant,
  ReceiptEnvelope,
  ReceiptModel,
  ReceiptRedaction,
  ReceiptRoute,
  ReceiptSignature,
  ReceiptSigner,
  ReceiptUsageCanonical,
  ReplayEnvelope,
  RunFailure,
  RunResult,
  RunSuccess,
  SessionRef,
  StorageLike,
  StoredArtifactEnvelope,
  StoredArtifactPayloadDescriptor,
  TracerLike,
  TripwireEvidence,
  TripwireResult,
  TripwireViolationError,
  Usage,
  ValidationIssue,
  VerifyError,
  VerifyErrorKind,
  VerifyFail,
  VerifyOk,
  VerifyResult,
} from "./runtime/public-types.js";

export type {
  EvictionHook,
  ResumePolicy,
  SerializedSnapshot,
  SurvivabilityAdapter,
  UnsubscribeFn,
} from "./runtime/survivability.js";
