import { describe, expect, it } from "vitest";

import { artifact } from "../src/artifacts/artifact.js";
import { mergePolicy, type PolicySpec } from "../src/policy/policy.js";
import type {
  ProviderAdapter,
  ProviderRef,
} from "../src/providers/provider.js";
import {
  normalizeConfig,
  type LatticeConfig,
} from "../src/runtime/config.js";
import { createMemoryArtifactStore } from "../src/storage/memory.js";
import type { TracerLike } from "../src/tracing/tracing.js";

describe("phase 1 runtime contracts", () => {
  it("accepts opaque provider refs and adapters", async () => {
    const providerRef = {
      id: "fixture",
      kind: "provider-ref",
    } satisfies ProviderRef;

    const adapter = {
      id: "fixture-adapter",
      kind: "provider-adapter",
      execute: async (request) => {
        expect(request).toMatchObject({
          task: "Extract the answer",
          outputs: ["answer"],
        });

        return {
          rawOutputs: {
            answer: "ok",
          },
        };
      },
    } satisfies ProviderAdapter;

    await expect(
      adapter.execute?.({
        task: "Extract the answer",
        artifacts: [],
        outputs: ["answer"],
        policy: { maxCostUsd: 1 },
      }),
    ).resolves.toEqual({
      rawOutputs: {
        answer: "ok",
      },
    });

    expect(providerRef).toEqual({
      id: "fixture",
      kind: "provider-ref",
    });
  });

  it("merges policy defaults and run overrides with nested gateway preservation", () => {
    const defaultPolicy: PolicySpec = {
      maxCostUsd: 10,
      latency: "interactive",
      privacy: "sensitive",
      providerAllowList: ["fixture"],
      providerDenyList: ["legacy"],
      noUpload: true,
      noPublicUrl: true,
      noLogging: false,
      metadata: {
        scope: "default",
      },
      gateway: {
        routeTags: ["prod"],
        providerPreferences: ["openai", "anthropic"],
        metadata: {
          trace_id: "default-trace",
          shared: "default",
        },
        allowFallbacks: false,
      },
    };

    const runPolicy: PolicySpec = {
      maxCostUsd: 2,
      noLogging: true,
      metadata: {
        scope: "run",
      },
      gateway: {
        metadata: {
          shared: "run",
          generation_name: "case-1",
        },
        allowFallbacks: true,
      },
    };

    expect(mergePolicy(defaultPolicy, runPolicy)).toEqual({
      maxCostUsd: 2,
      latency: "interactive",
      privacy: "sensitive",
      providerAllowList: ["fixture"],
      providerDenyList: ["legacy"],
      noUpload: true,
      noPublicUrl: true,
      noLogging: true,
      metadata: {
        scope: "run",
      },
      gateway: {
        routeTags: ["prod"],
        providerPreferences: ["openai", "anthropic"],
        metadata: {
          trace_id: "default-trace",
          shared: "run",
          generation_name: "case-1",
        },
        allowFallbacks: true,
      },
    });
    expect(mergePolicy()).toBeUndefined();
  });

  it("creates phase 1 artifact helper stubs", () => {
    expect(artifact.text("hello")).toMatchObject({
      kind: "text",
      source: "inline",
      mediaType: "text/plain",
      value: "hello",
    });

    expect(
      artifact.file("invoice.pdf", { mediaType: "application/pdf" }),
    ).toMatchObject({
      kind: "file",
      source: "file",
      mediaType: "application/pdf",
      value: "invoice.pdf",
    });
  });

  it("normalizes string providers and preserves policy defaults", () => {
    const policy: PolicySpec = {
      maxCostUsd: 5,
      latency: "batch",
      privacy: "restricted",
      noUpload: true,
    };

    const normalized = normalizeConfig({ providers: ["fixture"], defaults: { policy } });

    expect(normalized.providers).toEqual([
      {
        id: "fixture",
        kind: "provider-ref",
      },
    ]);
    expect(normalized.defaults.policy).toBe(policy);
  });

  it("normalizes disabled storage and tracing out of config", () => {
    const disabled = normalizeConfig({
      storage: false,
      tracing: false,
    });

    expect(disabled.storage).toBeUndefined();
    expect(disabled.tracing).toBeUndefined();

    const storage = createMemoryArtifactStore({ id: "config-store" });
    const tracing = {
      kind: "tracer",
      span: (_name, fn) => fn(),
    } satisfies TracerLike;
    const config = {
      storage,
      tracing,
    } satisfies LatticeConfig;

    const enabled = normalizeConfig(config);

    expect(enabled.storage).toBe(storage);
    expect(enabled.tracing).toBe(tracing);
  });
});
