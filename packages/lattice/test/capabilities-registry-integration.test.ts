// Phase 33 — CAPS-05 / CAPS-02 — Integration test suite.
//
// Exercises the populated registry (Plan 33-04) end-to-end via the public
// surface from src/index.ts. Asserts the structural success criteria locked
// in PLAN.md:
//
//   1. Coverage: GENERATED_PROFILES + STATIC_PROFILES >= 200 distinct
//      canonical keys (CAPS-05).
//   2. Static profile resolution: the 4 hand-edited supplemental profiles
//      (anthropic:claude-opus-4, gemini:gemini-2.5-pro, xai:grok-4,
//      lm-studio:local-template) each resolve via getCapabilityProfile.
//   3. Anchor case study session_1780792387779: openrouter:openai/gpt-oss-120b
//      ships trainingClass open_weight_instruct + knownFailureModes including
//      internal_envelope_leak. Variant (:free) resolves to the same class.
//   4. Variant symmetry (Pitfall 4): findCapabilityProfile strips the
//      OpenRouter :free suffix and returns the base entry.
//   5. Closed-union runtime invariants: every adapter / trainingClass /
//      reasoningSurface / toolCallSurface / recommendedPromptStrategy /
//      knownFailureMode value across the merged registry sits in its
//      typed closed union (defensive — catches a row that violated the
//      `as const satisfies` somehow at runtime).
//   6. No duplicate canonical keys: every `${adapter}:${id}` is unique
//      across the merged set.

import { describe, expect, it } from "vitest";
import {
  findCapabilityProfile,
  getCapabilityProfile,
} from "../src/index.js";
import type { ModelCapabilityProfile } from "../src/index.js";
import { GENERATED_PROFILES } from "../src/capabilities/registry.generated.js";
import { STATIC_PROFILES } from "../src/capabilities/registry.static.js";

const GENERATED_PROFILE_VIEW = GENERATED_PROFILES as readonly ModelCapabilityProfile[];

describe("Phase 33 registry — coverage (CAPS-05)", () => {
  it("ships at least 200 distinct canonical keys across generated + static", () => {
    const totalKeys = new Set<string>();
    for (const p of STATIC_PROFILES) totalKeys.add(`${p.adapter}:${p.id}`);
    for (const p of GENERATED_PROFILES) totalKeys.add(`${p.adapter}:${p.id}`);
    expect(totalKeys.size).toBeGreaterThanOrEqual(200);
  });

  it("ships exactly 4 static supplemental profiles per CONTEXT.md <specifics>", () => {
    expect(STATIC_PROFILES.length).toBe(4);
  });

  it("ships at least 200 generated profiles from the live OpenRouter snapshot", () => {
    expect(GENERATED_PROFILES.length).toBeGreaterThanOrEqual(200);
  });

  it("merged registry size equals generated + static (no canonical-key collisions)", () => {
    const mergedKeys = new Set<string>();
    for (const p of STATIC_PROFILES) mergedKeys.add(`${p.adapter}:${p.id}`);
    for (const p of GENERATED_PROFILES) mergedKeys.add(`${p.adapter}:${p.id}`);
    expect(mergedKeys.size).toBe(
      STATIC_PROFILES.length + GENERATED_PROFILES.length,
    );
  });
});

describe("Phase 33 registry — static direct-adapter coverage (CAPS-05)", () => {
  it("resolves anthropic:claude-opus-4 to a frontier_rlhf profile", () => {
    const p = getCapabilityProfile("anthropic:claude-opus-4");
    expect(p).toBeDefined();
    expect(p!.adapter).toBe("anthropic");
    expect(p!.trainingClass).toBe("frontier_rlhf");
    expect(p!.contextWindow).toBe(200000);
    expect(p!.recommendedPromptStrategy).toBe("frontier");
  });

  it("resolves gemini:gemini-2.5-pro to a frontier_rlhf profile with 2M context", () => {
    const p = getCapabilityProfile("gemini:gemini-2.5-pro");
    expect(p).toBeDefined();
    expect(p!.adapter).toBe("gemini");
    expect(p!.trainingClass).toBe("frontier_rlhf");
    expect(p!.contextWindow).toBe(2097152);
    expect(p!.recommendedPromptStrategy).toBe("frontier");
  });

  it("resolves xai:grok-4 to a frontier_rlhf profile with 128K context", () => {
    const p = getCapabilityProfile("xai:grok-4");
    expect(p).toBeDefined();
    expect(p!.adapter).toBe("xai");
    expect(p!.trainingClass).toBe("frontier_rlhf");
    expect(p!.contextWindow).toBe(131072);
  });

  it("resolves lm-studio:local-template to a local_quantized profile with all 5 default failure modes", () => {
    const p = getCapabilityProfile("lm-studio:local-template");
    expect(p).toBeDefined();
    expect(p!.adapter).toBe("lm-studio");
    expect(p!.trainingClass).toBe("local_quantized");
    expect(p!.recommendedPromptStrategy).toBe("local");
    expect(p!.knownFailureModes).toEqual(
      expect.arrayContaining([
        "internal_envelope_leak",
        "system_prompt_echo",
        "template_artifact_leak",
        "malformed_tool_arguments",
        "premature_termination",
      ]),
    );
    expect(p!.knownFailureModes.length).toBe(5);
  });
});

