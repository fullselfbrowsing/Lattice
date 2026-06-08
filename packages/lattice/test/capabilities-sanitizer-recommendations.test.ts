// Phase 34 — D-13 / D-14 / D-15 / D-16 — Unit tests for the sanitizer
// recommendation table and helper. QUIRK-01 / NEG-02 surface.
//
// Coverage:
//   1. SANITIZER_BY_FAILURE_MODE has a key for every KnownFailureMode member
//   2. getRecommendedSanitizers maps correctly (insertion-order via Set dedup)
//   3. getRecommendedSanitizers filters null entries
//   4. getRecommendedSanitizers deduplicates repeated modes
//   5. getRecommendedSanitizers handles empty input
//   6. Verbatim D-14 mapping spot-checks (the 3 non-null entries)

import { describe, expect, it } from "vitest";
import { ALL_KNOWN_FAILURE_MODES } from "../src/capabilities/profile.js";
import {
  SANITIZER_BY_FAILURE_MODE,
  getRecommendedSanitizers,
} from "../src/capabilities/sanitizer-recommendations.js";

describe("SANITIZER_BY_FAILURE_MODE", () => {
  it("has a key for every KnownFailureMode value (D-16 exhaustiveness)", () => {
    for (const mode of ALL_KNOWN_FAILURE_MODES) {
      expect(SANITIZER_BY_FAILURE_MODE).toHaveProperty(mode);
    }
  });

  it("maps internal_envelope_leak to unwrapInternalEnvelope (D-14)", () => {
    expect(SANITIZER_BY_FAILURE_MODE["internal_envelope_leak"]).toBe(
      "unwrapInternalEnvelope",
    );
  });

  it("maps reasoning_tag_leak to stripReasoningTags (D-14)", () => {
    expect(SANITIZER_BY_FAILURE_MODE["reasoning_tag_leak"]).toBe(
      "stripReasoningTags",
    );
  });

  it("maps template_artifact_leak to stripChatTemplateArtifacts (D-14)", () => {
    expect(SANITIZER_BY_FAILURE_MODE["template_artifact_leak"]).toBe(
      "stripChatTemplateArtifacts",
    );
  });
});

describe("getRecommendedSanitizers", () => {
  it("returns sanitizer keys for modes with a non-null mapping", () => {
    const result = getRecommendedSanitizers([
      "internal_envelope_leak",
      "reasoning_tag_leak",
    ]);
    expect(result).toEqual(["unwrapInternalEnvelope", "stripReasoningTags"]);
  });

  it("returns [] when all modes map to null (D-16 null filter)", () => {
    const result = getRecommendedSanitizers([
      "system_prompt_echo",
      "hallucinated_tool_name",
      "premature_termination",
    ]);
    expect(result).toEqual([]);
  });

  it("deduplicates repeated modes (Set-based dedup, D-15)", () => {
    const result = getRecommendedSanitizers([
      "internal_envelope_leak",
      "internal_envelope_leak",
    ]);
    expect(result).toEqual(["unwrapInternalEnvelope"]);
  });

  it("returns [] for empty input", () => {
    const result = getRecommendedSanitizers([]);
    expect(result).toEqual([]);
  });
});
