import { expectAssignable, expectError, expectType } from "tsd";
import { z } from "zod";
import {
  stripChatTemplateArtifacts,
  stripReasoningTags,
  unwrapInternalEnvelope,
} from "@full-self-browsing/lattice";
import type {
  InternalEnvelopeOptions,
  SanitizeOutputOption,
  SanitizerContext,
  SanitizerFn,
} from "@full-self-browsing/lattice";

const context: SanitizerContext = {
  providerId: "openrouter",
  modelId: "openai/gpt-oss-120b:free",
  outputName: "text",
};

expectType<string>(context.providerId);
expectType<string | undefined>(context.modelId);
expectType<string>(context.outputName);

const sanitizer: SanitizerFn = (text, ctx) => {
  expectType<string>(text);
  expectType<SanitizerContext>(ctx);
  return text;
};

const asyncSanitizer: SanitizerFn = async (text) => text;
expectAssignable<SanitizeOutputOption>(sanitizer);
expectAssignable<SanitizeOutputOption>([sanitizer, asyncSanitizer]);

expectType<SanitizerFn>(stripReasoningTags());
expectType<SanitizerFn>(stripChatTemplateArtifacts());
expectType<SanitizerFn>(unwrapInternalEnvelope("summary"));
expectType<SanitizerFn>(unwrapInternalEnvelope({ field: "summary" }));
expectType<SanitizerFn>(unwrapInternalEnvelope({ path: "data.summary" }));
expectType<SanitizerFn>(unwrapInternalEnvelope(z.object({ summary: z.string() })));

const options: InternalEnvelopeOptions = {
  field: "summary",
  schema: z.object({ summary: z.string() }),
};
expectType<InternalEnvelopeOptions>(options);

expectError<SanitizerContext>({
  providerId: "openrouter",
  outputName: "text",
  rawResponse: {},
});
