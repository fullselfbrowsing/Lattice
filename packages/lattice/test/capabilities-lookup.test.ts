// Phase 33 — CAPS-02 — Lookup-surface vitest suite.
//
// Verifies the D-09 strict lookup, D-10 fuzzy lookup, and D-11 OpenRouter
// variant suffix-strip behavior against the public surface re-exported by
// src/index.ts. Bootstrap-empty registries (Plan 33-02 Task 1) produce
// empty lookup results; the adapter-ordering test injects fake profiles
// via vi.doMock to prove the D-10 ordering contract is real.
//
// Anchor case study: session_1780792387779 — `findCapabilityProfile`
// applied to the case-study id `openai/gpt-oss-120b:free` strips the
// variant suffix to `openai/gpt-oss-120b` (Pitfall 4 regression guard);
// Plan 33-04 asserts the same call against the populated registry.

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Phase 33 lookup — stripOpenRouterVariant (D-11)", () => {
  it("strips :free suffix on OpenRouter-shaped ids", async () => {
    const { stripOpenRouterVariant } = await import("../src/index.js");
    expect(stripOpenRouterVariant("openai/gpt-oss-120b:free")).toBe(
      "openai/gpt-oss-120b",
    );
  });

  it("strips :thinking suffix on OpenRouter-shaped ids", async () => {
    const { stripOpenRouterVariant } = await import("../src/index.js");
    expect(stripOpenRouterVariant("openai/gpt-oss-120b:thinking")).toBe(
      "openai/gpt-oss-120b",
    );
  });

  it("passes through ids without a variant suffix", async () => {
    const { stripOpenRouterVariant } = await import("../src/index.js");
    expect(stripOpenRouterVariant("openai/gpt-oss-120b")).toBe(
      "openai/gpt-oss-120b",
    );
  });

  it("does NOT strip non-OpenRouter-shaped ids (D-11 scope discipline)", async () => {
    const { stripOpenRouterVariant } = await import("../src/index.js");
    // Direct-adapter canonical key (no slash before colon) — passthrough.
    expect(stripOpenRouterVariant("anthropic:claude-opus-4")).toBe(
      "anthropic:claude-opus-4",
    );
  });

  it("does NOT strip unrecognized variant suffixes (Pitfall 4 regression)", async () => {
    const { stripOpenRouterVariant } = await import("../src/index.js");
    // `:beta` is NOT in the current OpenRouter variant set (`:free`,
    // `:thinking`) — passthrough.
    expect(stripOpenRouterVariant("openai/gpt-4o:beta")).toBe(
      "openai/gpt-4o:beta",
    );
  });
});

describe("Phase 33 lookup — getCapabilityProfile (D-09) against bootstrap registry", () => {
  it("returns undefined when the registry has no profiles for the key", async () => {
    const { getCapabilityProfile } = await import("../src/index.js");
    expect(
      getCapabilityProfile("openrouter:openai/gpt-oss-120b"),
    ).toBeUndefined();
  });

  it("returns undefined for an obviously bogus key (no throw)", async () => {
    const { getCapabilityProfile } = await import("../src/index.js");
    expect(getCapabilityProfile("not-a-real-key")).toBeUndefined();
  });

  it("is case-sensitive on canonical keys", async () => {
    const { getCapabilityProfile } = await import("../src/index.js");
    // Both queries fail against the empty bootstrap registry; the
    // contract is that strict lookup does no case folding — Plan 04
    // will populate `openrouter:openai/gpt-oss-120b` (lower-case) and
    // an upper-case query MUST still miss.
    expect(
      getCapabilityProfile("OPENROUTER:openai/gpt-oss-120b"),
    ).toBeUndefined();
  });
});

describe("Phase 33 lookup — findCapabilityProfile (D-10) against bootstrap registry", () => {
  it("returns [] when the registry has no profiles", async () => {
    const { findCapabilityProfile } = await import("../src/index.js");
    expect(findCapabilityProfile("openai/gpt-oss-120b")).toEqual([]);
  });

  it("returns [] for the case-study id with variant (suffix stripped, still no match)", async () => {
    const { findCapabilityProfile } = await import("../src/index.js");
    // session_1780792387779 anchor: gpt-oss-120b:free — strip + lookup,
    // still empty pre-Plan-04. Plan 04 will replace this assertion with
    // the populated-registry equivalent.
    expect(findCapabilityProfile("openai/gpt-oss-120b:free")).toEqual([]);
  });
});

