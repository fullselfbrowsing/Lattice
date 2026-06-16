import { describe, expect, it } from "vitest";

import {
  collectStream,
  contract,
  createAI,
  createInMemorySigner,
  createLangfuseOtlpConfig,
  createLiteLLMProvider,
  createMemoryKeySet,
  createOpenRouterProvider,
  createOtelRunEventSink,
  createPhoenixOtlpConfig,
  createRealtimeCheckpointContext,
  createRemoteReceiptSigner,
  evaluateTripwires,
  generateEd25519KeyPairJwk,
  inv,
  isTerminal,
  materializeReplayEnvelope,
  PROMPT_SCAFFOLD_VERSION,
  PROMPT_STRATEGIES,
  REALTIME_DIRECTION_SUPPORT_LEVEL,
  getStructuredOutputContract,
  getToolUseContract,
  realtimeStepName,
  sanitizeRunEventAttributes,
  stripChatTemplateArtifacts,
  stripOpenRouterVariant,
  stripReasoningTags,
  ToolCallValidationError,
  unwrapInternalEnvelope,
  verifyReceipt,
} from "../src/index.js";
import { createFakeProvider } from "../src/providers/fake.js";
import type {
  BudgetInvariant,
  CapabilityContract,
  CapabilityReceiptBody,
  ContractRejectReasonCode,
  ContractVerdict,
  FieldFromTableInvariant,
  InvariantDeclaration,
  KeyEntry,
  KeySet,
  KeyState,
  MatchesInvariant,
  MaterializationError,
  MustCiteInvariant,
  NoPiiInvariant,
  QualityFloorInvariant,
  ReceiptEnvelope,
  ReceiptSigner,
  RemoteReceiptSignRequest,
  RemoteReceiptSignerOptions,
  ReplayEnvelope,
  OtelTracerLike,
  TrainingClass,
  TripwireEvidence,
  TripwireResult,
  TripwireViolationError,
  Usage,
  VerifyError,
  VerifyResult,
} from "../src/index.js";

const EXPECTED_PUBLIC_VALUE_EXPORTS = [
  "ALL_KNOWN_FAILURE_MODES",
  "ALL_TRAINING_CLASSES",
  "AgentDeniedError",
  "BAND",
  "DEFAULT_CHECKPOINT_BAND",
  "NegotiationAuthError",
  "PROMPT_SCAFFOLD_VERSION",
  "PROMPT_STRATEGIES",
  "REALTIME_DIRECTION_SUPPORT_LEVEL",
  "SANITIZER_BY_FAILURE_MODE",
  "STEP_TRANSITION_EVENT_NAME",
  "STUCK_REASONS",
  "ToolCallValidationError",
  "artifact",
  "collectStream",
  "contract",
  "createAI",
  "createAISdkProvider",
  "createActionHistory",
  "createAnthropicProvider",
  "createCheckpointHook",
  "createCostTracker",
  "createFakeProvider",
  "createGeminiProvider",
  "createGoalProgressTracker",
  "createHookPipeline",
  "createInMemorySigner",
  "createLangfuseOtlpConfig",
  "createLiteLLMProvider",
  "createLmStudioProvider",
  "createLocalArtifactStore",
  "createMemoryArtifactStore",
  "createMemoryKeySet",
  "createMemorySessionStore",
  "createNoopAgentHost",
  "createNoopSurvivabilityAdapter",
  "createOpenAICompatibleProvider",
  "createOpenAIProvider",
  "createOpenRouterProvider",
  "createOtelReceiptAttributes",
  "createOtelRunEventSink",
  "createPermissionContext",
  "createPermissionGuardHook",
  "createPhoenixOtlpConfig",
  "createRateLimitGroup",
  "createRealtimeCheckpointContext",
  "createRealtimeReceiptDescriptors",
  "createReceipt",
  "createRemoteReceiptSigner",
  "createReplayEnvelope",
  "createTranscriptStore",
  "createXaiProvider",
  "defaultPiiDetectors",
  "defineAgent",
  "defineTool",
  "estimateRouteCost",
  "evalAgentRun",
  "evaluateContractAgainstRoute",
  "evaluateTripwires",
  "findCapabilityProfile",
  "formatToolsForProvider",
  "generateEd25519KeyPairJwk",
  "getCapabilityProfile",
  "getRecommendedSanitizers",
  "getStructuredOutputContract",
  "getToolUseContract",
  "importMcpTools",
  "inv",
  "isTerminal",
  "latticeVersion",
  "materializeReplayEnvelope",
  "negotiateCapabilities",
  "output",
  "parseToolUseEnvelope",
  "permissionGuardRegisterOptions",
  "realtimeStepName",
  "receiptCid",
  "redactArtifactRef",
  "redactPlan",
  "redactReplayEnvelope",
  "replayOffline",
  "rerunLive",
  "runAgent",
  "runAgentCrew",
  "runTool",
  "sanitizeRunEventAttributes",
  "stripChatTemplateArtifacts",
  "stripOpenRouterVariant",
  "stripReasoningTags",
  "synthesizeNegotiatedCapabilitiesFromRegistry",
  "toolArtifactRef",
  "toolSchemaToJsonSchema",
  "unwrapInternalEnvelope",
  "verifyReceipt",
  "withRateLimit",
] as const;

