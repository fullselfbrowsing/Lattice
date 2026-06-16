#!/usr/bin/env node
/**
 * Phase 33 — D-16 / D-17 / D-18 — Build-time OpenRouter snapshot generator.
 *
 * Fetches https://openrouter.ai/api/v1/models, classifies each entry via
 * scripts/capabilities/classifier.mjs, sorts by (adapter, id), and writes
 * packages/lattice/src/capabilities/registry.generated.ts.
 *
 * Modes:
 *   (default)  Write the file.
 *   --check    Diff against committed file; exit 1 on bit-exact drift (D-17);
 *              exit 0 with stderr WARN on upstream fetch failure (D-18).
 *
 * Zero external dependencies — node: built-ins only (scripts/ invariant).
 *
 * Determinism rules (RESEARCH §Pattern 2):
 *   - No timestamps anywhere in the file body
 *   - Sort by (adapter, id) before emit
 *   - Explicit key-order in every row literal
 *   - Trailing newline always present
 *
 * Pitfalls handled:
 *   - Pitfall 1: sort before emit
 *   - Pitfall 2: top_provider.context_length ?? context_length
 *   - Pitfall 3: classifier returns null for ~latest aliases; filter
 *
 * Build-time only per D-02. Never bundled into the published tarball.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { classify } from "./capabilities/classifier.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const REGISTRY_PATH = join(repoRoot, "packages/lattice/src/capabilities/registry.generated.ts");
const UPSTREAM_URL = "https://openrouter.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 30000;
const PRICING_KEYS = [
  "prompt",
  "completion",
  "image",
  "audio",
  "web_search",
  "internal_reasoning",
  "input_cache_read",
  "input_cache_write",
];

const HEADER = `// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: scripts/refresh-model-registry.mjs
// Upstream: https://openrouter.ai/api/v1/models
// Regenerate with: node scripts/refresh-model-registry.mjs
// CI drift gate: .github/workflows/registry-drift.yml (weekly cron)
import type { ModelCapabilityProfile } from "./profile.js";

export const GENERATED_PROFILES = [
`;

const FOOTER = `] as const satisfies readonly ModelCapabilityProfile[];
`;

/**
 * 3-attempt exponential-backoff fetch with per-attempt AbortController
 * timeout (30s). Network unreachable / non-2xx / JSON parse failure all
 * surface as the final thrown error after exhausting retries.
 *
 * Backoff: 500ms / 1000ms / 2000ms between attempts (D-18 expectation).
 */
