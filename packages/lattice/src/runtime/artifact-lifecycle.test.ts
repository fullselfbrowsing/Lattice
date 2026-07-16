import { describe, expect, it, vi } from "vitest";

import {
  artifact,
  toArtifactRef,
  type ArtifactInput,
  type ArtifactRef,
} from "../artifacts/artifact.js";
import type { ArtifactStore } from "../storage/storage.js";
import {
  ArtifactLifecycleFailure,
  persistArtifactLifecycle,
  persistArtifactLifecycleBatch,
} from "./artifact-lifecycle.js";

describe("persistArtifactLifecycle", () => {
  it("returns an unconfigured skip with a local hash and effective privacy", async () => {
    const result = await persistArtifactLifecycle(
      {
        artifact: artifact.text("local", { id: "artifact:local" }),
        lifecycle: "input",
      },
      { policy: { privacy: "restricted" } },
    );

    expect(result.report).toMatchObject({
      status: "skipped",
      reason: "unconfigured",
      lifecycle: "input",
      artifactId: "artifact:local",
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(result.artifact.privacy).toBe("restricted");
    expect(result.report.ref).not.toHaveProperty("value");
  });

  it("skips retention-none writes even when upload is also forbidden", async () => {
    const put = vi.fn<ArtifactStore["put"]>();
    const store = createStore("store:skip", put);
    const result = await persistArtifactLifecycle(
      {
        artifact: artifact.text("skip", { id: "artifact:skip" }),
        lifecycle: "input",
      },
      {
        storage: store,
        policy: { retention: "none", noUpload: true },
      },
    );

    expect(result.report).toMatchObject({
      status: "skipped",
      reason: "policy",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("does not treat noUpload as a local persistence prohibition", async () => {
    const put = vi.fn<ArtifactStore["put"]>(async (input) =>
      toArtifactRef(input));
    const store = createStore("store:local", put);
    const result = await persistArtifactLifecycle(
      {
        artifact: artifact.text("persist", { id: "artifact:persist" }),
        lifecycle: "input",
      },
      { storage: store, policy: { noUpload: true } },
    );

    expect(result.report.status).toBe("stored");
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[0].storage).toEqual({
      storeId: "store:local",
      key: "artifact:persist",
      retention: "session",
    });
  });

  it("surfaces a custom returned ref unchanged and derives its hash separately", async () => {
    const returnedRef: ArtifactRef = {
      id: "artifact:custom",
      kind: "text",
      source: "inline",
      privacy: "sensitive",
      fingerprint: { algorithm: "sha256", value: "store-fingerprint" },
      storage: {
        storeId: "store:custom",
        key: "custom/key",
        tenantId: "tenant:a",
        retention: "durable",
      },
    };
    const store = createStore(
      "store:custom",
      vi.fn(async () => returnedRef),
    );
    const result = await persistArtifactLifecycle(
      {
        artifact: artifact.text("value", {
          id: "artifact:custom",
          privacy: "sensitive",
        }),
        lifecycle: "derived",
      },
      {
        storage: store,
        policy: { tenantId: "tenant:a", retention: "durable" },
      },
    );

    expect(result.report.status).toBe("stored");
    expect(result.report.ref).toBe(returnedRef);
    expect(result.report.inputHash).toBe("store-fingerprint");
    expect(result.artifact).toEqual({ ...returnedRef, value: "value" });
  });

  it("preserves a compatible reference-only artifact without writing", async () => {
    const put = vi.fn<ArtifactStore["put"]>();
    const store = createStore("store:existing", put);
    const input: ArtifactInput = {
      id: "artifact:existing",
      kind: "document",
      source: "file",
      privacy: "restricted",
      storage: {
        storeId: "store:existing",
        key: "existing/key",
        tenantId: "tenant:a",
        retention: "durable",
      },
      fingerprint: { algorithm: "sha256", value: "existing-fingerprint" },
    };
    const result = await persistArtifactLifecycle(
      { artifact: input, lifecycle: "summary" },
      {
        storage: store,
        policy: {
          tenantId: "tenant:a",
          retention: "durable",
          privacy: "sensitive",
        },
      },
    );

    expect(result.report).toMatchObject({
      status: "preserved",
      ref: toArtifactRef(input),
      inputHash: "existing-fingerprint",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    [
      "tenant",
      {
        storage: {
          storeId: "store:existing",
          key: "key",
          retention: "session" as const,
        },
        privacy: "restricted" as const,
      },
      { tenantId: "tenant:a" },
    ],
    [
      "retention",
      {
        storage: {
          storeId: "store:existing",
          key: "key",
          retention: "session" as const,
        },
        privacy: "restricted" as const,
      },
      { retention: "durable" as const },
    ],
    [
      "privacy",
      {
        storage: {
          storeId: "store:existing",
          key: "key",
          retention: "session" as const,
        },
        privacy: "standard" as const,
      },
      { privacy: "restricted" as const },
    ],
  ])("rejects incompatible reference-only %s scope", async (_name, refFields, policy) => {
    const store = createStore("store:existing", vi.fn());
    const input: ArtifactInput = {
      id: "artifact:existing",
      kind: "document",
      source: "file",
      ...refFields,
    };

    await expect(
      persistArtifactLifecycle(
        { artifact: input, lifecycle: "input" },
        { storage: store, policy },
      ),
    ).rejects.toBeInstanceOf(ArtifactLifecycleFailure);
  });

  it("wraps store faults without exposing the raw cause in its message", async () => {
    const cause = new Error("SECRET storage endpoint failed");
    const store = createStore(
      "store:fault",
      vi.fn(async () => {
        throw cause;
      }),
    );

    await expect(
      persistArtifactLifecycle(
        {
          artifact: artifact.text("value", { id: "artifact:fault" }),
          lifecycle: "provider-output",
        },
        { storage: store, postProvider: true },
      ),
    ).rejects.toMatchObject({
      name: "ArtifactLifecycleFailure",
      operation: "write",
      lifecycle: "provider-output",
      artifactId: "artifact:fault",
      storeId: "store:fault",
      postProvider: true,
      message: "Artifact lifecycle write failed.",
      cause,
    });
  });

  it("fails closed when a store returns a mismatched artifact ref", async () => {
    const store = createStore(
      "store:invalid",
      vi.fn(async (input) => ({
        ...toArtifactRef(input),
        id: "artifact:wrong",
      })),
    );

    await expect(
      persistArtifactLifecycle(
        {
          artifact: artifact.text("value", { id: "artifact:expected" }),
          lifecycle: "input",
        },
        { storage: store },
      ),
    ).rejects.toMatchObject({
      name: "ArtifactLifecycleFailure",
      operation: "write",
      lifecycle: "input",
      artifactId: "artifact:expected",
      storeId: "store:invalid",
      postProvider: false,
      message: "Artifact store returned a mismatched artifact reference.",
    });
  });

  it("processes batch writes in stable declaration order", async () => {
    const order: string[] = [];
    const store = createStore(
      "store:order",
      vi.fn(async (input) => {
        order.push(input.id);
        return toArtifactRef(input);
      }),
    );
    const results = await persistArtifactLifecycleBatch(
      ["a", "b", "c"].map((id) => ({
        artifact: artifact.text(id, { id: `artifact:${id}` }),
        lifecycle: "input" as const,
      })),
      { storage: store },
    );

    expect(order).toEqual(["artifact:a", "artifact:b", "artifact:c"]);
    expect(results.map((result) => result.report.artifactId)).toEqual(order);
  });
});

function createStore(
  id: string,
  put: ArtifactStore["put"],
): ArtifactStore {
  return {
    kind: "artifact-store",
    id,
    put,
    async get() {
      return undefined;
    },
    async load() {
      return undefined;
    },
    async has() {
      return false;
    },
    async delete() {
      return false;
    },
    async list() {
      return [];
    },
  };
}
