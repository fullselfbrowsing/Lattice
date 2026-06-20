import { describe, expect, it } from "vitest";

import { toArtifactRef } from "../artifacts/artifact.js";
import { buildContextPack } from "../context/context-pack.js";

import {
  mcpPromptArtifact,
  mcpResourceArtifact,
  mcpToolResultArtifact,
} from "./mcp-artifacts.js";

describe("MCP artifact helpers", () => {
  it("represents text resources as text artifacts with MCP metadata", () => {
    const resource = mcpResourceArtifact({
      uri: "file:///case.md",
      name: "case",
      mimeType: "text/markdown",
      text: "# Case",
    });

    expect(resource.kind).toBe("text");
    expect(resource.source).toBe("inline");
    expect(resource.mediaType).toBe("text/markdown");
    expect(resource.label).toBe("case");
    expect(resource.metadata?.["mcp"]).toMatchObject({
      kind: "resource",
      uri: "file:///case.md",
      name: "case",
      mimeType: "text/markdown",
      hasText: true,
      hasBlob: false,
    });
  });

  it("wraps blob resources as JSON artifacts without losing the original URI", () => {
    const resource = mcpResourceArtifact({
      uri: "mcp://images/1",
      mimeType: "image/png",
      blob: "base64-payload",
    });

    expect(resource.kind).toBe("json");
    expect(resource.mediaType).toBe("application/vnd.modelcontextprotocol.resource+json");
    expect(resource.value).toMatchObject({
      uri: "mcp://images/1",
      mimeType: "image/png",
      blob: "base64-payload",
    });
    expect(resource.metadata?.["mcp"]).toMatchObject({
      kind: "resource",
      uri: "mcp://images/1",
      hasBlob: true,
    });
  });

  it("represents prompts as JSON artifacts", () => {
    const prompt = mcpPromptArtifact({
      name: "summarize-case",
      arguments: { tone: "brief" },
      messages: [{ role: "user", content: "Summarize this case." }],
    });

    expect(prompt.kind).toBe("json");
    expect(prompt.source).toBe("inline");
    expect(prompt.mediaType).toBe("application/vnd.modelcontextprotocol.prompt+json");
    expect(prompt.value).toMatchObject({
      name: "summarize-case",
      arguments: { tone: "brief" },
      messages: [{ role: "user", content: "Summarize this case." }],
    });
    expect(prompt.metadata?.["mcp"]).toMatchObject({
      kind: "prompt",
      name: "summarize-case",
    });
  });

  it("represents MCP tool results as tool-result artifacts", () => {
    const result = mcpToolResultArtifact({
      toolName: "lookup",
      callId: "call-1",
      content: [{ type: "text", text: "found" }],
      isError: false,
    });

    expect(result.kind).toBe("tool-result");
    expect(result.source).toBe("tool");
    expect(result.mediaType).toBe("application/json");
    expect(result.metadata).toMatchObject({
      toolName: "lookup",
      callId: "call-1",
      mcp: {
        kind: "tool-result",
        toolName: "lookup",
        callId: "call-1",
        isError: false,
      },
    });
    expect(result.value).toEqual({
      content: [{ type: "text", text: "found" }],
      isError: false,
    });
  });

  it("produces artifact refs that context packing can consume", () => {
    const resource = mcpResourceArtifact({
      uri: "file:///case.md",
      text: "Case body",
    });
    const prompt = mcpPromptArtifact({
      name: "extract",
      messages: [{ role: "user", content: "Extract details." }],
    });
    const pack = buildContextPack({
      task: "Use MCP artifacts",
      artifacts: [resource, prompt],
    });

    expect("value" in toArtifactRef(resource)).toBe(false);
    expect(pack.included.map((item) => item.artifactId)).toEqual([resource.id, prompt.id]);
  });
});
