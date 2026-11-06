import type { ProviderGenerationOptions, ProviderRunRequest } from "./provider.js";

export function validateGenerationOptions(
  generation: ProviderGenerationOptions | undefined,
  maxTemperature = 2,
): void {
  if (generation === undefined) return;
  const { temperature, maxOutputTokens } = generation;
  if (temperature !== undefined &&
    (!Number.isFinite(temperature) || temperature < 0 || temperature > maxTemperature)) {
    throw new TypeError(`generation.temperature must be between 0 and ${maxTemperature}.`);
  }
  if (maxOutputTokens !== undefined &&
    (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)) {
    throw new TypeError("generation.maxOutputTokens must be a positive safe integer.");
  }
}

/** Hash exactly the body handed to fetch; transport wrappers can still mutate it afterward. */
export async function notifyRequestPrepared(request: ProviderRunRequest, body: string): Promise<void> {
  if (request.onRequestPrepared === undefined) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const bodyHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await request.onRequestPrepared({ bodyHash });
}