describe("public-surface inventory", () => {
  it("exports exactly the intentional package-root runtime values", async () => {
    const mod = await import("../src/index.js");
    expect(Object.keys(mod).sort()).toEqual([...EXPECTED_PUBLIC_VALUE_EXPORTS]);
    expect("default" in mod).toBe(false);
  });
});

describe("Phase 41 public surface", () => {
  it("exports createLiteLLMProvider as a first-class helper", () => {
    expect(typeof createLiteLLMProvider).toBe("function");
  });
});

describe("Phase 42 public surface", () => {
  it("preserves OpenRouter runtime exports while catalog metadata remains type-only", () => {
    expect(typeof createOpenRouterProvider).toBe("function");
    expect(stripOpenRouterVariant("openai/gpt-oss-120b:free")).toBe("openai/gpt-oss-120b");
  });
});

describe("Phase 43 public surface", () => {
  it("exports collectStream as the streaming collection helper", () => {
    expect(typeof collectStream).toBe("function");
  });
});

describe("Phase 45 public surface", () => {
  it("exports realtime direction helpers without socket side effects", () => {
    expect(REALTIME_DIRECTION_SUPPORT_LEVEL).toBe("direction-only");
    expect(realtimeStepName("openai-realtime", "session.start")).toBe(
      "realtime.openai-realtime.session.start",
    );
    expect(createRealtimeCheckpointContext({
      sessionId: "rt-session",
      provider: "openai-realtime",
      checkpoint: "session.start",
      stepIndex: 0,
      timestamp: "2026-06-16T00:00:00.000Z",
    })).toMatchObject({
      stepName: "realtime.openai-realtime.session.start",
      stepIndex: 0,
    });
  });
});

describe("Phase 47 public surface", () => {
  it("exports OTel sink and OTLP config helpers without SDK side effects", () => {
    const tracer: OtelTracerLike = {
      startSpan() {
        return {};
      },
    };
    expect(typeof createOtelRunEventSink({ tracer })).toBe("function");
    expect(createLangfuseOtlpConfig().endpoint).toBe(
      "https://cloud.langfuse.com/api/public/otel/v1/traces",
    );
    expect(createPhoenixOtlpConfig().endpoint).toBe(
      "http://localhost:6006/v1/traces",
    );
    expect(sanitizeRunEventAttributes({
      kind: "run.start",
      timestamp: "2026-06-16T00:00:00.000Z",
      runId: "run:public",
    })).toMatchObject({
      "lattice.run.id": "run:public",
    });
  });
});

describe("Phase 7 public surface", () => {
  it("contract is exported as a function from the package root", () => {
    expect(typeof contract).toBe("function");
  });

  it("contract() returns a capability-contract object", () => {
    const c: CapabilityContract = contract({ budget: { maxCostUsd: 0.5 } });
    expect(c.kind).toBe("capability-contract");
    expect(c.budget?.maxCostUsd).toBe(0.5);
  });

  it("createAI accepts a RunIntent with a contract field (type compile check)", () => {
    const ai = createAI({});
    const intent = {
      task: "ping",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    };
    expect(typeof ai.run).toBe("function");
    void intent;
  });

  it("type-only: BudgetInvariant, QualityFloorInvariant, InvariantDeclaration, ContractRejectReasonCode, Usage are exported", () => {
    const b: BudgetInvariant = {};
    const q: QualityFloorInvariant = { suite: "fixtures/x", minScore: 0.5 };
    // Phase 8 reshape: InvariantDeclaration is a discriminated union over
    // four kinds (must-cite | field-from-table | no-pii | matches).
    const invDecl: InvariantDeclaration = { id: "x", kind: "must-cite", artifactName: "doc-1" };
    const code: ContractRejectReasonCode = "contract-budget-exceeded";
    const usage: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };
    expect([b, q, invDecl, code, usage]).toHaveLength(5);
  });
});

