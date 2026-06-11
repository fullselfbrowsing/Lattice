export { artifact } from "./artifacts/artifact.js";
export { BAND, createHookPipeline, type HookPipeline, type HookLifecycleEvent } from "./contract/bands.js";
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
// Agent runtime (v1.2 Phase 19) — single-agent execution loop.
export { runAgent } from "./agent/runtime.js";
export {
  formatToolsForProvider,
  parseToolUseEnvelope,
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
// Agent crew surface (v1.3 Phase 39) — opt-in parent/child delegation
// composed over AgentSpec values. The internal dispatch seam and
// CrewDispatcher stay private.
export { defineAgent } from "./agent/crew/agent-spec.js";
export type { AgentSpec } from "./agent/crew/agent-spec.js";
export type { CrewPolicy, CrewRateLimitOverride } from "./agent/crew/crew-policy.js";
export { runAgentCrew } from "./agent/crew/run-crew.js";
export type {
  CrewAgentResult,
  CrewResult,
  RunAgentCrewOptions,
} from "./agent/crew/run-crew.js";
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
export {
  createRateLimitGroup,
  withRateLimit,
} from "./agent/infra/rate-limit-group.js";
export type {
  RateLimitGroup,
  RateLimitGroupOptions,
  RateLimitLease,
} from "./agent/infra/rate-limit-group.js";
export { receiptCid } from "./receipts/cid.js";
// Agent eval helper (v1.2 Phase 22).
export { evalAgentRun } from "./agent/eval.js";
export type {
  AgentEvalResult,
  AgentRunSnapshot,
  EvalOptions,
  EvalRegression,
  EvalRegressionKind,
} from "./agent/eval.js";
export { createAI } from "./runtime/create-ai.js";
export { createNoopSurvivabilityAdapter } from "./runtime/survivability.js";
export { createMemorySessionStore } from "./sessions/session.js";
export { createLocalArtifactStore } from "./storage/local.js";
export { createMemoryArtifactStore } from "./storage/memory.js";
export { defineTool, importMcpTools, runTool, toolArtifactRef } from "./tools/tools.js";
export { ToolCallValidationError } from "./tools/tool-call-validation.js";
export type {
  ToolCallValidationFailureReason,
  ValidateToolCallsOption,
  ValidatedToolCall,
} from "./tools/tool-call-validation.js";
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
  RunEvent,
  RunEventKind,
  RunEventSink,
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

// Phase 33 — Model Capability Registry (CAPS-01 / CAPS-02)
// Typed capability profile + 6 closed string-literal unions describing how
// each model class misbehaves and which prompt strategy it wants. Sibling
// to the v1.0 `ModelCapability` modality/cost surface — they answer
// orthogonal questions. Plan 33-04 will populate the static + generated
// registries; the lookup surface (CAPS-02) is wired below.
export type {
  CapabilityAdapter,
  KnownFailureMode,
  ModelCapabilityProfile,
  ReasoningSurface,
  RecommendedPromptStrategy,
  ToolCallSurface,
  TrainingClass,
} from "./capabilities/index.js";
export {
  ALL_KNOWN_FAILURE_MODES,
  ALL_TRAINING_CLASSES,
  findCapabilityProfile,
  getCapabilityProfile,
  stripOpenRouterVariant,
} from "./capabilities/index.js";

// Phase 34 — Adapter Quirk Flags + Capability Negotiation API
// SanitizerKey dispatch keys + recommendation table (D-13/D-14/D-15/D-16)
export type { SanitizerKey } from "./capabilities/index.js";
export {
  SANITIZER_BY_FAILURE_MODE,
  getRecommendedSanitizers,
} from "./capabilities/index.js";
// Phase 34 — NegotiatedCapabilities + NegotiationAuthError + helpers (D-02/D-04)
export type { NegotiatedCapabilities } from "./capabilities/index.js";
export {
  NegotiationAuthError,
  negotiateCapabilities,
  synthesizeNegotiatedCapabilitiesFromRegistry,
} from "./capabilities/index.js";
// Phase 34 — AdapterQuirks base + 7 per-adapter narrowed sub-interfaces (D-03)
export type {
  AdapterQuirks,
  AnthropicQuirks,
  GeminiQuirks,
  LmStudioQuirks,
  OpenAICompatQuirks,
  OpenAIQuirks,
  OpenRouterQuirks,
  XaiQuirks,
} from "./providers/quirks.js";

// Phase 35 — Prompt scaffold helpers (SCAFF-01 / SCAFF-02 / SCAFF-03)
// Strategy-specific prompt fragments for structured-output and tool-use
// contracts. These helpers consume the Phase 33 RecommendedPromptStrategy
// enum and render deterministic canonical JSON payloads for prompt assembly.
export {
  PROMPT_SCAFFOLD_VERSION,
  PROMPT_STRATEGIES,
  getStructuredOutputContract,
  getToolUseContract,
} from "./prompts/index.js";

// Phase 36 — Output Sanitizer Hook (SANITIZE-02 / SANITIZE-03)
// Opt-in output cleanup helpers for provider adapters and consumers handling
// model-family-specific output-shape leaks.
export {
  stripChatTemplateArtifacts,
  stripReasoningTags,
  unwrapInternalEnvelope,
} from "./sanitizers/index.js";
export type {
  InternalEnvelopeOptions,
  SanitizeOutputOption,
  SanitizerContext,
  SanitizerFn,
} from "./sanitizers/index.js";
