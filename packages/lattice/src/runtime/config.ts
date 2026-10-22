import type { PolicySpec } from "../policy/policy.js";
import type {
  ProviderAdapter,
  ProviderRef,
  ProviderRegistryInput,
} from "../providers/provider.js";
import type { ReceiptSigner } from "../receipts/types.js";
import type { SessionStore } from "../sessions/session.js";
import type { StorageLike } from "../storage/storage.js";
import type { RunEventSink, TracerLike } from "../tracing/tracing.js";

/**
 * What `ai.run` does when a configured signer fails to issue a receipt
 * (hashing, canonicalization, or `signer.sign()` throwing).
 *
 *   "flag"  (default) — the run result is returned with `receipt` absent and
 *           `receiptError: { kind: "signer-failed", message }` set, and a
 *           `step.transition` run event carrying `receiptError` and
 *           `mintError` is emitted so sinks and OTel see the gap.
 *   "throw" — `ai.run` rejects with `ReceiptSigningError` after emitting a
 *           `run.failed` event. Use when an unsigned run must never be
 *           treated as a completed run.
 */
export type ReceiptSignerErrorMode = "flag" | "throw";

export interface ReceiptsConfig {
  /**
   * Applies to `ai.run` and to the receipts `runAgentCrew` mints after the
   * crew's work: the root agent's completion receipt and the crew-close
   * receipt. Under "flag" the crew returns `CrewResult.receiptError` and a
   * tracer `step.transition` event; under "throw" it rejects with
   * `ReceiptSigningError`. A failure minting the crew-start receipt still
   * throws, since no work has run yet, and child completion receipts stay
   * best-effort (the dispatcher records a tracer event). `runAgent` does not
   * read this setting.
   */
  readonly onSignerError?: ReceiptSignerErrorMode;
}

export interface LatticeConfig {
  readonly providers?: ProviderRegistryInput;
  readonly storage?: StorageLike | false;
  readonly sessions?: SessionStore | false;
  readonly defaults?: { readonly policy?: PolicySpec };
  readonly tracing?: TracerLike | false;
  readonly events?: RunEventSink | readonly RunEventSink[];
  /**
   * Phase 9 — when configured, every terminal branch of `ai.run` emits a
   * signed `CapabilityReceipt` attached to `RunResult.receipt`. When absent,
   * no receipts are issued and `RunResult.receipt` is undefined.
   */
  readonly signer?: ReceiptSigner;
  /** Receipt issuance policy (issue #21 F5). */
  readonly receipts?: ReceiptsConfig;
}

export type NormalizedProviderEntry = ProviderRef | ProviderAdapter;

export interface NormalizedReceiptsConfig {
  readonly onSignerError: ReceiptSignerErrorMode;
}

export interface NormalizedLatticeConfig {
  readonly providers: readonly NormalizedProviderEntry[];
  readonly storage?: StorageLike;
  readonly sessions?: SessionStore;
  readonly defaults: { readonly policy?: PolicySpec };
  readonly tracing?: TracerLike;
  readonly events: readonly RunEventSink[];
  readonly signer?: ReceiptSigner;
  readonly receipts: NormalizedReceiptsConfig;
}

export function normalizeConfig(config: LatticeConfig = {}): NormalizedLatticeConfig {
  const normalized: {
    providers: readonly NormalizedProviderEntry[];
    defaults: { readonly policy?: PolicySpec };
    storage?: StorageLike;
    sessions?: SessionStore;
    tracing?: TracerLike;
    events: readonly RunEventSink[];
    signer?: ReceiptSigner;
    receipts: NormalizedReceiptsConfig;
  } = {
    providers: normalizeProviders(config.providers),
    defaults: config.defaults ?? {},
    events: normalizeEventSinks(config.events),
    receipts: { onSignerError: config.receipts?.onSignerError ?? "flag" },
  };

  if (config.storage !== undefined && config.storage !== false) {
    normalized.storage = config.storage;
  }

  if (config.sessions !== undefined && config.sessions !== false) {
    normalized.sessions = config.sessions;
  }

  if (config.tracing !== undefined && config.tracing !== false) {
    normalized.tracing = config.tracing;
  }

  if (config.signer !== undefined) {
    normalized.signer = config.signer;
  }

  return normalized;
}

function normalizeEventSinks(
  events: RunEventSink | readonly RunEventSink[] | undefined,
): readonly RunEventSink[] {
  if (events === undefined) {
    return [];
  }

  return typeof events === "function" ? [events] : events;
}

function normalizeProviders(
  providers: ProviderRegistryInput = [],
): readonly NormalizedProviderEntry[] {
  return providers.map((provider) => {
    if (typeof provider === "string") {
      return {
        id: provider,
        kind: "provider-ref",
      };
    }

    return provider;
  });
}
