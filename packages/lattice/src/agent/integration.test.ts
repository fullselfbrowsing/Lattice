/**
 * Phase 19 integration smoke — end-to-end exercise of the agent surface.
 *
 * Uses real cryptographic primitives (ephemeral Ed25519 keypair, real
 * createInMemorySigner, real createReceipt/verifyReceipt round-trip).
 * The only mock is the fake provider that scripts the iteration responses.
 *
 * Asserts:
 *   - Two-iteration agent flow (tool_use envelope -> tool dispatch ->
 *     final answer) completes with AgentSuccess.
 *   - Auto-registered checkpoint hook mints a v1.1 capability receipt for
 *     AFTER_AGENT_ITERATION (the hook reads stepName/stepIndex/timestamp
 *     from the iteration context).
 *   - The minted receipt verifies cleanly against the ephemeral KeySet
 *     (proves DSSE + JCS round-trip works inside the agent loop).
 *   - Sticky provider holds across both iterations.
 *   - Cumulative usage accumulates correctly.
 *   - Auto-registration opt-out (autoRegisterCheckpoint: false) suppresses
 *     receipt minting even when a signer is configured.
 */

import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createMemoryKeySet } from "../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import type { ReceiptEnvelope, KeyEntry } from "../receipts/types.js";
import { verifyReceipt } from "../receipts/verify.js";
import { createFakeProvider } from "../providers/fake.js";
import { defineTool } from "../tools/tools.js";
import { createHookPipeline, BAND } from "../contract/bands.js";

import { runAgent } from "./runtime.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "integration-stub",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

async function makeEphemeralSetup() {
  const kid = `kid:integration:${Math.random().toString(16).slice(2)}`;
  const { publicKeyJwk, privateKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keyEntry: KeyEntry = {
    kid,
    state: "active",
    publicKeyJwk,
  };
  const keySet = createMemoryKeySet([keyEntry]);
  return { signer, keySet, kid };
}

describe("Phase 19 integration smoke — agent loop + receipts + tool dispatch", () => {
  it(
    "completes a 2-iteration flow with per-iteration signed receipts that verify",
    async () => {
      const { signer, keySet, kid } = await makeEphemeralSetup();

      // Capture the receipts as the auto-registered checkpoint hook mints them.
      // The hook emits step.transition events via the tracer; we listen and
      // extract `envelope` from the event metadata.
      const mintedReceipts: ReceiptEnvelope[] = [];
      const tracer = {
        event: (kind: string, payload: Record<string, unknown>) => {
          if (kind === "step.transition") {
            const envelope = payload["envelope"];
            if (envelope !== undefined) {
              mintedReceipts.push(envelope as ReceiptEnvelope);
            }
          }
        },
      };

      const responses = [
        `{"tool_calls":[{"id":"call-1","name":"sumOf","args":{"a":2,"b":3}}]}`,
        "The sum is 5.",
      ];
      const fake = createFakeProvider({
        id: "sticky-fake",
        response: () => ({
          rawOutputs: { answer: responses.shift() ?? "" },
          normalizedUsage: { promptTokens: 7, completionTokens: 4, costUsd: 0.0001 },
        }),
      });

      const sumOf = defineTool({
        name: "sumOf",
        description: "Adds two integers",
        inputSchema: makeSchema(),
        execute: (input: unknown) => {
          const i = input as { a: number; b: number };
          return i.a + i.b;
        },
      });

      const result = await runAgent(
        {
          task: "Compute 2 + 3 using the sumOf tool.",
          tools: [sumOf],
          signer,
          tracer,
        },
        { providers: [fake] },
      );

      expect(result.kind).toBe("success");
      if (result.kind !== "success") return;

      // 2 iterations: one tool_use + one final answer.
      expect(result.iterations.length).toBe(2);
      // Sticky provider across both iterations.
      expect(result.iterations[0]?.provider).toBe("sticky-fake");
      expect(result.iterations[1]?.provider).toBe("sticky-fake");
      // First iteration dispatched 1 tool call.
      expect(result.iterations[0]?.toolCalls.length).toBe(1);
      expect(result.iterations[0]?.toolCalls[0]?.name).toBe("sumOf");
      // Cumulative usage = 2x per-iteration cost.
      expect(result.usage.promptTokens).toBe(14);
      expect(result.usage.completionTokens).toBe(8);
      expect(result.usage.costUsd).toBeCloseTo(0.0002);

      // 2 receipts minted via the auto-registered checkpoint hook (one per
      // AFTER_AGENT_ITERATION emission). The hook reads stepName / stepIndex /
      // timestamp from the iteration context.
      expect(mintedReceipts.length).toBe(2);
      // Each receipt verifies cleanly against the ephemeral KeySet (DSSE + JCS
      // round-trip preserved through the agent loop).
      for (const envelope of mintedReceipts) {
        const verifyResult = await verifyReceipt(envelope, keySet);
        expect(verifyResult.ok).toBe(true);
        expect(envelope.signatures[0]?.keyid).toBe(kid);
      }
    },
    15000,
  );

  it("autoRegisterCheckpoint=false suppresses receipt minting even when a signer is configured", async () => {
    const { signer } = await makeEphemeralSetup();
    const mintedReceipts: ReceiptEnvelope[] = [];
    const tracer = {
      event: (kind: string, payload: Record<string, unknown>) => {
        if (kind === "step.transition") {
          const envelope = payload["envelope"];
          if (envelope !== undefined) mintedReceipts.push(envelope as ReceiptEnvelope);
        }
      },
    };
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "Final answer immediately." },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      {
        task: "Hi.",
        tools: [],
        signer,
        tracer,
        autoRegisterCheckpoint: false,
      },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    expect(mintedReceipts.length).toBe(0);
  });

  it("caller-supplied SAFETY-band handler + auto-checkpoint coexist", async () => {
    const { signer } = await makeEphemeralSetup();
    const safetyCallCount = { value: 0 };
    const pipeline = createHookPipeline();
    pipeline.register(
      "BEFORE_AGENT_ITERATION",
      () => {
        safetyCallCount.value += 1;
      },
      { band: BAND.SAFETY },
    );
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "Done." },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      {
        task: "Hi.",
        tools: [],
        pipeline,
        signer,
      },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    // BEFORE_AGENT_ITERATION fired once (iteration 0 → final answer immediately).
    expect(safetyCallCount.value).toBe(1);
  });
});
