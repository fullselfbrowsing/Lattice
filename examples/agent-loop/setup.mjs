/**
 * agent-loop showcase setup (v1.2 Phase 22).
 *
 * Wires the full Phase 19-21 agent surface into a single deterministic
 * run sequence suitable for end-to-end verification.
 *
 * Composition:
 *   - Ephemeral Ed25519 signer + KeySet (real cryptography).
 *   - Scripted fake provider returning:
 *       iteration 0: tool_use envelope for lookup(query: "pi")
 *       iteration 1: tool_use envelope for sumOf(a: 3.14, b: 0.86)
 *       iteration 2: final answer "Total is 4."
 *   - Two tools: `lookup` (returns a number) and `sumOf` (adds two).
 *   - Fresh HookPipeline with PermissionContext guard on BEFORE_TOOL.
 *   - All five Phase 21 primitives instantiated and pumped via hooks:
 *       cost tracker, transcript store, goal-progress tracker,
 *       action-history dedup, permission context.
 *   - Auto-registered checkpoint hook via intent.signer.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BAND,
  createActionHistory,
  createCostTracker,
  createFakeProvider,
  createGoalProgressTracker,
  createHookPipeline,
  createInMemorySigner,
  createMemoryKeySet,
  createPermissionContext,
  createPermissionGuardHook,
  createTranscriptStore,
  defineTool,
  generateEd25519KeyPairJwk,
  permissionGuardRegisterOptions,
} from "../../packages/lattice/dist/index.js";

const SCRIPTED_RESPONSES = [
  '{"tool_calls":[{"id":"c1","name":"lookup","args":{"query":"pi"}}]}',
  '{"tool_calls":[{"id":"c2","name":"sumOf","args":{"a":3.14,"b":0.86}}]}',
  "Total is 4.",
];

const NULLISH_USAGE_DEFAULTS = {
  promptTokens: 5,
  completionTokens: 3,
  costUsd: 0.0002,
};

const INPUT_SCHEMA_STUB = {
  "~standard": {
    version: 1,
    vendor: "showcase-stub",
    validate: (value) => ({ value }),
  },
};

export async function createShowcase() {
  const { publicKeyJwk, privateKeyJwk } = await generateEd25519KeyPairJwk();
  const kid = "kid:agent-loop-showcase:01";
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keySet = createMemoryKeySet([{ kid, state: "active", publicKeyJwk }]);

  const outputDir = mkdtempSync(join(tmpdir(), "lattice-agent-loop-"));

  const lookup = defineTool({
    name: "lookup",
    description: "Return a known constant for the given query (showcase stub).",
    inputSchema: INPUT_SCHEMA_STUB,
    execute: (input) => {
      if (input.query === "pi") return 3.14;
      return 0;
    },
  });

  const sumOf = defineTool({
    name: "sumOf",
    description: "Add two numbers.",
    inputSchema: INPUT_SCHEMA_STUB,
    execute: (input) => Number(input.a) + Number(input.b),
  });

  const responses = [...SCRIPTED_RESPONSES];
  const fake = createFakeProvider({
    id: "showcase-fake",
    response: () => ({
      rawOutputs: { answer: responses.shift() ?? "" },
      normalizedUsage: { ...NULLISH_USAGE_DEFAULTS },
    }),
  });

  const costTracker = createCostTracker();
  const transcriptStore = createTranscriptStore();
  const goalProgress = createGoalProgressTracker({ windowSize: 3 });
  const actionHistory = createActionHistory({ consecutiveLimit: 3 });
  const permissionContext = createPermissionContext([
    {
      toolName: /^(lookup|sumOf)$/u,
      verdict: "allow",
    },
    {
      // Default deny for anything else (none expected in this showcase).
      verdict: "deny",
      reason: "tool not in showcase allowlist",
    },
  ]);

  const pipeline = createHookPipeline();
  pipeline.register(
    "BEFORE_TOOL",
    createPermissionGuardHook(permissionContext),
    permissionGuardRegisterOptions(),
  );
  pipeline.register(
    "AFTER_AGENT_ITERATION",
    (ctx) => {
      const r = ctx?.record;
      if (r === undefined) return;
      costTracker.recordIteration({
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        costUsd: r.costUsd,
      });
      // Action history pumped via the iteration's first tool call (if any).
      const firstCall = r.toolCalls?.[0];
      if (firstCall !== undefined) {
        actionHistory.recordAction({
          iterationIndex: r.index,
          toolName: firstCall.name,
          argsHash: firstCall.argsHash,
        });
      }
      // Goal-progress: monotonically advance based on iteration count
      // (showcase stub — real callers compute satisfaction over output).
      goalProgress.recordStep({
        iterationIndex: r.index,
        goalSatisfaction: (r.index + 1) / 3,
      });
    },
    { band: BAND.OBSERVABILITY },
  );

  // Seed transcript with the user task (showcase pumps appended turns
  // via the iteration record's conversation snapshot below; the agent
  // runtime owns the canonical state).
  transcriptStore.append({ role: "user", content: "Compute pi + 0.86." });

  return {
    signer,
    keySet,
    kid,
    fake,
    pipeline,
    tools: [lookup, sumOf],
    primitives: {
      costTracker,
      transcriptStore,
      goalProgress,
      actionHistory,
      permissionContext,
    },
    outputDir,
    writeReceipt: (receiptId, envelope) => {
      const path = join(outputDir, `${receiptId}.json`);
      writeFileSync(path, JSON.stringify(envelope, null, 2));
      return path;
    },
  };
}
