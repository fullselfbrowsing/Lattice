export const CANARY_LIMITS = Object.freeze({
  maxInputTokens: 2048,
  maxOutputTokens: 16,
  timeoutMs: 20_000,
  maxTransports: 1,
  maxSpendUsdPerFamily: 0.02,
});

export const CANARY_PROMPT =
  "Return one short acknowledgement for this provider health check.";

export const CANARY_FAMILIES = Object.freeze([
  "openai-compatible",
  "anthropic",
  "gemini",
]);

const FAMILY_DEFINITIONS = Object.freeze([
  {
    family: "openai-compatible",
    envPrefix: "OPENAI",
    defaultBaseUrl: undefined,
  },
  {
    family: "anthropic",
    envPrefix: "ANTHROPIC",
    defaultBaseUrl: "https://api.anthropic.com",
  },
  {
    family: "gemini",
    envPrefix: "GEMINI",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
  },
]);

const STABLE_CODES = new Set([
  "ok",
  "missing-model",
  "invalid-model",
  "missing-credential",
  "missing-base-url",
  "invalid-base-url",
  "missing-pricing",
  "invalid-pricing",
  "missing-spend-cap",
  "invalid-spend-cap",
  "projected-spend-exceeds-cap",
  "provider-http-error",
  "transport-timeout",
  "transport-failed",
  "transport-limit-exceeded",
  "runtime-failed",
  "response-malformed",
  "usage-missing",
  "usage-normalization-mismatch",
  "usage-limit-exceeded",
  "spend-limit-exceeded",
  "observed-model-missing",
  "receipt-missing",
  "receipt-verification-failed",
  "launcher-failed",
  "internal-failure",
]);

const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const SECRET_LIKE_IDENTIFIER_RE = /^(?:sk-|AIza|bearer|token-|secret-)/iu;

export class CanaryFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "CanaryFailure";
    this.code = STABLE_CODES.has(code) ? code : "internal-failure";
  }
}

export function parseCanaryConfiguration(environment = process.env) {
  return FAMILY_DEFINITIONS.map((definition) =>
    parseFamilyConfiguration(definition, environment),
  );
}

function parseFamilyConfiguration(definition, environment) {
  const envName = (suffix) =>
    `LATTICE_CANARY_${definition.envPrefix}_${suffix}`;
  const modelValue = environment[envName("MODEL")];
  const model = normalizeIdentifier(modelValue);
  if (
    modelValue === undefined ||
    (typeof modelValue === "string" && modelValue.trim().length === 0)
  ) {
    return notRun(definition.family, "missing-model");
  }
  if (model === undefined) {
    return notRun(definition.family, "invalid-model");
  }

  const credential = environment[envName("API_KEY")];
  if (
    typeof credential !== "string" ||
    credential.trim().length === 0
  ) {
    return notRun(definition.family, "missing-credential", model);
  }

  const baseUrlValue =
    environment[envName("BASE_URL")] ?? definition.defaultBaseUrl;
  if (
    baseUrlValue === undefined ||
    (typeof baseUrlValue === "string" && baseUrlValue.trim().length === 0)
  ) {
    return notRun(definition.family, "missing-base-url", model);
  }
  if (typeof baseUrlValue !== "string") {
    return notRun(definition.family, "invalid-base-url", model);
  }
  const baseUrl = normalizeBaseUrl(baseUrlValue);
  if (baseUrl === undefined) {
    return notRun(definition.family, "invalid-base-url", model);
  }

  const inputPrice = parseFiniteNumber(
    environment[envName("INPUT_PRICE_PER_1K_USD")],
  );
  const outputPrice = parseFiniteNumber(
    environment[envName("OUTPUT_PRICE_PER_1K_USD")],
  );
  if (inputPrice.status === "missing" || outputPrice.status === "missing") {
    return notRun(definition.family, "missing-pricing", model);
  }
  if (
    inputPrice.status !== "valid" ||
    outputPrice.status !== "valid" ||
    inputPrice.value < 0 ||
    outputPrice.value < 0
  ) {
    return notRun(definition.family, "invalid-pricing", model);
  }

  const spendCap = parseFiniteNumber(
    environment[envName("MAX_SPEND_USD")],
  );
  if (spendCap.status === "missing") {
    return notRun(definition.family, "missing-spend-cap", model);
  }
  if (
    spendCap.status !== "valid" ||
    spendCap.value <= 0 ||
    spendCap.value > CANARY_LIMITS.maxSpendUsdPerFamily
  ) {
    return notRun(definition.family, "invalid-spend-cap", model);
  }

  const projectedCostUsd = computeUsageCostUsd(
    {
      inputTokens: CANARY_LIMITS.maxInputTokens,
      outputTokens: CANARY_LIMITS.maxOutputTokens,
    },
    {
      inputPer1kUsd: inputPrice.value,
      outputPer1kUsd: outputPrice.value,
    },
  );
  if (projectedCostUsd > spendCap.value) {
    return notRun(
      definition.family,
      "projected-spend-exceeds-cap",
      model,
    );
  }

  return {
    family: definition.family,
    status: "configured",
    config: Object.freeze({
      family: definition.family,
      model,
      credential,
      baseUrl,
      inputPricePer1kUsd: inputPrice.value,
      outputPricePer1kUsd: outputPrice.value,
      maxSpendUsd: spendCap.value,
    }),
  };
}

