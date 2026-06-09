// Phase 33 Plan 03 — CAPS-03 — vitest suite for the build-time classifier.
//
// The classifier is a .mjs file in scripts/capabilities/, which is build-time
// only per D-02 and not part of the Lattice runtime tarball. We dynamic-import
// it here so vitest's TS pipeline does not try to typecheck the JS source.
//
// Coverage:
//   - Anchor case study session_1780792387779 (gpt-oss-120b -> open_weight_instruct
//     + internal_envelope_leak)
//   - Pitfall 4 variant symmetry (gpt-oss-120b == gpt-oss-120b:free trainingClass)
//   - D-03 family override precedence (claude-3-haiku -> mid_tier_rlhf)
//   - D-14 per-family override (deepseek-r1 -> reasoning_tag_leak)
//   - Pitfall 3 ~latest skip (returns null)
//   - D-04 unknown-prefix WARN + permissive default
//   - inferToolCallSurface branches (none / native_lenient / native_strict)
//   - A1 contextWindow precedence (asserted via refresh script transformFeed)
//   - Golden-fixture snapshot for the full 10-entry frozen feed
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The classifier is a .mjs in scripts/; dynamic import returns the module.
// @ts-expect-error untyped mjs import (build-time script, no .d.ts shipped)
const classifierModule = await import("../../../scripts/capabilities/classifier.mjs");
type ClassifierEntry = {
  id: string;
  supported_parameters?: string[];
  context_length?: number;
  top_provider?: { context_length?: number };
};
type Classification = {
  originFamily: string;
  trainingClass: string;
  reasoningSurface: string;
  toolCallSurface: string;
  knownFailureModes: string[];
  recommendedPromptStrategy: string;
};
const classify = classifierModule.classify as (raw: ClassifierEntry) => null | Classification;
const inferToolCallSurface = classifierModule.inferToolCallSurface as (raw: ClassifierEntry) => string;
const FAILURE_MODE_DEFAULTS = classifierModule.FAILURE_MODE_DEFAULTS as Record<string, string[]>;

// @ts-expect-error untyped mjs import (build-time script, no .d.ts shipped)
const refreshModule = await import("../../../scripts/refresh-model-registry.mjs");
const transformFeed = refreshModule.transformFeed as (raw: { data: ClassifierEntry[] }) => Array<{
  id: string;
  adapter: string;
  contextWindow: number;
}>;
const render = refreshModule.render as (profiles: Array<Record<string, unknown>>) => string;

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  here,
  "../../../scripts/capabilities/__fixtures__/openrouter-models-snapshot.json",
);

describe("Phase 33 classifier — anchor cases (CAPS-03)", () => {
  it("classifies gpt-oss-120b as open_weight_instruct with internal_envelope_leak (session_1780792387779)", () => {
    const result = classify({
      id: "openai/gpt-oss-120b",
      supported_parameters: ["tools", "tool_choice"],
    });
    expect(result).not.toBeNull();
    expect(result!.trainingClass).toBe("open_weight_instruct");
    expect(result!.knownFailureModes).toContain("internal_envelope_leak");
    expect(result!.recommendedPromptStrategy).toBe("open_weight");
    expect(result!.originFamily).toBe("openai");
    expect(result!.reasoningSurface).toBe("none");
  });

  it("classifies gpt-oss-120b:free with the SAME trainingClass as gpt-oss-120b (Pitfall 4 symmetry)", () => {
    const base = classify({
      id: "openai/gpt-oss-120b",
      supported_parameters: ["tools", "tool_choice"],
    })!;
    const variant = classify({
      id: "openai/gpt-oss-120b:free",
      supported_parameters: ["tools", "tool_choice"],
    })!;
    expect(variant.trainingClass).toBe(base.trainingClass);
    expect(variant.knownFailureModes).toEqual(base.knownFailureModes);
    expect(variant.originFamily).toBe(base.originFamily);
    expect(variant.recommendedPromptStrategy).toBe(base.recommendedPromptStrategy);
  });

  it("classifies claude-3-haiku as mid_tier_rlhf via family override (D-03 first-hit-wins)", () => {
    const result = classify({
      id: "anthropic/claude-3-haiku",
      supported_parameters: ["tools"],
    });
    expect(result!.trainingClass).toBe("mid_tier_rlhf");
    expect(result!.knownFailureModes).toContain("system_prompt_echo");
    expect(result!.recommendedPromptStrategy).toBe("mid_tier");
  });

  it("classifies deepseek-r1 with reasoning_tag_leak (D-14 per-family override)", () => {
    const result = classify({
      id: "deepseek/deepseek-r1",
      supported_parameters: ["tools", "reasoning"],
    });
    expect(result!.reasoningSurface).toBe("inlined_tags");
    expect(result!.knownFailureModes).toContain("reasoning_tag_leak");
    // Class defaults are still present alongside the override extras.
    expect(result!.knownFailureModes).toContain("internal_envelope_leak");
  });

  it("returns null for ~latest aliases (Pitfall 3)", () => {
    expect(classify({ id: "~anthropic/claude-sonnet-latest" })).toBeNull();
    expect(classify({ id: "~openai/gpt-latest" })).toBeNull();
  });

  it("falls back to open_weight_instruct + stderr WARN for unknown prefixes (D-04)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = classify({ id: "futurelab/some-new-model", supported_parameters: [] });
    expect(result!.trainingClass).toBe("open_weight_instruct");
    expect(result!.originFamily).toBe("unknown");
    expect(result!.toolCallSurface).toBe("none");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[classifier] WARN — unknown prefix 'futurelab'"),
    );
    warnSpy.mockRestore();
  });

  it("derives tool surface as native_strict when supported_parameters includes structured_outputs", () => {
    const result = classify({
      id: "anthropic/claude-3.5-sonnet",
      supported_parameters: ["tools", "structured_outputs"],
    });
    expect(result!.toolCallSurface).toBe("native_strict");
  });

  it("derives tool surface as native_lenient when only tools (no structured_outputs)", () => {
    const result = classify({
      id: "qwen/qwen-2.5-72b-instruct",
      supported_parameters: ["tools"],
    });
    expect(result!.toolCallSurface).toBe("native_lenient");
  });

  it("derives tool surface as none when supported_parameters lacks tools", () => {
    const result = classify({
      id: "qwen/qwen-2.5-72b-instruct",
      supported_parameters: [],
    });
    expect(result!.toolCallSurface).toBe("none");
    // inferToolCallSurface helper standalone.
    expect(inferToolCallSurface({ id: "anything/x", supported_parameters: [] })).toBe("none");
  });

  it("applies o1 family override to set reasoningSurface=hidden_cot", () => {
    const result = classify({
      id: "openai/o1",
      supported_parameters: ["tools", "reasoning"],
    });
    expect(result!.reasoningSurface).toBe("hidden_cot");
    // Frontier RLHF class default => empty failure-mode set.
    expect(result!.knownFailureModes).toEqual([]);
  });

  it("exposes all 5 FAILURE_MODE_DEFAULTS keys (D-14)", () => {
    expect(Object.keys(FAILURE_MODE_DEFAULTS).sort()).toEqual(
      [
        "frontier_rlhf",
        "local_quantized",
        "mid_tier_rlhf",
        "open_weight_base",
        "open_weight_instruct",
      ].sort(),
    );
    expect(FAILURE_MODE_DEFAULTS.frontier_rlhf).toEqual([]);
    expect(FAILURE_MODE_DEFAULTS.open_weight_instruct).toEqual([
      "internal_envelope_leak",
      "system_prompt_echo",
      "malformed_tool_arguments",
    ]);
  });

  it("respects A1 contextWindow precedence (top_provider.context_length wins over context_length)", () => {
    // transformFeed (from refresh script) applies the A1 precedence rule.
    const profiles = transformFeed({
      data: [
        {
          id: "openai/gpt-oss-120b:free",
          context_length: 131072,
          top_provider: { context_length: 65536 },
          supported_parameters: ["tools"],
        },
        {
          id: "qwen/qwen-2.5-72b-instruct",
          context_length: 32768,
          // top_provider absent: falls back to context_length.
          supported_parameters: ["tools"],
        },
      ],
    });
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p.contextWindow]));
    expect(byId["openai/gpt-oss-120b:free"]).toBe(65536);
    expect(byId["qwen/qwen-2.5-72b-instruct"]).toBe(32768);
  });
});

