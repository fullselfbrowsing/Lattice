import type { TrainingClass } from "../capabilities/profile.js";
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
import { CURRENT_RECEIPT_VERSION } from "./schema-version.js";
import { RFC3339_INSTANT_REQUIREMENT, isRfc3339Instant } from "./timestamp.js";
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
 *   - `version` (forced to CURRENT_RECEIPT_VERSION, currently v1.4)
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
  readonly modelClass?: TrainingClass;
  // Phase 39 (DELEG-06): chain-link to the parent receipt's CID
  // (`sha256:<hex>` of the parent envelope's canonical payload bytes,
  // derived via receipts/cid.ts receiptCid). Omit for root/non-crew receipts.
  readonly parentReceiptCid?: string;
  readonly lineageMerkleRoot?: string;
  // v1.4 freshness and audience binding. Pass `issuedAt` explicitly when you
  // derive `expiresAt` from it so the two agree exactly.
  readonly audience?: string;
  readonly nonce?: string;
  readonly expiresAt?: string;
  // Chain closure. Set `chainClosure` on a tree's root; list every other
  // member's receiptCid in `chainMemberCids` on one closing receipt,
  // sorted and unique (crew runs do this; see verifyChain).
  readonly chainClosure?: "member-cids";
  readonly chainMemberCids?: readonly string[];
  readonly usage: Usage;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId?: string;
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
  // Phase 2 v1.1 step-marker fields. All optional; populated when a step
  // transition emits a receipt. Phase 26 (CRYPTO-01) removed the old
  // version-bump heuristic: every new receipt carries the current version and
  // v1 receipts can no longer pass verifyReceipt (receipt-downgrade defense).
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
 *     verifier can cross-check (Step 9 of verifyReceipt).
 *
 * I-JSON guarantees: usage.costUsd is converted to string (or null) via
 * usageToCanonical. Receipts NEVER carry raw floats in the canonical form.
 */
function assertInstant(field: "issuedAt" | "expiresAt", value: string | undefined): void {
  if (value !== undefined && !isRfc3339Instant(value)) {
    throw new TypeError(
      `createReceipt: ${field} must be ${RFC3339_INSTANT_REQUIREMENT}, got "${value}"`,
    );
  }
}

const RECEIPT_CID_PATTERN = /^sha256:[0-9a-f]{64}$/u;

/**
 * Reject closure fields a verifier would refuse, so a JS caller passing the
 * wrong shape gets a TypeError at issuance instead of a signed receipt that
 * fails every chain check later.
 */
function assertChainClosure(
  chainClosure: unknown,
  chainMemberCids: unknown,
): void {
  if (chainClosure !== undefined && chainClosure !== "member-cids") {
    throw new TypeError(
      `createReceipt: chainClosure must be "member-cids", got ${JSON.stringify(chainClosure) ?? String(chainClosure)}`,
    );
  }
  if (chainMemberCids === undefined) return;
  if (!Array.isArray(chainMemberCids)) {
    throw new TypeError(
      "createReceipt: chainMemberCids must be an array of sha256:<hex> receipt CIDs",
    );
  }
  for (const [index, cid] of chainMemberCids.entries()) {
    if (typeof cid !== "string" || !RECEIPT_CID_PATTERN.test(cid)) {
      throw new TypeError(
        `createReceipt: chainMemberCids[${index}] must be a sha256:<64 lowercase hex> receipt CID, got ${JSON.stringify(cid) ?? String(cid)}`,
      );
    }
    const previous: unknown = chainMemberCids[index - 1];
    if (typeof previous === "string" && previous === cid) {
      throw new TypeError(`createReceipt: chainMemberCids lists ${cid} more than once`);
    }
    if (typeof previous === "string" && previous > cid) {
      throw new TypeError("createReceipt: chainMemberCids must be sorted");
    }
  }
}

export async function createReceipt(
  input: CreateReceiptInput,
  signer: ReceiptSigner,
): Promise<ReceiptEnvelope> {
  const policyId = input.redactionPolicyId ?? DEFAULT_REDACTION_POLICY_ID;
  const receiptId = input.receiptId ?? crypto.randomUUID();
  // Timestamps must name one instant. An offset-less string would be read as
  // local time by verifiers and make the receipt's validity depend on the
  // verifier's timezone, so refuse to issue one (caller error, not a verdict).
  assertInstant("issuedAt", input.issuedAt);
  assertInstant("expiresAt", input.expiresAt);
  assertChainClosure(input.chainClosure, input.chainMemberCids);
  const issuedAt = input.issuedAt ?? new Date().toISOString();

  // Always emit the current schema. Older minted versions (v1.1 to v1.3)
  // remain verifier-compatible; see receipts/schema-version.ts for the list.
  const version: CapabilityReceiptBody["version"] = CURRENT_RECEIPT_VERSION;

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
    ...(input.modelClass !== undefined ? { modelClass: input.modelClass } : {}),
    ...(input.parentReceiptCid !== undefined ? { parentReceiptCid: input.parentReceiptCid } : {}),
    ...(input.lineageMerkleRoot !== undefined ? { lineageMerkleRoot: input.lineageMerkleRoot } : {}),
    // v1.4 binding fields (conditional-spread so absent keys stay out of JCS)
    ...(input.audience !== undefined ? { audience: input.audience } : {}),
    ...(input.nonce !== undefined ? { nonce: input.nonce } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    ...(input.chainClosure !== undefined ? { chainClosure: input.chainClosure } : {}),
    ...(input.chainMemberCids !== undefined
      ? { chainMemberCids: input.chainMemberCids }
      : {}),
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

  // Step 2: redact BEFORE canonicalize. This is the only place the signed
  // copy of tripwire evidence is sanitized; the body now carries the
  // redactions[] manifest declaring exactly what was rewritten.
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
