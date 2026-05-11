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
}

export type NormalizedProviderEntry = ProviderRef | ProviderAdapter;

export interface NormalizedLatticeConfig {
  readonly providers: readonly NormalizedProviderEntry[];
  readonly storage?: StorageLike;
  readonly sessions?: SessionStore;
  readonly defaults: { readonly policy?: PolicySpec };
  readonly tracing?: TracerLike;
  readonly events: readonly RunEventSink[];
  readonly signer?: ReceiptSigner;
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
  } = {
    providers: normalizeProviders(config.providers),
    defaults: config.defaults ?? {},
    events: normalizeEventSinks(config.events),
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
