# Deferred Items — Phase 52 Plan 01

Items discovered during execution that are out of scope for this plan
(pre-existing, in files not touched by this plan) and were logged rather
than fixed, per the executor's scope-boundary rule.

## conformance/generate/src/main.test.ts — mtime-ordering test is environment-fragile

**Discovered during:** Task 3, running `pnpm -r test` as the full-workspace evidence
capture step.

**Symptom:** `VEC-06 — MANIFEST.sha256 integrity > MANIFEST.sha256 mtime is later than
most vector files (generator ordering proof)` fails with "12 files are newer than
manifest" instead of the expected "at most 1 file."

**Root cause:** This test (owned entirely by Phase 51, `conformance/generate/`, not
modified by this plan) asserts that `MANIFEST.sha256`'s filesystem mtime is later than
all-but-one of the 12 committed vector files, using this as a proxy for "the generator
wrote the manifest last." That assumption holds for a native `--regen-vectors` run
(files are written sequentially, one process, one filesystem) but does NOT hold in a
git worktree checkout: `git checkout` sets an identical mtime for every file it
materializes (checkout time), so the intentional file/manifest write-ordering signal
from generation time is lost. In this environment, all 12 vector files (plus the
manifest) resolved to `1782939810` before test-suite-internal side effects, i.e. the
underlying "manifest is newest" invariant is filesystem-checkout-order-dependent, not
git-content-dependent — the test conflates content freshness (which IS preserved,
verified by every other manifest/hash-based test passing) with mtime freshness (which
is NOT preserved across a fresh checkout/worktree).

**Why out of scope:** `conformance/generate/src/main.test.ts` is not in this plan's
`files_modified` list (`conformance/verify-ts/package.json`, `tsconfig.json`,
`vitest.config.ts`, `src/manifest.test.ts`, `src/positive.test.ts`,
`src/negative.test.ts`). `git log` / `git diff` confirm zero changes to this file from
any Task 1/2/3 commit — the last commits touching it are Phase 51's own
(`71499fa`, `3f9b84f`, `d055eb7`). This is a pre-existing fragility of a test that
happens to be sensitive to worktree/checkout mechanics, unrelated to Phase 52's harness
work.

**Impact on this plan's success criteria:** None. This is a filesystem-mtime proxy
assertion, not a content-integrity assertion. Every SHA-256-based integrity check
(`conformance/verify-ts/src/manifest.test.ts`'s 12 assertions, `sha256sum --check`
inside the same `main.test.ts` file, both of which passed) independently confirms the
committed vector files and `MANIFEST.sha256` are byte-for-byte consistent — the actual
security property (T-52-01 / VEC-06 tamper-detection) this mtime test was trying to
proxy for is fully proven by content hashing, not filesystem timestamps.

**Recommendation:** Not actioned by this plan. If addressed in a future plan, options
include: (a) skip/relax this specific assertion in CI or worktree contexts, (b) replace
the mtime heuristic with a content-based generation-order proof, or (c) accept it as a
local-dev/native-checkout-only sanity check and mark it `.skip` under
`process.env.CI` or a worktree-detection guard. Left to Phase 51's own maintainers or a
future hardening pass — no action taken here per the scope-boundary rule (fixes are
limited to files this plan's tasks touch).
