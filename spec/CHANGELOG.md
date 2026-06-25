# Lattice Receipt Protocol — Changelog

This changelog documents per-version field additions to the Lattice capability-receipt body schema. For full normative specifications, see spec/SPEC.md and spec/schema/.

---

## lattice-receipt/v1.3

Introduced in Phase 39 (receipt chaining / crew receipts) and Phase 46 (artifact lineage provenance). These are additive optional fields.

**Added optional fields:**

- `parentReceiptCid` (optional string): The `sha256:<lowercase-hex>` CID of the parent envelope. Used for receipt chaining in crew (multi-agent) workflows — holds the root receipt's CID, computed as `sha256:<hex>` of the parent envelope's decoded DSSE payload bytes (see `receipts/cid.ts`). Absent on root and non-crew receipts. Pattern: `^sha256:[0-9a-f]{64}$`. See SPEC.md §4.8 and §7.3.

- `lineageMerkleRoot` (optional string): The `sha256:<lowercase-hex>` provenance root for descriptor-only artifact lineage graphs. Commits to artifact lineage without embedding artifact payloads. Absent when no lineage graph is attached to the run. Pattern: `^sha256:[0-9a-f]{64}$`.

Signing and verification behaviour is unchanged. These are additive optional fields. v1.3 receipts verify against the same algorithm as v1.1 and v1.2 receipts.

---

## lattice-receipt/v1.2

Introduced in Phase 38 (model-aware SDK + TrainingClass audit surface).

**Added optional field:**

- `modelClass` (optional string enum): Model training-class audit tag. Populated from the Phase 33 capability registry when runtime issuance has a known selected provider/model. Absent on synthetic, unknown-route, or legacy v1.1 receipts. Accepted values: `"frontier_rlhf"`, `"mid_tier_rlhf"`, `"open_weight_instruct"`, `"open_weight_base"`, `"local_quantized"` (from `TrainingClass` in `packages/lattice/src/capabilities/profile.ts`).

Signing and verification behaviour is unchanged.

---

## lattice-receipt/v1.1

Introduced in Phase 2 (initial receipts implementation: RFC 8785 JCS canonicalization, Ed25519 signing, DSSE envelope, `kid`/`KeySet`, redaction manifest).

**Initial versioned schema.** Introduced:

- Step-marker fields (all optional): identifiers for step-transition receipts emitted during multi-step runs. Step-marker fields are stable identifiers, not user content, and are intentionally excluded from the redaction manifest.
  - `stepName` (optional string): Name of the step emitting this receipt.
  - `stepIndex` (optional integer): Zero-based ordinal index of the step. I-JSON safe integer (maximum `9007199254740991`; MUST be encoded as a bare integer without fraction or exponent).
  - `parentStepName` (optional string): Name of the parent step in a hierarchical step tree.
  - `previousStepName` (optional string): Name of the immediately preceding sibling step.
  - `sessionId` (optional string): Session identifier linking step receipts within the same session.
  - `timestamp` (optional string, format: `date-time`): ISO 8601 / RFC 3339 timestamp at which the step occurred.

- `redactionPolicyId` (string, required): Identifier of the redaction policy applied to the receipt body before signing. Default value: `"lattice.default.v1"` (from `redact.ts` `DEFAULT_REDACTION_POLICY_ID`).

- `redactions[]` (array, required): Per-field redaction manifest. Each entry contains:
  - `path` (string): JCS-addressable path of the redacted field.
  - `reason` (string): Human-readable rationale for redaction (e.g. `"no-pii-detector-substring-only"`).
  Entries are sorted ascending by `path` before canonicalization to ensure deterministic ordering.

---

Note: `lattice-receipt/v1` (the unversioned predecessor) is permanently rejected by the verifier at step 4 of the verification algorithm (downgrade defense CRYPTO-01). It predates the step-marker fields and the `modelClass` audit surface. Receipts carrying `version: "lattice-receipt/v1"` or no `version` field are rejected before any cryptographic work is performed.
