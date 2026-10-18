---
quick_id: 261018-5tt
slug: patch-issue-21-receipt-hardening
status: complete
completed_at: "2026-10-18T13:30:00.000Z"
---

# Patch Issue #21 Receipt Hardening Summary

## Outcome

All ten findings from GitHub issue #21 are fixed in code, covered by tests, and reflected in the paper, security policy, README, and docs. The signed receipt no longer contains tripwire matches, receipts can be bound to an audience, nonce, and validity window, receipt trees can be verified as a whole, signer failures are visible, crew receipts commit to agent output, routing ignores catalog order, the PII scan covers nested values, and `mustCite` has options. Eight commits on this branch, one changeset (minor bump for both packages).

## Changes

Part A, receipts core and CLI (findings 1 to 4):

* `receipts/redact.ts` rewrites `tripwireEvidence.observed` for all four invariant kinds and the `matches` message before signing; manifest entries are written at the moment of each rewrite. Sentinel tests prove no matched value reaches the canonical bytes.
* `receipts/schema-version.ts` holds the ordered version list; receipts mint at `lattice-receipt/v1.4` with optional `audience`, `nonce`, `expiresAt`.
* `verifyReceipt(envelope, keySet, options?)` adds `minVersion`, `expectedAudience`, `expectedNonce`, `now`, `maxAgeMs` and the error kinds `audience-mismatch`, `nonce-mismatch`, `receipt-expired`; binding checks run after the signature.
* `receipts/chain.ts` adds `verifyChain` (tree semantics, order-independent, optional count and root commitments); exported from root and `audit` with `RECEIPT_VERSIONS`.
* CLI: `verify` gains `--min-version`, `--audience`, `--nonce`, `--max-age-ms`; new `receipt verify-chain <dir>`; `receipt diff` projects the new fields.

Part B, runtime, crew, router, tripwire (findings 5 to 9):

* `receipts/hashes.ts` shared by `ai.run`, the crew dispatcher, and `runAgentCrew`; agent completion receipts carry `outputHash`.
* Router drops the catalog index from the score; 24-permutation test; planning fixtures renamed.
* `noPII` walks arrays and plain objects deterministically with a cycle guard and depth cap, reporting the concrete sub-path; `us-phone` accepts dotted, spaced, and `+1` forms; detector header documents scope.
* `inv.mustCite(name, { path?, keys?, caseInsensitive? })` with hash-stable defaults.
* `LatticeConfig.receipts.onSignerError` (`flag` default, `throw` opt-in), `receiptError` on run results, `ReceiptSigningError`, receipts minted before terminal run events, `intent.receipt` binding, dispatcher mint failures recorded on the tracer, OTel `lattice.receipt.error`.

Part C, docs and release (finding 10):

* `paper/main.tex` reworded for redaction, routing, versions, verification, chain, threat model, limitations; counts regenerated to 1,394 tests across 104 files; version 1.6.0; `paper/main.pdf` rebuilt with tectonic (now 9 pages, was 8).
* `SECURITY.md` corrected and extended; README and `docs/` updated; `.changeset/issue-21-receipt-hardening.md` added.

## Verification

* Runtime package: 86 test files, 1217 tests passing. CLI package: 18 files, 177 tests passing.
* `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r test:types`, `pnpm -r lint:packages`, and the four `scripts/check-*.mjs` gates: see `.context/gates.log` (run with stdin from `/dev/null`; nested pnpm script runs stall on this tool shell's socket stdin, which does not affect CI).
* `tectonic paper/main.tex` succeeds; `grep` for the stale paper strings returns nothing.

## Notes

* Behavior changes called out in the changeset: tying route candidates order by provider and model id; `noPII` fires on nested values it previously skipped; `observed.substring` is gone from signed bodies.
* The eval harness numbers in the issue (shuffle rate, precision and recall) could not be reproduced here because the `eval-harness` branch is not pushed; every mechanism they describe was confirmed from source and is now covered by tests.
