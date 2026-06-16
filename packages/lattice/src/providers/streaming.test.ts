import { describe, expect, it } from "vitest";

import { fc } from "../test-support/fast-check.js";
import type { ProviderAdapter, ProviderStream } from "./provider.js";
import { collectStream } from "./streaming.js";

describe("Phase 43 collectStream", () => {
  it("collectStream assembles text deltas into the default output", async () => {
    async function* stream(): ProviderStream {
      yield { kind: "text-delta", text: "hel" };
      yield { kind: "text-delta", text: "lo" };
    }

    const collected = await collectStream(stream(), { defaultOutput: "answer" });

    expect(collected.rawOutputs.answer).toBe("hello");
    expect(collected.rawResponse).toEqual({
      kind: "lattice-stream-summary",
      chunkCount: 2,
      outputNames: ["answer"],
    });
  });

  it("collectStream lets explicit output chunks override accumulated text", async () => {
    async function* stream(): ProviderStream {
      yield { kind: "text-delta", output: "answer", text: "partial" };
      yield { kind: "output", output: "answer", value: "final" };
    }

    const collected = await collectStream(stream());

    expect(collected.rawOutputs.answer).toBe("final");
  });

  it("collectStream merges usage gateway artifacts and tool calls from complete chunks", async () => {
    const artifactRef = {
      id: "artifact:stream:1",
      kind: "text" as const,
      mediaType: "text/plain",
      source: "inline" as const,
      privacy: "standard" as const,
    };
    const toolCall = { id: "tool-1", name: "lookup", args: { q: "x" } };

    async function* stream(): ProviderStream {
      yield {
        kind: "usage",
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: null },
      };
      yield {
        kind: "gateway",
        gateway: { used: true, requestedModel: "primary" },
      };
      yield { kind: "tool-call", toolCall };
      yield {
        kind: "complete",
        rawOutputs: { answer: "done" },
        artifactRefs: [artifactRef],
        usage: { inputTokens: 2, outputTokens: 3 },
        normalizedUsage: { promptTokens: 2, completionTokens: 3, costUsd: 0.1 },
        gateway: { used: true, requestedModel: "primary", observedModel: "served" },
        toolCalls: [{ id: "tool-2", name: "fetch", args: { id: 1 } }],
        rawResponse: { provider: "test" },
      };
    }

    const collected = await collectStream(stream());

    expect(collected.rawOutputs.answer).toBe("done");
    expect(collected.artifactRefs).toEqual([artifactRef]);
    expect(collected.usage).toEqual({ inputTokens: 2, outputTokens: 3 });
    expect(collected.normalizedUsage).toEqual({
      promptTokens: 2,
      completionTokens: 3,
      costUsd: 0.1,
    });
    expect(collected.gateway).toEqual({
      used: true,
      requestedModel: "primary",
      observedModel: "served",
    });
    expect(collected.toolCalls).toEqual([
      toolCall,
      { id: "tool-2", name: "fetch", args: { id: 1 } },
    ]);
    expect(collected.rawResponse).toEqual({ provider: "test" });
  });

  it("legacy ProviderAdapter literals still satisfy the optional stream contract", async () => {
    const adapter = {
      id: "legacy",
      kind: "provider-adapter",
      execute: async () => ({ rawOutputs: { answer: "ok" } }),
    } satisfies ProviderAdapter;

    expect(adapter.kind).toBe("provider-adapter");
  });

  it("collectStream is invariant to text chunk boundaries", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (parts) => {
          const expected = parts.join("");
          async function* stream() {
            for (const part of parts) {
              yield { kind: "text-delta" as const, output: "answer", text: part };
            }
          }

          const collected = await collectStream(stream());
          expect(collected.rawOutputs.answer).toBe(expected);
        },
      ),
      { numRuns: 50 },
    );
  });
});
