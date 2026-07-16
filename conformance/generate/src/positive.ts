import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  EXAMPLE_KID,
  EXAMPLE_PUBLIC_KEY_JWK,
  WARNING_TEXT,
  signBody,
} from "./protocol.js";
import type { StandardConformanceVector } from "./types.js";

export const STANDARD_POSITIVE_FILENAMES = [
  "vec-00-v1.4-unicode-redaction.json",
  "vec-01-v1.4-minimal.json",
  "vec-02-v1.4-lineage-agent.json",
] as const;

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(sourceDir, "..", "..", "..");
const schemaPath = join(repoRoot, "spec", "schema", "v1.4.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<
  string,
  unknown
>;

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validateV14 = ajv.compile(schema);

export function bodyMatchesV14Schema(body: unknown): boolean {
  return validateV14(body);
}

function assertV14Body(body: Record<string, unknown>, name: string): void {
  if (!validateV14(body)) {
    throw new Error(
      `${name} failed spec/schema/v1.4.json: ${JSON.stringify(validateV14.errors)}`,
    );
  }
}

function requiredBody(input: {
  readonly receiptId: string;
  readonly runId: string;
  readonly issuedAt: string;
}): Record<string, unknown> {
  return {
    version: "lattice-receipt/v1.4",
    signatureProfile: "dsse-v1",
    receiptId: input.receiptId,
    runId: input.runId,
    issuedAt: input.issuedAt,
    kid: EXAMPLE_KID,
    model: {
      requested: "example-model",
      observed: null,
    },
    route: {
      providerId: "example-provider",
      capabilityId: "chat",
      attemptNumber: 1,
    },
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null,
    },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: "lattice.default.v1",
    redactions: [],
  };
}

async function buildPositive(
  body: Record<string, unknown>,
  name: string,
): Promise<StandardConformanceVector> {
  assertV14Body(body, name);
  const material = await signBody(body);
  return {
    WARNING: WARNING_TEXT,
    corpusProfile: "standard",
    schema: "spec/schema/v1.4.json",
    expectedSchemaResult: "valid",
    expectedVerificationProfile: "dsse-v1",
    expectedDeprecated: false,
    expectedResult: "ok",
    body,
    canonicalBytesHex: material.canonicalBytesHex,
    payloadBase64: material.payloadBase64,
    paeHex: material.paeHex,
    signatureHex: material.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: EXAMPLE_KID,
  };
}

export async function generatePositiveVectors(): Promise<
  StandardConformanceVector[]
> {
  const unicodeRedactionBody = {
    ...requiredBody({
      receiptId: "00000000-0000-4000-a000-000000000001",
      runId: "standard-unicode-redaction",
      issuedAt: "2026-07-16T00:00:00.000Z",
    }),
    stepName: "分析-step",
    model: {
      requested: "modèle-画像",
      observed: "modèle-画像-2026",
    },
    usage: {
      promptTokens: 100,
      completionTokens: 42,
      costUsd: "0.001250",
    },
    redactions: [
      {
        path: "tripwireEvidence.observed",
        reason: "no-pii-detector-substring-only",
      },
    ],
    tripwireEvidence: {
      invariantId: "standard-redaction-example",
      kind: "no-pii",
      path: "tripwireEvidence.observed",
      observed: "[REDACTED]",
      message: "redacted before canonicalization",
    },
  } satisfies Record<string, unknown>;

  const minimalBody = requiredBody({
    receiptId: "00000000-0000-4000-a000-000000000002",
    runId: "standard-minimal",
    issuedAt: "2026-07-16T00:00:01.000Z",
  });

  const lineageAgentBody = {
    ...requiredBody({
      receiptId: "00000000-0000-4000-a000-000000000003",
      runId: "standard-lineage-agent",
      issuedAt: "2026-07-16T00:00:02.000Z",
    }),
    modelClass: "frontier_rlhf",
    parentReceiptCid: `sha256:${"1".repeat(64)}`,
    lineageMerkleRoot: `sha256:${"2".repeat(64)}`,
    stepName: "child-analyze",
    stepIndex: 2,
    parentStepName: "crew-root",
    previousStepName: "child-collect",
    sessionId: "standard-session-001",
    timestamp: "2026-07-16T00:00:02.500Z",
  } satisfies Record<string, unknown>;

  return Promise.all([
    buildPositive(unicodeRedactionBody, STANDARD_POSITIVE_FILENAMES[0]),
    buildPositive(minimalBody, STANDARD_POSITIVE_FILENAMES[1]),
    buildPositive(lineageAgentBody, STANDARD_POSITIVE_FILENAMES[2]),
  ]);
}