describe("Phase 8 public surface", () => {
  it("exports inv as a function-bag with the four builder helpers", () => {
    expect(typeof inv.mustCite).toBe("function");
    expect(typeof inv.fieldFromTable).toBe("function");
    expect(typeof inv.noPII).toBe("function");
    expect(typeof inv.matches).toBe("function");
  });

  it("inv.mustCite returns an InvariantDeclaration with the must-cite shape", () => {
    inv.__resetCounterForTests();
    const decl = inv.mustCite("artifact-1");
    expect(decl.kind).toBe("must-cite");
    expect(typeof decl.id).toBe("string");
    expect(decl.id.length).toBeGreaterThan(0);
    expect(decl.artifactName).toBe("artifact-1");
  });

  it("exports evaluateTripwires as an async function returning a TripwireResult", async () => {
    const result = await evaluateTripwires({ foo: "bar" }, []);
    expect(result.ok).toBe(true);
  });

  it("exports isTerminal predicate with the right truth table", () => {
    expect(
      isTerminal({
        kind: "tripwire-violated",
        message: "x",
        invariantId: "id",
        evidence: {
          invariantId: "id",
          kind: "must-cite",
          path: "citations",
          observed: [],
          message: "x",
        },
        terminal: true,
      }),
    ).toBe(true);
    expect(
      isTerminal({
        kind: "no-contract-match",
        message: "x",
        noRouteReasons: [],
      }),
    ).toBe(true);
    expect(
      isTerminal({
        kind: "validation",
        message: "x",
        issues: [],
      }),
    ).toBe(false);
  });

  it("type-only: Phase 8 invariant variant types are exported", () => {
    const mc: MustCiteInvariant = { id: "1", kind: "must-cite", artifactName: "a" };
    const ff: FieldFromTableInvariant = {
      id: "2",
      kind: "field-from-table",
      path: "action.kind",
      allowedValues: ["create"],
    };
    const np: NoPiiInvariant = { id: "3", kind: "no-pii", path: "text" };
    const mt: MatchesInvariant = {
      id: "4",
      kind: "matches",
      path: "payload",
      schema: {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (v: unknown) => ({ value: v }),
        },
      },
    };
    expect([mc.kind, ff.kind, np.kind, mt.kind]).toEqual([
      "must-cite",
      "field-from-table",
      "no-pii",
      "matches",
    ]);
  });

  it("type-only: TripwireEvidence, TripwireResult, TripwireViolationError are exported", () => {
    const evidence: TripwireEvidence = {
      invariantId: "id",
      kind: "no-pii",
      path: "text",
      observed: { detector: "email", substring: "a@b.co" },
      message: "PII detected",
    };
    const okResult: TripwireResult = { ok: true };
    const failResult: TripwireResult = { ok: false, evidence };
    const err: TripwireViolationError = {
      kind: "tripwire-violated",
      message: "",
      invariantId: "id",
      evidence,
      terminal: true,
    };
    expect(err.terminal).toBe(true);
    expect(okResult.ok).toBe(true);
    expect(failResult.ok).toBe(false);
  });

  it("createAI accepts a contract with invariants built via inv (compile + run)", async () => {
    inv.__resetCounterForTests();
    const ai = createAI({});
    const c: CapabilityContract = contract({
      invariants: [inv.fieldFromTable("action.kind", ["create"])],
    });
    expect(c.invariants).toHaveLength(1);
    expect(c.invariants?.[0]?.kind).toBe("field-from-table");
    expect(typeof ai.run).toBe("function");
  });
});

