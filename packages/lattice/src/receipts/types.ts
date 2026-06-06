// Phase 9 receipt type spine. Schema locked in 09-CONTEXT.md — unretrofittable.
//   - CapabilityReceiptBody: RECEIPT-01 schema
//   - ReceiptEnvelope: RECEIPT-03 DSSE shape (no payloadType drift allowed)
//   - ReceiptSigner: RECEIPT-10 — runtime never sees raw private keys
//   - KeySet / KeyEntry / KeyState: RECEIPT-05 rotation surface
//   - VerifyResult / VerifyError: RECEIPT-06 typed failure union
//   - ReceiptUsageCanonical.costUsd is `string | null` (NOT number) — I-JSON
//     compliance per 09-CONTEXT.md "I-JSON only" decision.

import type { TripwireEvidence } from "../contract/tripwire.js";
import type { RouteRejectReason } from "../plan/plan.js";

export type ContractVerdict =
  | "success"
  | "tripwire-violated"
  | "no-contract-match"
  | "execution-failed"
  | "validation-failed";

export interface ReceiptUsageCanonical {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: string | null;
}

export interface ReceiptModel {
  readonly requested: string;
  readonly observed: string | null;
}

export interface ReceiptRoute {
  readonly providerId: string;
  readonly capabilityId: string;
  readonly attemptNumber: number;
}

export interface ReceiptRedaction {
  readonly path: string;
  readonly reason: string;
}

export interface CapabilityReceiptBody {
  readonly version: "lattice-receipt/v1" | "lattice-receipt/v1.1";
  readonly receiptId: string;
  readonly runId: string;
  readonly issuedAt: string;
  readonly kid: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: ReceiptUsageCanonical;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId: string;
  readonly redactions: readonly ReceiptRedaction[];
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
  // Phase 2 v1.1 step-marker fields. All optional; populated by callers when
  // a step-transition emits a receipt. v1 receipts omit these entirely.
  // Step-marker fields are stable identifiers, not user content -- the
  // redaction manifest (redact.ts) intentionally does NOT touch them.
  readonly stepName?: string;
  readonly stepIndex?: number;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
  readonly sessionId?: string;
  readonly timestamp?: string;
}

export interface ReceiptSignature {
  readonly keyid: string;
  readonly sig: string;
}

export interface ReceiptEnvelope {
  readonly payloadType: "application/vnd.lattice.receipt+json";
  readonly payload: string;
  readonly signatures: readonly ReceiptSignature[];
}

export interface ReceiptSigner {
  readonly kid: string;
  sign(bytes: Uint8Array): Promise<Uint8Array>;
  readonly publicKeyJwk: JsonWebKey;
}

export type KeyState = "active" | "retired" | "revoked";

export interface KeyEntry {
  readonly kid: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly state: KeyState;
}

export interface KeySet {
  lookup(kid: string): KeyEntry | undefined;
}

export type VerifyErrorKind =
  | "key-not-found"
  | "key-revoked"
  | "canonicalization-mismatch"
  | "signature-invalid"
  | "envelope-malformed"
  | "version-mismatch"
  | "schema-version-too-low";

export interface VerifyError {
  readonly kind: VerifyErrorKind;
  readonly message: string;
}

export interface VerifyOk {
  readonly ok: true;
  readonly body: CapabilityReceiptBody;
  readonly keyState: KeyState;
}

export interface VerifyFail {
  readonly ok: false;
  readonly error: VerifyError;
}

export type VerifyResult = VerifyOk | VerifyFail;
