// Phase 34 — QUIRK-01 / QUIRK-03 / NEG-01 / NEG-02 type-level tests.
//
// Coverage:
//   Task 1 (SanitizerKey):
//     - SanitizerKey extends string
//     - Exhaustive switch over SanitizerKey (compile-time closure enforcement)
//     - SANITIZER_BY_FAILURE_MODE is inferred as Record<KnownFailureMode, SanitizerKey | null>
//
//   Task 2 (AdapterQuirks -- added when quirks.ts ships):
//     - AdapterQuirks has 5 universal booleans typed as boolean
//     - AnthropicQuirks extends AdapterQuirks (expectAssignable)
//     - Discriminant narrowing contract (MUST cast after adapter.id check)
//     - AnthropicQuirks literal satisfies AnthropicQuirks
//     - ProviderAdapter remains backward-compatible (4-field literal satisfies ProviderAdapter)
//
//   Task 3 (NegotiatedCapabilities / RunEventKind -- added when negotiate.ts ships):
//     - NegotiatedCapabilities.source exhaustive switch
//     - RunEventKind includes "capabilities.negotiation.fallback"

import { expectAssignable, expectError, expectType } from "tsd";
import type {
  KnownFailureMode,
  SanitizerKey,
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