describe("Phase 9 public surface", () => {
  it("verifyReceipt, createInMemorySigner, createMemoryKeySet, generateEd25519KeyPairJwk are exported as functions", () => {
    expect(typeof verifyReceipt).toBe("function");
    expect(typeof createInMemorySigner).toBe("function");
    expect(typeof createMemoryKeySet).toBe("function");
    expect(typeof generateEd25519KeyPairJwk).toBe("function");
  });

  it("createInMemorySigner returns a ReceiptSigner shape", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer: ReceiptSigner = createInMemorySigner(privateKeyJwk, {
      kid: "x",
      publicKeyJwk,
    });
    expect(signer.kid).toBe("x");
    expect(typeof signer.sign).toBe("function");
    expect(typeof signer.publicKeyJwk).toBe("object");
    expect((signer.publicKeyJwk as { kty?: string }).kty).toBe("OKP");
  });

  it("createRemoteReceiptSigner returns a ReceiptSigner shape", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const delegate = createInMemorySigner(privateKeyJwk, {
      kid: "remote-public",
      publicKeyJwk,
    });
    const signer: ReceiptSigner = createRemoteReceiptSigner({
      kid: "remote-public",
      publicKeyJwk,
      provider: "external-kms",
      sign: (request) => delegate.sign(request.bytes),
    });
    expect(signer.kid).toBe("remote-public");
    expect(typeof signer.sign).toBe("function");
    expect(signer.publicKeyJwk).toBe(publicKeyJwk);
  });

  it("createMemoryKeySet returns a KeySet with lookup", async () => {
    const { publicKeyJwk } = await generateEd25519KeyPairJwk();
    const entry: KeyEntry = {
      kid: "test-kid",
      publicKeyJwk,
      state: "active",
    };
    const keySet: KeySet = createMemoryKeySet([entry]);
    expect(keySet.lookup("test-kid")).toBeDefined();
    expect(keySet.lookup("unknown")).toBeUndefined();
  });

  it("createReceipt IS exported from the public surface (Phase 1 re-export)", async () => {
    // Phase 1 commit ab6c1f6 (FSB v0.10.0-attempt-2) deliberately re-exported
    // createReceipt + CreateReceiptInput from src/index.ts so the FSB
    // integration smoke (tests/lattice-smoke.test.js) can mint receipts via
    // the public package surface. Prior to that commit, callers had to reach
    // into internal paths; the re-export collapses the gap. This test asserts
    // the re-export holds.
    const mod = (await import("../src/index.js")) as Record<string, unknown>;
    expect("createReceipt" in mod).toBe(true);
    expect(typeof mod.createReceipt).toBe("function");
  });

  it("end-to-end public-surface integration — createAI + signer + verifyReceipt", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "k1",
      publicKeyJwk,
    });
    const ai = createAI({ providers: [createFakeProvider()], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    expect(result.receipt).toBeDefined();
    const keySet = createMemoryKeySet([
      { kid: "k1", publicKeyJwk, state: "active" },
    ]);
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
  });

  it("type-only: Phase 9 types compile and are reachable from the consumer-visible path", () => {
    const _body: CapabilityReceiptBody | undefined = undefined;
    const _class: TrainingClass | undefined = undefined;
    const _bodyModelClass: CapabilityReceiptBody["modelClass"] | undefined =
      _class;
    const _envelope: ReceiptEnvelope | undefined = undefined;
    const _signer: ReceiptSigner | undefined = undefined;
    const _remoteRequest: RemoteReceiptSignRequest | undefined = undefined;
    const _remoteOptions: RemoteReceiptSignerOptions | undefined = undefined;
    const _keyState: KeyState | undefined = undefined;
    const _verifyResult: VerifyResult | undefined = undefined;
    const _verifyError: VerifyError | undefined = undefined;
    const _verdict: ContractVerdict | undefined = undefined;
    // touch to silence unused-var lint
    void _body;
    void _bodyModelClass;
    void _envelope;
    void _signer;
    void _remoteRequest;
    void _remoteOptions;
    void _keyState;
    void _verifyResult;
    void _verifyError;
    void _verdict;
    expect(true).toBe(true);
  });
});

describe("Phase 10 public surface", () => {
  it("materializeReplayEnvelope is exported as a function", () => {
    expect(typeof materializeReplayEnvelope).toBe("function");
  });

  it("type-only: MaterializationError discriminated union compiles", () => {
    const verifyFailed: MaterializationError = {
      kind: "verify-failed",
      message: "x",
    };
    const loadFailed: MaterializationError = {
      kind: "artifact-load-failed",
      message: "x",
    };
    const malformed: MaterializationError = {
      kind: "envelope-malformed",
      message: "x",
    };
    expect([verifyFailed.kind, loadFailed.kind, malformed.kind]).toEqual([
      "verify-failed",
      "artifact-load-failed",
      "envelope-malformed",
    ]);
  });

  it("type-only: ReplayEnvelope carries optional receipt and contract fields", () => {
    const _env: ReplayEnvelope | undefined = undefined;
    void _env;
    expect(true).toBe(true);
  });
});

