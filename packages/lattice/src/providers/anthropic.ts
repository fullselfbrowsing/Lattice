import type { UsageRecord } from "../plan/plan.js";
import type { ProviderAdapter, ProviderRunResponse, Usage } from "./provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";

/**
 * Options for {@link createAnthropicProvider}.
 *
 * Mirrors `OpenAICompatibleProviderOptions` ergonomics (Phase 7 pattern) but
 * for the Anthropic Messages API at `/v1/messages` -- which uses a top-level
 * `system` field and a `content[0].text` response shape that diverges from
 * the OpenAI Chat Completions schema (see FSB v0.9.x `extension/ai/universal-provider.js`
 * lines 280-297 + 566-573 for the production reference).
 *
 * SECURITY: `apiKey` is a runtime parameter -- do NOT hardcode or log it.
 *
 * DEFERRED (Phase 4 carryforward notes):
 *   - prompt caching   (deferred to a follow-on phase)
 *   - streaming        (deferred; this adapter is single-shot Promise -- per CONTEXT.md D-06)
 *   - tool use         (Anthropic tool_use blocks are deferred)
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter contract)
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-02 + D-07: full custom adapter; preserve top-level `system`).
 */
export interface AnthropicProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly apiKey: string;
  /** Defaults to `https://api.anthropic.com`. Override for proxies. */
  readonly baseUrl?: string;
  /** Defaults to `2023-06-01`. Override only if the consumer has tested a newer pinned version. */
  readonly anthropicVersion?: string;
  readonly fetch?: typeof fetch;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 2000;

export function createAnthropicProvider(options: AnthropicProviderOptions): ProviderAdapter {
  const id = options.id ?? "anthropic";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
  const anthropicVersion = options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  return {
    id,
    kind: "provider-adapter",
    capabilities: [
      {
        ...defaultCapabilityForProvider(id),
        modelId: options.model,
        fileTransport: ["inline", "json", "url", "base64", "extracted-text", "transcript"],
      },
    ],
    async execute(request) {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": anthropicVersion,
        },
        body: JSON.stringify({
          model: options.model,
          // D-07: top-level `system` field PRESERVED (Anthropic Messages API
          // contract; NOT folded into the `messages` array).
          system: "",
          messages: [
            {
              role: "user",
              content: request.task,
            },
          ],
          max_tokens: DEFAULT_MAX_TOKENS,
        }),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };

      const response = await fetchImpl(`${baseUrl}/v1/messages`, init);

      if (!response.ok) {
        throw new Error(`Anthropic provider failed with ${response.status}.`);
      }

      const body = (await response.json()) as {
        content?: readonly { text?: unknown }[];
        usage?: unknown;
      };

      const text = String(body.content?.[0]?.text ?? "");
      const usage = normalizeAnthropicUsage(body.usage);
      const normalizedUsage = normalizeAnthropicUsageToRunUsage(body.usage, options.pricing);

      return {
        rawOutputs: Object.fromEntries(request.outputs.map((name) => [name, text])),
        ...(usage !== undefined ? { usage } : {}),
        normalizedUsage,
        rawResponse: body,
      };
    },
  };
}

/**
 * Anthropic uses `input_tokens` / `output_tokens` (not OpenAI's
 * `prompt_tokens` / `completion_tokens`). This helper maps to Lattice's
 * `Usage` shape and applies pricing when supplied (Phase 7 pattern).
 */
function normalizeAnthropicUsageToRunUsage(
  rawUsage: unknown,
  pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  },
): Usage {
  let promptTokens = 0;
  let completionTokens = 0;
  if (typeof rawUsage === "object" && rawUsage !== null) {
    const record = rawUsage as Record<string, unknown>;
    promptTokens = numberField(record, "input_tokens") ?? numberField(record, "inputTokens") ?? 0;
    completionTokens =
      numberField(record, "output_tokens") ?? numberField(record, "outputTokens") ?? 0;
  }
  let costUsd: number | null = null;
  if (
    pricing !== undefined &&
    (pricing.inputPer1kTokens !== undefined || pricing.outputPer1kTokens !== undefined)
  ) {
    const inputCost = ((pricing.inputPer1kTokens ?? 0) * promptTokens) / 1000;
    const outputCost = ((pricing.outputPer1kTokens ?? 0) * completionTokens) / 1000;
    costUsd = inputCost + outputCost;
  }
  return { promptTokens, completionTokens, costUsd };
}

function normalizeAnthropicUsage(usage: unknown): UsageRecord | undefined {
  if (typeof usage !== "object" || usage === null) {
    return undefined;
  }
  const record = usage as Record<string, unknown>;
  const inputTokens = numberField(record, "input_tokens");
  const outputTokens = numberField(record, "output_tokens");
  const totalTokens =
    inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined;
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}
