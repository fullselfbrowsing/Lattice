import { describe, expect, it } from "vitest";

import { artifact } from "../artifacts/artifact.js";
import type { ArtifactInput } from "../artifacts/artifact.js";
import type { SelectedRoute } from "../plan/plan.js";
import { packageArtifactsForProvider } from "./packaging.js";

function route(input: {
  readonly providerId?: string;
  readonly fileTransport?: SelectedRoute["fileTransport"];
} = {}): SelectedRoute {
  const providerId = input.providerId ?? "gemini";

  return {
    providerId,
    modelId: `${providerId}:test-model`,
    score: 0,
    estimates: { inputTokens: 1, outputTokens: 1 },
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    fileTransport: input.fileTransport ?? ["inline", "json", "url", "base64", "file-id"],
  };
}

describe("packageArtifactsForProvider multimodal request evidence", () => {
  it("records inline/base64 media packaging with MIME and shape metadata", () => {
    const input = artifact.image(new Blob(["png"], { type: "image/png" }), {
      id: "img-inline",
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "anthropic" }),
    });

    expect(result.blocked).toEqual([]);
    const packaged = result.plan.artifacts[0];
    expect(packaged?.transport).toBe("base64");
    expect(packaged?.mediaType).toBe("image/png");
    expect(packaged?.providerRequest).toMatchObject({
      shape: "anthropic:image.base64",
      sourceType: "base64",
      mediaType: "image/png",
      sizeBytes: 3,
    });
    expect(packaged?.warnings).toContain("Artifact img-inline will be encoded as base64.");
    expect(result.packagedArtifacts[0]?.lineage?.transform.metadata).toMatchObject({
      providerRequest: {
        shape: "anthropic:image.base64",
        sourceType: "base64",
      },
    });
  });

  it("preserves media types from inline data URLs in packaging evidence", () => {
    const input = artifact.image("data:image/webp;base64,AAAA", {
      id: "img-data-url",
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "gemini" }),
    });

    expect(result.blocked).toEqual([]);
    const packaged = result.plan.artifacts[0];
    expect(packaged?.transport).toBe("base64");
    expect(packaged?.mediaType).toBe("image/webp");
    expect(packaged?.providerRequest).toMatchObject({
      shape: "gemini:part.inlineData",
      sourceType: "base64",
      mediaType: "image/webp",
    });
    expect(result.packagedArtifacts[0]?.mediaType).toBe("image/webp");
    expect(result.packagedArtifacts[0]?.lineage?.transform.metadata).toMatchObject({
      providerRequest: {
        mediaType: "image/webp",
      },
    });
  });

  it("records URL media packaging when artifact value is public HTTP URL", () => {
    const input = artifact.image("https://cdn.example.test/photo.jpg", {
      id: "img-url",
      mediaType: "image/jpeg",
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "anthropic" }),
    });

    expect(result.blocked).toEqual([]);
    expect(result.plan.artifacts[0]?.transport).toBe("url");
    expect(result.plan.artifacts[0]?.providerRequest).toMatchObject({
      shape: "anthropic:image.url",
      sourceType: "url",
      reference: { kind: "url" },
    });
  });

  it("records provider file references from Anthropic file-id metadata", () => {
    const input = artifact.image("ignored-local-name.png", {
      id: "img-file-id",
      mediaType: "image/png",
      metadata: { anthropicFileId: "file_123" },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "anthropic" }),
    });

    expect(result.blocked).toEqual([]);
    expect(result.plan.artifacts[0]?.transport).toBe("file-id");
    expect(result.plan.artifacts[0]?.providerRequest).toMatchObject({
      shape: "anthropic:image.file",
      sourceType: "file-id",
      reference: { kind: "file-id", metadataKey: "anthropicFileId" },
    });
  });

  it("records Gemini file references as file-reference source metadata", () => {
    const input = artifact.audio("ignored.mp3", {
      id: "audio-file-uri",
      mediaType: "audio/mpeg",
      metadata: { geminiFileUri: "files/audio-123" },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "gemini" }),
    });

    expect(result.blocked).toEqual([]);
    expect(result.plan.artifacts[0]?.transport).toBe("file-id");
    expect(result.plan.artifacts[0]?.providerRequest).toMatchObject({
      shape: "gemini:part.fileData",
      sourceType: "file-reference",
      reference: { kind: "file-uri", metadataKey: "geminiFileUri" },
    });
  });

  it("blocks public URL media when noPublicUrl policy is set", () => {
    const input = {
      id: "video-url",
      kind: "video",
      source: "file",
      value: "https://cdn.example.test/clip.mp4",
      mediaType: "video/mp4",
      privacy: "standard",
    } satisfies ArtifactInput;

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "gemini" }),
      policy: { noPublicUrl: true },
    });

    expect(result.blocked).toEqual(["No policy-safe transport for artifact video-url."]);
    expect(result.plan.warnings).toEqual(["No policy-safe transport for artifact video-url."]);
  });

  it("blocks file-id transport when metadata value is a public URL under noPublicUrl", () => {
    const input = artifact.audio("ignored.mp3", {
      id: "audio-file-uri-public",
      mediaType: "audio/mpeg",
      metadata: { fileUri: "https://cdn.example.test/clip.mp4" },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "gemini" }),
      policy: { noPublicUrl: true },
    });

    expect(result.blocked).not.toHaveLength(0);
    expect(result.plan.artifacts).toHaveLength(0);
  });

  it("allows file-id transport when metadata value is a provider-internal handle under noPublicUrl", () => {
    const input = artifact.audio("ignored.mp3", {
      id: "audio-file-uri-internal",
      mediaType: "audio/mpeg",
      metadata: { geminiFileUri: "files/audio-123" },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "gemini" }),
      policy: { noPublicUrl: true },
    });

    expect(result.blocked).toHaveLength(0);
    expect(result.plan.artifacts[0]?.transport).toBe("file-id");
  });

  it("blocks restricted media from base64 and file-reference transport", () => {
    const input = artifact.image(new Blob(["secret"], { type: "image/png" }), {
      id: "restricted-image",
      privacy: "restricted",
      metadata: { anthropicFileId: "file_secret" },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "anthropic" }),
    });

    expect(result.plan.artifacts).toEqual([]);
    expect(result.blocked).toEqual([
      "No policy-safe transport for artifact restricted-image.",
    ]);
  });

  it("blocks oversized inline media when no file reference is available", () => {
    const input = artifact.image(new Blob(["small"], { type: "image/png" }), {
      id: "large-image",
      size: { bytes: 101 * 1024 * 1024 },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "gemini" }),
    });

    expect(result.plan.artifacts).toEqual([]);
    expect(result.blocked).toEqual(["No policy-safe transport for artifact large-image."]);
    expect(result.plan.warnings).toContain(
      "Artifact large-image exceeds inline media limit and needs a file reference.",
    );
  });

  it("skips provider file references when noUpload policy is set and falls back to base64", () => {
    const input = artifact.image(new Blob(["png"], { type: "image/png" }), {
      id: "file-id-with-inline",
      metadata: { anthropicFileId: "file_existing" },
    });

    const result = packageArtifactsForProvider({
      artifacts: [input],
      route: route({ providerId: "anthropic" }),
      policy: { noUpload: true },
    });

    expect(result.blocked).toEqual([]);
    expect(result.plan.artifacts[0]?.transport).toBe("base64");
    expect(result.plan.artifacts[0]?.providerRequest?.shape).toBe("anthropic:image.base64");
  });
});
