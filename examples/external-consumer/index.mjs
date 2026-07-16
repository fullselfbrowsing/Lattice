/**
 * Generic external-consumer modular adoption example.
 *
 * This example intentionally imports built package subpaths instead of
 * workspace source files. Run from the repo root after building Lattice:
 *
 *   pnpm example:external-consumer
 */

import {
  artifact,
  contract,
  output,
  prepareCoreRun,
} from "../../packages/lattice/dist/core.js";
import {
  defineTool,
  mcpPromptArtifact,
  mcpResourceArtifact,
  mcpToolResultArtifact,
  validateToolCallRequests,
} from "../../packages/lattice/dist/tools.js";
import {
  createExternalExecutionAudit,
  createInMemorySigner,
  createMemoryKeySet,
  generateEd25519KeyPairJwk,
  verifyReceipt,
} from "../../packages/lattice/dist/audit.js";
import { evalAgentRun } from "../../packages/lattice/dist/eval.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const querySchema = {
  "~standard": {
    version: 1,
    vendor: "external-consumer-example",
    validate(value) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof value.query === "string"
      ) {
        return { value };
      }

      return { issues: [{ message: "Expected { query: string }." }] };
    },
  },
};

async function runCoreSlice() {
  const source = artifact.text("External app already owns model execution.", {
    id: "artifact:external-consumer:source",
  });
  const prepared = await prepareCoreRun({
    task: "Prepare artifacts and context for an external executor.",
    artifacts: [source],
    outputs: { answer: output.citations() },
    catalog: { version: "external-consumer", models: [] },
    metadata: { consumer: "external-consumer-example" },
  });

  assert(prepared.kind === "prepared-core-run", "core slice should prepare a core run");
  assert(prepared.artifactRefs.length === 1, "core slice should return artifact refs");
  process.stdout.write(
    `scenario=external-consumer slice=core kind=${prepared.kind} artifacts=${prepared.artifactRefs.length}\n`,
  );

  return source;
}

async function runToolsSlice() {
  const resource = mcpResourceArtifact({
    uri: "file:///support-case.md",
    mimeType: "text/markdown",
    text: "# Support case",
  });
  const prompt = mcpPromptArtifact({
    name: "summarize-support-case",
    messages: [{ role: "user", content: "Summarize this support case." }],
  });
  const toolResult = mcpToolResultArtifact({
    toolName: "lookup",
    callId: "call-1",
    content: [{ type: "text", text: "Refund policy found." }],
  });
  const lookup = defineTool({
    name: "lookup",
    inputSchema: querySchema,
    execute: () => "not executed in this example",
  });
  const calls = await validateToolCallRequests(
    [{ id: "call-1", name: "lookup", args: { query: "refund" } }],
    { tools: [lookup] },
  );

  assert(calls?.length === 1, "tools slice should validate returned tool calls");
  assert(resource.kind === "text", "MCP resource should be an artifact");
  assert(prompt.kind === "json", "MCP prompt should be an artifact");
  assert(toolResult.kind === "tool-result", "MCP tool result should be an artifact");
  process.stdout.write(
    `scenario=external-consumer slice=tools calls=${calls.length} artifacts=${[resource, prompt, toolResult].length}\n`,
  );
}

async function runAuditSlice(source) {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, {
    kid: "external-consumer-example",
    publicKeyJwk,
  });
  const result = await createExternalExecutionAudit(
    {
      runId: "external-consumer-run",
      receiptId: "external-consumer-receipt",
      issuedAt: "2026-06-20T00:00:00.000Z",
      task: "Audit external executor output.",
      artifacts: [source],
      outputSpecs: { answer: "text" },
      outputs: { answer: "External executor answer." },
      policy: { privacy: "standard" },
      contract: contract(),
      model: { requested: "external-model", observed: "external-model" },
      route: { providerId: "external", capabilityId: "external-model", attemptNumber: 1 },
      usage: { promptTokens: 5, completionTokens: 4, costUsd: null },
      rawRequest: { model: "external-model" },
      rawResponse: { answer: "External executor answer." },
      metadata: { consumer: "external-consumer-example" },
    },
    signer,
  );
  const verified = await verifyReceipt(
    result.receipt,
    createMemoryKeySet([{ kid: "external-consumer-example", publicKeyJwk, state: "active" }]),
  );

  assert(verified.ok === true, "audit slice should verify receipt");
  process.stdout.write(
    `scenario=external-consumer slice=audit verified=${verified.ok} sidecar=${result.sidecar.version}\n`,
  );
}

function runEvalSlice() {
  const report = evalAgentRun(
    { iterationsToGoal: 2, usage: { promptTokens: 10, completionTokens: 4, costUsd: 0.001 } },
    { iterationsToGoal: 2, usage: { promptTokens: 10, completionTokens: 4, costUsd: 0.001 } },
  );

  assert(report.ok === true, "eval slice should pass equal snapshots");
  process.stdout.write(`scenario=external-consumer slice=eval ok=${report.ok}\n`);
}

const source = await runCoreSlice();
await runToolsSlice();
await runAuditSlice(source);
runEvalSlice();