describe("Phase 33 classifier — golden fixture snapshot (CAPS-03 stability gate)", () => {
  it("classifies the frozen 10-entry fixture deterministically", async () => {
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as {
      data: ClassifierEntry[];
    };
    // Squelch WARN noise on any unknown-prefix entries during the snapshot run
    // so the assertion focuses on the structural output.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const classified = fixture.data.map((row) => ({
        id: row.id,
        classification: classify(row),
      }));
      // 9 keep + 1 phantom (~latest) skipped to null.
      const skipped = classified.filter((c) => c.classification === null);
      const kept = classified.filter((c) => c.classification !== null);
      expect(skipped).toHaveLength(1);
      expect(kept).toHaveLength(9);
      expect(classified).toMatchSnapshot();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("Phase 33 refresh-model-registry — deterministic rendering (D-17)", () => {
  it("renders the same input to byte-identical output on two back-to-back runs (Pitfall 1)", async () => {
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as {
      data: ClassifierEntry[];
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const profilesA = transformFeed(fixture);
      const profilesB = transformFeed(fixture);
      const renderedA = render(profilesA);
      const renderedB = render(profilesB);
      expect(renderedA).toBe(renderedB);
      // Header / footer present.
      expect(renderedA.startsWith("// AUTO-GENERATED FILE")).toBe(true);
      expect(renderedA.endsWith("] as const satisfies readonly ModelCapabilityProfile[];\n")).toBe(true);
      // Sorted by (adapter, id) — first entry should be the alphabetically
      // smallest id among the 9 kept (`anthropic/claude-3-haiku`).
      const firstIdLine = renderedA.split("\n").find((l) => l.includes("    id:"));
      expect(firstIdLine).toContain("anthropic/claude-3-haiku");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("--check mode signals drift on bit-exact mismatch and a match on identical input", async () => {
    // We exercise the comparison logic the script's main() uses: render
    // against the same input twice -> identical; render against a perturbed
    // copy -> different.
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as {
      data: ClassifierEntry[];
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const baseline = render(transformFeed(fixture));
      const sameAgain = render(transformFeed(fixture));
      expect(sameAgain === baseline).toBe(true);
      // Perturb by appending a synthetic new model — output must differ.
      const perturbed: { data: ClassifierEntry[] } = {
        data: [
          ...fixture.data,
          {
            id: "openai/gpt-5-pretend",
            context_length: 200000,
            top_provider: { context_length: 200000 },
            supported_parameters: ["tools"],
          },
        ],
      };
      const drifted = render(transformFeed(perturbed));
      expect(drifted === baseline).toBe(false);
      expect(drifted.length).toBeGreaterThan(baseline.length);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