describe("Phase 33 lookup — adapter ordering (D-10) via vi.doMock injection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns direct-adapter profiles before openrouter profiles", async () => {
    // Inject a fake registry that exposes the SAME model id under TWO
    // adapters (anthropic + openrouter). Verify the order returned is
    // anthropic first, openrouter last (D-10 contract).
    vi.doMock("../src/capabilities/registry.static.js", () => ({
      STATIC_PROFILES: [
        {
          id: "claude-opus-4",
          adapter: "anthropic",
          originFamily: "anthropic",
          trainingClass: "frontier_rlhf",
          reasoningSurface: "none",
          toolCallSurface: "native_strict",
          contextWindow: 200000,
          knownFailureModes: [],
          recommendedPromptStrategy: "frontier",
        },
        {
          id: "claude-opus-4",
          adapter: "openrouter",
          originFamily: "anthropic",
          trainingClass: "frontier_rlhf",
          reasoningSurface: "none",
          toolCallSurface: "native_strict",
          contextWindow: 200000,
          knownFailureModes: [],
          recommendedPromptStrategy: "frontier",
        },
      ],
    }));
    vi.doMock("../src/capabilities/registry.generated.js", () => ({
      GENERATED_PROFILES: [],
    }));
    const { findCapabilityProfile } = await import(
      "../src/capabilities/lookup.js"
    );
    const results = findCapabilityProfile("claude-opus-4");
    expect(results.map((p) => p.adapter)).toEqual(["anthropic", "openrouter"]);
  });

  it("anchor case study: findCapabilityProfile('openai/gpt-oss-120b:free') strips suffix and finds the openrouter profile", async () => {
    // session_1780792387779: gpt-oss-120b on FSB autopilot. The fuzzy
    // lookup MUST strip `:free` and find the openrouter profile when
    // the registry is populated. Plan 04 verifies the SAME assertion
    // against the live OpenRouter snapshot.
    vi.doMock("../src/capabilities/registry.static.js", () => ({
      STATIC_PROFILES: [],
    }));
    vi.doMock("../src/capabilities/registry.generated.js", () => ({
      GENERATED_PROFILES: [
        {
          id: "openai/gpt-oss-120b",
          adapter: "openrouter",
          originFamily: "openai",
          trainingClass: "open_weight_instruct",
          reasoningSurface: "none",
          toolCallSurface: "native_lenient",
          contextWindow: 131072,
          knownFailureModes: [
            "internal_envelope_leak",
            "system_prompt_echo",
            "malformed_tool_arguments",
          ],
          recommendedPromptStrategy: "open_weight",
        },
      ],
    }));
    const { findCapabilityProfile } = await import(
      "../src/capabilities/lookup.js"
    );
    const results = findCapabilityProfile("openai/gpt-oss-120b:free");
    expect(results).toHaveLength(1);
    expect(results[0]?.adapter).toBe("openrouter");
    expect(results[0]?.id).toBe("openai/gpt-oss-120b");
    expect(results[0]?.knownFailureModes).toContain("internal_envelope_leak");
  });

  it("findCapabilityProfile on a non-OpenRouter id does NOT strip (D-11 scope discipline)", async () => {
    // The id `claude-opus-4` is a direct-adapter shape (no slash). The
    // suffix-strip rule does not apply. With both anthropic and lm-studio
    // profiles registered, the lookup returns both in deterministic order:
    // anthropic (index 0 in ADAPTER_ORDER), lm-studio (index 5).
    vi.doMock("../src/capabilities/registry.static.js", () => ({
      STATIC_PROFILES: [
        {
          id: "claude-opus-4",
          adapter: "anthropic",
          originFamily: "anthropic",
          trainingClass: "frontier_rlhf",
          reasoningSurface: "none",
          toolCallSurface: "native_strict",
          contextWindow: 200000,
          knownFailureModes: [],
          recommendedPromptStrategy: "frontier",
        },
        {
          id: "claude-opus-4",
          adapter: "lm-studio",
          originFamily: "anthropic",
          trainingClass: "local_quantized",
          reasoningSurface: "none",
          toolCallSurface: "none",
          contextWindow: 32768,
          knownFailureModes: ["internal_envelope_leak"],
          recommendedPromptStrategy: "local",
        },
      ],
    }));
    vi.doMock("../src/capabilities/registry.generated.js", () => ({
      GENERATED_PROFILES: [],
    }));
    const { findCapabilityProfile } = await import(
      "../src/capabilities/lookup.js"
    );
    const results = findCapabilityProfile("claude-opus-4");
    expect(results.map((p) => p.adapter)).toEqual(["anthropic", "lm-studio"]);
  });

  it("strict getCapabilityProfile retrieves an injected profile by canonical key", async () => {
    vi.doMock("../src/capabilities/registry.static.js", () => ({
      STATIC_PROFILES: [
        {
          id: "claude-opus-4",
          adapter: "anthropic",
          originFamily: "anthropic",
          trainingClass: "frontier_rlhf",
          reasoningSurface: "none",
          toolCallSurface: "native_strict",
          contextWindow: 200000,
          knownFailureModes: [],
          recommendedPromptStrategy: "frontier",
        },
      ],
    }));
    vi.doMock("../src/capabilities/registry.generated.js", () => ({
      GENERATED_PROFILES: [],
    }));
    const { getCapabilityProfile } = await import(
      "../src/capabilities/lookup.js"
    );
    const profile = getCapabilityProfile("anthropic:claude-opus-4");
    expect(profile).toBeDefined();
    expect(profile?.adapter).toBe("anthropic");
    expect(profile?.id).toBe("claude-opus-4");
  });
});
