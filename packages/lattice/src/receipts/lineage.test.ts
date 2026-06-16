import { describe, expect, it } from "vitest";

import { artifact } from "../artifacts/artifact.js";

import { computeArtifactLineageMerkleRoot } from "./lineage.js";

describe("computeArtifactLineageMerkleRoot", () => {
  it("returns undefined when no artifact carries lineage", async () => {
    const root = await computeArtifactLineageMerkleRoot([
      artifact.text("plain", { id: "artifact:text:plain" }),
    ]);
    expect(root).toBeUndefined();
  });

  it("returns a sha256 root for lineage-bearing artifacts", async () => {
    const source = artifact.text("source payload", {
      id: "artifact:text:source",
      metadata: { document: "notes" },
    });
    const derived = artifact.derive({
      id: "artifact:text:derived",
      kind: "text",
      value: "derived payload",
      parents: [source],
      transform: { kind: "extraction", name: "quote" },
    });

    const root = await computeArtifactLineageMerkleRoot([source, derived]);

    expect(root).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("is independent of top-level artifact order", async () => {
    const source = artifact.text("source", { id: "artifact:text:source" });
    const first = artifact.derive({
      id: "artifact:text:first",
      kind: "text",
      value: "first",
      parents: [source],
      transform: { kind: "chunking", name: "first" },
    });
    const second = artifact.derive({
      id: "artifact:text:second",
      kind: "text",
      value: "second",
      parents: [source],
      transform: { kind: "chunking", name: "second" },
    });

    await expect(computeArtifactLineageMerkleRoot([first, second])).resolves.toBe(
      await computeArtifactLineageMerkleRoot([second, first]),
    );
  });

  it("changes when lineage descriptors change", async () => {
    const source = artifact.text("source", { id: "artifact:text:source" });
    const a = artifact.derive({
      id: "artifact:text:derived",
      kind: "text",
      value: "same payload",
      parents: [source],
      transform: { kind: "extraction", name: "summary" },
    });
    const b = artifact.derive({
      id: "artifact:text:derived",
      kind: "text",
      value: "same payload",
      parents: [source],
      transform: { kind: "transcription", name: "summary" },
    });

    expect(await computeArtifactLineageMerkleRoot([a])).not.toBe(
      await computeArtifactLineageMerkleRoot([b]),
    );
  });

  it("does not hash raw artifact values", async () => {
    const source = artifact.text("source", { id: "artifact:text:source" });
    const a = artifact.derive({
      id: "artifact:text:derived",
      kind: "text",
      value: "private payload one",
      parents: [source],
      transform: { kind: "extraction", name: "summary" },
    });
    const b = artifact.derive({
      id: "artifact:text:derived",
      kind: "text",
      value: "private payload two",
      parents: [source],
      transform: { kind: "extraction", name: "summary" },
    });

    expect(await computeArtifactLineageMerkleRoot([a])).toBe(
      await computeArtifactLineageMerkleRoot([b]),
    );
  });

  it("normalizes parent order inside nested lineage", async () => {
    const left = artifact.text("left", { id: "artifact:text:left" });
    const right = artifact.text("right", { id: "artifact:text:right" });
    const a = artifact.derive({
      id: "artifact:text:merged",
      kind: "text",
      value: "merged",
      parents: [left, right],
      transform: { kind: "generated", name: "merge" },
    });
    const b = artifact.derive({
      id: "artifact:text:merged",
      kind: "text",
      value: "merged",
      parents: [right, left],
      transform: { kind: "generated", name: "merge" },
    });

    expect(await computeArtifactLineageMerkleRoot([a])).toBe(
      await computeArtifactLineageMerkleRoot([b]),
    );
  });
});
