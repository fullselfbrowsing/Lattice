import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { artifact } from "../src/artifacts/artifact.js";
import { createLocalArtifactStore } from "../src/storage/local.js";

describe("local filesystem artifact store", () => {
  it("writes inspectable metadata and separate JSON payload files", async () => {
    const rootDir = await createTempDir();
    const store = createLocalArtifactStore(rootDir, { id: "local-test" });
    const input = artifact.json({ ok: true }, { id: "artifact:json:case-1" });

    const ref = await store.put(input);
    const artifactDir = join(rootDir, "artifacts", encodeURIComponent(input.id));
    const metadataPath = join(artifactDir, "metadata.json");
    const payloadPath = join(artifactDir, "payload.json");
    const envelope = JSON.parse(await readFile(metadataPath, "utf8"));

    expect(envelope).toMatchObject({
      version: 1,
      ref: {
        id: input.id,
        kind: "json",
        source: "inline",
        storage: {
          storeId: "local-test",
          key: input.id,
        },
        fingerprint: {
          algorithm: "sha256",
        },
      },
      payload: {
        kind: "json",
        path: "payload.json",
      },
    });
    expect(envelope.ref).not.toHaveProperty("value");
    expect(JSON.parse(await readFile(payloadPath, "utf8"))).toEqual({ ok: true });

    const metadataOnly = await store.get(input.id);
    expect(metadataOnly).toEqual(ref);
    expect(metadataOnly).not.toHaveProperty("value");

    const loaded = await store.load(input.id);
    expect(loaded).toEqual({
      ...ref,
      value: { ok: true },
    });
  });

  it("stores Blob payload bytes separately from metadata", async () => {
    const rootDir = await createTempDir();
    const store = createLocalArtifactStore(new URL(`file://${rootDir}/`), {
      id: "local-binary",
    });
    const input = artifact.file(
      new Blob([new Uint8Array([1, 2, 3])], {
        type: "application/octet-stream",
      }),
      { id: "artifact:file:bytes" },
    );

    await store.put(input);

    const artifactDir = join(rootDir, "artifacts", encodeURIComponent(input.id));
    const envelope = JSON.parse(await readFile(join(artifactDir, "metadata.json"), "utf8"));
    const bytes = await readFile(join(artifactDir, "payload.bin"));

    expect(envelope.payload).toEqual({
      kind: "binary",
      path: "payload.bin",
    });
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("lists refs sorted by id and deletes artifact directories", async () => {
    const rootDir = await createTempDir();
    const store = createLocalArtifactStore(rootDir, { id: "local-state" });
    const second = await store.put(artifact.text("second", { id: "artifact:text:b" }));
    const first = await store.put(artifact.text("first", { id: "artifact:text:a" }));

    await expect(store.list()).resolves.toEqual([first, second]);
    await expect(store.has(first.id)).resolves.toBe(true);

    const artifactDir = join(rootDir, "artifacts", encodeURIComponent(first.id));
    await expect(store.delete(first.id)).resolves.toBe(true);
    await expect(stat(artifactDir)).rejects.toThrow();
    await expect(store.delete(first.id)).resolves.toBe(false);
    await expect(store.has(first.id)).resolves.toBe(false);
  });

  it("preserves tenant, retention, and privacy scope in persisted metadata", async () => {
    const rootDir = await createTempDir();
    const store = createLocalArtifactStore(rootDir, { id: "local-scoped" });
    const input = {
      ...artifact.text("scoped", {
        id: "artifact:text:scoped",
        privacy: "sensitive",
      }),
      storage: {
        storeId: "lifecycle-hint",
        key: "lifecycle-hint",
        tenantId: "tenant:a",
        retention: "durable" as const,
      },
    };

    const ref = await store.put(input);
    const artifactDir = join(rootDir, "artifacts", encodeURIComponent(input.id));
    const envelope = JSON.parse(
      await readFile(join(artifactDir, "metadata.json"), "utf8"),
    );

    expect(ref).toMatchObject({
      privacy: "sensitive",
      storage: {
        storeId: "local-scoped",
        key: input.id,
        tenantId: "tenant:a",
        retention: "durable",
      },
    });
    expect(envelope.ref).toEqual(ref);
    await expect(store.get(input.id)).resolves.toEqual(ref);
    await expect(store.load(input.id)).resolves.toEqual({
      ...ref,
      value: "scoped",
    });
    await expect(store.list()).resolves.toEqual([ref]);
  });

  it("uses local as the default store id", () => {
    expect(createLocalArtifactStore("/tmp/lattice-artifacts").id).toBe("local");
    expect(createLocalArtifactStore("/tmp/lattice-artifacts").kind).toBe("artifact-store");
  });
});

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lattice-artifacts-"));
}
