// Phase 9 receipt type spine. Schema locked in 09-CONTEXT.md — unretrofittable.
//   - CapabilityReceiptBody: RECEIPT-01 schema
//   - ReceiptEnvelope: RECEIPT-03 DSSE shape (no payloadType drift allowed)
//   - ReceiptSigner: RECEIPT-10 — runtime never sees raw private keys
//   - KeySet / KeyEntry / KeyState: RECEIPT-05 rotation surface
//   - VerifyResult / VerifyError: RECEIPT-06 typed failure union
//   - ReceiptUsageCanonical.costUsd is `string | null` (NOT number) — I-JSON
//     compliance per 09-CONTEXT.md "I-JSON only" decision.

import type { TripwireEvidence } from "../contract/tripwire.js";
import type { TrainingClass } from "../capabilities/profile.js";
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

/**
 * Receipt schema version literals. Ordinal order lives in
 * receipts/schema-version.ts (RECEIPT_VERSIONS); verifiers compare by
 * position there, never by string comparison.
 */
export type ReceiptVersion =
  | "lattice-receipt/v1"
  | "lattice-receipt/v1.1"
  | "lattice-receipt/v1.2"
  | "lattice-receipt/v1.3"
  | "lattice-receipt/v1.4";

export interface CapabilityReceiptBody {
  readonly version: ReceiptVersion;
  readonly receiptId: string;
  readonly runId: string;
  readonly issuedAt: string;
  readonly kid: string;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  // Phase 38 v1.2 model-class tag. Optional for legacy v1.1 receipts and
  // synthetic/unknown routes; populated from the strict Phase 33 registry when
  // runtime issuance has a known selected provider/model.
  readonly modelClass?: TrainingClass;
  // Phase 39 (v1.3) receipt-chain link — additive optional on v1.2, no schema
  // bump. Holds the crew-root receipt's CID: `sha256:<hex>` of the parent
  // envelope's canonical DSSE payload bytes (see receipts/cid.ts). A stable
  // identifier, not user content — redaction-exempt per the step-marker-field
  // rationale above; never put free-form crew names in receipt identifier
  // fields. Absent on root/non-crew receipts.
  readonly parentReceiptCid?: string;
  // Phase 46 v1.3 provenance root. Commits to descriptor-only artifact
  // lineage graphs as `sha256:<hex>` without embedding artifact payloads.
  readonly lineageMerkleRoot?: string;
  // v1.4 freshness and audience binding. All optional and additive; absent
  // keys are omitted from the canonical JSON entirely, so receipts without
  // them canonicalize exactly as before.
  /** Intended relying party. Verifiers pass VerifyOptions.expectedAudience. */
  readonly audience?: string;
  /**
   * Caller-supplied single-use value. Verifiers pass VerifyOptions.expectedNonce.
   * No replay cache ships with the verifier; dedupe on receiptCid() if needed.
   */
  readonly nonce?: string;
  /** ISO 8601 UTC instant after which every verifier rejects the receipt. */
  readonly expiresAt?: string;
  /**
   * When `"member-cids"`, `verifyChain` requires exactly one other receipt
   * whose `chainMemberCids` lists every remaining member. Crew-start
   * receipts set this so a dropped leaf fails closed. Absent on older
   * receipts; those still need `expectedCount`.
   */
  readonly chainClosure?: "member-cids";
  /**
   * CIDs of every other receipt in the tree, sorted. Present only on the
   * closing receipt of a chain that declared `chainClosure`.
   */
  readonly chainMemberCids?: readonly string[];
  readonly usage: ReceiptUsageCanonical;
  readonly contractVerdict: ContractVerdict;
  readonly contractHash: string | null;
  readonly inputHashes: readonly string[];
  readonly outputHash: string | null;
  readonly redactionPolicyId: string;
  readonly redactions: readonly ReceiptRedaction[];
  readonly noRouteReasons?: readonly RouteRejectReason[];
  // Signed copy of the tripwire evidence. `observed` (and, for `matches`,
  // `message`) is rewritten by receipts/redact.ts before signing; see that
  // module for the redacted shapes. The runtime error returned by ai.run
  // keeps the unredacted evidence.
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
  | "schema-version-too-low"
  | "audience-mismatch"
  | "nonce-mismatch"
  | "receipt-expired";

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

/**
 * Optional verifier policy. Every field is opt-in; `verifyReceipt(env, keySet)`
 * with no options behaves as before except that a receipt carrying
 * `expiresAt` is always checked against the clock.
 *
 * Invalid option values (unknown `minVersion`, unparseable `now`) are
 * programmer errors and throw a TypeError. Crafted envelopes never throw.
 */
export interface VerifyOptions {
  /**
   * Lowest accepted schema version. Compared by ordinal; the CRYPTO-01 floor
   * (v1.1) still applies even if a lower value is passed.
   */
  readonly minVersion?: ReceiptVersion;
  /** When set, `body.audience` must equal this. An absent audience fails. */
  readonly expectedAudience?: string;
  /** When set, `body.nonce` must equal this. An absent nonce fails. */
  readonly expectedNonce?: string;
  /** Clock for expiry checks. Defaults to the current time. Pin it in tests. */
  readonly now?: Date | string;
  /** Reject when `issuedAt + maxAgeMs` is before `now`. */
  readonly maxAgeMs?: number;
}

export type VerifyChainErrorKind =
  | "link-invalid"
  | "no-root"
  | "multiple-roots"
  | "orphan-link"
  | "run-id-mismatch"
  | "duplicate-cid"
  | "count-mismatch"
  | "root-mismatch";

export interface VerifyChainError {
  readonly kind: VerifyChainErrorKind;
  readonly message: string;
  /** CID of the offending receipt, when one can be identified. */
  readonly cid?: string;
  /** Underlying verifyReceipt failure when kind is "link-invalid". */
  readonly cause?: VerifyError;
}

export interface VerifyChainOptions extends VerifyOptions {
  /** Every receipt in the chain must carry this runId. */
  readonly expectedRunId?: string;
  /** Out-of-band commitment to the number of receipts. Detects leaf truncation. */
  readonly expectedCount?: number;
  /** Out-of-band commitment to the root receipt's CID. */
  readonly expectedRootCid?: string;
}

export interface VerifyChainOk {
  readonly ok: true;
  readonly rootCid: string;
  readonly count: number;
  /** Edges on the longest root-to-leaf path. A lone root has depth 0. */
  readonly depth: number;
  /** CIDs in input order. */
  readonly cids: readonly string[];
  /**
   * Set when verification succeeded but a stronger check was left to the
   * caller: audience, nonce, expiry, a raised `minVersion`, or
   * `expectedCount` on a chain that does not carry `chainClosure`.
   * Omitted when there is nothing to warn about.
   */
  readonly advisories?: readonly string[];
}

export interface VerifyChainFail {
  readonly ok: false;
  readonly error: VerifyChainError;
}

export type VerifyChainResult = VerifyChainOk | VerifyChainFail;