describe("public-surface — Phase 19 agent runtime", () => {
  it("re-exports runAgent + formatToolsForProvider + AgentDeniedError as values", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.runAgent).toBe("function");
    expect(typeof mod.formatToolsForProvider).toBe("function");
    expect(typeof mod.toolSchemaToJsonSchema).toBe("function");
    expect(typeof mod.AgentDeniedError).toBe("function");
    expect(new mod.AgentDeniedError("x", 0).name).toBe("AgentDeniedError");
  });

  it("type-only: AgentIntent / AgentResult / AgentSuccess / AgentFailure / IterationRecord / ToolUseRequest are exported", async () => {
    // Imports go through src/index.ts to assert reachability; the values are
    // never executed.
    type _AgentIntent = import("../src/index.js").AgentIntent;
    type _AgentResult = import("../src/index.js").AgentResult;
    type _AgentSuccess = import("../src/index.js").AgentSuccess;
    type _AgentFailure = import("../src/index.js").AgentFailure;
    type _AgentFailureKind = import("../src/index.js").AgentFailureKind;
    type _AgentHost = import("../src/index.js").AgentHost;
    type _IterationRecord = import("../src/index.js").IterationRecord;
    type _ToolUseRequest = import("../src/index.js").ToolUseRequest;
    type _ConversationTurn = import("../src/index.js").ConversationTurn;
    type _FormatToolsMode = import("../src/index.js").FormatToolsMode;
    type _FormatToolsOptions = import("../src/index.js").FormatToolsOptions;
    type _FormattedToolsHandle = import("../src/index.js").FormattedToolsHandle;
    type _HookControls = import("../src/index.js").HookControls;
    type _HookDenyDirective = import("../src/index.js").HookDenyDirective;
    // Touch the placeholders so TypeScript treats the imports as used.
    void (null as unknown as
      | _AgentIntent
      | _AgentResult
      | _AgentSuccess
      | _AgentFailure
      | _AgentFailureKind
      | _AgentHost
      | _IterationRecord
      | _ToolUseRequest
      | _ConversationTurn
      | _FormatToolsMode
      | _FormatToolsOptions
      | _FormattedToolsHandle
      | _HookControls
      | _HookDenyDirective);
    expect(true).toBe(true);
  });

  it("createAI() returns a runtime exposing ai.runAgent next to ai.run", () => {
    const ai = createAI();
    expect(typeof ai.runAgent).toBe("function");
    expect(typeof ai.run).toBe("function");
    expect(typeof ai.plan).toBe("function");
    expect(typeof ai.session).toBe("function");
  });
});

describe("public-surface — Phase 20 AgentHost adapter", () => {
  it("re-exports createNoopAgentHost as a value", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.createNoopAgentHost).toBe("function");
    const host = mod.createNoopAgentHost();
    expect(host.kind).toBe("agent-host");
    expect(typeof host.scheduler?.scheduleNext).toBe("function");
    expect(typeof host.transport?.call).toBe("function");
    expect(typeof host.storage?.save).toBe("function");
  });

  it("type-only: AgentScheduler / AgentTransport / AgentStorage / AgentSnapshot are exported", async () => {
    type _AgentScheduler = import("../src/index.js").AgentScheduler;
    type _AgentTransport = import("../src/index.js").AgentTransport;
    type _AgentStorage = import("../src/index.js").AgentStorage;
    type _AgentSnapshot = import("../src/index.js").AgentSnapshot;
    void (null as unknown as
      | _AgentScheduler
      | _AgentTransport
      | _AgentStorage
      | _AgentSnapshot);
    expect(true).toBe(true);
  });
});

