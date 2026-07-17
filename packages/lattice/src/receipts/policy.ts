import type { AuditError, AuditErrorStage } from "../results/errors.js";

import { createReceipt, type CreateReceiptInput } from "./receipt.js";
import type { ReceiptEnvelope, ReceiptSigner } from "./types.js";

export type ReceiptIssuanceMode = "off" | "best-effort" | "required";

export interface ReceiptPolicyInput {
  readonly mode?: ReceiptIssuanceMode;
  readonly signer?: ReceiptSigner;
}

export interface EffectiveReceiptPolicy {
  readonly mode: ReceiptIssuanceMode;
  readonly signer?: ReceiptSigner;
}

export type ReceiptIssuanceOutcome =
  | {
      readonly status: "issued";
      readonly envelope: ReceiptEnvelope;
    }
  | {
      readonly status: "skipped";
      readonly reason: "disabled" | "signer-unavailable";
    }
  | {
      readonly status: "failed";
      readonly error: AuditError;
    };

export function resolveReceiptPolicy(
  input: ReceiptPolicyInput = {},
): EffectiveReceiptPolicy {
  const mode = input.mode ?? (input.signer === undefined ? "off" : "best-effort");

  return input.signer === undefined
    ? { mode }
    : { mode, signer: input.signer };
}

export function preflightReceiptPolicy(
  policy: EffectiveReceiptPolicy,
): ReceiptIssuanceOutcome | undefined {
  if (policy.mode === "off") {
    return { status: "skipped", reason: "disabled" };
  }

  if (policy.signer === undefined) {
    if (policy.mode === "required") {
      return {
        status: "failed",
        error: auditError("receipt-signer-missing", "pre-execution"),
      };
    }

    return { status: "skipped", reason: "signer-unavailable" };
  }

  return undefined;
}

export async function issueReceipt(
  input: CreateReceiptInput,
  policy: EffectiveReceiptPolicy,
  stage: AuditErrorStage = "post-execution",
): Promise<ReceiptIssuanceOutcome> {
  return issueReceiptFrom(() => input, policy, stage);
}

export async function issueReceiptFrom(
  build: () => CreateReceiptInput | Promise<CreateReceiptInput>,
  policy: EffectiveReceiptPolicy,
  stage: AuditErrorStage = "post-execution",
): Promise<ReceiptIssuanceOutcome> {
  const preflight = preflightReceiptPolicy(policy);
  if (preflight !== undefined) {
    return preflight;
  }

  try {
    return {
      status: "issued",
      envelope: await createReceipt(await build(), policy.signer!),
    };
  } catch {
    return {
      status: "failed",
      error: auditError("receipt-signing-failed", stage),
    };
  }
}

function auditError(
  code: AuditError["code"],
  stage: AuditErrorStage,
): AuditError {
  return {
    kind: "audit",
    code,
    stage,
    message:
      code === "receipt-signer-missing"
        ? "Receipt issuance requires a configured signer."
        : "Receipt signing failed.",
    terminal: true,
  };
}
