---
quick_id: 261018-5tt
slug: patch-issue-21-receipt-hardening
status: complete
---

# Patch Issue #21 Receipt Hardening

## Goal

Fix all ten findings from GitHub issue #21 (eval harness report against Lattice 1.5.1 at `5bd9a42`) so the receipt subsystem matches the paper's claims, then update the paper, docs, and security policy to match the code. Detailed design: `/Users/lakshman/.claude/plans/go-for-patches-moonlit-wilkinson.md` (approved).

## Implementation

Part A, receipts core (findings 1 to 4):

* Add `receipts/schema-version.ts` with the ordered version list and `lattice-receipt/v1.4` as current.
* Redact `tripwireEvidence.observed` for all four invariant kinds inside `redactReceiptBody` (no-pii becomes detector, length, mask; others become value type and length; `matches` message replaced) so the manifest is truthful by construction.
* Add optional `audience`, `nonce`, `expiresAt` to the receipt body and `CreateReceiptInput`; mint v1.4; accept v1.1 to v1.4.
* `verifyReceipt(envelope, keySet, options?)` with `minVersion`, `expectedAudience`, `expectedNonce`, `now`, `maxAgeMs`; new error kinds `audience-mismatch`, `nonce-mismatch`, `receipt-expired`; freshness checks after signature verification.
* `ai.run` accepts `intent.receipt: { audience?, nonce?, ttlMs? }`.
* New `verifyChain` (tree semantics) in core and `audit` entrypoints; CLI `receipt verify-chain`; `verify` gains `--min-version`, `--audience`, `--nonce`, `--max-age-ms`.

Part B, runtime, crew, router, tripwire (findings 5 to 9):

* Shared `receipts/hashes.ts`; crew agent completion receipts carry `outputHash`.
* Router drops the catalog index from the score; ties break on provider and model id; permutation test.
* `noPII` walks nested objects, arrays, and wildcard paths deterministically; phone detector accepts dotted, spaced, and `+1` forms.
* `inv.mustCite(name, { path?, keys?, caseInsensitive? })`.
* `LatticeConfig.receipts.onSignerError` (`flag` default, `throw` opt-in); `receiptError` on run results; `ReceiptSigningError`; receipt minted before terminal run events.

Part C, docs and release (finding 10 and wording):

* SECURITY.md, paper/main.tex, README, docs updates; regenerate test counts; rebuild `paper/main.pdf` with tectonic; changeset (minor, both packages).

## Verification

* `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types`
* `pnpm -r lint:packages` plus the four `scripts/check-*.mjs` gates from `.github/workflows/ci.yml`
* Signed-bytes test: no tripwire sentinel appears in any minted receipt payload
* `grep -n "1,248\|1,086\|seven error kinds\|Three versions\|catalog index" paper/main.tex` returns nothing
* `tectonic paper/main.tex` succeeds
