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

## Review follow-up (PR #22 inline findings)

A code review of the PR posted five findings; all were confirmed and fixed on the same branch.

* **Signed evidence leaked object keys (P1).** The `noPII` nested walk had put the concrete location, which can contain model-produced object keys, into the signed `path` and `message`. `path` is now always the declared path, the concrete location rides in `observed.foundAt` on the runtime error, and `redactReceiptBody` rebuilds `message` for every invariant kind from the kind, the declared path, and the detector name (manifest reason `tripwire-message-templated`). An end-to-end test plants a sentinel object key and proves it reaches `result.error.message` but not the signed bytes.
* **Crew trees failed `verifyChain` (P1).** The dispatcher stamped child completion receipts with its own `lattice-crew-<uuid>` while the crew root used the crew run id. `CrewDispatchContext.runId` now carries the crew id, `CrewResult.runId` exposes it, and the crew tests call `verifyChain` on real crew output.
* **`verifyChain` could throw (P2).** `verifyReceipt` now rejects payloads that do not round-trip through canonical base64 (`envelope-malformed`), so the lenient envelope decoder and the strict CID decoder agree; `verifyChain` also guards the CID step and returns `link-invalid`.
* **`maxAgeMs: NaN` passed silently (P2).** `maxAgeMs` must be a finite non-negative number or `verifyReceipt` throws a TypeError, matching `now` and `minVersion`.
* **Wrong truncation claim (P2).** README, SECURITY.md, the changeset, the `verifyChain` JSDoc, the CLI comment, and the paper now say dropped leaves are detectable only with `expectedCount` or an external anchor, and that `expectedRootCid` detects a replaced root.

Runtime suite after the follow-up: 86 files, 1227 tests. Paper counts regenerated (1,404 tests across 104 files) and the PDF rebuilt.

## Review follow-up round 2 (redaction module)

* **Shape-mimicking bypass (P1).** `redactObservedShape` passed through any object that looked already redacted, including its numeric `length`, so a raw model value such as `{ valueType: "number", length: 4111111111111111 }` was signed intact. The generic signed shape is now `{ valueType }` only, a closed vocabulary with no free values, and the no-pii branch derives `length` from the re-masked string instead of trusting input.
* **ASCII-only mask (P2).** `maskPiiSubstring` now masks letters, digits, and combining marks in any script (`\p{L}`, `\p{N}`, `\p{M}`), so custom detectors returning non-ASCII matches are masked; ASCII masks are unchanged.
* Tests cover the exact reproductions at the redaction and signed-receipt levels. Runtime suite: 86 files, 1243 tests. Paper counts regenerated (1,420 across 104 files) and PDF rebuilt.

## Review follow-up round 3 (edge cases)

A third review pass posted five low-severity findings; all were confirmed and fixed on the same branch.

* **Locale-sensitive route tiebreak.** `compareCandidates` used `localeCompare`, so `gpt-4I` and `gpt-4i` swapped order between English and Turkish locales and canonically equivalent ids compared equal (falling back to registration order). Identifiers are now compared by UTF-16 code unit. Tests cover a precomposed/decomposed pair and a case-only pair in both registration orders.
* **Non-JSON output reported as a signer failure.** `hashOutputForReceipt` let `JSON.stringify` throw on BigInt or circular values, which `ai.run` reported as `signer-failed` and `runAgentCrew` turned into a rejected crew. The helper now returns `null` for anything without a JSON form, as its JSDoc already promised.
* **Second redaction changed `length` for non-BMP text.** The first pass counted UTF-16 units of the match while the re-redaction pass counted units of the mask, and a supplementary-plane letter masks from two units to one. `length` is now the code-point count of the mask in both branches, so redaction is idempotent for every input.
* **Glued `+1` phone numbers.** `+1415-555-1234` did not match because the area code still required a word boundary after a consumed prefix. The regex now has three explicit entry paths; a bare `1` prefix still needs a separator and E.164 stays out of scope.
* **`noPII` JSDoc.** Now says `path` is the declared path and the concrete location is `observed.foundAt` on the runtime error.

Changeset, paper routing sentence, and paper test counts updated; PDF rebuilt.

## Review follow-up round 4 (throw mode and session turns)

* **Signer throw recorded a completed session turn.** On the success path the session turn was appended before the receipt was minted, so with `receipts.onSignerError: "throw"` and a session store configured, a signer failure rejected `ai.run` after the turn was already stored; a retry on the same session then continued a run the caller was told did not complete. The mint now runs before the session append (a pure reorder; neither step reads the other's output). Tests pin both modes: throw mode leaves the session with zero turns, flag mode appends one turn and returns `receiptError`.

Changeset and SECURITY.md updated; paper counts refreshed and PDF rebuilt.

## Review follow-up round 5 (timezone-dependent freshness, shared references)

* **Freshness depended on the verifier's timezone.** `Date.parse` reads an offset-less date-time as local time and accepts non-ISO text, so a hand-issued `expiresAt` or `issuedAt` could be valid on one machine and expired on another. New `receipts/timestamp.ts` accepts only RFC 3339 instants with an explicit `Z` or numeric offset; `verifyReceipt` uses it for `expiresAt`, `issuedAt` under `maxAgeMs`, and a string `now` (TypeError), and `createReceipt` refuses to issue an offset-less timestamp. `ai.run` already wrote `toISOString()` output and is unaffected.
* **Shared references could hide PII.** The no-pii walk marked an object scanned before its children were visited, so an object first reached at depth 31 (children cut at 32) was skipped when a shallower path reached it later. The visited set is now a map from object to the shallowest depth scanned; an object met strictly shallower is rescanned, bounded to at most 32 rescans per object. Tests cover the exact reproduction, a clean variant, and a 25-level diamond graph that a path-stack guard would walk 2^25 times.

Changeset and SECURITY.md updated; paper counts refreshed and PDF rebuilt.
