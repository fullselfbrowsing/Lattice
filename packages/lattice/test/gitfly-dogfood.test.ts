import { describe, expect, it } from "vitest";
import { z } from "zod";

import { artifact } from "../src/artifacts/artifact.js";
import { contract } from "../src/contract/contract.js";
import { createExternalExecutionAudit } from "../src/audit/external-execution.js";
import { createOpenAICompatibleProvider } from "../src/providers/adapters.js";
import { createMemoryKeySet } from "../src/receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../src/receipts/sign.js";
import { verifyReceipt } from "../src/receipts/verify.js";
import { replayOffline } from "../src/replay/replay.js";
import { defineTool } from "../src/tools/tools.js";

const searchTool = defineTool({
  name: "search_files",
  description: "Search the repository for relevant files.",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "not used by provider-only fixture",
});

async function makeSigner(kid = "gitfly-dogfood") {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  return {
    signer: createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk }),
    keySet: createMemoryKeySet([{ kid, publicKeyJwk, state: "active" }]),
  };
}

describe("GitFly-style dogfood", () => {
  it("runs host-owned provider execution with native tools and structured output", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "{\"command\":\"git diff -- packages/lattice\"}",
              tool_calls: [
                {
                  id: "call_gitfly_search",
                  type: "function",
                  function: {
                    name: "search_files",
                    arguments: "{\"query\":\"lattice provider parity\"}",
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const provider = createOpenAICompatibleProvider({
      id: "gitfly-gateway",
      model: "grok-4-1-fast-gitfly",
      baseUrl: "https://gitfly-gateway.invalid/v1",
      fetch,
      validateToolCalls: { tools: [searchTool] },
    });

    const response = await provider.execute?.({
      task: "Prepare a build command for a repository change.",
      artifacts: [],
      outputs: ["text", "build"],
      nativeTools: [searchTool],
      nativeToolChoice: { type: "tool", name: "search_files" },
      nativeStructuredOutput: {
        output: "build",
        name: "BuildConfig",
        schema: z.object({ command: z.string() }),
      },
      policy: {
        gateway: {
          metadata: { consumer: "gitfly-style-dogfood" },
        },
      },
    });

    expect(response).toBeDefined();
    expect(requestBody?.["model"]).toBe("grok-4-1-fast-gitfly");
    expect(requestBody?.["tools"]).toEqual([
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({ name: "search_files" }),
      }),
    ]);
    expect(requestBody?.["tool_choice"]).toEqual({
      type: "function",
      function: { name: "search_files" },
    });
    expect(requestBody?.["response_format"]).toMatchObject({
      type: "json_schema",
      json_schema: { name: "BuildConfig", strict: true },
    });
    expect(response?.rawOutputs.build).toEqual({
      command: "git diff -- packages/lattice",
    });
    expect(response?.toolCalls).toEqual([
      {
        id: "call_gitfly_search",
        name: "search_files",
        args: { query: "lattice provider parity" },
      },
    ]);
    expect(response?.finish).toEqual({
      reason: "tool_calls",
      toolCallIds: ["call_gitfly_search"],
    });
  });

  it("wraps external execution with receipts and replay behind feature-flag metadata", async () => {
    const { signer, keySet } = await makeSigner();
    const input = artifact.text("diff --git a/package.json b/package.json", {
      id: "artifact:gitfly:diff",
      metadata: { consumer: "gitfly" },
    });
    const outputs = { build: { command: "pnpm --filter @full-self-browsing/lattice test" } };
    const featureFlag = {
      name: "lattice_external_audit",
      enabled: true,
    };

    const result = await createExternalExecutionAudit(
      {
        runId: "gitfly-external-run",
        receiptId: "gitfly-external-receipt",
        issuedAt: "2026-06-20T00:00:00.000Z",
        task: "Audit host-owned GitFly execution.",
        artifacts: [input],
        outputSpecs: { build: "text" },
        outputs,
        policy: { privacy: "standard" },
        contract: contract(),
        model: {
          requested: "grok-4-1-fast-gitfly",
          observed: "grok-4-1-fast-gitfly",
        },
        route: {
          providerId: "gitfly-gateway",
          capabilityId: "grok-4-1-fast-gitfly",
          attemptNumber: 1,
        },
        usage: { promptTokens: 11, completionTokens: 7, costUsd: null },
        rawRequest: { model: "grok-4-1-fast-gitfly", featureFlag },
        rawResponse: { output: outputs.build },
        metadata: {
          consumer: "gitfly",
          featureFlag,
        },
      },
      signer,
    );

    const verified = await verifyReceipt(result.receipt, keySet);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.body.runId).toBe("gitfly-external-run");
      expect(verified.body.route.providerId).toBe("gitfly-gateway");
      expect(verified.body.model.requested).toBe("grok-4-1-fast-gitfly");
    }

    expect(result.sidecar.externalExecution.metadata).toMatchObject({
      consumer: "gitfly",
      featureFlag,
    });
    expect(result.sidecar.externalExecution.rawRequestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.sidecar.externalExecution.rawResponseHash).toMatch(/^[a-f0-9]{64}$/u);

    const replayed = await replayOffline(result.replayEnvelope);
    expect(replayed.ok).toBe(true);
    if (replayed.ok && replayed.plan.kind === "execution-plan") {
      expect(replayed.outputs).toEqual(outputs);
      expect(replayed.plan.metadata).toMatchObject({
        externalExecution: true,
        external: {
          consumer: "gitfly",
          featureFlag,
        },
      });
    }
  });
});
