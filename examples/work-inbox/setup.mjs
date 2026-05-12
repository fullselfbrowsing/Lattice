/**
 * Shared setup helpers for the work-inbox showcase (Phase 13-01).
 *
 * Produces the on-disk `.lattice/` layout consumed by `lattice repro`,
 * `lattice verify`, and `lattice eval` (per 13-CONTEXT.md "Receipts +
 * Artifacts Output"):
 *
 *   examples/work-inbox/.lattice/
 *     keyset.json           # JSON array of KeyEntry — what loadKeySetFromPath expects
 *     receipts/<id>.json    # Signed ReceiptEnvelope per terminal run
 *     fixtures/<sha256>.bin # Content-addressed input artifact bodies
 *     baseline.json         # (written by `lattice eval --init-baseline`, not us)
 *
 * Each `pnpm example:work-inbox` invocation generates a fresh Ed25519
 * keypair — receipts are unique per run. The `.lattice/` tree is
 * gitignored so it never pollutes the repo.
 *
 * Public exports:
 *   - createShowcase()                              -> { ai, signer, keySet, paths }
 *   - buildScenarioAI({ signer, sessionId, fakeRawOutputs, capabilities? })
 *   - writeArtifactContentAddressed(fixturesDir, bytes) -> sha256 hex
 *   - writeReceipt(receiptsDir, envelope)           -> absolute path
 *   - writeSidecar(sidecarsDir, receiptId, sidecar) -> absolute path
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAI,
  createAISdkProvider,
  createFakeProvider,
  createInMemorySigner,
  createMemoryKeySet,
  createMemorySessionStore,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
  generateEd25519KeyPairJwk,
} from "../../packages/lattice/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve and create the .lattice/ on-disk layout, generate a fresh Ed25519
 * keypair, write the keyset JSON, and construct a shared `ai` instance
 * (success scenario reuses this; tripwire + refusal build their own).
 */
export async function createShowcase() {
  const latticeDir = resolve(__dirname, ".lattice");
  const receiptsDir = join(latticeDir, "receipts");
  const fixturesDir = join(latticeDir, "fixtures");
  const sidecarsDir = join(latticeDir, "sidecars");
  const keysetPath = join(latticeDir, "keyset.json");
  const baselinePath = join(latticeDir, "baseline.json");

  await mkdir(receiptsDir, { recursive: true });
  await mkdir(fixturesDir, { recursive: true });
  await mkdir(sidecarsDir, { recursive: true });

  // Fresh per-run keypair. `generateEd25519KeyPairJwk()` returns
  // `{ privateKeyJwk, publicKeyJwk }` only — caller mints the kid.
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const kid = `showcase-${randomUUID()}`;

  // Keyset file format consumed by `loadKeySetFromPath` in lattice-cli:
  // a JSON array of `KeyEntry { kid, state, publicKeyJwk }`. NOT a
  // versioned object — the CLI loader rejects anything else.
  const keysetEntries = [
    {
      kid,
      state: "active",
      publicKeyJwk,
    },
  ];
  await writeFile(keysetPath, JSON.stringify(keysetEntries, null, 2));

  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keySet = createMemoryKeySet(keysetEntries);

  // Shared `ai` exposed for callers that want a no-op default. Each
  // scenario constructs its own scenario-specific `ai` via
  // `buildScenarioAI` so the fake provider response varies per scenario.
  const ai = createAI({
    sessions: createMemorySessionStore(),
    providers: [
      createFakeProvider({
        id: "showcase-default",
        response: { rawOutputs: {} },
      }),
    ],
    signer,
  });

  return {
    ai,
    signer,
    keySet,
    keysetEntries,
    latticeDir,
    receiptsDir,
    fixturesDir,
    sidecarsDir,
    keysetPath,
    baselinePath,
    kid,
  };
}

/**
 * Build a scenario-scoped `ai` with a fresh fake provider returning
 * `fakeRawOutputs` and the shared signer threaded through. Optional
 * `capabilities` override is used by the refusal scenario to give the
 * provider non-zero pricing so the budget invariant can actually fire.
 */
export function buildScenarioAI({ signer, sessionId, fakeRawOutputs, capabilities }) {
  const providerOptions = {
    id: `showcase-${sessionId}`,
    response: { rawOutputs: fakeRawOutputs },
  };
  if (capabilities !== undefined) {
    providerOptions.capabilities = capabilities;
  }
  return createAI({
    sessions: createMemorySessionStore(),
    providers: [createFakeProvider(providerOptions)],
    signer,
  });
}

/**
 * Write `bytes` (Buffer | Uint8Array | string) to
 * `<fixturesDir>/<sha256hex>.bin` and return the sha256 hex digest.
 *
 * Idempotent: if the file already exists, no second write is performed.
 * The runtime hashes artifact values via `fingerprintArtifactValue`
 * (sha256 over the value bytes), so the showcase pre-hashes here and
 * writes the same bytes — `lattice repro` can then rehydrate the input
 * by the hash recorded in the receipt's `inputHashes`.
 */
export async function writeArtifactContentAddressed(fixturesDir, bytes) {
  const buf =
    typeof bytes === "string"
      ? Buffer.from(bytes, "utf8")
      : Buffer.isBuffer(bytes)
        ? bytes
        : Buffer.from(bytes);
  const sha256hex = createHash("sha256").update(buf).digest("hex");
  const filePath = join(fixturesDir, `${sha256hex}.bin`);
  let exists = true;
  try {
    await access(filePath);
  } catch {
    exists = false;
  }
  if (!exists) {
    await writeFile(filePath, buf);
  }
  return sha256hex;
}