function notRun(family, code, configuredModel) {
  return {
    family,
    status: "not-run",
    record: {
      family,
      status: "not-run",
      code,
      ...(configuredModel === undefined ? {} : { configuredModel }),
      transportCount: 0,
      receiptVerified: false,
    },
  };
}

function parseFiniteNumber(value) {
  if (value === undefined || (typeof value === "string" && value.trim().length === 0)) {
    return { status: "missing" };
  }
  if (typeof value !== "string") return { status: "invalid" };
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? { status: "valid", value: parsed }
    : { status: "invalid" };
}

function normalizeBaseUrl(value) {
  try {
    const parsed = new URL(value);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    const permittedProtocol =
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && loopback.has(parsed.hostname));
    if (
      !permittedProtocol ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      return undefined;
    }
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return undefined;
  }
}

export function computeUsageCostUsd(usage, pricing) {
  return (
    (usage.inputTokens * pricing.inputPer1kUsd) / 1000 +
    (usage.outputTokens * pricing.outputPer1kUsd) / 1000
  );
}

export function extractProviderEvidence(
  family,
  rawResponse,
  runtimeUsage,
) {
  if (!isRecord(rawResponse)) {
    throw new CanaryFailure("response-malformed");
  }

  const responseUsage = usageRecordForFamily(family, rawResponse);
  if (responseUsage === undefined) {
    throw new CanaryFailure("usage-missing");
  }

  const inputTokens = nonnegativeInteger(responseUsage.inputTokens);
  const outputTokens = nonnegativeInteger(responseUsage.outputTokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    throw new CanaryFailure("usage-missing");
  }

  if (
    runtimeUsage === undefined ||
    runtimeUsage.promptTokens !== inputTokens ||
    (family !== "gemini" && runtimeUsage.completionTokens !== outputTokens)
  ) {
    throw new CanaryFailure("usage-normalization-mismatch");
  }

  const observedModel = observedModelForFamily(family, rawResponse);
  if (observedModel === undefined) {
    throw new CanaryFailure("observed-model-missing");
  }

  return {
    observedModel,
    requestId: requestIdForFamily(family, rawResponse),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };
}

function usageRecordForFamily(family, rawResponse) {
  if (family === "openai-compatible") {
    if (!isRecord(rawResponse.usage)) return undefined;
    return {
      inputTokens:
        rawResponse.usage.prompt_tokens ?? rawResponse.usage.input_tokens,
      outputTokens:
        rawResponse.usage.completion_tokens ?? rawResponse.usage.output_tokens,
    };
  }
  if (family === "anthropic") {
    if (!isRecord(rawResponse.usage)) return undefined;
    return {
      inputTokens: rawResponse.usage.input_tokens,
      outputTokens: rawResponse.usage.output_tokens,
    };
  }
  if (family === "gemini") {
    if (!isRecord(rawResponse.usageMetadata)) return undefined;
    const inputTokens = rawResponse.usageMetadata.promptTokenCount;
    const totalTokens = rawResponse.usageMetadata.totalTokenCount;
    const candidateTokens = rawResponse.usageMetadata.candidatesTokenCount;
    const outputTokens =
      typeof inputTokens === "number" && typeof totalTokens === "number"
        ? totalTokens - inputTokens
        : candidateTokens;
    return { inputTokens, outputTokens };
  }
  return undefined;
}

function observedModelForFamily(family, rawResponse) {
  const value =
    family === "gemini" ? rawResponse.modelVersion : rawResponse.model;
  return normalizeIdentifier(value);
}

function requestIdForFamily(family, rawResponse) {
  const value = family === "gemini" ? rawResponse.responseId : rawResponse.id;
  return normalizeIdentifier(value);
}

