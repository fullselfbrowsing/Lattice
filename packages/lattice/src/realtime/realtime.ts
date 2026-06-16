import type { ArtifactRef } from "../artifacts/artifact.js";
import type { CheckpointHookContext } from "../contract/checkpoint.js";
import type { PolicySpec } from "../policy/policy.js";
import type { ReceiptModel, ReceiptRoute } from "../receipts/types.js";

export const REALTIME_DIRECTION_SUPPORT_LEVEL = "direction-only" as const;

export type RealtimeSupportLevel = typeof REALTIME_DIRECTION_SUPPORT_LEVEL;
export type RealtimeProviderKind = "openai-realtime" | "gemini-live";
export type RealtimeTransportKind = "websocket" | "webrtc" | "sip";
export type RealtimeSessionMode =
  | "voice-agent"
  | "transcription"
  | "translation"
  | "live-multimodal";
export type RealtimeInputModality = "text" | "audio" | "image" | "video";
export type RealtimeOutputModality = "text" | "audio" | "tool";
export type RealtimeCheckpointKind =
  | "session.start"
  | "client.frame"
  | "server.frame"
  | "session.summary"
  | "session.close";

export interface OpenAIRealtimeTarget {
  readonly provider: "openai-realtime";
  readonly model: string;
  readonly transport: RealtimeTransportKind;
  readonly endpoint: "/v1/realtime" | "/v1/realtime/translations" | "/v1/realtime/transcription_sessions";
}

export interface GeminiLiveTarget {
  readonly provider: "gemini-live";
  readonly model: string;
  readonly transport: "websocket";
  readonly endpoint: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
  readonly preview: true;
}

export type RealtimeProviderTarget = OpenAIRealtimeTarget | GeminiLiveTarget;

export interface RealtimeSessionSpec {
  readonly kind: "realtime-session-spec";
  readonly supportLevel: RealtimeSupportLevel;
  readonly sessionId: string;
  readonly target: RealtimeProviderTarget;
  readonly mode: RealtimeSessionMode;
  readonly inputModalities: readonly RealtimeInputModality[];
  readonly outputModalities: readonly RealtimeOutputModality[];
  readonly artifactRefs?: readonly ArtifactRef[];
  readonly policy?: PolicySpec;
  readonly checkpointing?: RealtimeCheckpointingSpec;
}

export interface RealtimeCheckpointingSpec {
  readonly receiptThreading: "step-linked-list";
  readonly summaryCheckpoints: "manual" | "session-close" | "interval";
  readonly note: "direction-only";
}

export interface RealtimeCheckpointInput {
  readonly sessionId: string;
  readonly provider: RealtimeProviderKind;
  readonly checkpoint: RealtimeCheckpointKind;
  readonly stepIndex: number;
  readonly timestamp?: string;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
}

export interface RealtimeReceiptDescriptors {
  readonly sessionId: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
}

export function createRealtimeCheckpointContext(
  input: RealtimeCheckpointInput,
): CheckpointHookContext {
  return {
    stepName: realtimeStepName(input.provider, input.checkpoint),
    stepIndex: input.stepIndex,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.parentStepName !== undefined ? { parentStepName: input.parentStepName } : {}),
    ...(input.previousStepName !== undefined ? { previousStepName: input.previousStepName } : {}),
  };
}

export function createRealtimeReceiptDescriptors(
  spec: RealtimeSessionSpec,
): RealtimeReceiptDescriptors {
  return {
    sessionId: spec.sessionId,
    model: {
      requested: spec.target.model,
      observed: null,
    },
    route: {
      providerId: spec.target.provider,
      capabilityId: `${spec.target.provider}:${spec.target.model}:realtime-session`,
      attemptNumber: 1,
    },
  };
}

export function realtimeStepName(
  provider: RealtimeProviderKind,
  checkpoint: RealtimeCheckpointKind,
): string {
  return `realtime.${provider}.${checkpoint}`;
}
