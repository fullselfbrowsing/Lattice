---
phase: 26-release-hygiene-docs-receipt-downgrade-defense
reviewed: 2026-06-06T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - packages/lattice/src/receipts/types.ts
  - packages/lattice/src/receipts/verify.ts
  - packages/lattice/src/receipts/receipt.ts
  - packages/lattice/src/receipts/verify.test.ts
  - packages/lattice/src/receipts/receipt.test.ts
  - SECURITY.md
  - CONTRIBUTING.md
  - packages/lattice/CHANGELOG.md
  - packages/lattice-cli/CHANGELOG.md
  - README.md
  - .changeset/v1.3.0-initial.md
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-06-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

CRYPTO-01 is correctly wired: `verifyReceipt` rejects v1 receipts before any cryptographic work, the new `schema-version-too-low` error kind is plumbed through `VerifyErrorKind` without breaking any downstream exhaustive switch (none exists outside test code), and `createReceipt` cannot mint a v1 body. All sites that consume `verifyReceipt` (replay/materialize, lattice-cli verify/repro/eval) read the result via `.ok` / `.error.message` and do not require an exhaustive case for the new kind. No other path bypasses `verifyReceipt` to trust a body directly.

Documentation is solid. SECURITY.md accurately describes the downgrade attack and points readers at the exact file plus error literal that implements the defense. CONTRIBUTING.md is actionable end-to-end. Both CHANGELOG.md files map cleanly onto `.planning/MILESTONES.md` content. The `.changeset/v1.3.0-initial.md` covers all five themes (rename, license/metadata, CI, OIDC, CRYPTO-01) and both packages are correctly marked `minor`. README badges match the D-12 contract (provenance badge is a static placeholder until Phase 28).

Two notable issues:

1. The receipt-downgrade defense's `body.version === undefined` branch is unreachable in practice because `asReceiptBody` at Step 3 rejects bodies whose version is neither v1 nor v1.1 (returns `version-mismatch`). The CRYPTO-01 branch only fires for the literal `"lattice-receipt/v1"`. Security posture is fine (the body is still rejected), but the documented invariant ("reject both undefined and v1") is only half-true at the verifier's external surface, and the `verify.test.ts` "version absent" test acknowledges the ambiguity by accepting either error kind.
2. The `version` local in `receipt.ts` is typed as `"lattice-receipt/v1" | "lattice-receipt/v1.1"` even though only one branch is possible. Minor — but a future refactor could narrow this to `"lattice-receipt/v1.1"` for the symmetry the comment claims.

## Warnings

### WR-01: CRYPTO-01 `body.version === undefined` branch is unreachable (intent-vs-implementation gap)

**File:** `packages/lattice/src/receipts/verify.ts:120`
**Issue:** The intent (per phase context, SECURITY.md, and the verify.ts step-4 comment) is to reject BOTH `body.version === undefined` AND `body.version === "lattice-receipt/v1"` with the `schema-version-too-low` error kind. In practice the `undefined` case is captured by Step 3 (`asReceiptBody` line 42 returns undefined when version is neither v1 nor v1.1, which short-circuits with `version-mismatch`). Only the literal v1 string actually triggers the CRYPTO-01 branch. The `verify.test.ts` "version absent" test (lines 430-483) acknowledges this by accepting either kind:

```ts
expect(
  result.error.kind === "schema-version-too-low" ||
    result.error.kind === "version-mismatch",
).toBe(true);
```

This is not a security bug — the v1-without-version body is still rejected — but it makes the SECURITY.md claim that "the verifier short-circuits with `schema-version-too-low` whenever `body.version` is absent" technically inaccurate at the boundary that callers observe. A reader pattern-matching for the downgrade case will miss undefined-version receipts.

**Fix:** Either widen `asReceiptBody` to accept a body whose version is the v1 literal OR absent (so the CRYPTO-01 branch can be the sole rejection surface for downgrade-shaped bodies), OR document the actual split honestly in `verify.ts` step-4 comment, SECURITY.md, and the v1.1 PR notes. The cleanest fix is the first one — restructure `asReceiptBody` so the version check there only ensures the field is either `string | undefined`, and let Step 4 be the single chokepoint for the version policy:

```ts
function asReceiptBody(value: unknown): CapabilityReceiptBody | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  // Version is checked at Step 4 (CRYPTO-01). Here we only require the field
  // to be a string or absent; an unrecognized literal (e.g. "v9") falls
  // through to Step 4 and is rejected as schema-version-too-low alongside v1
  // and undefined.
  if (v.version !== undefined && typeof v.version !== "string") return undefined;
  // ... rest of the structural checks unchanged
}
```

Then Step 4 becomes:

```ts
if (body.version !== "lattice-receipt/v1.1") {
  return fail(
    "schema-version-too-low",
    `Receipt body.version must be 'lattice-receipt/v1.1' (received ${JSON.stringify(body.version ?? null)}); v1 and pre-v1 receipts are not accepted (CRYPTO-01).`,
  );
}
```

That collapses Step 3's version slice and Step 4 into one branch, makes the test's `||` acceptable-kinds disjunction tighten to a single expected kind, and matches the SECURITY.md narrative verbatim. If you keep the current structure, please update the SECURITY.md sentence "absent or equals `lattice-receipt/v1`" and the verify.ts step-4 comment to acknowledge the `undefined` case is rejected with `version-mismatch`, not `schema-version-too-low`.

### WR-02: `verify.test.ts:220` "version-mismatch when body.version !== 'lattice-receipt/v1'" test title is now stale

**File:** `packages/lattice/src/receipts/verify.test.ts:220`
**Issue:** The describe block from Phase 9 still reads:

```ts
it("returns version-mismatch when body.version !== 'lattice-receipt/v1'", async () => {
```

Post-CRYPTO-01 the contract is "must be v1.1" (v1 is now actively rejected with a different kind). The test body crafts a v2 body and asserts `version-mismatch` — which still passes — but the title misleads anyone scanning the test suite for the live version policy.

**Fix:** Update the title to reflect the post-Phase-26 policy:

```ts
it("returns version-mismatch when body.version is a recognized-shape body but unknown literal (e.g. v9)", async () => {
```

Or more succinctly, "returns version-mismatch when body.version is neither v1 nor v1.1".

## Info

### IN-01: `receipt.ts:90-91` declared union is wider than reachable

**File:** `packages/lattice/src/receipts/receipt.ts:90`
**Issue:** After the Phase 26 collapse the `version` local can only ever hold `"lattice-receipt/v1.1"`, but the declared type still admits both v1 literals:

```ts
const version: "lattice-receipt/v1" | "lattice-receipt/v1.1" =
  "lattice-receipt/v1.1";
```

This is harmless, but a reader could misread it as "this is still a branch" until they get to the comment. Narrowing the local communicates the collapse at the type level.

