import { describe, expect, expectTypeOf, it } from "vitest";

import type { ProviderStream } from "../providers/provider.js";
import {
  REALTIME_DIRECTION_SUPPORT_LEVEL,
  createRealtimeCheckpointContext,
  createRealtimeReceiptDescriptors,
  realtimeStepName,
  type RealtimeSessionSpec,
} from "./realtime.js";

describe("realtime direction surface", () => {
  it("creates stable checkpoint context for OpenAI Realtime sessions", () => {
    const context = createRealtimeCheckpointContext({
      sessionId: "rt-session-1",
      provider: "openai-realtime",
      checkpoint: "session.start",
      stepIndex: 0,
      timestamp: "2026-06-16T00:00:00.000Z",
    });

    expect(context).toEqual({
      stepName: "realtime.openai-realtime.session.start",
      stepIndex: 0,
      timestamp: "2026-06-16T00:00:00.000Z",
    });
  });

  it("threads previous and parent checkpoint identifiers for Gemini Live summaries", () => {
    const context = createRealtimeCheckpointContext({
      sessionId: "gemini-live-session",
      provider: "gemini-live",
      checkpoint: "session.summary",
      stepIndex: 4,
      timestamp: "2026-06-16T00:01:00.000Z",
      parentStepName: realtimeStepName("gemini-live", "session.start"),
      previousStepName: realtimeStepName("gemini-live", "server.frame"),
    });

    expect(context).toEqual({
      stepName: "realtime.gemini-live.session.summary",
      stepIndex: 4,
      timestamp: "2026-06-16T00:01:00.000Z",
      parentStepName: "realtime.gemini-live.session.start",
      previousStepName: "realtime.gemini-live.server.frame",
    });
  });

  it("builds receipt descriptors without opening a realtime transport", () => {
    const spec: RealtimeSessionSpec = {
      kind: "realtime-session-spec",
      supportLevel: REALTIME_DIRECTION_SUPPORT_LEVEL,
      sessionId: "rt-session-1",
      target: {
        provider: "openai-realtime",
        model: "gpt-realtime-2",
        transport: "websocket",
        endpoint: "/v1/realtime",
      },
      mode: "voice-agent",
      inputModalities: ["audio", "text"],
      outputModalities: ["audio", "text", "tool"],
      checkpointing: {
        receiptThreading: "step-linked-list",
        summaryCheckpoints: "session-close",
        note: "direction-only",
      },
    };

    expect(createRealtimeReceiptDescriptors(spec)).toEqual({
      sessionId: "rt-session-1",
      model: {
        requested: "gpt-realtime-2",
        observed: null,
      },
      route: {
        providerId: "openai-realtime",
        capabilityId: "openai-realtime:gpt-realtime-2:realtime-session",
        attemptNumber: 1,
      },
    });
  });

  it("models Gemini Live as preview websocket direction", () => {
    const spec: RealtimeSessionSpec = {
      kind: "realtime-session-spec",
      supportLevel: "direction-only",
      sessionId: "gemini-live-session",
      target: {
        provider: "gemini-live",
        model: "gemini-live-2.5-flash-preview",
        transport: "websocket",
        endpoint: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
        preview: true,
      },
      mode: "live-multimodal",
      inputModalities: ["audio", "video", "text"],
      outputModalities: ["audio", "text", "tool"],
    };

    expect(spec.target.provider).toBe("gemini-live");
    if (spec.target.provider !== "gemini-live") {
      throw new Error("Expected Gemini Live target.");
    }
    expect(spec.target.preview).toBe(true);
  });

  it("keeps realtime session specs distinct from one-shot ProviderStream", () => {
    expectTypeOf<RealtimeSessionSpec>().not.toMatchTypeOf<ProviderStream>();
  });
});
