import type {
  CapabilityReceiptBody,
  ReceiptEnvelope,
  ReceiptSignature,
} from "@full-self-browsing/lattice";

import {
  isReceiptLoadError,
  loadReceiptByIdOrPath,
} from "../io/receipt-loader.js";

export interface ReceiptDiffDifference {
  readonly path: string;
  readonly left: unknown;
  readonly right: unknown;
}

export interface ReceiptDiffReport {
  readonly version: "lattice-receipt-diff/v1";
  readonly leftPath: string;
  readonly rightPath: string;
  readonly equal: boolean;
  readonly differences: readonly ReceiptDiffDifference[];
  readonly exitCode: 0 | 1 | 2;
}

export interface ReceiptDiffError {
  readonly kind: "load" | "decode";
  readonly side: "left" | "right";
  readonly path: string;
  readonly message: string;
}

export interface ReceiptDiffOptions {
  readonly left: string;
  readonly right: string;
}

interface ReceiptProjection {
  readonly receipt: {
    readonly version: unknown;
    readonly receiptId: unknown;
    readonly runId: unknown;
    readonly kid: unknown;
    readonly parentReceiptCid: unknown;
    readonly lineageMerkleRoot: unknown;
    readonly issuedAt: unknown;
  };
  readonly model: {
    readonly requested: unknown;
    readonly observed: unknown;
    readonly modelClass: unknown;
  };
  readonly route: {
    readonly providerId: unknown;
    readonly capabilityId: unknown;
    readonly attemptNumber: unknown;
  };
  readonly usage: {
    readonly promptTokens: unknown;
    readonly completionTokens: unknown;
    readonly costUsd: unknown;
  };
  readonly hashes: {
    readonly inputHashes: unknown;
    readonly outputHash: unknown;
  };
  readonly signatures: {
    readonly count: unknown;
    readonly keyids: unknown;
    readonly values: unknown;
  };
  readonly verdict: {
    readonly contractVerdict: unknown;
    readonly contractHash: unknown;
    readonly noRouteReasons: unknown;
    readonly tripwireEvidence: unknown;
  };
  readonly redaction: {
    readonly redactionPolicyId: unknown;
    readonly redactions: unknown;
  };
  readonly step: {
    readonly stepName: unknown;
    readonly stepIndex: unknown;
    readonly parentStepName: unknown;
    readonly previousStepName: unknown;
    readonly sessionId: unknown;
    readonly timestamp: unknown;
  };
}

export function isReceiptDiffError(value: unknown): value is ReceiptDiffError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "load" && v.kind !== "decode") return false;
  if (v.side !== "left" && v.side !== "right") return false;
  return typeof v.path === "string" && typeof v.message === "string";
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null) {
    const v = value as { message?: unknown };
    if (typeof v.message === "string") return v.message;
  }
  return String(value);
}

function diffError(
  kind: ReceiptDiffError["kind"],
  side: ReceiptDiffError["side"],
  path: string,
  message: string,
): ReceiptDiffError {
  return { kind, side, path, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function assertReceiptBody(
  value: unknown,
  side: ReceiptDiffError["side"],
  path: string,
): asserts value is CapabilityReceiptBody {
  if (!isObject(value)) {
    throw diffError(
      "decode",
      side,
      path,
      "Receipt payload must decode to an object.",
    );
  }
  if (typeof value.version !== "string") {
    throw diffError("decode", side, path, "receipt.version must be a string.");
  }
  if (typeof value.receiptId !== "string") {
    throw diffError("decode", side, path, "receipt.receiptId must be a string.");
  }
  if (typeof value.runId !== "string") {
    throw diffError("decode", side, path, "receipt.runId must be a string.");
  }
  if (typeof value.kid !== "string") {
    throw diffError("decode", side, path, "receipt.kid must be a string.");
  }
  if (!isObject(value.model)) {
    throw diffError("decode", side, path, "receipt.model must be an object.");
  }
  if (typeof value.model.requested !== "string") {
    throw diffError("decode", side, path, "receipt.model.requested must be a string.");
  }
  if (!isStringOrNull(value.model.observed)) {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.model.observed must be a string or null.",
    );
  }
  if (!isObject(value.route)) {
    throw diffError("decode", side, path, "receipt.route must be an object.");
  }
  if (typeof value.route.providerId !== "string") {
    throw diffError("decode", side, path, "receipt.route.providerId must be a string.");
  }
  if (typeof value.route.capabilityId !== "string") {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.route.capabilityId must be a string.",
    );
  }
  if (typeof value.route.attemptNumber !== "number") {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.route.attemptNumber must be a number.",
    );
  }
  if (!isObject(value.usage)) {
    throw diffError("decode", side, path, "receipt.usage must be an object.");
  }
  if (typeof value.usage.promptTokens !== "number") {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.usage.promptTokens must be a number.",
    );
  }
  if (typeof value.usage.completionTokens !== "number") {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.usage.completionTokens must be a number.",
    );
  }
  if (!isStringOrNull(value.usage.costUsd)) {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.usage.costUsd must be a string or null.",
    );
  }
  if (!isStringArray(value.inputHashes)) {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.inputHashes must be an array of strings.",
    );
  }
  if (!isStringOrNull(value.outputHash)) {
    throw diffError(
      "decode",
      side,
      path,
      "receipt.outputHash must be a string or null.",
    );
  }
}