**Fix:** `const version: "lattice-receipt/v1.1" = "lattice-receipt/v1.1";` — and keep the `CapabilityReceiptBody.version` union member `"lattice-receipt/v1"` in place at the type-system level so verify-side tests can still construct hand-crafted v1 bodies for the CRYPTO-01 regression guard. The union in `types.ts` is the right place for `v1` to live (it's the wire-format historical literal). The local in `receipt.ts` does not need it.

### IN-02: SECURITY.md cross-reference to `verify.ts` does not include a line number or symbol anchor

**File:** `SECURITY.md:71`
**Issue:** The reference "`verifyReceipt` in `packages/lattice/src/receipts/verify.ts` short-circuits with the `schema-version-too-low` error kind whenever `body.version` is absent or equals `lattice-receipt/v1`" points at the file but not the symbol or line. The closing paragraph mitigates this by promising that grepping for the literal string finds all four sites (doc, type, branch, test), which is true. Still, when GitHub renders the file, an inline anchor would be a single click for an auditor.

**Fix:** Either accept the grep-based discoverability (already documented and works) or add an explicit line-stable anchor:

```md
**Defense:** `verifyReceipt` in [`packages/lattice/src/receipts/verify.ts`](packages/lattice/src/receipts/verify.ts) — see Step 4 in the function decision-tree comment — short-circuits with the `schema-version-too-low` error kind...
```

Also note WR-01: the "whenever `body.version` is absent" half of that SECURITY.md sentence is not what the current code actually does (the undefined case fires `version-mismatch`). Either fix the code (WR-01 preferred) or fix the sentence here to match.

### IN-03: README.md Provenance Verification example uses an `npm view` command that emits unverified state pre-Phase-28

**File:** `README.md:290-293`
**Issue:** The snippet:

```bash
npm view @fullselfbrowsing/lattice --json | jq .dist
# then inspect .dist.attestations.provenance
```

is correct AFTER the first OIDC-signed publish lands. Before Phase 28, copying this command into a terminal will print an error (package not on registry yet) which may confuse early stargazers. The surrounding prose does qualify this ("lights up after the first OIDC-signed publish lands"), so this is a soft Info, not a Warning.

**Fix:** Optional — consider gating the snippet behind a heading like "After Phase 28 / v1.3.0 lands on npm" so the example is clearly a future-tense contract rather than something to copy today. Or leave as-is and trust the surrounding qualifier.

### IN-04: `.changeset/v1.3.0-initial.md` claim about CI-02 wording is slightly off compared to SECURITY.md

**File:** `.changeset/v1.3.0-initial.md:23`
**Issue:** The changeset says "TanStack 2026 OIDC compromise" and SECURITY.md (line 77) says "TanStack 2026 OIDC compromise (a maintainer-token theft that pushed malicious code through a tag-pinned action)". Both reference the same incident; the changeset wording is fine but loses the "tag-pinned action" causal link that SECURITY.md makes explicit. Not a correctness issue, just a style consistency note for users who read both.

**Fix:** Optional — append the causal clause to the changeset line so a reader who only sees the changeset still understands why SHA pinning helps:

```md
- Every third-party action is pinned by 40-character commit SHA, not a floating tag, to mitigate the TanStack 2026 OIDC compromise blast radius (a maintainer-token theft that pushed malicious code through a tag-pinned action) (CI-02).
```

---

## Cross-Cutting Checks Performed

The following targeted checks were run and passed:

1. **No code path bypasses `verifyReceipt`.** Searched all of `packages/lattice/src` and `packages/lattice-cli/src` for direct callers of `decodeEnvelope`, `buildPae`, `verifyEd25519Signature`. Every consumer that takes a `ReceiptEnvelope` and treats its body as trusted (replay/materialize.ts, lattice-cli verify/repro/eval) routes through `verifyReceipt` first.
2. **No exhaustive `switch` on `VerifyErrorKind` exists outside tests.** Adding `"schema-version-too-low"` to the union does not break any caller. `replay/materialize.ts` collapses the result to a binary (`envelope-malformed` vs everything-else as `verify-failed`). The CLI stringifies `error.kind` for user output.
3. **No v1 fixtures in tests still expect ok=true.** Every test that hand-crafts a v1 body either asserts a failure (CRYPTO-01 regression test) or has been updated to v1.1 (verify.test.ts line 268, receipt.test.ts:380-394 which now asserts v1.1 even with no step-marker fields per Phase 26's collapse).
4. **Em-dash policy honored in authored prose.** `grep -n "—"` returns zero matches across SECURITY.md, CONTRIBUTING.md, both CHANGELOG.md files, the README additions, and the `.changeset` body. Em-dashes do appear in `verify.ts` / `receipt.ts` / `types.ts` JSDoc comments and one runtime error string — those are pre-existing code style, exempt per the policy, and were not introduced by this phase.
5. **Both changeset packages marked `minor`.** Confirmed line 2-3 of `.changeset/v1.3.0-initial.md`.
6. **CHANGELOG faithfulness.** v1.0, v1.1, and v1.2 entries in `packages/lattice/CHANGELOG.md` cross-check against `.planning/MILESTONES.md` content. No invented features. `packages/lattice-cli/CHANGELOG.md` correctly records v1.0 as a placeholder entry (the CLI did not ship until v1.1) and v1.1's CLI surface (`repro`, `verify`, `eval`, `--init-baseline`, judge cache, depcheck gate) is verifiable against MILESTONES line 47.

---

_Reviewed: 2026-06-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
