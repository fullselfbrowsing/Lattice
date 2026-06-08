// Phase 33 — CAPS-01 type-level tests. Cover:
//   - ModelCapabilityProfile has the right shape (9 readonly fields)
//   - Closed adapter enum rejects unknown values
//   - Exhaustive switch on KnownFailureMode (compile-time enforcement)
//   - TrainingClass and RecommendedPromptStrategy are TWO distinct enums
//   - getCapabilityProfile-shaped function (Plan 02 will land the real one)
//     narrows to ModelCapabilityProfile | undefined
//
// Anchor case study: session_1780792387779 — gpt-oss-120b on FSB
// autopilot emitting `{"summary": "Greeted the user."}` as the user-visible
// reply for the task "hi". The literal below MUST compile as a
// ModelCapabilityProfile with `internal_envelope_leak` in
// `knownFailureModes`; if it does not, the type design is wrong.

import { expectAssignable, expectError, expectType } from "tsd";
import type {
  CapabilityAdapter,
  KnownFailureMode,
  ModelCapabilityProfile,
  ReasoningSurface,
  RecommendedPromptStrategy,
  ToolCallSurface,
  TrainingClass,
} from "@full-self-browsing/lattice";

// CAPS-01 — anchor case study sample (session_1780792387779, gpt-oss-120b).
const sample: ModelCapabilityProfile = {
  id: "openai/gpt-oss-120b",
  adapter: "openrouter",
  originFamily: "openai",
  trainingClass: "open_weight_instruct",
  reasoningSurface: "none",
  toolCallSurface: "native_lenient",
  contextWindow: 131072,
  knownFailureModes: ["internal_envelope_leak"],
  recommendedPromptStrategy: "open_weight",
};

expectType<string>(sample.id);
expectType<CapabilityAdapter>(sample.adapter);
expectType<string>(sample.originFamily);
expectType<TrainingClass>(sample.trainingClass);
expectType<ReasoningSurface>(sample.reasoningSurface);
expectType<ToolCallSurface>(sample.toolCallSurface);
expectType<number>(sample.contextWindow);
expectType<readonly KnownFailureMode[]>(sample.knownFailureModes);
expectType<RecommendedPromptStrategy>(sample.recommendedPromptStrategy);

// CAPS-01 — closed adapter enum: invalid adapter must fail to type-check.
expectError<ModelCapabilityProfile>({
  ...sample,
  adapter: "not-a-real-adapter",
});

// CAPS-01 — closed trainingClass enum: invalid value must fail to type-check.
expectError<ModelCapabilityProfile>({
  ...sample,
  trainingClass: "not-a-real-training-class",
});

// CAPS-01 — Exhaustive switch on KnownFailureMode.
// If any KnownFailureMode value is added to the union without updating
// this switch, TypeScript fails to compile (the `_exhaustive: never` line
// raises an error). Phase 36 sanitizer dispatch enforces the same gate at
// runtime; this test is the type-level mirror.
function assertExhaustive(mode: KnownFailureMode): "covered" {
  switch (mode) {
    case "internal_envelope_leak":
    case "reasoning_tag_leak":
    case "system_prompt_echo":
    case "template_artifact_leak":
    case "hallucinated_tool_name":
    case "malformed_tool_arguments":
    case "premature_termination":
      return "covered";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
expectType<"covered">(assertExhaustive("internal_envelope_leak"));

// CAPS-01 — TrainingClass vs RecommendedPromptStrategy: TWO distinct enums
// (research open question 2). `frontier` is only valid as a
// RecommendedPromptStrategy; `frontier_rlhf` is only valid as a
// TrainingClass. The reverse-cast must fail compile.
declare const aStrategy: RecommendedPromptStrategy;
declare const aClass: TrainingClass;
expectError<TrainingClass>(aStrategy);
expectError<RecommendedPromptStrategy>(aClass);

// CAPS-01 — every TrainingClass + every RecommendedPromptStrategy literal
// is at least assignable to its own type (sanity check that the enums
// were typed as we intended).
expectAssignable<TrainingClass>("frontier_rlhf");
expectAssignable<TrainingClass>("mid_tier_rlhf");
expectAssignable<TrainingClass>("open_weight_instruct");
expectAssignable<TrainingClass>("open_weight_base");
expectAssignable<TrainingClass>("local_quantized");
expectAssignable<RecommendedPromptStrategy>("frontier");
expectAssignable<RecommendedPromptStrategy>("mid_tier");
expectAssignable<RecommendedPromptStrategy>("open_weight");
expectAssignable<RecommendedPromptStrategy>("reasoning");
expectAssignable<RecommendedPromptStrategy>("local");

// CAPS-01 — forward reference to Plan 02's lookup. Uses a placeholder
// shim so this plan stays self-contained. Plan 02 replaces the shim
// with the real `getCapabilityProfile` import from the public surface.
declare function getCapabilityProfilePlaceholder(
  key: string,
): ModelCapabilityProfile | undefined;
expectType<ModelCapabilityProfile | undefined>(
  getCapabilityProfilePlaceholder("openrouter:openai/gpt-oss-120b"),
);
