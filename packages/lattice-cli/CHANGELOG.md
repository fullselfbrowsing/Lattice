# Changelog

## 1.7.0

### Minor Changes

- 419e21e: Deliver every artifact to the built-in providers and fail on the ones they cannot receive, fix the OpenAI endpoint, bind receipts to the task, policy, and provider requests, tighten the `no-pii` detectors, add opt-in must-cite prose checks, detect truncated crew receipt chains, and return structured verify advisories.

  - Behavior change: the default `no-pii` detectors flag different text than 1.6.0. `us-ssn` still matches every dashed `ddd-dd-dddd`, and now also matches a spaced `ddd dd dddd` or an undashed 9-digit run when an SSN cue (`ssn`, `ss#`, `social security`, `social sec`) is the nearest word before it. `us-phone` still matches the separated forms, and now also matches a plain 10-digit run that is a valid NANP number, does not follow a `.`, and comes after a trunk prefix (`+1` followed by a space, dot, or dash, or `1-`) or a phone cue (`phone`, `tel`, `call`, `mobile`, `cell`, `fax`) as the nearest word. Only punctuation and the words `no`, `number`, `num`, `nbr`, `nr`, `is`, `at`, `on`, `me`, and `us` may sit between a cue and a bare value, so "call me at 4155551234" is flagged and "call Jane at 4155551234" is not. `email` matches exactly as before and scans in linear time.
  - Behavior change: `credit-card` checks every 13-19 digit candidate in the text, not only the first, and also checks the card-shaped part of a run joined to a neighbouring number ("Apt 18 4111 1111 1111 1111", a card followed by its CVV). It skips Luhn-valid runs that start with 0 or 1 (epoch milliseconds, snowflake ids), so UATP cards are not detected, and 13-digit runs that start with 978 or 979 (ISBN-13). No issuer prefix list is applied.
  - Behavior change: `us-ssn`, `us-phone`, and `credit-card` skip a value whose nearest preceding word is an identifier label: `order`, `orders`, `ord`, `invoice`, `inv`, `sku`, `ref`, `po`, `isbn`, `pn`, or `txn`, joined only by whitespace, `:`, `#`, `=`, `no.`, `number`, or `is`. `email` never checks labels, so "Order: alice@example.com" is still flagged. "Order No. 123-45-6789" and "SKU 123-456-7890" are no longer flagged; "Customer SSN 123-45-6789" and "Order 5521, 415-555-0134" still are. A phone with a `+1` or `1` trunk prefix is flagged even right after a label ("SKU +1 415 555 0134"). Cues and labels are read from the 48 characters before a value, cut at the last line break and sentence end. Trade-offs: a real value right after a label is missed; a text listing k long numeric ids is flagged with probability near 1 - 0.9^k; detectors read string values, not keys, so `{ ssn: "123456789" }` is not flagged.
  - `inv.mustCite` keeps the 1.6.0 structured match as its default and adds a fallback: when the top-level `citations` list is missing or does not name the artifact, the top-level `evidence` list and `citations` or `evidence` arrays nested in objects and arrays are searched too. A declared `path` turns the fallback off. The default never reads prose, so it never fails an output that 1.6.0 passed.
  - New opt-in `inv.mustCite` options read the prose. `inline: true` passes on a `[name]` or `(name)` marker, or on one `;`- or `,`-separated part of a group, with an optional `p. 4` or `§3` locator, but only when no located citations list has entries; code spans, fenced code, and link text are ignored. `rejectUncited: true` fails a list entry that names the artifact when the text carries citation markers and none of them cites it. Markers are `[1]`, `[1, 2]`, and `[2-4]` (resolved by an entry's `label`, `marker`, or `id`, else by 1-based position; a number past the end cites another source), author-year brackets such as `[Smith 1999]`, and a bracket equal to a list entry. Links, footnotes, `[x]`, `[sic]`, `[INFO]`, `arr[0]`, dates, timestamps, and code are ignored. `textPath` limits both scans to the strings at one path (wildcards allowed); without it every string in the output is scanned. The options are added to the declaration only when set, so existing contract hashes are unchanged. The check stays syntactic and does not judge whether the artifact supports the claim.
  - Behavior change: `inv.mustCite("")` and a whitespace-only name throw `TypeError`. The signed must-cite evidence `path` is the declared `path` or the reported list's key name (`citations` or `evidence`), never the location of a nested list; that location appears only in the runtime error message.
  - Receipts gain two optional signed fields on `lattice-receipt/v1.4`, with no schema-version bump: `chainClosure: "member-cids"` on a root receipt, and `chainMemberCids`, the sorted, unique CIDs of every other member, on one closing receipt. `verifyChain` fails with `count-mismatch` when a closed chain is missing a member or its closer, has more than one closer, or has a closure declaration on a receipt other than the root. 1.6.x verifiers accept these receipts but ignore the fields, so they do not detect a dropped crew leaf; only verifiers from this release on enforce closure. `verifyReceipt` returns `version-mismatch` for a malformed closure field, which `verifyChain` reports as `link-invalid`.
  - Behavior change: `createReceipt` throws `TypeError` when `chainClosure` is not `"member-cids"`, when `chainClosure` is set together with `parentReceiptCid`, or when `chainMemberCids` is not an array of `sha256:<hex>` CIDs, repeats a CID, or is not sorted.
  - New `VerifyChainOptions.requireClosure` fails a chain that declares no closure. New `VerifyChainOptions.partial` verifies a disclosed subset of a closed chain: the closing receipt must be present and must list every presented receipt, and listed members that were not presented produce a `closure-partial` warning.
  - Behavior change: `runAgentCrew` with a signer returns, in mint order, the crew-start root, a completion receipt for each child run that succeeded, the root agent's completion receipt, and a new crew-close receipt that lists the others. When each of N agents runs once and every child run succeeds, that is N + 2 receipts; a child that never runs or whose run fails gets no completion receipt. Pass `receipts.length` as `expectedCount`. The crew-start receipt sets `chainClosure`, and its `outputHash` commits to the agent id tree (each agent's `id` and its children) instead of `null`; it does not cover intents, tools, or policy. The crew-close receipt signs `execution-failed` when the crew did not succeed. The crew budget verdict is decided when agent work ends, so signing the root completion and crew-close receipts does not count against `maxWallTimeMs`. Signing the crew-start receipt and each child completion receipt happens before that point and does count.
  - Behavior change: `receipts.onSignerError` now applies to every crew receipt minted after crew-start: child completions, the root agent's completion, and crew-close. Under `"flag"` (the default) the crew returns its result with `CrewResult.receiptError`, which lists every failed mint in mint order, and a missing completion receipt leaves a chain that still verifies; a missing crew-close receipt makes the chain fail `verifyChain`. Under `"throw"` the crew rejects with `ReceiptSigningError` at the failed mint. A crew-start mint failure always rejects with `ReceiptSigningError`, since no agent has run.
  - New `receiptVerifyAdvisories(body, options?)` on the root and `audit` entrypoints, and `VerifyChainOk.advisories`, return `{ code, severity, message }` objects (types `VerifyAdvisory`, `VerifyAdvisoryCode`, `VerifyAdvisorySeverity`). Gate on `code` and `severity`, not on the message. `warn` means something was not checked: `audience-unchecked` or `nonce-unchecked` (the receipt carries the binding but the caller did not pass the expectation), `tail-truncation-unchecked`, and `closure-partial`. `info` names an optional check the receipt does not use: `audience-absent`, `nonce-absent`, `expiry-absent`, and `version-below-current`. Audience, nonce, `maxAgeMs`, `minVersion`, and `expectedCount` stay opt-in.
  - CLI: on success, `lattice verify` and `lattice receipt verify-chain` print `WARN <code>: <message>` lines to stderr, and `INFO <code>: <message>` lines unless the new `--quiet` flag is passed. `--quiet` never hides `WARN` lines, and advisories never change the exit code. `lattice receipt verify-chain` gains `--require-closure` and `--partial`, and reports a malformed closure field as `FAIL kind=link-invalid`. `lattice receipt diff` shows `chainClosure` and `chainMemberCids`.

  - Behavior change: built-in adapters now deliver every artifact they accept. In 1.6.0 the Anthropic adapter sent only image artifacts and the Gemini adapter only image, audio, and video artifacts; both skipped every other kind, including text, JSON, document, URL, and tool-result artifacts. The OpenAI, OpenAI-compatible, xAI, OpenRouter, and LM Studio adapters sent an artifact's value only when it was a string, so JSON objects and image bytes never reached the model. Those runs still reported success, and a signed receipt listed the skipped inputs in `inputHashes`. Supported images now go out as native image parts, and JSON values are sent intact. Because the artifacts now reach the provider, expect higher token usage, most of all on Anthropic and Gemini.
  - Behavior change: an artifact that a provider cannot receive faithfully now fails the run with `UnsupportedArtifactTransportError` before any request is sent, instead of being dropped. This covers JSON values that are not plain JSON (`Date`, `undefined`, `NaN`, `Infinity`, `BigInt`, `Map`, `Set`, class instances, functions, symbol keys, and circular references), `artifact.file(...)` on every built-in adapter, binary documents on every built-in adapter, audio and video bytes on adapters other than Gemini, and URL artifacts on providers without the `url` transport. The error's `message`, `reason`, and `path` name the problem, for example `$.createdAt is a Date`. Convert values to plain JSON first, and pass text with `artifact.text(...)` or `artifact.document(text)`. The error is exported from the root and `providers` entrypoints.
  - Behavior change: `createOpenAIProvider` builds its endpoint from `baseUrl` as follows. A bare origin gets `/v1` appended, and a base URL that already has a path, such as `https://api.openai.com/v1` or a gateway prefix like `https://gateway.example/acct/openai`, is used as given. The default is `https://api.openai.com/v1`. From 1.4.0 through 1.6.0 the default posted to `https://api.openai.com/chat/completions`, which OpenAI does not serve, and a `/v1` base made model negotiation request `/v1/v1/models`. `createOpenAICompatibleProvider` builds URLs as before.
  - OpenAI-shaped adapters reject error envelopes returned with HTTP 200, including JSON errors on streaming requests and mid-stream SSE errors, instead of completing empty or partial output successfully.
  - All built-in adapters accept a validated optional `generation: { temperature, maxOutputTokens }`, forwarded from `ai.run`, `ai.runAgent`, and crew intents. Random context IDs remain in plans but are omitted from provider prompts.
  - Optional v1.4 taskHash, policyHash and ordered providerRequestHashes bind original task, normalized policy and exact serialized submission bodies. These fields are additive; legacy receipts remain accepted. New verifier expectations and CLI `--task-hash`, `--policy-hash`, `--request-hashes` reject missing or unequal commitments. Old verifiers do not enforce them. External audit binds only exact rawRequest strings; custom adapters without reporting leave the request list absent.
  - Single-agent success and failure results return terminal receipts with an intent or runtime signer, independent of per-iteration tracing. Existing flag/throw signer failure policy applies. This does not change the crew receipts described above.
  - Built-in PII detectors expose all UTF-16 spans through optional findAll; detect remains first-hit. Opt-in contextual noPII handles compact +1 phone numbers, bounded support/customer cues, and recognized structured field names. Defaults stay unchanged because contextual cues did not improve frozen development or holdout macro-F1. Public-data scoring now separates exact/overlap extraction, type classification and blocking with one-to-one matching and Unicode normalization.

