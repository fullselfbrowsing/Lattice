import type { TripwireEvidence } from "../contract/tripwire.js";
import type { RouteRejectReason } from "../plan/plan.js";
import type { Usage } from "../providers/provider.js";

import { canonicalizeReceiptBody, usageToCanonical } from "./canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
  encodeEnvelope,
} from "./envelope.js";
import { DEFAULT_REDACTION_POLICY_ID, redactReceiptBody } from "./redact.js";
import type {
  CapabilityReceiptBody,
  ContractVerdict,
  ReceiptEnvelope,
  ReceiptModel,
  ReceiptRoute,
  ReceiptSigner,
} from "./types.js";

/**
 * Public input to createReceipt. Mirrors CapabilityReceiptBody minus:
 *   - `version` (forced to "lattice-receipt/v1")
 *   - `kid` (forced from signer.kid — caller cannot mismatch)
 *   - `redactions[]` (populated by redactReceiptBody)
 *   - `usage.costUsd` (converted to canonical string by usageToCanonical)
 *
 * receiptId and issuedAt default to runtime-generated values when omitted.
 * redactionPolicyId defaults to DEFAULT_REDACTION_POLICY_ID.
 */
export interface CreateReceiptInput {
  readonly runId: string;
  readonly issuedAt?: string;
  readonly receiptId?: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: Usage;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId?: string;
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
  // Phase 2 v1.1 step-marker fields. When ANY of these is provided, the
  // emitted receipt body's `version` is bumped to "lattice-receipt/v1.1";
  // when ALL are absent, the body's `version` stays "lattice-receipt/v1"
  // for backward compatibility with v1 verifiers.
  readonly stepName?: string;
  readonly stepIndex?: number;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
}

/**
 * Build, redact, canonicalize, sign, and envelope a CapabilityReceipt.
 *
 * Ordering INVARIANT (09-CONTEXT.md, PITFALLS.md Pitfall #1):
 *   redact -> canonicalize -> PAE -> sign -> encode
 *
 * The signed digest commits to canonicalize(redact(body)). The function
 * structure makes any other ordering impossible to write by accident —
 * canonicalizeReceiptBody is ONLY called on the output of redactReceiptBody.
 *
 * Defense in depth:
 *   - body.kid is assigned from signer.kid, never from input (input has no
 *     kid field). The signed body and the envelope keyid CANNOT disagree by
 *     construction.
 *   - signer.kid is also written to envelope.signatures[0].keyid, so the
 *     verifier can cross-check (Step 7 of verifyReceipt).
 *
 * I-JSON guarantees: usage.costUsd is converted to string (or null) via
 * usageToCanonical. Receipts NEVER carry raw floats in the canonical form.
 */
export async function createReceipt(
  input: CreateReceiptInput,
  signer: ReceiptSigner,
): Promise<ReceiptEnvelope> {
  const policyId = input.redactionPolicyId ?? DEFAULT_REDACTION_POLICY_ID;
  const receiptId = input.receiptId ?? crypto.randomUUID();
  const issuedAt = input.issuedAt ?? new Date().toISOString();

  // Phase 2 version-bump heuristic: any step-marker field set -> v1.1;
  // otherwise v1 (preserves backward compatibility with Phase 1 callers).
  const hasStepMarker =
    input.stepName !== undefined ||
    input.stepIndex !== undefined ||
    input.parentStepName !== undefined ||
    input.previousStepName !== undefined ||
    input.sessionId !== undefined ||
    input.timestamp !== undefined;
  const version: "lattice-receipt/v1" | "lattice-receipt/v1.1" = hasStepMarker
    ? "lattice-receipt/v1.1"
    : "lattice-receipt/v1";

  // Step 1: assemble the raw body. `kid` comes from the signer — caller
  // cannot mismatch it. `usage.costUsd` is converted to string (I-JSON).
  const body0: CapabilityReceiptBody = {
    version,
    receiptId,
    runId: input.runId,
    issuedAt,
    kid: signer.kid,
    model: input.model,
    route: input.route,
    usage: usageToCanonical(input.usage),
    contractVerdict: input.contractVerdict,
    contractHash: input.contractHash,
    inputHashes: input.inputHashes,
    outputHash: input.outputHash,
    redactionPolicyId: policyId,
    redactions: [],
    ...(input.noRouteReasons !== undefined
      ? { noRouteReasons: input.noRouteReasons }
      : {}),
    ...(input.tripwireEvidence !== undefined
      ? { tripwireEvidence: input.tripwireEvidence }
      : {}),
    // v1.1 step-marker fields (conditional-spread to honor exactOptionalPropertyTypes)
    ...(input.stepName !== undefined ? { stepName: input.stepName } : {}),
    ...(input.stepIndex !== undefined ? { stepIndex: input.stepIndex } : {}),
    ...(input.parentStepName !== undefined ? { parentStepName: input.parentStepName } : {}),
    ...(input.previousStepName !== undefined ? { previousStepName: input.previousStepName } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
  };

  // Step 2: redact BEFORE canonicalize. body now carries the redactions[]
  // manifest declaring what was elided.
  const { body } = redactReceiptBody(body0, policyId);

  // Step 3: canonicalize the redacted body (RFC 8785 JCS).
  const payloadBytes = canonicalizeReceiptBody(body);

  // Step 4: base64-encode for the envelope (DSSE wire format).
  const payload = base64Encode(payloadBytes);

  // Step 5: build PAE — Pre-Authentication Encoding per DSSE v1.0.
  const pae = buildPae(PAYLOAD_TYPE, payload);

  // Step 6: sign the PAE bytes.
  const sig = await signer.sign(pae);

  // Step 7: assemble the envelope. signer.kid duplicated in signatures[]
  // even though it is ALSO inside the signed body (defense in depth).
  return encodeEnvelope({
    payloadBytes,
    signatures: [{ keyid: signer.kid, sig }],
  });
}