describe("public-surface — Phase 21 agent infrastructure primitives", () => {
  it("re-exports the 5 primitive factories + STUCK_REASONS as values", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.createCostTracker).toBe("function");
    expect(typeof mod.createTranscriptStore).toBe("function");
    expect(typeof mod.createGoalProgressTracker).toBe("function");
    expect(typeof mod.createActionHistory).toBe("function");
    expect(typeof mod.createPermissionContext).toBe("function");
    expect(typeof mod.createPermissionGuardHook).toBe("function");
    expect(typeof mod.permissionGuardRegisterOptions).toBe("function");
    expect(Array.isArray(mod.STUCK_REASONS)).toBe(true);
  });

  it("type-only: 14 Phase 21 types are exported", async () => {
    type _CostTracker = import("../src/index.js").CostTracker;
    type _CostBudgetStatus = import("../src/index.js").CostBudgetStatus;
    type _TranscriptStore = import("../src/index.js").TranscriptStore;
    type _TokenEstimator = import("../src/index.js").TokenEstimator;
    type _GoalProgressTracker = import("../src/index.js").GoalProgressTracker;
    type _GoalProgressOptions = import("../src/index.js").GoalProgressOptions;
    type _GoalProgressStep = import("../src/index.js").GoalProgressStep;
    type _ProgressStatus = import("../src/index.js").ProgressStatus;
    type _ActionHistory = import("../src/index.js").ActionHistory;
    type _ActionRecord = import("../src/index.js").ActionRecord;
    type _StuckReason = import("../src/index.js").StuckReason;
    type _PermissionContext = import("../src/index.js").PermissionContext;
    type _PermissionRule = import("../src/index.js").PermissionRule;
    type _PermissionVerdict = import("../src/index.js").PermissionVerdict;
    void (null as unknown as
      | _CostTracker
      | _CostBudgetStatus
      | _TranscriptStore
      | _TokenEstimator
      | _GoalProgressTracker
      | _GoalProgressOptions
      | _GoalProgressStep
      | _ProgressStatus
      | _ActionHistory
      | _ActionRecord
      | _StuckReason
      | _PermissionContext
      | _PermissionRule
      | _PermissionVerdict);
    expect(true).toBe(true);
  });
});

describe("Phase 35 public surface", () => {
  it("re-exports prompt scaffold helpers and constants", () => {
    expect(PROMPT_SCAFFOLD_VERSION).toBe("lattice.prompt-scaffold/v1");
    expect(PROMPT_STRATEGIES).toEqual([
      "frontier",
      "mid_tier",
      "open_weight",
      "reasoning",
      "local",
    ]);
    expect(typeof getStructuredOutputContract).toBe("function");
    expect(typeof getToolUseContract).toBe("function");
  });

  it("renders prompt scaffolds through the package root", () => {
    expect(getStructuredOutputContract("frontier", { type: "object" })).toContain(
      "Purpose: structured-output",
    );
    expect(getToolUseContract("frontier", [])).toContain("Purpose: tool-use");
  });
});

describe("Phase 36 public surface", () => {
  it("re-exports built-in output sanitizer factories", () => {
    expect(typeof stripReasoningTags).toBe("function");
    expect(typeof stripChatTemplateArtifacts).toBe("function");
    expect(typeof unwrapInternalEnvelope).toBe("function");
  });

  it("unwraps the anchor internal envelope through the package root", async () => {
    const sanitize = unwrapInternalEnvelope({ field: "summary" });

    await expect(
      sanitize("{\"summary\":\"Greeted the user.\"}", {
        providerId: "openrouter",
        modelId: "openai/gpt-oss-120b:free",
        outputName: "text",
      }),
    ).resolves.toBe("Greeted the user.");
  });

  it("type-only: Phase 36 sanitizer types are exported", async () => {
    type _SanitizerFn = import("../src/index.js").SanitizerFn;
    type _SanitizerContext = import("../src/index.js").SanitizerContext;
    type _SanitizeOutputOption = import("../src/index.js").SanitizeOutputOption;
    type _InternalEnvelopeOptions = import("../src/index.js").InternalEnvelopeOptions;
    void (null as unknown as
      | _SanitizerFn
      | _SanitizerContext
      | _SanitizeOutputOption
      | _InternalEnvelopeOptions);
    expect(true).toBe(true);
  });
});

describe("Phase 37 public surface", () => {
  it("re-exports ToolCallValidationError from the package root", () => {
    const error = new ToolCallValidationError({
      reason: "unknown_tool",
      toolName: "search_database",
      attemptedArgs: { query: "lattice" },
      requestId: "call-1",
    });

    expect(typeof ToolCallValidationError).toBe("function");
    expect(error.kind).toBe("tool-call-validation");
    expect(error.reason).toBe("unknown_tool");
  });

  it("type-only: Phase 37 tool-call validation types are exported", async () => {
    type _ToolCallValidationFailureReason =
      import("../src/index.js").ToolCallValidationFailureReason;
    type _ValidateToolCallsOption = import("../src/index.js").ValidateToolCallsOption;
    type _ValidatedToolCall = import("../src/index.js").ValidatedToolCall;
    void (null as unknown as
      | _ToolCallValidationFailureReason
      | _ValidateToolCallsOption
      | _ValidatedToolCall);
    expect(true).toBe(true);
  });
});