/**
 * Decode `envelope.payload` (base64url -> JSON) to read `body.receiptId`,
 * then write the full envelope as JSON to `<receiptsDir>/<receiptId>.json`.
 * Returns the absolute path written. This is the filename convention
 * `lattice repro <id>` expects (Phase 11-03 receipt-loader).
 */
export async function writeReceipt(receiptsDir, envelope) {
  if (envelope === undefined || envelope === null) {
    throw new Error("writeReceipt: envelope is undefined — signer is not wired.");
  }
  const payloadJson = Buffer.from(envelope.payload, "base64url").toString("utf8");
  const body = JSON.parse(payloadJson);
  const receiptId = body.receiptId;
  if (typeof receiptId !== "string" || receiptId.length === 0) {
    throw new Error(
      "writeReceipt: decoded receipt body has no receiptId — receipt is malformed.",
    );
  }
  const filePath = join(receiptsDir, `${receiptId}.json`);
  await writeFile(filePath, JSON.stringify(envelope, null, 2));
  return filePath;
}

/**
 * Write `sidecar` as JSON to `<sidecarsDir>/<receiptId>.json`. The sidecar
 * carries the `{ task, outputs, policy, contract }` quadruple that
 * `lattice repro` / `lattice eval` need to materialize a replay envelope
 * that round-trips to verdict=match (Phase 13.1).
 *
 * Defensive: refuses to write any version other than `"lattice-sidecar/v1"`
 * (matches the loader's strict version check). Returns the absolute path
 * written.
 *
 * @param {string} sidecarsDir - Absolute path to the sidecars dir.
 * @param {string} receiptId - The receipt id (used as the filename stem).
 * @param {object} sidecar - The sidecar object to JSON.stringify.
 * @returns {Promise<string>} Absolute path written.
 */
export async function writeSidecar(sidecarsDir, receiptId, sidecar) {
  if (sidecar?.version !== "lattice-sidecar/v1") {
    throw new Error(
      `writeSidecar: refusing to write — expected version "lattice-sidecar/v1", got "${sidecar?.version}".`,
    );
  }
  if (typeof receiptId !== "string" || receiptId.length === 0) {
    throw new Error("writeSidecar: receiptId must be a non-empty string.");
  }
  const filePath = join(sidecarsDir, `${receiptId}.json`);
  await writeFile(filePath, JSON.stringify(sidecar, null, 2));
  return filePath;
}

/**
 * Build three provider adapters representing each v1.1 adapter family,
 * each producing a normalized Usage shape:
 *   - openai           — createOpenAIProvider with bundled catalog pricing
 *                        (per-1k input/output costs set explicitly so costUsd
 *                        is a positive number, not null).
 *   - openai-compat    — createOpenAICompatibleProvider with caller-supplied
 *                        pricing and a TEST-INJECTED fetch mock returning a
 *                        deterministic chat-completions body (NO real HTTP).
 *   - ai-sdk           — createAISdkProvider whose `generate` returns a fixed
 *                        ProviderRunResponse with non-null usage.inputTokens
 *                        / usage.outputTokens (costUsd is null per the
 *                        ai-sdk adapter's documented behaviour).
 *
 * Token counts in the inline mock are FIXED (prompt=100, completion=50) so
 * downstream stdout / receipts are byte-deterministic across runs.
 *
 * Cost expectations (with the bundled defaults):
 *   - openai        costUsd = 100/1000 * 0.001 + 50/1000 * 0.002 = 0.0002
 *   - openai-compat costUsd = 100/1000 * 0.0005 + 50/1000 * 0.001 = 0.0001
 *   - ai-sdk        costUsd = null (per adapter design)
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] - Injected fetch for openai +
 *   openai-compat. When omitted, a shared deterministic mock is used.
 *   Tests can pass their own to assert request shape.
 * @returns {{
 *   openai: import("../../packages/lattice/dist/index.js").ProviderAdapter,
 *   openaiCompat: import("../../packages/lattice/dist/index.js").ProviderAdapter,
 *   aiSdk: import("../../packages/lattice/dist/index.js").ProviderAdapter,
 * }}
 */
export function buildMultiAdapterProviders(options = {}) {
  const defaultFetchMock = async (_url, _init) => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "stub-completion" } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const fetchImpl = options.fetch ?? defaultFetchMock;

  const openai = createOpenAIProvider({
    id: "showcase-openai",
    model: "showcase-openai-1",
    baseUrl: "https://stub.invalid/v1",
    apiKey: "stub",
    pricing: {
      inputPer1kTokens: 0.001,
      outputPer1kTokens: 0.002,
    },
    fetch: fetchImpl,
  });

  const openaiCompat = createOpenAICompatibleProvider({
    id: "showcase-openai-compat",
    model: "showcase-openai-compat-1",
    baseUrl: "https://stub.invalid/v1",
    pricing: {
      inputPer1kTokens: 0.0005,
      outputPer1kTokens: 0.001,
    },
    fetch: fetchImpl,
  });

  const aiSdk = createAISdkProvider({
    id: "showcase-ai-sdk",
    model: "showcase-ai-sdk-1",
    generate: async () => ({
      rawOutputs: { answer: "ai-sdk-fixed-answer" },
      usage: { inputTokens: 80, outputTokens: 40 },
    }),
  });

  return { openai, openaiCompat, aiSdk };
}
