import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  applyOutputSanitizers,
  stripChatTemplateArtifacts,
  stripReasoningTags,
  unwrapInternalEnvelope,
} from "../src/sanitizers/index.js";
import type { SanitizerFn } from "../src/sanitizers/index.js";

const context = {
  providerId: "openrouter",
  modelId: "openai/gpt-oss-120b:free",
};

describe("stripReasoningTags", () => {
  it("removes delimited reasoning blocks", async () => {
    const sanitize = stripReasoningTags();

    await expect(Promise.resolve(
      sanitize("<think>hidden</think>\nGreeted the user.", { ...context, outputName: "text" }),
    )).resolves.toBe("Greeted the user.");
  });

  it("handles multiline reasoning blocks", async () => {
    const sanitize = stripReasoningTags();

    await expect(Promise.resolve(
      sanitize("<reasoning>\none\ntwo\n</reasoning>\nDone.", {
        ...context,
        outputName: "text",
      }),
    )).resolves.toBe("Done.");
  });

  it("is a no-op for ordinary text", async () => {
    const sanitize = stripReasoningTags();

    await expect(Promise.resolve(
      sanitize("ordinary text", { ...context, outputName: "text" }),
    )).resolves.toBe("ordinary text");
  });
});

describe("stripChatTemplateArtifacts", () => {
  it("removes common chat-template markers", async () => {
    const sanitize = stripChatTemplateArtifacts();

    await expect(Promise.resolve(
      sanitize("<|im_start|>assistant\n[INST]<<SYS>>hidden<</SYS>>[/INST]\nGreeted the user.<|im_end|>", {
        ...context,
        outputName: "text",
      }),
    )).resolves.toBe("hidden\nGreeted the user.");
  });

  it("is a no-op for ordinary text", async () => {
    const sanitize = stripChatTemplateArtifacts();

    await expect(Promise.resolve(
      sanitize("Greeted the user.", { ...context, outputName: "text" }),
    )).resolves.toBe("Greeted the user.");
  });
});

describe("unwrapInternalEnvelope", () => {
  it("extracts the anchor summary field", async () => {
    const sanitize = unwrapInternalEnvelope({ field: "summary" });

    await expect(
      sanitize("{\"summary\":\"Greeted the user.\"}", {
        ...context,
        outputName: "text",
      }),
    ).resolves.toBe("Greeted the user.");
  });

  it("extracts a nested dotted path", async () => {
    const sanitize = unwrapInternalEnvelope({ path: "data.summary" });

    await expect(
      sanitize("{\"data\":{\"summary\":\"Greeted the user.\"}}", {
        ...context,
        outputName: "text",
      }),
    ).resolves.toBe("Greeted the user.");
  });

  it("accepts a Standard Schema-compatible schema for schema-only extraction", async () => {
    const sanitize = unwrapInternalEnvelope(z.object({ summary: z.string() }));

    await expect(
      sanitize("{\"summary\":\"Greeted the user.\"}", {
        ...context,
        outputName: "text",
      }),
    ).resolves.toBe("Greeted the user.");
  });

  it("no-ops on ambiguous schema-only extraction", async () => {
    const sanitize = unwrapInternalEnvelope(z.object({
      summary: z.string(),
      detail: z.string(),
    }));
    const text = "{\"summary\":\"Greeted the user.\",\"detail\":\"extra\"}";

    await expect(
      sanitize(text, { ...context, outputName: "text" }),
    ).resolves.toBe(text);
  });

  it("no-ops on invalid JSON", async () => {
    const sanitize = unwrapInternalEnvelope({ field: "summary" });

    await expect(
      sanitize("not json", { ...context, outputName: "text" }),
    ).resolves.toBe("not json");
  });

  it("no-ops on missing paths and non-string extracted values", async () => {
    const sanitize = unwrapInternalEnvelope({ field: "summary" });

    await expect(
      sanitize("{\"other\":\"Greeted the user.\"}", {
        ...context,
        outputName: "text",
      }),
    ).resolves.toBe("{\"other\":\"Greeted the user.\"}");
    await expect(
      sanitize("{\"summary\":123}", { ...context, outputName: "text" }),
    ).resolves.toBe("{\"summary\":123}");
  });
});

describe("applyOutputSanitizers", () => {
  it("returns the original output object when sanitizer is absent", async () => {
    const rawOutputs = { text: "Greeted the user." };

    await expect(applyOutputSanitizers(rawOutputs, undefined, context)).resolves.toBe(rawOutputs);
  });

  it("applies custom sanitizer arrays in order", async () => {
    const first: SanitizerFn = (text) => `${text} first`;
    const second: SanitizerFn = (text) => `${text} second`;

    await expect(
      applyOutputSanitizers({ text: "Greeted the user." }, [first, second], context),
    ).resolves.toEqual({ text: "Greeted the user. first second" });
  });

  it("preserves non-string values", async () => {
    const sanitize: SanitizerFn = () => "changed";
    const marker = { nested: true };

    await expect(
      applyOutputSanitizers({ text: "x", json: marker, count: 1 }, sanitize, context),
    ).resolves.toEqual({ text: "changed", json: marker, count: 1 });
  });

  it("propagates custom sanitizer exceptions", async () => {
    const sanitize: SanitizerFn = () => {
      throw new Error("custom sanitizer failed");
    };

    await expect(
      applyOutputSanitizers({ text: "Greeted the user." }, sanitize, context),
    ).rejects.toThrow("custom sanitizer failed");
  });
});
