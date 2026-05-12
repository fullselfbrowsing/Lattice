/**
 * Quality-floor scenario — declares a contract carrying both a budget
 * invariant AND a `qualityFloor: { suite, minScore: 0.8 }`. The runtime
 * accepts and persists the qualityFloor declaration in the canonical
 * contract (the receipt's `contractHash` covers it); enforcement happens
 * later in `lattice eval`, not at run time. The scenario also wires three
 * provider adapters (`openai`, `openai-compat`, `ai-sdk`) so the showcase
 * exercises COST-02's adapter-normalization surface; each adapter's
 * normalized Usage is printed to stdout.
 *
 * Per 13.2-CONTEXT.md:
 *   - Scenario A: qualityFloor declared, runtime tolerates without enforcement.
 *   - Scenario B: all three adapter families exercised; each emits a
 *     normalized `Usage` line with `{ promptTokens, completionTokens, costUsd }`.
 *   - Limitations: openai-compat exercised via test-injected fetch mock — no
 *     real HTTP.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// canonicalize is a runtime dep of `lattice` per Phase 9 but is not
// re-exported on the public surface. The showcase reaches into the
// lattice package's node_modules directly so the locally computed
// hash matches the runtime's `body.contractHash`.
import canonicalizeModule from "../../../packages/lattice/node_modules/canonicalize/lib/canonicalize.js";

import {
  artifact,
  contract,
  createAI,
  createMemorySessionStore,
  createFakeProvider,
} from "../../../packages/lattice/dist/index.js";

import {
  buildMultiAdapterProviders,
  writeArtifactContentAddressed,
  writeReceipt,
  writeSidecar,
} from "../setup.mjs";

const canonicalize = canonicalizeModule;

async function readFixture(name) {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

function sha256hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export async function run(ctx) {
  // Load + content-address the one input fixture used by this scenario.
  const messageText = await readFixture("message.txt");
  await writeArtifactContentAddressed(ctx.fixturesDir, messageText);

  const artifacts = [
    artifact.text(messageText, {
      id: "artifact:text:message",
      label: "Customer message",
    }),
  ];

  // Build the three adapter-family adapters. The default fetch mock is
  // shared between openai + openai-compat (no real HTTP).
  const { openai, openaiCompat, aiSdk } = buildMultiAdapterProviders();

  // The single `ai.run` only routes to ONE adapter; we still need the
  // run to terminate with a signed receipt. Wire a fake provider that
  // emits the expected "answer" field so contract evaluation succeeds.
  // The three adapter families are exercised separately via direct
  // `execute()` introspection below (their normalizedUsage is the
  // COST-02 observable).
  const runProvider = createFakeProvider({
    id: "showcase-quality-floor-driver",
    response: {
      rawOutputs: {
        answer: "Quality-floor scenario driver answer.",
      },
    },
  });

  const ai = createAI({
    sessions: createMemorySessionStore(),
    providers: [runProvider, openai, openaiCompat, aiSdk],
    signer: ctx.signer,
  });

  // CONTRACT-03: declare qualityFloor on the contract. The runtime
  // accepts this and persists it under the receipt's contractHash
  // (canonical form); enforcement is deferred to `lattice eval`.
  const contractInput = {
    budget: { maxCostUsd: 0.05 },
    qualityFloor: {
      suite: "examples/work-inbox/.lattice/quality-suite",
      minScore: 0.8,
    },
  };
  const contractValue = contract(contractInput);

  const intent = {
    task: "Triage this inbox case under a quality-floor contract.",
    session: ai.session("showcase-quality-floor"),
    artifacts,
    outputs: { answer: "text" },
    policy: { privacy: "standard" },
    contract: contractValue,
  };

  const result = await ai.run(intent);

  if (!result.ok) {
    throw new Error(
      `quality-floor scenario expected ok=true, got ok=false error=${result.error?.kind ?? "unknown"}`,
    );
  }
  if (result.receipt === undefined) {
    throw new Error(
      "quality-floor scenario expected result.receipt to be present (signer is wired)",
    );
  }

  const payloadJson = Buffer.from(result.receipt.payload, "base64url").toString("utf8");
  const body = JSON.parse(payloadJson);

  if (body.contractVerdict !== "success") {
    throw new Error(
      `quality-floor scenario expected contractVerdict="success", got "${body.contractVerdict}"`,
    );
  }

  if (body.contractHash === null || body.contractHash === undefined) {
    throw new Error(
      "quality-floor scenario expected body.contractHash to be set — see create-ai.ts:920-967 (the contractHash path)",
    );
  }

  if (!/^[0-9a-f]{64}$/.test(body.contractHash)) {
    throw new Error(
      `quality-floor scenario expected body.contractHash to be 64-char lowercase hex, got "${body.contractHash}"`,
    );
  }

  // OBSERVABLE PROOF that qualityFloor survived canonicalization: compute
  // the same canonical form + sha256 locally and assert it matches the
  // receipt body's contractHash. If qualityFloor were stripped, the
  // hashes would diverge.
  const canonical = canonicalize(intent.contract);
  if (canonical === undefined) {
    throw new Error(
      "quality-floor scenario: canonicalize(intent.contract) returned undefined",
    );
  }
  const expectedContractHash = sha256hex(canonical);
  if (expectedContractHash !== body.contractHash) {
    throw new Error(
      `quality-floor scenario: contractHash mismatch — expected ${expectedContractHash}, got ${body.contractHash}`,
    );
  }

  // COST-02 surface: prove each of the three adapter families produces
  // the normalized `Usage { promptTokens, completionTokens, costUsd }`
  // shape. We bypass the router intentionally — the router is exercised
  // by the success scenario. Here we directly call each adapter's
  // execute() with a minimal ProviderRunRequest so the test does not
  // depend on routing decisions.
  const syntheticRequest = {
    task: intent.task,
    outputs: ["answer"],
    artifacts: [],
  };
  const adapterTriples = [
    ["openai", openai],
    ["openai-compat", openaiCompat],
    ["ai-sdk", aiSdk],
  ];
  for (const [label, adapter] of adapterTriples) {
    const resp = await adapter.execute(syntheticRequest);
    const u = resp.normalizedUsage;
    if (u === undefined || u === null) {
      throw new Error(`adapter ${label} did not emit normalizedUsage`);
    }
    if (typeof u.promptTokens !== "number" || typeof u.completionTokens !== "number") {
      throw new Error(
        `adapter ${label} normalizedUsage missing token counts (promptTokens=${typeof u.promptTokens}, completionTokens=${typeof u.completionTokens})`,
      );
    }
    if (u.costUsd !== null && typeof u.costUsd !== "number") {
      throw new Error(
        `adapter ${label} normalizedUsage.costUsd must be number|null, got ${typeof u.costUsd}`,
      );
    }
    const cost = u.costUsd === null ? "null" : String(u.costUsd);
    process.stdout.write(
      `adapterUsage adapter=${label} promptTokens=${u.promptTokens} completionTokens=${u.completionTokens} costUsd=${cost}\n`,
    );
  }

  process.stdout.write(
    "qualityFloor: declared on contract suite=examples/work-inbox/.lattice/quality-suite minScore=0.8 — enforcement deferred to lattice eval (Phase 12)\n",
  );

  await writeReceipt(ctx.receiptsDir, result.receipt);

  const sidecar = {
    version: "lattice-sidecar/v1",
    task: intent.task,
    outputs: { answer: "text" },
    policy: intent.policy,
    contract: intent.contract,
    rawOutputs: result.outputs,
  };
  await writeSidecar(ctx.sidecarsDir, body.receiptId, sidecar);

  return {
    scenario: "quality-floor",
    receiptId: body.receiptId,
    verdict: body.contractVerdict,
    contractHash: body.contractHash,
    ok: true,
  };
}
