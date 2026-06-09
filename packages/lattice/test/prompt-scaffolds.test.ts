import { describe, expect, it } from "vitest";

import type { RecommendedPromptStrategy } from "../src/capabilities/profile.js";
import {
  PROMPT_SCAFFOLD_VERSION,
  PROMPT_STRATEGIES,
  getStructuredOutputContract,
  getToolUseContract,
} from "../src/prompts/scaffolds.js";

const schemaFixture = {
  type: "object",
  properties: {
    summary: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

const toolFixture = [
  {
    name: "lookupWeather",
    description: "Look up weather for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
] as const;

function openWeightStructuredStub(fragment: string): string {
  const hasGuard =
    fragment.includes(
      "The contract below is an instruction, not text to output.",
    ) &&
    fragment.includes(
      'Bad: {"summary":"Greeted the user."} when the user asked for a natural-language reply.',
    ) &&
    fragment.includes("Good: Greeted the user.");
  return hasGuard ? "Greeted the user." : '{"summary":"Greeted the user."}';
}

function openWeightToolStub(fragment: string): string {
  const hasGuard =
    fragment.includes(
      "The tool list below is action metadata, not text to output.",
    ) &&
    fragment.includes("Do not copy the tool descriptor into the final answer.");
  return hasGuard
    ? "Greeted the user."
    : '{"tool":"lookupWeather","arguments":{"city":"San Francisco"}}';
}

function defaultStrategyStub(fragment: string): string {
  return fragment.length > 0 ? "Greeted the user." : "";
}

describe("Phase 35 prompt scaffolds", () => {
  it("exports the stable prompt scaffold strategy order", () => {
    expect(PROMPT_STRATEGIES).toEqual([
      "frontier",
      "mid_tier",
      "open_weight",
      "reasoning",
      "local",
    ]);
  });

  it.each(PROMPT_STRATEGIES)(
    "renders structured-output scaffold for %s",
    (strategy) => {
      const fragment = getStructuredOutputContract(strategy, schemaFixture);
      expect(fragment).toContain(PROMPT_SCAFFOLD_VERSION);
      expect(fragment).toMatchSnapshot();
    },
  );

  it.each(PROMPT_STRATEGIES)("renders tool-use scaffold for %s", (strategy) => {
    const fragment = getToolUseContract(strategy, toolFixture);
    expect(fragment).toContain(PROMPT_SCAFFOLD_VERSION);
    expect(fragment).toMatchSnapshot();
  });

  it("canonicalizes structured-output contracts deterministically", () => {
    expect(getStructuredOutputContract("frontier", { b: 1, a: 2 })).toBe(
      getStructuredOutputContract("frontier", { a: 2, b: 1 }),
    );
  });

  it("canonicalizes tool-use contracts deterministically", () => {
    expect(getToolUseContract("frontier", [{ b: 1, a: 2 }])).toBe(
      getToolUseContract("frontier", [{ a: 2, b: 1 }]),
    );
  });

  it("rejects non-JSON-serializable structured-output schemas", () => {
    expect(() =>
      getStructuredOutputContract("frontier", { invalid: () => undefined }),
    ).toThrow("schema must be JSON-serializable");
  });

  it("rejects non-JSON-serializable tool descriptors", () => {
    expect(() =>
      getToolUseContract("frontier", [{ invalid: () => undefined }]),
    ).toThrow("tools must be JSON-serializable");
  });

  it("guards the session_1780792387779 open-weight structured leak", () => {
    expect(openWeightStructuredStub("Contract:\n{}")).toBe(
      '{"summary":"Greeted the user."}',
    );
    expect(
      openWeightStructuredStub(
        getStructuredOutputContract("open_weight", schemaFixture),
      ),
    ).toBe("Greeted the user.");
  });

  it("guards the session_1780792387779 open-weight tool descriptor leak", () => {
    expect(openWeightToolStub("Tools:\n[]")).toBe(
      '{"tool":"lookupWeather","arguments":{"city":"San Francisco"}}',
    );
    expect(openWeightToolStub(getToolUseContract("open_weight", toolFixture))).toBe(
      "Greeted the user.",
    );
  });

  it("keeps non-open-weight strategies on the normal reply path", () => {
    const nonOpenWeightStrategies = PROMPT_STRATEGIES.filter(
      (strategy): strategy is Exclude<RecommendedPromptStrategy, "open_weight"> =>
        strategy !== "open_weight",
    );

    for (const strategy of nonOpenWeightStrategies) {
      expect(
        defaultStrategyStub(getStructuredOutputContract(strategy, schemaFixture)),
      ).toBe("Greeted the user.");
      expect(defaultStrategyStub(getToolUseContract(strategy, toolFixture))).toBe(
        "Greeted the user.",
      );
    }
  });
});
