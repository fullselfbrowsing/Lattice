/**
 * agent-crew showcase setup (v1.3 Phase 39).
 *
 * Deterministic 4-agent crew:
 *   parent summarizer -> researcher-1 -> researcher-2 -> researcher-3
 *
 * The provider is fake and scripted, but receipt signing is real Ed25519.
 * The child agents share a deliberately large, byte-stable tool-description
 * prefix so live Anthropic/OpenAI cache verification can be added behind
 * explicit environment keys without changing the example shape.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createFakeProvider,
  createInMemorySigner,
  createMemoryKeySet,
  createNoopAgentHost,
  defineAgent,
  defineTool,
  generateEd25519KeyPairJwk,
} from "../../packages/lattice/dist/index.js";

const SCRIPTED_RESPONSES = [
  '{"tool_calls":[{"id":"r1","name":"researcher-1","args":{"task":"summarize routing guarantees"}}]}',
  "routing guarantees: deterministic policy scoring, explicit fallbacks, inspectable plan",
  '{"tool_calls":[{"id":"r2","name":"researcher-2","args":{"task":"summarize artifact handling"}}]}',
  "artifact handling: typed refs, provider packaging, replayable transforms",
  '{"tool_calls":[{"id":"r3","name":"researcher-3","args":{"task":"summarize audit evidence"}}]}',
  "audit evidence: signed receipts, parentReceiptCid chain, aggregate CrewResult usage",
  "Crew summary: Lattice routes deterministically, transports artifacts explicitly, and verifies every agent result through chained receipts.",
];

const PRICED_USAGE = {
  promptTokens: 12,
  completionTokens: 4,
  costUsd: 0.0003,
};

const SUMMARY_RETURN_SCHEMA = {
  "~standard": {
    version: 1,
    vendor: "agent-crew-showcase",
    validate: (value) => {
      const body = value;
      if (
        typeof body === "object" &&
        body !== null &&
        typeof body.summary === "string" &&
        Array.isArray(body.artifacts) &&
        Array.isArray(body.receipts)
      ) {
        return { value };
      }
      return {
        issues: [
          {
            message:
              "summary return must be { summary: string, artifacts: array, receipts: array }",
          },
        ],
      };
    },
  },
};

const INPUT_SCHEMA_STUB = {
  "~standard": {
    version: 1,
    vendor: "agent-crew-showcase",
    validate: (value) => ({ value }),
  },
};

const CACHE_PREFIX_PAD = Array.from({ length: 180 }, (_, index) =>
  `cache-prefix-fragment-${String(index).padStart(3, "0")}: preserve identical crew instructions for prompt-cache eligibility.`,
).join(" ");

export async function createShowcase() {
  const { publicKeyJwk, privateKeyJwk } = await generateEd25519KeyPairJwk();
  const kid = "kid:agent-crew-showcase:01";
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keySet = createMemoryKeySet([{ kid, state: "active", publicKeyJwk }]);
  const outputDir = mkdtempSync(join(tmpdir(), "lattice-agent-crew-"));

  const corpus = defineTool({
    name: "readCrewCorpus",
    description:
      "Read the deterministic crew showcase corpus. " +
      "This intentionally long, byte-stable description pads the shared tool prefix beyond live-provider cache thresholds. " +
      CACHE_PREFIX_PAD,
    inputSchema: INPUT_SCHEMA_STUB,
    execute: (input) => ({
      query: input?.query ?? "all",
      facts: [
        "deterministic routing",
        "artifact packaging",
        "signed receipt chain",
      ],
    }),
  });

  const childTools = [corpus];
  const children = [1, 2, 3].map((n) =>
    defineAgent({
      id: `researcher-${n}`,
      intent: `Research topic ${n} and return one concise evidence summary.`,
      tools: childTools,
      summaryReturnSchema: SUMMARY_RETURN_SCHEMA,
      contract: {
        kind: "capability-contract",
        budget: { maxIterations: 2, maxCostUsd: 0.01 },
      },
    }),
  );

  const root = defineAgent({
    id: "summarizer",
    intent:
      "Delegate to researcher-1, researcher-2, and researcher-3 in order, then synthesize the final crew summary.",
    tools: [],
    childAgents: children,
    summaryReturnSchema: SUMMARY_RETURN_SCHEMA,
    contract: {
      kind: "capability-contract",
      budget: { maxIterations: 5, maxCostUsd: 0.05 },
    },
  });

  const responses = [...SCRIPTED_RESPONSES];
  const fake = createFakeProvider({
    id: "agent-crew-showcase-fake",
    response: () => ({
      rawOutputs: { answer: responses.shift() ?? "" },
      normalizedUsage: { ...PRICED_USAGE },
    }),
  });

  return {
    signer,
    keySet,
    fake,
    root,
    childHost: createNoopAgentHost(),
    outputDir,
    writeReceipt: (receiptId, envelope) => {
      const path = join(outputDir, `${receiptId}.json`);
      writeFileSync(path, JSON.stringify(envelope, null, 2));
      return path;
    },
  };
}

// Live cache verification is intentionally omitted from PR-time execution.
// A future env-keyed script can swap the fake provider for Anthropic/OpenAI
// when ANTHROPIC_API_KEY or OPENAI_API_KEY is explicitly set; real-provider
// cache counters belong in nightly/manual canary runs, not this deterministic
// showcase.
