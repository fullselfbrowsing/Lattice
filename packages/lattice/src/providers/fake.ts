import type { ArtifactInput } from "../artifacts/artifact.js";
import type {
  ModelCapability,
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
  Usage,
} from "./provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";

export interface FakeProviderOptions {
  readonly id?: string;
  readonly modelId?: string;
  readonly response?:
    | ProviderRunResponse
    | ((request: ProviderRunRequest) => ProviderRunResponse | Promise<ProviderRunResponse>);
  readonly artifacts?: readonly ArtifactInput[];
  /**
   * Phase 7 addition: when provided, REPLACES the default single-capability
   * array so callers (notably Plan 07-04's modality/privacy reject tests)
   * can construct a fake adapter with arbitrary
   * `inputModalities` / `outputModalities` / `dataPolicy` / `pricing`
   * without mutating the returned adapter's readonly `capabilities` array.
   * When omitted, the existing default capability is used.
   */
  readonly capabilities?: readonly ModelCapability[];
}

const DEFAULT_FAKE_USAGE: Usage = {
  promptTokens: 0,
  completionTokens: 0,
  costUsd: null,
};

export function createFakeProvider(options: FakeProviderOptions = {}): ProviderAdapter {
  const id = options.id ?? "fake";
  const modelId = options.modelId ?? `${id}:deterministic`;
  const defaultCapability: ModelCapability = {
    ...defaultCapabilityForProvider(id),
    modelId,
    inputModalities: ["text", "json", "image", "audio", "document", "file", "url", "tool"],
    outputModalities: ["text", "json"],
    toolUse: true,
  };
  const capabilities = options.capabilities ?? [defaultCapability];

  return {
    id,
    kind: "provider-adapter",
    capabilities,
    async execute(request) {
      const baseResponse =
        typeof options.response === "function"
          ? await options.response(request)
          : options.response;

      if (baseResponse !== undefined) {
        return baseResponse.normalizedUsage !== undefined
          ? baseResponse
          : { ...baseResponse, normalizedUsage: { ...DEFAULT_FAKE_USAGE } };
      }

      return {
        rawOutputs: Object.fromEntries(
          request.outputs.map((name) => [name, defaultOutputForName(name)]),
        ),
        ...(options.artifacts !== undefined ? { artifactRefs: options.artifacts } : {}),
        normalizedUsage: { ...DEFAULT_FAKE_USAGE },
      };
    },
  };
}

function defaultOutputForName(name: string): unknown {
  if (/action|json|data|decision/u.test(name)) {
    return {
      kind: "clarify",
      reason: "fake provider default structured response",
    };
  }

  if (/citations|evidence/u.test(name)) {
    return [];
  }

  if (/generated|artifacts/u.test(name)) {
    return [];
  }

  return `Fake response for ${name}.`;
}
