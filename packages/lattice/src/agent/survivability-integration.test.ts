/**
 * Phase 20 survivability integration smoke.
 *
 * Demonstrates the full eviction-resume contract end-to-end:
 *
 *   1. Run an agent with an in-memory storage seam + signer. The loop
 *      saves a snapshot after each iteration.
 *   2. Capture the saved snapshot, simulate eviction by destroying the
 *      runtime + agent instance.
 *   3. Re-run the agent with a fresh runtime + the captured snapshot
 *      pre-loaded into a new storage seam.
 *   4. Assert: recovery.start + recovery.complete fire; the new run
 *      resumes at the captured iteration index; final receipt verifies
 *      cleanly against the same ephemeral KeySet.
 *
 * Uses real Ed25519 keys and real createInMemorySigner — no mocking of
 * Lattice cryptographic primitives.
 */

import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createMemoryKeySet } from "../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import type { KeyEntry, ReceiptEnvelope } from "../receipts/types.js";
import { verifyReceipt } from "../receipts/verify.js";
import { createNoopSurvivabilityAdapter } from "../runtime/survivability.js";
import type { SerializedSnapshot } from "../runtime/survivability.js";
import { createFakeProvider } from "../providers/fake.js";
import { defineTool } from "../tools/tools.js";

import { createNoopAgentHost, type AgentHost, type AgentSnapshot } from "./host.js";
import { runAgent } from "./runtime.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "surv-integration",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