describe("Phase 33 registry — anchor case study session_1780792387779 (CAPS-02 + CAPS-03)", () => {
  it("getCapabilityProfile resolves openrouter:openai/gpt-oss-120b as open_weight_instruct with internal_envelope_leak", () => {
    const p = getCapabilityProfile("openrouter:openai/gpt-oss-120b");
    expect(p).toBeDefined();
    expect(p!.adapter).toBe("openrouter");
    expect(p!.trainingClass).toBe("open_weight_instruct");
    expect(p!.knownFailureModes).toContain("internal_envelope_leak");
    expect(p!.recommendedPromptStrategy).toBe("open_weight");
  });

  it("getCapabilityProfile resolves openrouter:openai/gpt-oss-120b:free with identical class to the base id (Pitfall 4 symmetry)", () => {
    const base = getCapabilityProfile("openrouter:openai/gpt-oss-120b");
    const variant = getCapabilityProfile("openrouter:openai/gpt-oss-120b:free");
    expect(base).toBeDefined();
    expect(variant).toBeDefined();
    expect(variant!.trainingClass).toBe(base!.trainingClass);
    expect(variant!.knownFailureModes).toEqual(base!.knownFailureModes);
    expect(variant!.recommendedPromptStrategy).toBe(
      base!.recommendedPromptStrategy,
    );
  });

  it("findCapabilityProfile strips the :free suffix and returns the openrouter profile", () => {
    const results = findCapabilityProfile("openai/gpt-oss-120b:free");
    // adapter order is direct-first; for gpt-oss-120b there is NO direct
    // entry, so the result is the single openrouter profile (the base id
    // after suffix-strip).
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(
      results.some(
        (p) => p.adapter === "openrouter" && p.id === "openai/gpt-oss-120b",
      ),
    ).toBe(true);
    // None of the results retain the :free variant id — they all resolve
    // to the base (suffix-stripped) lookup.
    expect(results.every((p) => !p.id.endsWith(":free"))).toBe(true);
  });

  it("findCapabilityProfile on the base id (no suffix) returns the openrouter profile directly", () => {
    const results = findCapabilityProfile("openai/gpt-oss-120b");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(
      results.some(
        (p) => p.adapter === "openrouter" && p.id === "openai/gpt-oss-120b",
      ),
    ).toBe(true);
  });
});

describe("Phase 42 registry — OpenRouter feed metadata", () => {
  it("captures supported parameter metadata in generated OpenRouter profiles", () => {
    const profile = GENERATED_PROFILE_VIEW.find(
      (p) => p.adapter === "openrouter" && Array.isArray(p.supportedParameters),
    );
    expect(profile).toBeDefined();
    expect(profile!.supportedParameters!.length).toBeGreaterThan(0);
  });

  it("keeps the gpt-oss anchor profile resolvable with optional pricing strings", () => {
    const profile = getCapabilityProfile("openrouter:openai/gpt-oss-120b");
    expect(profile).toBeDefined();
    expect(profile!.adapter).toBe("openrouter");
    if (profile!.pricing?.prompt !== undefined) {
      expect(typeof profile!.pricing.prompt).toBe("string");
    }
  });
});