### Patch Changes

- Updated dependencies [419e21e]
  - @full-self-browsing/lattice@1.7.0

## 1.6.0

### Minor Changes

- a636350: Harden capability receipts and fix the findings from issue #21.

  - Signed `tripwireEvidence.observed` is now redacted for every invariant kind before signing. `no-pii` carries `{ detector, length, mask }` (letters, digits, and combining marks in any script masked, separators kept); `must-cite`, `field-from-table`, and `matches` carry `{ valueType }` and nothing else, so no value from the output can mimic redacted evidence; the message is rebuilt for every kind from the invariant kind, the declared path, and the detector name, because the kernel's message can embed model-produced object keys or schema issue text. The signed `path` is always the declared path; for `no-pii` the concrete location lives in `observed.foundAt` on the runtime error only. The manifest reasons are `no-pii-detector-mask-only`, `tripwire-observed-value-elided`, and `tripwire-message-templated`, and each entry is written at the moment of the rewrite. `result.error.evidence` from `ai.run` is unchanged apart from the added `foundAt`. Breaking for consumers that read `observed.substring` from a signed body: switch to `mask`.
  - New receipt schema `lattice-receipt/v1.4` with optional `audience`, `nonce`, and `expiresAt`. `createReceipt` accepts them, `ai.run` accepts `intent.receipt: { audience?, nonce?, ttlMs? }`, and `RECEIPT_VERSIONS` exports the ordered version list.
  - `verifyReceipt(envelope, keySet, options?)` adds `minVersion`, `expectedAudience`, `expectedNonce`, `now`, and `maxAgeMs`, with the new error kinds `audience-mismatch`, `nonce-mismatch`, and `receipt-expired`. Binding checks run after signature verification. `expiresAt`, `issuedAt` (under `maxAgeMs`), and a string `now` must be calendar-valid RFC 3339 instants with an explicit `Z` or numeric offset, parsed field by field rather than by `Date.parse`, so a verdict never depends on the verifier's local timezone and an impossible date such as February 31 is rejected instead of rolled into March; `createReceipt` throws on an `issuedAt` or `expiresAt` that fails the same check. A receipt carrying `expiresAt` is rejected after that instant by every verifier, including replay and eval, so do not set `ttlMs` on receipts you intend to replay later.
  - New `verifyChain(envelopes, keySet, options?)` on the root and `audit` entrypoints verifies a `parentReceiptCid` tree: every link, unique CIDs, one `runId`, exactly one root, parent linkage, and optional `expectedRunId`, `expectedCount`, and `expectedRootCid`. Dropped leaf receipts are only detectable with `expectedCount` or an external anchor; `expectedRootCid` detects a replaced root.
  - `LatticeConfig.receipts.onSignerError` selects what `ai.run` does when a configured signer fails. `"flag"` (default) returns the run with `receiptError: { kind: "signer-failed", message }` and emits a `step.transition` event; `"throw"` emits `run.failed` and rejects with `ReceiptSigningError`. Receipts are minted before the session turn is appended and before each terminal run event, so a `"throw"` rejection leaves no session state behind. The crew dispatcher records child receipt mint failures on the tracer instead of swallowing them.
  - Crew agent completion receipts now carry `outputHash` over the agent's output, computed by the shared `hashOutputForReceipt` helper that `ai.run`, replay, and eval all agree on. An output with no JSON form (a BigInt, a circular structure) hashes to `null` instead of surfacing as a signer failure.
  - Routing no longer adds the catalog position to a candidate's score. Ties resolve on provider and model identifier compared by UTF-16 code unit (not `localeCompare`, whose order depends on the process locale), so the same catalog contents produce the same route and fallback chain in any registration order on any machine. Behavior change for candidates that previously tied and were ordered by registration.
  - `noPII` scans nested objects, arrays, and `[*]` wildcard results deterministically (array order, sorted keys, 32-level cap, and a depth-keyed visited map so a shared reference first met near the cap is rescanned when reached through a shallower path) and reports the concrete sub-path of the offending string as `observed.foundAt` on the runtime error. `us-phone` accepts dotted, spaced, and `+1` or `1` trunk-prefixed forms, including `+1` glued to the area code (`+1415-555-1234`). `us-ssn` stays dashed-only; the detector module documents in-scope formats and the known SKU false positive.
  - `inv.mustCite(name, { path?, keys?, caseInsensitive? })` locates nested citation arrays, compares other object keys, and matches case-insensitively. Defaults reproduce the previous behavior and keep `contractHash` stable.
  - CLI: `lattice verify` gains `--min-version`, `--audience`, `--nonce`, and `--max-age-ms`; new `lattice receipt verify-chain <dir> [--key] [--expect-count] [--run-id] [--root-cid]` prints `OK root=<cid> links=<n>` or `FAIL kind=<kind> reason=<msg>`. Bad flag values exit 2 with `FAIL kind=invalid-argument`. `receipt diff` projects the new `audience`, `nonce`, and `expiresAt` fields.