async function makeEphemeralSetup() {
  const kid = `kid:surv-int:${Math.random().toString(16).slice(2)}`;
  const { publicKeyJwk, privateKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keyEntry: KeyEntry = { kid, state: "active", publicKeyJwk };
  const keySet = createMemoryKeySet([keyEntry]);
  return { signer, keySet, kid };
}

describe("Phase 20 survivability integration — end-to-end resume across simulated eviction", () => {
  it(
    "captures a snapshot after iteration 0, evicts, resumes at iteration 1, signs a verifiable receipt",
    async () => {
      const { signer, keySet, kid } = await makeEphemeralSetup();

      // Track ALL receipts minted across both halves of the run.
      const mintedReceipts: ReceiptEnvelope[] = [];
      const tracer = {
        kind: "tracer" as const,
        event: (kind: string, payload?: Record<string, unknown>) => {
          if (kind === "step.transition" && payload !== undefined) {
            const envelope = payload["envelope"];
            if (envelope !== undefined) mintedReceipts.push(envelope as ReceiptEnvelope);
          }
        },
      };

      // First half — runs iteration 0 (tool_use). The provider stub returns
      // a tool_use envelope; the tool returns a value; the loop schedules
      // iteration 1 but we'll intercept after the snapshot save and simulate
      // eviction.
      const firstHalfResponses = [
        `{"tool_calls":[{"id":"c1","name":"echo","args":{"v":"a"}}]}`,
      ];
      const firstHalfProvider = createFakeProvider({
        id: "sticky",
        response: () => ({
          rawOutputs: { answer: firstHalfResponses.shift() ?? "Should not be called." },
          normalizedUsage: { promptTokens: 3, completionTokens: 2, costUsd: 0.001 },
        }),
      });

      let capturedSnapshot: SerializedSnapshot | null = null;
      const firstHalfHost: AgentHost = {
        ...createNoopAgentHost(),
        storage: {
          async save(snapshot) {
            capturedSnapshot = snapshot;
          },
          async load() {
            return null;
          },
          async clear() {
            // no-op
          },
        },
        // Inject a budget that allows exactly 1 iteration so the loop
        // exits after the snapshot is captured but before producing the
        // final answer. Simulates an eviction at the iteration boundary.
        scheduler: {
          async scheduleNext(_iterationIndex) {
            // Throw to simulate eviction: the loop will surface this as a
            // provider_execution failure but the snapshot was already saved.
            throw new Error("Simulated eviction.");
          },
        },
      };

      const echo = defineTool({
        name: "echo",
        inputSchema: makeSchema(),
        execute: (input: unknown) => input,
      });

      // First half — expected to FAIL via the eviction throw, but the
      // snapshot should be saved before that.
      let firstHalfError: unknown = null;
      try {
        await runAgent(
          {
            task: "Compute step a -> b.",
            tools: [echo],
            host: firstHalfHost,
            signer,
            tracer,
          },
          { providers: [firstHalfProvider] },
        );
      } catch (error) {
        firstHalfError = error;
      }
      expect(firstHalfError).not.toBeNull();
      expect(capturedSnapshot).not.toBeNull();
      const snapshotForResume = capturedSnapshot as SerializedSnapshot | null;
      expect(snapshotForResume).not.toBeNull();
      if (snapshotForResume === null) return;
      expect(snapshotForResume.kind).toBe("survivability-snapshot");

      // Inspect the snapshot payload to confirm iterationIndex advanced.
      const adapter = createNoopSurvivabilityAdapter<AgentSnapshot>();
      const restored = adapter.deserialize(snapshotForResume);
      expect(restored.iterationIndex).toBe(1);
      expect(restored.conversation.length).toBeGreaterThanOrEqual(3);
      expect(restored.cumulativeUsage.promptTokens).toBe(3);

      // -- Simulate process restart --

      // Second half: brand-new runtime + host pre-loaded with the captured
      // snapshot. Iteration 1 returns a final answer.
      const secondHalfResponses = ["Final answer."];
      const secondHalfProvider = createFakeProvider({
        id: "sticky",
        response: () => ({
          rawOutputs: { answer: secondHalfResponses.shift() ?? "" },
          normalizedUsage: { promptTokens: 4, completionTokens: 1, costUsd: 0.0005 },
        }),
      });

      const recoveryEvents: Array<{ kind: string; payload?: Record<string, unknown> | undefined }> = [];
      const secondTracer = {
        kind: "tracer" as const,
        event: (kind: string, payload?: Record<string, unknown>) => {
          if (kind.startsWith("recovery.")) recoveryEvents.push({ kind, payload });
          if (kind === "step.transition" && payload !== undefined) {
            const envelope = payload["envelope"];
            if (envelope !== undefined) mintedReceipts.push(envelope as ReceiptEnvelope);
          }
        },
      };

      const secondHalfHost: AgentHost = {
        ...createNoopAgentHost(),
        storage: {
          async save(_snapshot) {
            // collect via the tracer; not needed here for the resume assertion
          },
          async load() {
            return snapshotForResume;
          },
          async clear() {
            // no-op
          },
        },
      };

      const result = await runAgent(
        {
          task: "Compute step a -> b.",
          tools: [echo],
          host: secondHalfHost,
          signer,
          tracer: secondTracer,
        },
        { providers: [secondHalfProvider] },
      );

      expect(result.kind).toBe("success");
      // recovery.start AND recovery.complete fired in order.
      const recoveryKinds = recoveryEvents.map((e) => e.kind);
      expect(recoveryKinds).toEqual(["recovery.start", "recovery.complete"]);
      expect((recoveryEvents[1]?.payload as { iterationIndex?: number })?.iterationIndex).toBe(1);

      if (result.kind === "success") {
        // Exactly 1 NEW iteration ran in the second half (iteration index 1 -> final).
        expect(result.iterations.length).toBe(1);
        // Usage carries from the snapshot (3/2/0.001) plus the new iter (4/1/0.0005)
        // = 7/3/0.0015.
        expect(result.usage.promptTokens).toBe(7);
        expect(result.usage.completionTokens).toBe(3);
        expect(result.usage.costUsd).toBeCloseTo(0.0015);
      }

      // All collected receipts (from both halves) verify under the same KeySet.
      expect(mintedReceipts.length).toBeGreaterThanOrEqual(1);
      for (const envelope of mintedReceipts) {
        const v = await verifyReceipt(envelope, keySet);
        expect(v.ok).toBe(true);
        expect(envelope.signatures[0]?.keyid).toBe(kid);
      }
    },
    20000,
  );
});
