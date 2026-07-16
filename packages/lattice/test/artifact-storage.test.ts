import { describe, expect, it } from "vitest";

import { artifact } from "../src/artifacts/artifact.js";
import { createMemoryArtifactStore } from "../src/storage/memory.js";

describe("memory artifact store", () => {
  it("stores payload-free refs separately from payload loading", async () => {
    const store = createMemoryArtifactStore({ id: "mem-test" });
    const input = artifact.text("hello", { id: "artifact:text:hello" });

    const ref = await store.put(input);

    expect(ref).toMatchObject({
      id: "artifact:text:hello",
      kind: "text",
      source: "inline",
      mediaType: "text/plain",
      privacy: "standard",
      storage: {
        storeId: "mem-test",
        key: "artifact:text:hello",
      },
      fingerprint: {
        algorithm: "sha256",
        value: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      },
    });
    expect("value" in ref).toBe(false);

    const metadataOnly = await store.get(input.id);
    expect(metadataOnly).toEqual(ref);
    expect(metadataOnly).not.toHaveProperty("value");

    const loaded = await store.load(input.id);
    expect(loaded).toMatchObject({
      ...ref,
      value: "hello",
    });
  });

  it("tracks store state through has, list, and delete", async () => {
    const store = createMemoryArtifactStore({ id: "mem-state" });
    const first = await store.put(artifact.text("first", { id: "artifact:text:first" }));
    const second = await store.put(artifact.json({ ok: true }, { id: "artifact:json:second" }));

    await expect(store.has(first.id)).resolves.toBe(true);
    await expect(store.has("missing")).resolves.toBe(false);
    await expect(store.list()).resolves.toEqual([first, second]);

    await expect(store.delete(first.id)).resolves.toBe(true);
    await expect(store.delete(first.id)).resolves.toBe(false);
    await expect(store.has(first.id)).resolves.toBe(false);
    await expect(store.list()).resolves.toEqual([second]);
    await expect(store.load(first.id)).resolves.toBeUndefined();
  });

  it("preserves tenant, retention, and privacy scope across store reads", async () => {
    const store = createMemoryArtifactStore({ id: "mem-scoped" });
    const input = {
      ...artifact.text("scoped", {
        id: "artifact:text:scoped",
        privacy: "restricted",
      }),
      storage: {
        storeId: "lifecycle-hint",
        key: "lifecycle-hint",
        tenantId: "tenant:a",
        retention: "durable" as const,
      },
    };

    const ref = await store.put(input);

    expect(ref).toMatchObject({
      privacy: "restricted",
      storage: {
        storeId: "mem-scoped",
        key: input.id,
        tenantId: "tenant:a",
        retention: "durable",
      },
    });
    await expect(store.get(input.id)).resolves.toEqual(ref);
    await expect(store.load(input.id)).resolves.toEqual({
      ...ref,
      value: "scoped",
    });
    await expect(store.list()).resolves.toEqual([ref]);
  });

  it("uses memory as the default store id", () => {
    expect(createMemoryArtifactStore().id).toBe("memory");
    expect(createMemoryArtifactStore().kind).toBe("artifact-store");
  });
});