### Patch Changes

- Updated dependencies [a636350]
  - @full-self-browsing/lattice@1.6.0

## 1.5.1

### Patch Changes

- Updated dependency `@full-self-browsing/lattice` to `1.5.1`.

## 1.5.0

### Patch Changes

- Updated dependency `@full-self-browsing/lattice` to `1.5.0`.

## 1.4.0

### Minor Changes

- 3ab4423: Add agent-run eval gating, receipt structural diffing, and local LM Studio latency diagnostics to the `lattice` CLI.

### Patch Changes

- Updated dependencies [3b152a1]
- Updated dependencies [5f77ec5]
- Updated dependencies [e68d1e5]
- Updated dependencies [25a36bc]
- Updated dependencies [6503486]
- Updated dependencies [9278b77]
- Updated dependencies [25ef841]
  - @full-self-browsing/lattice@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [ca2bcb5]
- Updated dependencies [29474a1]
- Updated dependencies [a1e5f04]
- Updated dependencies [6ce8af3]
- Updated dependencies [5e38c31]
- Updated dependencies [cfc0372]
- Updated dependencies [f0be51f]
  - @full-self-browsing/lattice@1.3.0

All notable changes to `@full-self-browsing/lattice-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- v1.3.0 prepares the first public npm release under the `@full-self-browsing` scope. See `.changeset/v1.3.0-initial.md` for the full release notes.

## [1.2.0] - 2026-05-31

Tracks lattice runtime v1.2. No new CLI subcommands shipped in this release.

### Added

- CLI tracks the v1.2 runtime so `lattice repro`, `lattice verify`, and `lattice eval` consume the v1.1 receipt schema extension and the step-transition tracing literal without API drift.
- Test posture, 144 of 144 lattice-cli tests passing alongside the 589 runtime tests, gating every PR.
- Verified that the v1.1 `replayOffline` path inside `lattice repro` continues to reach `verdict=match` against fixtures produced by a v1.2 runtime emitting `step.transition` and `recovery.*` event kinds.

### Changed

- Bumped the workspace runtime peer to v1.2 so the CLI consumes the receipt v1.1 schema extension (`CapabilityReceiptBody.version` widening) and the new step-transition tracing literal.
- Subcommand registration kept lazy via `citty` so the v1.2 runtime's larger surface does not inflate cold-start cost for `lattice verify`.

### Security

- Continued to gate the runtime SDK against any CLI dependency leakage. Depcheck plus the runtime's `check-cli-deps.mjs` script run in CI on every push.

## [1.1.0] - 2026-05-12

lattice CLI. First public-facing CLI surface.

### Added

- New `packages/lattice-cli` workspace package exposing the `lattice` bin via tsdown shebang detection.
- `citty@0.2.2` lazy subcommand loading so unused subcommands do not pay an import cost at startup.
- `lattice repro <id-or-path>` subcommand running load, verify, materialize, replayOffline, and diff outputHash, with exit codes 0 (match), 1 (signature or structural fail), 2 (replay diverged).
- `lattice verify <path>` subcommand emitting a single-line OK or FAIL result covering signature plus structural verification.
- `lattice eval` subcommand walking `.lattice/receipts/`, replaying each via `replayOffline`, and gating layered determinism in three stages, Exact, then Semantic-cheap no-op, then Semantic-expensive judge with N=3 median.
- `--init-baseline` flag writing a fresh baseline JSON for first-run scaffolding.
- Disk-backed judge cache keyed by `hash(fixtureId, model_fingerprint, judge_prompt, output_canonicalized)`, demonstrably short-circuiting the second invocation.
- Filesystem artifact loader reading `.lattice/fixtures/<sha256>.bin` so showcase fixtures are content-addressed.

### Security

- Redacted-by-default behavior across all subcommands. No `--unsafe-unredacted` flag in v1.1.
- Depcheck gate prevents CLI dependencies from leaking into the runtime SDK package.

## [1.0.0] - 2026-04-22

Pre-CLI placeholder. Aligns the version history with the runtime SDK.

### Added

- Package not published in v1.0. The CLI surface landed in v1.1. This entry exists for completeness so the `@full-self-browsing/lattice-cli` version history aligns with the runtime SDK's `@full-self-browsing/lattice` history.
- Reproducibility in v1.0 was exercised through the `examples/work-inbox` showcase invoked as a Node script. The v1.1 `lattice repro` subcommand later subsumed that script-driven workflow.
