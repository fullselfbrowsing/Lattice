---
phase: quick-261111-f94
verified: 2026-11-11T00:00:00Z
status: passed
score: 7/7 must-haves verified
---

# Quick 261111-f94 Verification

**Goal:** Fix OpenAI base URL joining, explain artifact transport errors, correct the 1.7.0 release notes.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bare origin posts to `<origin>/v1/chat/completions` and models at `/v1/models` | VERIFIED | `resolveOpenAIBaseUrl` in adapters.ts is the single base used by `createOpenAIProvider`. Bare origin gets `/v1`, and the default is `https://api.openai.com/v1`. request-delivery tests pass. |
| 2 | Path-prefixed base used as given (execute, stream, models) | VERIFIED | The resolver keeps any non-root path as given, and keeps a `/v1` suffix and strips trailing slashes. Unparseable input falls back to the stripped string. Tests pass. |
| 3 | `createOpenAICompatibleProvider` unchanged | VERIFIED | The diff to adapters.ts does not touch the compatible URL code. A new test covers it. |
| 4 | Strict JSON delivery unchanged | VERIFIED | See the comparison below. |
| 5 | Error carries `reason` and `path`; Date reports `$.createdAt is a Date` | VERIFIED | The constructor in multimodal.ts sets both only when defined. `prototypeDescription` returns "a Date". The multimodal tests pass, and the type test passes. |
| 6 | `ai.run` with a bad JSON artifact returns ok=false with the detail and zero fetches | VERIFIED | The run-level test is in the suites that pass. `artifactText` throws before any request is built. |
| 7 | Changeset, README, JSDoc contain the verbatim text | VERIFIED | See below. |

## Behavior preservation (old `isJsonValue` at be1a4a0 vs new `findJsonProblem`)
Compared by reading both.
- Primitives are the same: null, string and boolean pass, and only finite numbers pass.
- undefined, function, symbol and bigint fail in both. The old code failed them through the `typeof !== "object"` branch.
- Arrays: the old code used `Array.from`, so holes became undefined and failed. The new code scans indices `0..length-1` and fails on the same holes. Extra own properties on arrays are ignored in both.
- Objects: the old code used `Object.values`, the new code uses `Object.keys` plus a property read. Both cover enumerable own string keys.
- A throwing getter or proxy trap threw inside the old try and was rethrown as the transport error. The new code wraps the scan in a try (generic reason) and also catches getter errors (specific reason).
- Prototype rule is the same: only `Object.prototype`, null, or arrays pass.
- Own symbol keys fail in both.
- Cycles: both use an ancestor set with delete on exit, so shared non-circular references pass.
- Deep recursion: the old catch-all converted a RangeError into the transport error, and the new code does the same.
- The new binary pre-check (Blob, ArrayBuffer, views) only reclassifies values the old code also rejected, because their prototype is not Object.prototype.
- Transport pre-checks are the same. A url transport with no URL rejected in the old code because `isJsonValue(undefined)` is false, and it still rejects with a new reason.
- Image branch in adapters.ts: every old `url === undefined` path still throws. The reasons are now split per case.

The accepted set is unchanged. I did not run an executable differential fuzz of the old and new functions.

## Verbatim text
- The changeset line-6 summary and the five bullets match the plan, and the old "OpenAI-shaped adapters deliver supported images" bullet is gone. The "Crew receipt counts stay unchanged" sentence is replaced by "This does not change the crew receipts described above."
- README lines 40 and 42 match the plan paragraphs exactly.
- config.ts `onSignerError` JSDoc has the new opening and the final sentence ("does not read this setting" is gone).

## Commands run (each with `< /dev/null`)
| Command | Result |
|---------|--------|
| vitest multimodal, request-delivery and adapters tests | 3 files, 224 tests passed |
| lattice typecheck | exit 0 |
| lattice build, then test:types | exit 0; 113 files, 2038 tests, no type errors |
| lattice test | 93 files, 1834 tests passed |
| lattice-cli test | 19 files, 196 tests passed |

## Anti-patterns
- No TBD, FIXME or XXX markers were added.
- multimodal.ts has no task, phase or PR references in comments.
- The "Phase 34" doc comment in adapters.ts predates this task.
- The working tree is clean apart from the untracked task directory.

## Gaps
None.
