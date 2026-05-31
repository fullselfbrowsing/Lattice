import type { UsageRecord } from "../plan/plan.js";
import type { ProviderAdapter, ProviderRunResponse, Usage } from "./provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";

/**
 * Options for {@link createGeminiProvider}.
 *
 * Mirrors `OpenAICompatibleProviderOptions` ergonomics (Phase 7 pattern) but
 * for Google's Generative Language API at
 * `/v1beta/models/{model}:generateContent` -- which uses `contents[].parts[].text`
 * (NOT OpenAI's `messages[]`), `role: "model"` for assistant turns (NOT
 * `"assistant"`), authenticates via `?key=` query string, and applies a
 * 4-category `safetySettings` block at `BLOCK_NONE` thresholds (FSB convention
 * mirrored from `extension/ai/universal-provider.js:255-272`).
 *
 * SECURITY: `apiKey` is a runtime parameter -- do NOT hardcode or log it.
 *
 * DEFERRED (Phase 4 carryforward notes):
 *   - multimodal (vision) -- deferred
 *   - streaming           -- deferred (single-shot Promise per CONTEXT.md D-06)
 *   - tool use            -- deferred
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter contract)
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-02 + D-07: full custom adapter; preserve role:"model").
 */
export interface GeminiProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly apiKey: string;
  /** Defaults to `https://generativelanguage.googleapis.com`. */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 0.9;

/**
 * 4 HARM_CATEGORY entries at BLOCK_NONE (FSB convention mirrored from
 * `extension/ai/universal-provider.js:255-272`). If Google restricts
 * BLOCK_NONE in the future, that is a re-spec concern, not a Phase 4
 * design defect (CONTEXT.md Specific Ideas note).
 */
const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
] as const;

export function createGeminiProvider(options: GeminiProviderOptions): ProviderAdapter {
  const id = options.id ?? "gemini";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");

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
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: request.task }],
            },
          ],
          generationConfig: {
            temperature: DEFAULT_TEMPERATURE,
            topP: DEFAULT_TOP_P,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          },
          safetySettings: SAFETY_SETTINGS,
        }),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };

      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
      const response = await fetchImpl(url, init);

      if (!response.ok) {
        throw new Error(`Gemini provider failed with ${response.status}.`);
      }

      const body = (await response.json()) as {
        candidates?: readonly {
          content?: { parts?: readonly { text?: unknown }[] };
        }[];
        usageMetadata?: unknown;
      };

      if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
        throw new Error("Gemini provider returned no candidates.");
      }

      const text = String(body.candidates[0]?.content?.parts?.[0]?.text ?? "");
      const usage = normalizeGeminiUsage(body.usageMetadata);
      const normalizedUsage = normalizeGeminiUsageToRunUsage(body.usageMetadata, options.pricing);

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
 * Gemini uses `usageMetadata.promptTokenCount` / `candidatesTokenCount` /
 * `totalTokenCount` (NOT OpenAI's `prompt_tokens` / `completion_tokens`).
 * This helper maps to Lattice's `Usage` shape and applies pricing when supplied.
 */
function normalizeGeminiUsageToRunUsage(
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
    promptTokens = numberField(record, "promptTokenCount") ?? 0;
    completionTokens = numberField(record, "candidatesTokenCount") ?? 0;
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

function normalizeGeminiUsage(usage: unknown): UsageRecord | undefined {
  if (typeof usage !== "object" || usage === null) {
    return undefined;
  }
  const record = usage as Record<string, unknown>;
  const inputTokens = numberField(record, "promptTokenCount");
  const outputTokens = numberField(record, "candidatesTokenCount");
  const totalTokens = numberField(record, "totalTokenCount");
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
