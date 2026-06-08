// Phase 34 — NEG-01 / NEG-02 — Unit tests for the top-level
// negotiateCapabilities helper and synthesizeNegotiatedCapabilitiesFromRegistry.
//
// Coverage:
//   1. When adapter HAS negotiateCapabilities, helper delegates verbatim
//   2. When adapter has NO negotiateCapabilities, helper synthesizes from
//      Phase 33 static registry (anthropic:claude-opus-4 — known profile)
//   3. When adapter has no negotiateCapabilities AND registry has no profile,
//      helper returns empty-stub NegotiatedCapabilities with source "registry"
//   4. NegotiationAuthError shape: instanceof checks, kind, httpStatus, adapter, modelId

import { describe, expect, it, vi } from "vitest";
import type { NegotiatedCapabilities } from "../src/capabilities/negotiate.js";
import {
  NegotiationAuthError,
  negotiateCapabilities,
} from "../src/capabilities/negotiate.js";
import type { ProviderAdapter } from "../src/providers/provider.js";

describe("negotiateCapabilities helper — delegation path (D-02 / Pitfall 5)", () => {
  it("delegates verbatim to adapter.negotiateCapabilities when present", async () => {
    const mockResult: NegotiatedCapabilities = {
      modelId: "test-model",
      contextWindow: 200_000,
      supports: {
        nativeToolCalling: true,
        structuredOutputs: true,
        parallelToolCalls: true,
        extendedThinking: true,
        streaming: true,
      },
      knownFailureModes: [],
      recommendedSanitizers: [],
      source: "live",
    };

    const mockFn = vi.fn().mockResolvedValue(mockResult);
    const adapter: ProviderAdapter & {
      negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
    } = {
      id: "anthropic",
      kind: "provider-adapter",
      negotiateCapabilities: mockFn,
    };

    const result = await negotiateCapabilities(adapter, "test-model");

    expect(result).toBe(mockResult);
    expect(mockFn).toHaveBeenCalledOnce();
    expect(mockFn).toHaveBeenCalledWith("test-model");
  });
});

describe("negotiateCapabilities helper — registry fallback path (D-04)", () => {
  it("synthesizes from registry with source 'registry' when adapter has no negotiateCapabilities", async () => {
    // anthropic:claude-opus-4 is a static profile in Phase 33 (registry.static.ts)
    const adapter: ProviderAdapter = {
      id: "anthropic",
      kind: "provider-adapter",
    };

    const result = await negotiateCapabilities(adapter, "claude-opus-4");

    expect(result.source).toBe("registry");
    expect(result.modelId).toBe("claude-opus-4");
    // Static profile has knownFailureModes; verify it came through
    expect(Array.isArray(result.knownFailureModes)).toBe(true);
    expect(result.contextWindow).toBeGreaterThan(0);
  });

  it("returns empty-stub with source 'registry' when registry has no matching profile", async () => {
    const adapter: ProviderAdapter = {
      id: "openai",
      kind: "provider-adapter",
    };

    const result = await negotiateCapabilities(
      adapter,
      "nonexistent-model-id-test-12345",
    );

    expect(result.source).toBe("registry");
    expect(result.contextWindow).toBe(0);
    expect(result.knownFailureModes).toEqual([]);
    expect(result.recommendedSanitizers).toEqual([]);
    expect(result.supports.nativeToolCalling).toBe(false);
    expect(result.supports.extendedThinking).toBe(false);
  });
});

describe("NegotiationAuthError (D-10)", () => {
  it("is instanceof Error and instanceof NegotiationAuthError", () => {
    const err = new NegotiationAuthError(
      "anthropic",
      "claude-opus-4",
      401,
      "Anthropic /v1/models returned 401: check apiKey config.",
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NegotiationAuthError);
  });

  it("carries kind, adapter, modelId, httpStatus fields", () => {
    const err = new NegotiationAuthError(
      "openrouter",
      "openai/gpt-oss-120b",
      403,
      "OpenRouter /api/v1/models returned 403: check apiKey.",
    );

    expect(err.kind).toBe("negotiation-auth-failed");
    expect(err.adapter).toBe("openrouter");
    expect(err.modelId).toBe("openai/gpt-oss-120b");
    expect(err.httpStatus).toBe(403);
    expect(err.name).toBe("NegotiationAuthError");
    expect(err.message).toContain("403");
  });

  it("works with 401 httpStatus", () => {
    const err = new NegotiationAuthError(
      "gemini",
      "gemini-2.5-pro",
      401,
      "Gemini /v1beta/models returned 401.",
    );

    expect(err.httpStatus).toBe(401);
    expect(err.adapter).toBe("gemini");
  });
});