function decodePayload(
  envelope: ReceiptEnvelope,
  side: ReceiptDiffError["side"],
  path: string,
): CapabilityReceiptBody {
  let text: string;
  try {
    text = Buffer.from(envelope.payload, "base64").toString("utf8");
  } catch (err) {
    throw diffError("decode", side, path, readErrorMessage(err));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw diffError("decode", side, path, readErrorMessage(err));
  }

  assertReceiptBody(parsed, side, path);
  return parsed as CapabilityReceiptBody;
}

async function loadEnvelope(
  target: string,
  side: ReceiptDiffError["side"],
): Promise<{ readonly envelope: ReceiptEnvelope; readonly path: string }> {
  try {
    const loaded = await loadReceiptByIdOrPath(target);
    return { envelope: loaded.envelope, path: loaded.resolvedPath };
  } catch (err) {
    if (isReceiptLoadError(err)) {
      throw diffError(
        "load",
        side,
        err.resolvedPath,
        `${err.kind}: ${err.message}`,
      );
    }
    throw diffError("load", side, target, readErrorMessage(err));
  }
}

function projectReceipt(
  body: CapabilityReceiptBody,
  envelope: ReceiptEnvelope,
): ReceiptProjection {
  const b = body as unknown as Record<string, unknown>;
  return {
    receipt: {
      version: body.version,
      receiptId: body.receiptId,
      runId: body.runId,
      kid: body.kid,
      parentReceiptCid: body.parentReceiptCid ?? null,
      lineageMerkleRoot: body.lineageMerkleRoot ?? null,
      issuedAt: b.issuedAt ?? null,
    },
    model: {
      requested: body.model?.requested ?? null,
      observed: body.model?.observed ?? null,
      modelClass: b.modelClass ?? null,
    },
    route: {
      providerId: body.route?.providerId ?? null,
      capabilityId: body.route?.capabilityId ?? null,
      attemptNumber: body.route?.attemptNumber ?? null,
    },
    usage: {
      promptTokens: body.usage?.promptTokens ?? null,
      completionTokens: body.usage?.completionTokens ?? null,
      costUsd: body.usage?.costUsd ?? null,
    },
    hashes: {
      inputHashes: body.inputHashes ?? [],
      outputHash: body.outputHash ?? null,
    },
    signatures: {
      count: envelope.signatures.length,
      keyids: envelope.signatures.map((signature: ReceiptSignature) => signature.keyid),
      values: envelope.signatures.map((signature: ReceiptSignature) => signature.sig),
    },
    verdict: {
      contractVerdict: b.contractVerdict ?? null,
      contractHash: b.contractHash ?? null,
      noRouteReasons: b.noRouteReasons ?? null,
      tripwireEvidence: b.tripwireEvidence ?? null,
    },
    redaction: {
      redactionPolicyId: b.redactionPolicyId ?? null,
      redactions: b.redactions ?? null,
    },
    step: {
      stepName: b.stepName ?? null,
      stepIndex: b.stepIndex ?? null,
      parentStepName: b.parentStepName ?? null,
      previousStepName: b.previousStepName ?? null,
      sessionId: b.sessionId ?? null,
      timestamp: b.timestamp ?? null,
    },
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function pushDifference(
  differences: ReceiptDiffDifference[],
  path: string,
  left: unknown,
  right: unknown,
): void {
  if (stableJson(left) === stableJson(right)) return;
  differences.push({ path, left, right });
}

function compareProjection(
  left: ReceiptProjection,
  right: ReceiptProjection,
): readonly ReceiptDiffDifference[] {
  const differences: ReceiptDiffDifference[] = [];

  pushDifference(differences, "receipt.version", left.receipt.version, right.receipt.version);
  pushDifference(differences, "receipt.receiptId", left.receipt.receiptId, right.receipt.receiptId);
  pushDifference(differences, "receipt.runId", left.receipt.runId, right.receipt.runId);
  pushDifference(differences, "receipt.kid", left.receipt.kid, right.receipt.kid);
  pushDifference(
    differences,
    "receipt.parentReceiptCid",
    left.receipt.parentReceiptCid,
    right.receipt.parentReceiptCid,
  );
  pushDifference(
    differences,
    "receipt.lineageMerkleRoot",
    left.receipt.lineageMerkleRoot,
    right.receipt.lineageMerkleRoot,
  );
  pushDifference(differences, "model.requested", left.model.requested, right.model.requested);
  pushDifference(differences, "model.observed", left.model.observed, right.model.observed);
  pushDifference(differences, "route.providerId", left.route.providerId, right.route.providerId);
  pushDifference(
    differences,
    "route.capabilityId",
    left.route.capabilityId,
    right.route.capabilityId,
  );
  pushDifference(
    differences,
    "route.attemptNumber",
    left.route.attemptNumber,
    right.route.attemptNumber,
  );
  pushDifference(
    differences,
    "usage.promptTokens",
    left.usage.promptTokens,
    right.usage.promptTokens,
  );
  pushDifference(
    differences,
    "usage.completionTokens",
    left.usage.completionTokens,
    right.usage.completionTokens,
  );
  pushDifference(differences, "usage.costUsd", left.usage.costUsd, right.usage.costUsd);
  pushDifference(differences, "hashes.inputHashes", left.hashes.inputHashes, right.hashes.inputHashes);
  pushDifference(differences, "hashes.outputHash", left.hashes.outputHash, right.hashes.outputHash);
  pushDifference(differences, "signatures.count", left.signatures.count, right.signatures.count);
  pushDifference(differences, "signatures.keyids", left.signatures.keyids, right.signatures.keyids);
  pushDifference(differences, "signatures.values", left.signatures.values, right.signatures.values);
  pushDifference(differences, "receipt.issuedAt", left.receipt.issuedAt, right.receipt.issuedAt);
  pushDifference(differences, "model.modelClass", left.model.modelClass, right.model.modelClass);
  pushDifference(differences, "verdict.contractVerdict", left.verdict.contractVerdict, right.verdict.contractVerdict);
  pushDifference(differences, "verdict.contractHash", left.verdict.contractHash, right.verdict.contractHash);
  pushDifference(differences, "verdict.noRouteReasons", left.verdict.noRouteReasons, right.verdict.noRouteReasons);
  pushDifference(differences, "verdict.tripwireEvidence", left.verdict.tripwireEvidence, right.verdict.tripwireEvidence);
  pushDifference(differences, "redaction.redactionPolicyId", left.redaction.redactionPolicyId, right.redaction.redactionPolicyId);
  pushDifference(differences, "redaction.redactions", left.redaction.redactions, right.redaction.redactions);
  pushDifference(differences, "step.stepName", left.step.stepName, right.step.stepName);
  pushDifference(differences, "step.stepIndex", left.step.stepIndex, right.step.stepIndex);
  pushDifference(differences, "step.parentStepName", left.step.parentStepName, right.step.parentStepName);
  pushDifference(differences, "step.previousStepName", left.step.previousStepName, right.step.previousStepName);
  pushDifference(differences, "step.sessionId", left.step.sessionId, right.step.sessionId);
  pushDifference(differences, "step.timestamp", left.step.timestamp, right.step.timestamp);

  return differences;
}

export async function diffReceiptFiles(
  options: ReceiptDiffOptions,
): Promise<ReceiptDiffReport> {
  const left = await loadEnvelope(options.left, "left");
  const right = await loadEnvelope(options.right, "right");
  const leftBody = decodePayload(left.envelope, "left", left.path);
  const rightBody = decodePayload(right.envelope, "right", right.path);
  const differences = compareProjection(
    projectReceipt(leftBody, left.envelope),
    projectReceipt(rightBody, right.envelope),
  );

  return {
    version: "lattice-receipt-diff/v1",
    leftPath: left.path,
    rightPath: right.path,
    equal: differences.length === 0,
    differences,
    exitCode: 0,
  };
}