async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(new Error("timeout")), FETCH_TIMEOUT_MS);
    const headers = { Accept: "application/json" };
    if (process.env.OPENROUTER_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    }
    try {
      const resp = await fetch(url, {
        headers,
        signal: ctrl.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const backoffMs = 500 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastErr;
}

function normalizePricing(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const pricing = {};
  for (const key of PRICING_KEYS) {
    const value = raw[key];
    if (typeof value === "string") pricing[key] = value;
  }
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function normalizeModalities(raw) {
  if (!Array.isArray(raw)) return undefined;
  const values = raw.map((value) => (typeof value === "string" ? value.trim() : ""));
  if (values.length === 0 || values.some((value) => value.length === 0)) return undefined;
  return values;
}

function normalizeSupportedParameters(raw) {
  if (!Array.isArray(raw)) return undefined;
  const values = raw
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return unique.length > 0 ? unique : undefined;
}

function renderPricingField(pricing) {
  if (pricing === undefined) return "";
  const entries = PRICING_KEYS
    .filter((key) => typeof pricing[key] === "string")
    .map((key) => `${key}: ${JSON.stringify(pricing[key])}`);
  if (entries.length === 0) return "";
  return `    pricing: { ${entries.join(", ")} },\n`;
}

function renderStringArrayField(name, values) {
  if (values === undefined) return "";
  return `    ${name}: [${values.map((value) => JSON.stringify(value)).join(", ")}],\n`;
}

/**
 * Render one profile literal with explicit key order. Key order MUST
 * match the `ModelCapabilityProfile` field order in profile.ts — this
 * is what makes the generated file byte-stable across runs.
 *
 * `JSON.stringify` is used per primitive so backticks, control chars,
 * unicode, etc. are correctly escaped without any shell-exec path.
 */
function renderRow(profile) {
  return (
    "  {\n" +
    `    id: ${JSON.stringify(profile.id)},\n` +
    `    adapter: ${JSON.stringify(profile.adapter)},\n` +
    `    originFamily: ${JSON.stringify(profile.originFamily)},\n` +
    `    trainingClass: ${JSON.stringify(profile.trainingClass)},\n` +
    `    reasoningSurface: ${JSON.stringify(profile.reasoningSurface)},\n` +
    `    toolCallSurface: ${JSON.stringify(profile.toolCallSurface)},\n` +
    `    contextWindow: ${profile.contextWindow},\n` +
    renderPricingField(profile.pricing) +
    renderStringArrayField("inputModalities", profile.inputModalities) +
    renderStringArrayField("outputModalities", profile.outputModalities) +
    renderStringArrayField("supportedParameters", profile.supportedParameters) +
    `    knownFailureModes: [${profile.knownFailureModes.map((m) => JSON.stringify(m)).join(", ")}],\n` +
    `    recommendedPromptStrategy: ${JSON.stringify(profile.recommendedPromptStrategy)},\n` +
    "  },\n"
  );
}

/**
 * Sort profiles by (adapter, id) before emit (Pitfall 1). OpenRouter
 * returns models in non-deterministic order; sorting here is what makes
 * the --check drift gate (D-17) work bit-exactly.
 */
export function render(profiles) {
  const sorted = [...profiles].sort((a, b) => {
    if (a.adapter !== b.adapter) return a.adapter.localeCompare(b.adapter);
    return a.id.localeCompare(b.id);
  });
  return HEADER + sorted.map(renderRow).join("") + FOOTER;
}

/**
 * Transform the raw OpenRouter feed into typed profile objects. Filters
 * out `null` classifications (Pitfall 3 ~latest aliases) and rows with
 * missing ids. `contextWindow` uses the top_provider precedence (Pitfall
 * 2 / A1) — what OpenRouter routing will actually accept on a request.
 */
export function transformFeed(rawFeed) {
  const profiles = [];
  for (const raw of rawFeed.data ?? []) {
    const classified = classify(raw);
    if (classified === null) continue; // Pitfall 3 ~latest skip
    if (typeof raw.id !== "string" || raw.id.length === 0) {
      console.warn(`[refresh-model-registry] WARN — skipping row with missing id`);
      continue;
    }
    const pricing = normalizePricing(raw.pricing);
    const inputModalities = normalizeModalities(raw.input_modalities);
    const outputModalities = normalizeModalities(raw.output_modalities);
    const supportedParameters = normalizeSupportedParameters(raw.supported_parameters);
    profiles.push({
      id: raw.id,
      adapter: "openrouter",
      originFamily: classified.originFamily,
      trainingClass: classified.trainingClass,
      reasoningSurface: classified.reasoningSurface,
      toolCallSurface: classified.toolCallSurface,
      // Pitfall 2 / A1: top_provider.context_length is the routing-tier truth.
      contextWindow: raw.top_provider?.context_length ?? raw.context_length ?? 0,
      ...(pricing !== undefined ? { pricing } : {}),
      ...(inputModalities !== undefined ? { inputModalities } : {}),
      ...(outputModalities !== undefined ? { outputModalities } : {}),
      ...(supportedParameters !== undefined ? { supportedParameters } : {}),
      knownFailureModes: classified.knownFailureModes,
      recommendedPromptStrategy: classified.recommendedPromptStrategy,
    });
  }
  return profiles;
}

async function main() {
  const checkMode = process.argv.includes("--check");

  let feed;
  try {
    feed = await fetchWithRetry(UPSTREAM_URL);
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (checkMode) {
      // D-18: upstream outage is not a CI block; surface as WARN, exit 0.
      console.warn(
        `[refresh-model-registry] WARN — upstream fetch failed (${msg}). Skipping drift check (D-18).`,
      );
      return;
    }
    // Write mode: the engineer asked for a fresh snapshot, so we must error.
    console.error(`[refresh-model-registry] FAIL — upstream fetch failed: ${msg}`);
    process.exit(1);
  }

  const generated = render(transformFeed(feed));

  if (checkMode) {
    // D-17: bit-exact diff. Any byte difference fails.
    const committed = await readFile(REGISTRY_PATH, "utf8").catch(() => "");
    if (generated !== committed) {
      console.error("[refresh-model-registry] FAIL — registry.generated.ts is stale.");
      console.error("[refresh-model-registry] Regenerate with: node scripts/refresh-model-registry.mjs");
      console.error(
        `[refresh-model-registry] (Generated ${generated.length} bytes vs committed ${committed.length} bytes.)`,
      );
      process.exit(1);
    }
    console.log("[refresh-model-registry] OK — registry matches upstream.");
    return;
  }

  await writeFile(REGISTRY_PATH, generated, "utf8");
  console.log(
    `[refresh-model-registry] OK — wrote ${REGISTRY_PATH} (${generated.length} bytes).`,
  );
}

// Top-level entrypoint guard: only call main() when invoked as a CLI, NOT
// when imported by a test that wants `render` / `transformFeed` only.
const invokedAsCli = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().catch((err) => {
    console.error(`[refresh-model-registry] FAIL — unexpected: ${(err && err.stack) || String(err)}`);
    process.exit(1);
  });
}
