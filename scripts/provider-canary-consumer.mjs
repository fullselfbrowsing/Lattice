#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createAI,
  createAnthropicProvider,
  createGeminiProvider,
  createInMemorySigner,
  createMemoryKeySet,
  createOpenAICompatibleProvider,
  generateEd25519KeyPairJwk,
  latticeVersion,
  verifyReceipt,
} from "@full-self-browsing/lattice";

import {
  CANARY_LIMITS,
  CANARY_PROMPT,
  CanaryFailure,
  classifyCanaryFailure,
  createLauncherFailureReport,
  createSanitizedReport,
  extractProviderEvidence,
  parseCanaryConfiguration,
  reportExitCode,
  validateUsageAndCost,
} from "./provider-canary-core.mjs";

export async function runProviderCanary({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  decorateFetch,
  timeoutMs = CANARY_LIMITS.timeoutMs,
} = {}) {
  const configurations = parseCanaryConfiguration(environment);
  const records = [];

  for (const configuration of configurations) {
    if (configuration.status === "not-run") {
      records.push(configuration.record);
      continue;
    }
    records.push(
      await runConfiguredFamily(configuration.config, {
        fetchImpl,
        decorateFetch,
        timeoutMs: normalizeTimeout(timeoutMs),
      }),
    );
  }

  return createSanitizedReport({
    packageVersion: latticeVersion,
    commit: environment.LATTICE_PROVIDER_CANARY_COMMIT ?? "unknown",
    records,
  });
}

async function runConfiguredFamily(config, dependencies) {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let transportCount = 0;
  let evidence;
  let costUsd;
  let receiptVerified = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new CanaryFailure("transport-timeout"));
  }, dependencies.timeoutMs);

  const countedFetch = async (input, init) => {
    transportCount += 1;
    if (transportCount > CANARY_LIMITS.maxTransports) {
      throw new CanaryFailure("transport-limit-exceeded");
    }
    return dependencies.fetchImpl(input, {
      ...init,
      redirect: "error",
    });
  };
  const providerFetch =
    typeof dependencies.decorateFetch === "function"
      ? dependencies.decorateFetch(countedFetch, config.family)
      : countedFetch;

  try {
    const { privateKeyJwk, publicKeyJwk } =
      await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: `provider-canary-${config.family}`,
      publicKeyJwk,
    });
    const keySet = createMemoryKeySet([
      { kid: signer.kid, publicKeyJwk, state: "active" },
    ]);
    const provider = createProvider(config, providerFetch);
    let rawResponse;
    const ai = createAI({
      providers: [provider],
      signer,
      receiptMode: "required",
    });
    const result = await ai.run({
      task: CANARY_PROMPT,
      artifacts: [],
      outputs: { answer: "text" },
      signal: controller.signal,
      overrides: {
        provider: provider.id,
        model: config.model,
        hooks: {
          afterProviderCall({ response }) {
            if (isRecord(response) && "rawResponse" in response) {
              rawResponse = response.rawResponse;
            }
          },
        },
      },
    });

    if (!result.ok) {
      const providerFailure =
        result.error.kind === "provider_execution"
          ? classifyCanaryFailure(result.error, timedOut)
          : "runtime-failed";
      throw new CanaryFailure(providerFailure);
    }
    if (transportCount !== CANARY_LIMITS.maxTransports) {
      throw new CanaryFailure("transport-limit-exceeded");
    }

    evidence = extractProviderEvidence(
      config.family,
      rawResponse,
      result.usage,
    );
    assertEvidenceDoesNotEchoSensitiveInput(evidence, config);
    costUsd = validateUsageAndCost(config, evidence, result.usage);

    if (result.receipt === undefined) {
      throw new CanaryFailure("receipt-missing");
    }
    const verification = await verifyReceipt(result.receipt, keySet, {
      legacyPolicy: "reject",
    });
    if (
      !verification.ok ||
      verification.body.version !== "lattice-receipt/v1.4" ||
      verification.verificationProfile !== "dsse-v1" ||
      verification.deprecated
    ) {
      throw new CanaryFailure("receipt-verification-failed");
    }
    receiptVerified = true;
    if (timedOut) {
      throw new CanaryFailure("transport-timeout");
    }

    return {
      family: config.family,
      configuredModel: config.model,
      observedModel: evidence.observedModel,
      ...(evidence.requestId === undefined
        ? {}
        : { requestId: evidence.requestId }),
      status: "passed",
      code: "ok",
      usage: evidence.usage,
      costUsd,
      durationMs: Date.now() - startedAt,
      transportCount,
      receiptVerified,
    };
  } catch (error) {
    return {
      family: config.family,
      configuredModel: config.model,
      ...(evidence === undefined
        ? {}
        : {
            observedModel: evidence.observedModel,
            ...(evidence.requestId === undefined
              ? {}
              : { requestId: evidence.requestId }),
            usage: evidence.usage,
          }),
      status: "failed",
      code: classifyCanaryFailure(error, timedOut),
      ...(costUsd === undefined ? {} : { costUsd }),
      durationMs: Date.now() - startedAt,
      transportCount,
      receiptVerified,
    };
  } finally {
    clearTimeout(timer);
  }
}

function createProvider(config, fetchImpl) {
  const common = {
    model: config.model,
    fetch: fetchImpl,
    pricing: {
      inputPer1kTokens: config.inputPricePer1kUsd,
      outputPer1kTokens: config.outputPricePer1kUsd,
    },
    maxOutputTokens: CANARY_LIMITS.maxOutputTokens,
  };
  if (config.family === "openai-compatible") {
    return createOpenAICompatibleProvider({
      ...common,
      apiKey: config.credential,
      baseUrl: config.baseUrl,
    });
  }
  if (config.family === "anthropic") {
    return createAnthropicProvider({
      ...common,
      apiKey: config.credential,
      baseUrl: config.baseUrl,
    });
  }
  if (config.family === "gemini") {
    return createGeminiProvider({
      ...common,
      apiKey: config.credential,
      baseUrl: config.baseUrl,
    });
  }
  throw new CanaryFailure("internal-failure");
}

function assertEvidenceDoesNotEchoSensitiveInput(evidence, config) {
  const retainedIdentifiers = [evidence.observedModel, evidence.requestId].filter(
    (value) => typeof value === "string",
  );
  if (
    retainedIdentifiers.some(
      (value) =>
        value.includes(config.credential) || value.includes(CANARY_PROMPT),
    )
  ) {
    throw new CanaryFailure("response-malformed");
  }
}

function normalizeTimeout(value) {
  return Number.isFinite(value) && value > 0 && value <= CANARY_LIMITS.timeoutMs
    ? value
    : CANARY_LIMITS.timeoutMs;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main() {
  let report;
  try {
    report = await runProviderCanary();
  } catch {
    report = createLauncherFailureReport({
      commit: process.env.LATTICE_PROVIDER_CANARY_COMMIT,
    });
    process.exitCode = 1;
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (process.exitCode !== 1) {
    process.exitCode = reportExitCode(report);
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