describe("Phase 33 registry — fuzzy lookup against real data (D-10)", () => {
  it("findCapabilityProfile returns the anthropic direct profile when querying claude-opus-4", () => {
    // The id `claude-opus-4` is a bare direct-adapter id (no `vendor/`
    // prefix), so the OpenRouter routing equivalent (`anthropic/claude-opus-4`)
    // does NOT match against it. The result is only the static anthropic
    // direct profile.
    const results = findCapabilityProfile("claude-opus-4");
    expect(results.length).toBe(1);
    expect(results[0]!.adapter).toBe("anthropic");
    expect(results[0]!.id).toBe("claude-opus-4");
  });

  it("findCapabilityProfile returns the openrouter profile when querying an OpenRouter-shaped id with no direct equivalent", () => {
    // `openai/gpt-4o` exists in the OpenRouter snapshot but Lattice does
    // not ship a direct openai static profile, so only the openrouter
    // entry comes back.
    const results = findCapabilityProfile("openai/gpt-4o");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Whatever the first adapter is, openrouter must be present in the result.
    expect(results.some((p) => p.adapter === "openrouter")).toBe(true);
  });
});

describe("Phase 33 registry — closed-union runtime invariants", () => {
  const VALID_ADAPTERS = new Set([
    "openrouter",
    "anthropic",
    "openai",
    "openai-compat",
    "xai",
    "gemini",
    "lm-studio",
  ]);
  const VALID_TRAINING_CLASSES = new Set([
    "frontier_rlhf",
    "mid_tier_rlhf",
    "open_weight_instruct",
    "open_weight_base",
    "local_quantized",
  ]);
  const VALID_REASONING_SURFACES = new Set([
    "none",
    "hidden_cot",
    "inlined_tags",
    "interleaved_thinking",
    "streamed_reasoning",
  ]);
  const VALID_TOOL_CALL_SURFACES = new Set([
    "none",
    "native_strict",
    "native_lenient",
    "json_only",
    "text_only",
  ]);
  const VALID_FAILURE_MODES = new Set([
    "internal_envelope_leak",
    "reasoning_tag_leak",
    "system_prompt_echo",
    "template_artifact_leak",
    "hallucinated_tool_name",
    "malformed_tool_arguments",
    "premature_termination",
  ]);
  const VALID_PROMPT_STRATEGIES = new Set([
    "frontier",
    "mid_tier",
    "open_weight",
    "reasoning",
    "local",
  ]);

  const ALL_PROFILES = [...STATIC_PROFILES, ...GENERATED_PROFILES];

  it("every profile has an adapter in the closed CapabilityAdapter union", () => {
    for (const p of ALL_PROFILES) {
      expect(VALID_ADAPTERS.has(p.adapter)).toBe(true);
    }
  });

  it("every profile has a trainingClass in the closed TrainingClass union", () => {
    for (const p of ALL_PROFILES) {
      expect(VALID_TRAINING_CLASSES.has(p.trainingClass)).toBe(true);
    }
  });

  it("every profile has a reasoningSurface in the closed ReasoningSurface union", () => {
    for (const p of ALL_PROFILES) {
      expect(VALID_REASONING_SURFACES.has(p.reasoningSurface)).toBe(true);
    }
  });

  it("every profile has a toolCallSurface in the closed ToolCallSurface union", () => {
    for (const p of ALL_PROFILES) {
      expect(VALID_TOOL_CALL_SURFACES.has(p.toolCallSurface)).toBe(true);
    }
  });

  it("every profile has a recommendedPromptStrategy in the closed RecommendedPromptStrategy union", () => {
    for (const p of ALL_PROFILES) {
      expect(VALID_PROMPT_STRATEGIES.has(p.recommendedPromptStrategy)).toBe(
        true,
      );
    }
  });

  it("every profile's knownFailureModes entries are all in the closed KnownFailureMode union", () => {
    for (const p of ALL_PROFILES) {
      for (const m of p.knownFailureModes) {
        expect(VALID_FAILURE_MODES.has(m)).toBe(true);
      }
    }
  });

  it("every profile has a non-negative contextWindow integer", () => {
    for (const p of ALL_PROFILES) {
      expect(typeof p.contextWindow).toBe("number");
      expect(p.contextWindow).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.contextWindow)).toBe(true);
    }
  });
});

describe("Phase 33 registry — uniqueness of canonical keys", () => {
  it("every profile's canonical key (`${adapter}:${id}`) is unique across the merged set", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const p of [...STATIC_PROFILES, ...GENERATED_PROFILES]) {
      const key = `${p.adapter}:${p.id}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });
});
