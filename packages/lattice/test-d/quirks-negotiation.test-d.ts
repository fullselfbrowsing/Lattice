// Phase 34 — QUIRK-01 / QUIRK-03 / NEG-01 / NEG-02 type-level tests.
//
// Coverage:
//   Task 1 (SanitizerKey):
//     - SanitizerKey extends string
//     - Exhaustive switch over SanitizerKey (compile-time closure enforcement)
//     - SANITIZER_BY_FAILURE_MODE is inferred as Record<KnownFailureMode, SanitizerKey | null>
//
//   Task 2 (AdapterQuirks):
//     - AdapterQuirks has 5 universal booleans typed as boolean
//     - AnthropicQuirks extends AdapterQuirks (expectAssignable)
//     - Discriminant narrowing contract (MUST cast after adapter.id check)
//     - AnthropicQuirks literal satisfies AnthropicQuirks
//     - ProviderAdapter remains backward-compatible (4-field literal satisfies ProviderAdapter)
//
//   Task 3 (NegotiatedCapabilities / RunEventKind):
//     - NegotiatedCapabilities.source exhaustive switch
//     - RunEventKind includes "capabilities.negotiation.fallback"

import { expectAssignable, expectError, expectType } from "tsd";
import type {
  AdapterQuirks,
  AnthropicQuirks,
  GeminiQuirks,
  KnownFailureMode,
  LmStudioQuirks,
  NegotiatedCapabilities,
  OpenAICompatQuirks,
  OpenAIQuirks,
  OpenRouterQuirks,
  ProviderAdapter,
  RunEventKind,
  SanitizerKey,
  XaiQuirks,
} from "@full-self-browsing/lattice";
import {
  SANITIZER_BY_FAILURE_MODE,
} from "@full-self-browsing/lattice";

// --- Task 1: SanitizerKey type-level assertions ---

// SanitizerKey extends string (D-13 — closed string-literal union)
declare const aKey: SanitizerKey;
expectAssignable<string>(aKey);

// Exhaustive switch over SanitizerKey. If a 4th key is added to the union
// without updating this switch, TypeScript fails to compile (the
// `_exhaustive: never` line raises an error). Phase 36 sanitizer registration
// enforces the same gate at runtime; this test is the type-level mirror.
function assertSanitizerKeyExhaustive(key: SanitizerKey): "covered" {
  switch (key) {
    case "stripReasoningTags":
    case "stripChatTemplateArtifacts":
    case "unwrapInternalEnvelope":
      return "covered";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
expectType<"covered">(assertSanitizerKeyExhaustive("stripReasoningTags"));
expectType<"covered">(assertSanitizerKeyExhaustive("stripChatTemplateArtifacts"));
expectType<"covered">(assertSanitizerKeyExhaustive("unwrapInternalEnvelope"));

// SANITIZER_BY_FAILURE_MODE inferred as Record<KnownFailureMode, SanitizerKey | null>
// This verifies the table's inferred type is exhaustive over KnownFailureMode.
expectType<Record<KnownFailureMode, SanitizerKey | null>>(SANITIZER_BY_FAILURE_MODE);

// Invalid SanitizerKey must fail to type-check (closed union).
expectError<SanitizerKey>("not-a-real-sanitizer-key");

// --- Task 2: AdapterQuirks type-level assertions ---

// AdapterQuirks has 5 universal boolean fields
declare const quirks: AdapterQuirks;
expectType<boolean>(quirks.supportsToolChoice);
expectType<boolean>(quirks.parallelToolCalls);
expectType<boolean>(quirks.structuredOutputs);
expectType<boolean>(quirks.responseFormatHonored);
expectType<boolean>(quirks.streamingDiverges);

// AnthropicQuirks extends AdapterQuirks (per D-03 sub-interface hierarchy)
declare const anthropicQuirks: AnthropicQuirks;
expectAssignable<AdapterQuirks>(anthropicQuirks);
expectType<boolean>(anthropicQuirks.promptCachingSupported);
expectType<boolean>(anthropicQuirks.extendedThinkingSupported);
expectType<boolean>(anthropicQuirks.toolUseInputSchemaStrict);

// All 7 narrowed interfaces are assignable to AdapterQuirks
declare const openaiQuirks: OpenAIQuirks;
expectAssignable<AdapterQuirks>(openaiQuirks);
declare const openaiCompatQuirks: OpenAICompatQuirks;
expectAssignable<AdapterQuirks>(openaiCompatQuirks);
declare const geminiQuirks: GeminiQuirks;
expectAssignable<AdapterQuirks>(geminiQuirks);
declare const xaiQuirks: XaiQuirks;
expectAssignable<AdapterQuirks>(xaiQuirks);
declare const openrouterQuirks: OpenRouterQuirks;
expectAssignable<AdapterQuirks>(openrouterQuirks);
declare const lmStudioQuirks: LmStudioQuirks;
expectAssignable<AdapterQuirks>(lmStudioQuirks);

// AnthropicQuirks literal satisfies the interface (all required fields)
const anthropicQuirksLiteral = {
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  promptCachingSupported: true,
  extendedThinkingSupported: true,
  toolUseInputSchemaStrict: true,
} satisfies AnthropicQuirks;
expectAssignable<AdapterQuirks>(anthropicQuirksLiteral);

// ProviderAdapter backward-compatibility (D-01/D-02 non-breaking):
// a 4-field consumer adapter literal must still satisfy ProviderAdapter.
const consumerAdapter = {
  id: "my-custom-adapter",
  kind: "provider-adapter" as const,
} satisfies ProviderAdapter;
expectType<string>(consumerAdapter.id);

// D-03 discriminant-narrowing contract note:
// TypeScript CANNOT automatically narrow adapter.quirks to AnthropicQuirks
// after `if (adapter.id === "anthropic")` because the base ProviderAdapter
// types quirks as AdapterQuirks | undefined, not as a discriminated union.
// Consumers MUST cast: `(adapter.quirks as AnthropicQuirks).promptCachingSupported`
// OR use the typed factory return (Plans 02-05) which narrows the return type.
// TODO: Plans 02-05 will add factory-level type narrowing tests here once the
// adapter implementations ship.
declare const adapter: ProviderAdapter;
// adapter.quirks is AdapterQuirks | undefined on the base interface
expectType<AdapterQuirks | undefined>(adapter.quirks);

// --- Task 3: NegotiatedCapabilities + RunEventKind type-level assertions ---

// NegotiatedCapabilities.source exhaustive switch
// If a new source value is added to the union without updating this switch,
// TypeScript fails to compile (the `_exhaustive: never` line raises an error).
function assertSourceExhaustive(
  source: NegotiatedCapabilities["source"],
): "covered" {
  switch (source) {
    case "live":
    case "registry-fallback":
    case "registry":
      return "covered";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}
expectType<"covered">(assertSourceExhaustive("live"));
expectType<"covered">(assertSourceExhaustive("registry-fallback"));
expectType<"covered">(assertSourceExhaustive("registry"));

// RunEventKind includes "capabilities.negotiation.fallback" (D-12)
expectAssignable<RunEventKind>("capabilities.negotiation.fallback" as const);

// NegotiatedCapabilities supports block has 5 boolean fields
declare const neg: NegotiatedCapabilities;
expectType<boolean>(neg.supports.nativeToolCalling);
expectType<boolean>(neg.supports.structuredOutputs);
expectType<boolean>(neg.supports.parallelToolCalls);
expectType<boolean>(neg.supports.extendedThinking);
expectType<boolean>(neg.supports.streaming);