export function validateUsageAndCost(config, evidence, runtimeUsage) {
  if (
    evidence.usage.inputTokens > CANARY_LIMITS.maxInputTokens ||
    evidence.usage.outputTokens > CANARY_LIMITS.maxOutputTokens
  ) {
    throw new CanaryFailure("usage-limit-exceeded");
  }

  const computedCostUsd = computeUsageCostUsd(evidence.usage, {
    inputPer1kUsd: config.inputPricePer1kUsd,
    outputPer1kUsd: config.outputPricePer1kUsd,
  });
  const reportedCostUsd =
    typeof runtimeUsage?.costUsd === "number" &&
    Number.isFinite(runtimeUsage.costUsd) &&
    runtimeUsage.costUsd >= 0
      ? runtimeUsage.costUsd
      : 0;
  const actualCostUsd = Math.max(computedCostUsd, reportedCostUsd);
  if (actualCostUsd > config.maxSpendUsd) {
    throw new CanaryFailure("spend-limit-exceeded");
  }
  return actualCostUsd;
}

export function classifyCanaryFailure(error, timedOut = false) {
  if (timedOut) return "transport-timeout";
  if (error instanceof CanaryFailure) return error.code;
  const message =
    error instanceof Error
      ? error.message
      : isRecord(error) && typeof error.message === "string"
        ? error.message
        : undefined;
  if (message !== undefined && STABLE_CODES.has(message)) {
    return message;
  }
  if (message !== undefined && /provider failed with \d{3}/iu.test(message)) {
    return "provider-http-error";
  }
  if (
    message !== undefined &&
    /returned no candidates|invalid json|unexpected end|unexpected token|json/iu.test(
      message,
    )
  ) {
    return "response-malformed";
  }
  return "transport-failed";
}

export function createSanitizedReport({
  packageVersion,
  commit,
  records,
}) {
  return {
    packageVersion: safeVersion(packageVersion),
    commit: safeCommit(commit),
    limits: { ...CANARY_LIMITS },
    families: CANARY_FAMILIES.map((family) => {
      const record = records.find((candidate) => candidate.family === family);
      return projectFamilyRecord(
        record ?? {
          family,
          status: "failed",
          code: "internal-failure",
          transportCount: 0,
          receiptVerified: false,
        },
      );
    }),
  };
}

export function createLauncherFailureReport({ commit = "unknown" } = {}) {
  return createSanitizedReport({
    packageVersion: "unknown",
    commit,
    records: CANARY_FAMILIES.map((family) => ({
      family,
      status: "not-run",
      code: "launcher-failed",
      transportCount: 0,
      receiptVerified: false,
    })),
  });
}

function projectFamilyRecord(record) {
  const family = CANARY_FAMILIES.includes(record.family)
    ? record.family
    : "openai-compatible";
  const status = ["not-run", "passed", "failed"].includes(record.status)
    ? record.status
    : "failed";
  const code = STABLE_CODES.has(record.code) ? record.code : "internal-failure";
  const projected = {
    family,
    status,
    code,
    transportCount: boundedInteger(record.transportCount, 0, 2),
    receiptVerified: record.receiptVerified === true,
  };
  const configuredModel = normalizeIdentifier(record.configuredModel);
  const observedModel = normalizeIdentifier(record.observedModel);
  const requestId = normalizeIdentifier(record.requestId);
  if (configuredModel !== undefined) projected.configuredModel = configuredModel;
  if (observedModel !== undefined) projected.observedModel = observedModel;
  if (requestId !== undefined) projected.requestId = requestId;

  if (isRecord(record.usage)) {
    projected.usage = {
      inputTokens: boundedInteger(
        record.usage.inputTokens,
        0,
        CANARY_LIMITS.maxInputTokens + 1,
      ),
      outputTokens: boundedInteger(
        record.usage.outputTokens,
        0,
        CANARY_LIMITS.maxOutputTokens + 1,
      ),
      totalTokens: boundedInteger(
        record.usage.totalTokens,
        0,
        CANARY_LIMITS.maxInputTokens + CANARY_LIMITS.maxOutputTokens + 2,
      ),
    };
  }
  if (typeof record.costUsd === "number" && Number.isFinite(record.costUsd)) {
    projected.costUsd = boundedNumber(
      record.costUsd,
      0,
      CANARY_LIMITS.maxSpendUsdPerFamily,
    );
  }
  if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) {
    projected.durationMs = boundedInteger(
      record.durationMs,
      0,
      CANARY_LIMITS.timeoutMs,
    );
  }
  return projected;
}

export function reportExitCode(report) {
  return report.families.some((record) => record.status === "failed") ? 1 : 0;
}

function normalizeIdentifier(value) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    !SAFE_IDENTIFIER_RE.test(normalized) ||
    SECRET_LIKE_IDENTIFIER_RE.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function boundedInteger(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.round(boundedNumber(value, minimum, maximum));
}

function boundedNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeVersion(value) {
  return typeof value === "string" && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/u.test(value)
    ? value
    : "unknown";
}

function safeCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{7,64}$/u.test(value)
    ? value
    : "unknown";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
