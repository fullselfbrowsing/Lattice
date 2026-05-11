# Pitfalls Research

**Domain:** TypeScript capability runtime SDK — adding signed Capability Receipts, contracts, tripwire invariants, repro CLI, and eval CI to an existing replay/redaction/artifact-fingerprint runtime (Lattice v1.1).
**Researched:** 2026-05-11
**Confidence:** HIGH for receipts/signing, repro, and CLI (well-documented territory); MEDIUM for tripwire DSL and eval CI (newer practice, vendor blogs over RFCs).

> Scope guardrail: every pitfall below is specific to ADDING these features to Lattice's existing surface (Phase 5 replay envelopes, default redaction, structured events; Phase 2 artifact fingerprints; Phase 3 deterministic plan JSON; Phase 4 context packs/provider packaging). Generic crypto/CLI lore is excluded.

---

## Critical Pitfalls

### Pitfall 1: Signing before redaction (a.k.a. "the receipt that doxxes the user")

**What goes wrong:**
The receipt signer captures the canonical input/output payload, signs it, and only then runs the redactor on the stored copy. The signed digest now binds the cleartext PII version — anyone with the public key can prove a redacted-looking field was originally an SSN, and the redactor on the stored copy invalidates the signature.

**Why it happens:**
Lattice already has a redactor on the replay envelope (Phase 5). The intuitive ordering is "snapshot run → sign for integrity → redact for distribution". This is wrong for an attestation: the signature must commit to the redacted form, with a separate "redaction manifest" inside the signed payload describing which fields were redacted and by what rule. Otherwise the receipt cannot be shared without either leaking the unredacted blob or producing an unverifiable doc.

**How to avoid:**
- Define the canonical signing input as `redact(canonicalize(run))`, never `canonicalize(redact(run))` after the fact.
- Inside the signed payload, include a `redactions[]` array: `{ pointer, rule, hash_of_unredacted }`. The hash binds the original without exposing it and lets a holder of the original prove inclusion if needed (selective disclosure).
- Make the receipt builder a pure function from the redacted replay envelope + plan + run-events; refuse to accept raw artifacts. Architecturally, the signer must depend on the redacted-envelope module, not on the runtime store.

**Warning signs:**
- Tests that sign synthetic PII fixtures and never re-verify after the redactor runs.
- A `signRun(envelope, options)` API that accepts an `applyRedaction: boolean` flag — that flag is a code smell, the order must not be a parameter.
- Code paths where `receipt.payload` and `envelope.redacted` come from different snapshots of the run.

**Phase to address:** Receipts phase (must be locked in the phase that introduces `Receipt` type). Cannot be deferred — once a single unredacted receipt is signed and stored, the bug is permanent for that record.

---

### Pitfall 2: JCS / canonicalization drift across Node versions and platforms

**What goes wrong:**
Two engineers run `lattice repro <id>` on the same receipt; one verifies, one fails. Root cause: the receipt was signed using `JSON.stringify` (or a naive sort-keys library), and Node 22 vs Node 25 serialize the same float differently. V8 25 switched from Grisu3 to Dragonbox; a value like `1e+23` or `0.1 + 0.2` can round-trip to a different shortest string. The signature now refuses to verify on a different runtime.

**Why it happens:**
Two cooperating bugs:
1. Devs reach for `JSON.stringify` because it ships with Node. ECMA-262 does not guarantee deterministic property order or stable float→string conversion across engines.
2. JCS (RFC 8785) appears to delegate to ECMAScript number serialization, but in practice every conformant implementation must implement Ryu or Dragonbox itself and pin the algorithm — not call the host engine. Most npm JCS libraries (`json-canonicalize`, `canonicalize`) have edge-case bugs around `1e+23`, very small numbers, and negative zero.

**How to avoid:**
- Adopt RFC 8785 (JCS) as the on-the-wire canonical form. Pin to a JCS library with explicit Ryu-based number serialization, and add fixture tests with the RFC's appendix test vectors (`1e+30`, `0`, `-0`, `333333333.33333329`, etc.).
- Constrain the receipt schema to I-JSON: no floats in cost/latency/score fields — encode as strings with fixed precision (e.g. `cost.usd: "0.001234"`) or as integer "micro" units. Floats are a determinism trap, not a feature.
- Cross-version CI matrix: Node 22 LTS + Node 24 + Node 25 + Bun + Deno, all sign the same fixture and all must produce the same digest.
- Reject `JSON.stringify` in the signing path via a custom lint rule (banned imports / `no-restricted-globals`).

**Warning signs:**
- A signing test that imports `JSON.stringify` anywhere in its call chain.
- The codebase has both `canonicalize` and `JSON.stringify` paths that "should be equivalent."
- Receipts contain raw floats for `usd`, `latencyMs`, `qualityScore`.
- CI runs on one Node version only.

**Phase to address:** Receipts phase (canonicalization is foundational; the contract for what's signed must be frozen before any receipts ship).

---

### Pitfall 3: Ed25519 key rotation without `kid` and verification fork

**What goes wrong:**
v1.1 ships with one signing key embedded in config. Six months later a developer accidentally commits the key, or wants to rotate keys per environment. Existing receipts in production can no longer be verified because the verifier only knows the new key, and there is no way to ask the receipt "which key signed you?" There is also no mechanism to mark the old key as compromised vs. retired.

**Why it happens:**
Single-key designs are the path of least resistance for v1. Rotation is treated as an "ops problem for later." But once a receipt is stored and used for regression CI, the verifier needs to honor historical keys forever.

**How to avoid:**
- From day one, include a `kid` (key id) field in the signed payload and in a separate unsigned header. The verifier must look up the key by `kid`, not assume a single key.
- Ship a `KeySet` interface (similar to JWKS) — a function that returns the verification key for a given `kid`. Default implementation is a static map; users can plug in a fetcher.
- Separate signing key from verification keys. The repro CLI only needs to verify; it should never see a signing key.
- Distinguish three key states in the `KeySet`: `active` (sign + verify), `retired` (verify only), `revoked` (refuse to verify, surface a typed error). Without `revoked`, a leaked key remains trusted forever.
- Document non-extractable key storage paths (libsodium / `node:crypto` with `KeyObject`) and forbid logging the `secretKey` field.

**Warning signs:**
- `signRun(run, privateKey)` accepts a raw `Uint8Array`/hex string — invites accidental logging and disk persistence.
- `verifyReceipt(receipt, publicKey)` takes a single public key parameter; no key set, no `kid`.
- No documented procedure for "rotate the signing key" in the milestone exit notes.

**Phase to address:** Receipts phase. Key id and key-set abstraction are cheap to introduce up front and architecturally hard to retrofit after receipts are in the wild.

---

### Pitfall 4: Tripwire DSL aborts mid-stream and burns budget on retries

**What goes wrong:**
A tripwire fires on token #80 of a streaming completion ("policy violation: contains medical advice"). The runtime aborts the stream, surfaces a typed error, and a wrapping retry loop (the user's, or Lattice's own fallback chain from Phase 3) immediately calls the provider again — costing the full prompt + 80 tokens of output discarded. Three retries later the user has burned 4× the budget and the contract's `budget.maxUSD` is silently exceeded because cost-on-abort was never accounted for.

**Why it happens:**
Three orthogonal mistakes compound:
1. Aborted streams aren't billed at zero; providers still bill for the in-flight tokens, but SDK token-counters often only commit at stream end.
2. Tripwire violations look like transient errors to a generic retry loop. Without a `terminal: true` flag on the typed error, Lattice's existing Phase 3 fallback chain treats them as "try the next provider."
3. The contract budget is checked pre-flight, but the post-flight reconciliation lives in a different module and doesn't see partial-stream costs.

**How to avoid:**
- Define tripwire violations as `terminal` outcomes in the typed result union — distinct from `transient`/`fallbackable`. Phase 3's fallback chain must read the `terminal` flag and refuse to retry.
- Account for partial-stream tokens by attaching a token-counter to the stream consumer, not just to the completion response. On abort, commit the partial count to the contract budget.
- Make the contract budget the source of truth: the runtime checks `cumulativeCost + estimatedNextCost <= maxUSD` before *every* retry, including fallback. Receipts must record `costAtAbort` separately from `costAtSuccess`.

**Warning signs:**
- A tripwire test that aborts mid-stream and a retry test that "happens to retry" in the same code path.
- Token usage in the receipt is reported as 0 for aborted runs.
- The error class hierarchy has `InvariantViolation` but no `terminal: true` discriminator.

**Phase to address:** Tripwire phase (must define the terminal/non-retryable contract); verified again in the receipts phase (cost accounting), and stress-tested in the eval CI phase.

---

### Pitfall 5: Tripwire DSL produces over-aborts and false positives that erode trust

**What goes wrong:**
The semantic invariant "must not produce financial advice" matches "you should consult a financial advisor" and aborts 30% of legitimate runs. Devs disable invariants entirely, and Lattice becomes a system with a security feature nobody uses.

**Why it happens:**
- Invariant DSLs that mix syntactic checks (regex, JSON-schema) with semantic checks (LLM-judge, embedding similarity) without distinguishing precision tiers. Devs write a "policy" and get an LLM-judge call by default — high false-positive rate.
- No "shadow mode" where invariants log without aborting during initial rollout.
- No per-tenant precision/recall feedback loop — once shipped, the rule is invisible.

**How to avoid:**
- Make the DSL layered: deterministic predicates (string/regex/JSON-pointer/schema) are the primary primitive; LLM-judge predicates require explicit opt-in and a confidence threshold.
- Ship a `mode: 'shadow' | 'enforce'` per invariant. Shadow mode records violations to receipts (so eval CI can grade them) but does not abort. Default new invariants to shadow for the first N runs.
- Include rule provenance in the receipt: `{ invariantId, version, mode, verdict, evidence }` so a flaky invariant can be diff'd against last week's behavior in `lattice eval`.
- Document and test the false-positive workflow: a developer should be able to add a fixture, mark it "should not have aborted," and have eval CI fail until the invariant is fixed.

**Warning signs:**
- The invariant DSL has one verb (`abort`) and no `warn`/`shadow`.
- Invariants don't carry version numbers, so a rule change cannot be attributed in the receipt history.
- No fixtures exercise the "false positive" path.

**Phase to address:** Tripwire phase (DSL design); validated in eval-CI phase (shadow→enforce promotion based on fixture grading).

---

### Pitfall 6: Streaming evaluation cost blows past the latency budget

**What goes wrong:**
Each tripwire evaluates against the token buffer on every chunk. An LLM-judge invariant fires a sub-call every 50 tokens. A 2,000-token completion ends up making 40 judge calls — turning a 3-second streaming run into an 18-second run that violates the contract's latency budget.

**Why it happens:**
The natural implementation evaluates predicates on the streaming buffer "as soon as possible." But semantic predicates have non-trivial cost; running them on every chunk is quadratic in the worst case.

**How to avoid:**
- Distinguish *streaming-cheap* predicates (regex, max-length, banned-substring — O(delta) per chunk) from *streaming-expensive* predicates (judge calls, embeddings) and gate the expensive ones behind explicit windows (`evaluateEvery: { tokens: 200 }` or `evaluateAt: 'end' | 'stream-boundary'`).
- Default expensive predicates to `evaluateAt: 'end'` and require opt-in for mid-stream.
- Include the predicate's own latency contribution in the receipt so `lattice eval` can flag predicate-induced regressions.

**Warning signs:**
- The DSL has no syntactic distinction between cheap and expensive predicates.
- Latency numbers in receipts don't separate model-latency from invariant-latency.

**Phase to address:** Tripwire phase (DSL semantics); enforced in eval-CI phase (latency gates must split the two).

---

### Pitfall 7: `lattice repro` leaks PII via the replay envelope it ships

**What goes wrong:**
A developer hits a thumbs-down on a prod run, runs `lattice repro <id>`, and the CLI downloads the replay envelope to `~/.lattice/repros/abc.json`. The envelope contains the original user message (with the user's email and phone). Now PII is on a developer laptop, outside production controls.

**Why it happens:**
Repro is "deterministic" by definition, which engineers read as "must use the exact original inputs." But determinism is about hashing equality, not about retaining cleartext. Phase 5's existing redaction was designed for *logs* and may not be applied to the *repro envelope* because reproducibility tests expect raw values.

**How to avoid:**
- The envelope shipped to `lattice repro` must be the same redacted form bound to the receipt's signature. Cleartext should never leave the prod boundary.
- For fields that *must* be replayed verbatim (e.g., a tool call that includes an order number), use a structured `placeholder` system: the receipt declares `inputs.userMessage = "<<redacted:USER_MESSAGE:sha256:abc>>"`, and `lattice repro` either (a) accepts a developer-provided override from a local fixture, or (b) refuses to run and tells the user which placeholder needs filling.
- Add a `--unsafe-unredacted` flag that requires explicit confirmation, only works against test-environment receipts, and is logged to telemetry. Default behavior is redacted-only.
- The local store for repros must inherit the same redaction rules as the prod replay store. Define one redactor, use it everywhere.

**Warning signs:**
- `lattice repro` works end-to-end against a prod receipt without any developer-side configuration — that means cleartext flowed through.
- Test fixtures and prod receipts use different envelope schemas.
- The CLI prints user content to stdout without a `--reveal` flag.

**Phase to address:** Repro CLI phase (must integrate with the redaction system from receipts phase). The redaction guarantee must be receipt-level (Pitfall 1), not CLI-level — otherwise a future tool will leak it differently.

---

### Pitfall 8: Receipts pin the model name, not the model fingerprint

**What goes wrong:**
A run is signed against `gpt-4o-2024-08-06`. Six months later, that alias quietly maps to a new build with different behavior; the system_fingerprint changed but the model id string is identical. `lattice repro` claims success, but the output diverges from the original. CI continues to pass against the new behavior, masking the regression.

**Why it happens:**
- OpenAI/Anthropic/Google all expose model "snapshots" with stable ids that nonetheless update under the hood. The only definitive identifier is the provider's per-response fingerprint (e.g., OpenAI's `system_fingerprint`, Anthropic's `model` field with build suffix).
- Lattice's Phase 3 plan JSON records the model name as the routing decision; the model fingerprint is a *response* property, not a *plan* property — easy to forget to include in the receipt.

**How to avoid:**
- Receipts record both: `model.requested: "gpt-4o-2024-08-06"` (what the plan asked for) and `model.observed: { id, fingerprint, provider, snapshot }` (what the provider returned). Both go inside the signed payload.
- `lattice repro` verifies the observed fingerprint matches when replaying live; if it doesn't, surface a typed `EnvironmentDrift` warning (don't fail silently).
- `lattice eval` treats fingerprint changes as a first-class regression dimension — the CI can be configured to fail or to merely flag.

**Warning signs:**
- The receipt schema has `model: string` instead of a structured field.
- Provider adapters don't surface the fingerprint to the receipt builder.
- Live-replay (Phase 5 mode) doesn't compare fingerprints.

**Phase to address:** Receipts phase (schema decision); validated in repro-CLI phase (drift detection); enforced in eval-CI phase (regression dimension).

---

### Pitfall 9: Eval CI is flaky and gets disabled within two sprints

**What goes wrong:**
The `lattice eval` step in CI fails intermittently. After 5–10 flakes, a developer adds `continue-on-error: true` or comments the step out. The regression gate is now decorative.

**Why it happens:**
LLM-judge evaluations on identical inputs vary by 0.05–0.15 in score (industry-reported variance for GPT-4-class judges). A single-run pass/fail threshold *must* fail intermittently. Setting `temperature: 0` reduces but does not eliminate variance — provider-side load balancing and silent updates still cause drift.

**How to avoid:**
- For judge-based metrics, score each fixture N=3 (or N=5) times and take the median. Configure per-metric variance tolerance, not a single threshold.
- Layer the gates by determinism class:
  - **Deterministic checks** (output shape, receipt verification, redaction completeness, plan JSON stable, fingerprint match) — run on every push, hard fail.
  - **Semantic-cheap checks** (cosine similarity to golden output, token count budgets, p95 latency) — run on every PR, hard fail with tolerance band.
  - **Semantic-expensive checks** (LLM-as-judge on quality) — run on merge to main, hard fail only on regression (delta vs baseline) not absolute threshold.
- Compare against a stored baseline (last green main), not an absolute number. "Did quality drop by >X compared to baseline?" is a stable question; "Is quality >0.85?" is not.
- Cache judge outputs by fixture+model-fingerprint hash — re-running on unchanged inputs should be free.

**Warning signs:**
- A single `lattice eval` invocation makes one pass/fail decision based on absolute thresholds.
- No N>1 retry on judge calls.
- The CI matrix doesn't pin model snapshots.

**Phase to address:** Eval-CI phase. Variance handling is the headline feature, not an optimization — design the layering before writing the first gate.

---

### Pitfall 10: Cost gates use mean instead of p95 (or vice-versa)

**What goes wrong:**
The cost gate fires on mean cost-per-task. A long-tail of 5% of fixtures hit the fallback chain and cost 10× the typical run; the mean creeps up; CI fails for a "regression" that's actually correct behavior on hard fixtures. Inverse: the gate uses p95 only, and a 30% mean-cost increase from a routing bug slips under the gate because p95 was always dominated by the long tail.

**Why it happens:**
Cost distributions for LLM workloads are bimodal (cache hit vs. miss, fast path vs. fallback). Single-statistic gates miss one mode.

**How to avoid:**
- Report and gate on multiple statistics in `lattice eval`: `mean`, `p50`, `p95`, `max`. Different metrics need different gates (latency cares about p95, total spend cares about mean × volume).
- Bucket fixtures by *expected* difficulty (easy/typical/hard) — track each bucket's cost separately. Regression in any bucket is a signal; mixing them hides regressions.
- The eval report (and receipt) records the full histogram, not just the summary; CI gates can be tuned without re-running.

**Warning signs:**
- `lattice eval` output shows a single cost number per run.
- Receipts do not contain enough cost detail to reconstruct a histogram in eval.

**Phase to address:** Eval-CI phase, with receipt schema support locked in the receipts phase (per-call cost detail in the signed payload).

---

### Pitfall 11: Multi-tenant attribution leaks across receipts

**What goes wrong:**
A receipt from tenant A's run contains a cost breakdown that references provider account B's price tier (because a shared provider key was used internally). When tenant A inspects the receipt, they see tenant B's negotiated pricing. Or worse: a tenant id from one run leaks into a receipt for another via a misconfigured session reuse.

**Why it happens:**
- Receipts are typically built by collating data from many subsystems (router, provider client, billing module). It is easy to grab "the current price tier" from a shared singleton instead of from the per-run context.
- Lattice's Phase 4 sessions are explicit, but the receipt builder might pull from a global config object rather than from the run's resolved policy.

**How to avoid:**
- The receipt builder is a pure function of an explicit `RunContext` — every input is passed in, no module-level singletons. Static-analysis test: try to construct two receipts from two different contexts in parallel; assert no cross-contamination via a property-based test.
- All cost/pricing data in the receipt is recorded as derived from the *run's* policy/context, never from "current production config." Pricing snapshots are part of the signed payload.
- Tenant id (if used) is recorded in the receipt as a redacted/hashed form by default; opt-in to cleartext.
- Mandatory tags on every provider call: tenant, feature, environment. Untagged calls refuse to commit to the receipt; this matches the gateway-level pattern recommended in the multi-tenant cost attribution literature.

**Warning signs:**
- The receipt builder imports a `config` or `pricing` module at the top level.
- Parallel test runs cause cost numbers to interleave.
- The receipt schema has no explicit tenant/feature field, but tenant info appears in `metadata` strings.

**Phase to address:** Receipts phase (purity of builder, schema decisions). Eval-CI phase verifies attribution is preserved end-to-end.

---

### Pitfall 12: CLI bin ships ESM shebangs that break on Windows

**What goes wrong:**
`lattice` works on macOS/Linux. On Windows, `npx lattice repro` or `lattice` from a global install fails with `node: bad option: --require ...` or "is not recognized as an internal or external command," or simply hangs. Worse: the CMD shim reports success while the actual receipt verification never ran.

**Why it happens:**
- Node ESM bin scripts have known Windows pain points: cmd-shim's generated `.cmd` and `.ps1` files have historically had issues with PowerShell PATH resolution, paths with shell metacharacters, and references to `/bin/sh`.
- ESM-only bins lose the simple shebang→node path. The shebang is on the `.js`/`.mjs` source, but the CMD shim invokes node a different way.
- TypeScript compilers/bundlers (`tsc`, `tsup`, `unbuild`) sometimes strip shebangs in production builds; output runs locally because the IDE re-adds it, but `npm publish` ships the stripped file.

**How to avoid:**
- Ship the CLI as CommonJS or as ESM with a `.mjs` extension on the bin entry; do not rely on `"type": "module"` extension-less inference for the bin.
- Add a build step that re-adds the shebang post-bundle, and a publish-time check that asserts the published bin's first bytes are `#!/usr/bin/env node\n`.
- Cross-platform CI matrix: ubuntu + macos + windows-latest, all running `npm pack` → install the tarball → invoke `lattice --version` → exit code 0.
- Avoid spaces/`&` in default install paths in CI (cmd-shim has known bugs with shell metachars).
- Document: "do not depend on `npx` for receipt verification in CI — `npm i -g` or `pnpm dlx` first."

**Warning signs:**
- The CLI works locally but never tested under Windows.
- The published tarball's bin file doesn't start with `#!/usr/bin/env node`.
- `package.json` `bin` points at a file with no extension under `"type": "module"`.

**Phase to address:** Repro-CLI phase (and the eval CLI shares the same plumbing). Cross-platform smoke test must be a phase exit criterion.

---

### Pitfall 13: Adding the CLI bloats the library's install size

**What goes wrong:**
Pre-v1.1, `npm i lattice` pulls in a tight core. The CLI phase adds `commander`, `chalk`, `inquirer`, `ora`, `update-notifier`, and a YAML parser. Now the library has a 30MB node_modules footprint and starts emitting telemetry from `update-notifier` on first load — surprising users who use Lattice as a library, not a CLI.

**Why it happens:**
The CLI and the library live in one package for distribution convenience, but their dependency closures get merged in `package.json`. CLI-only deps end up in `dependencies` instead of an optional/peer slot, or worse: the library entry imports a CLI helper that pulls in the entire CLI dep tree.

**How to avoid:**
- Split the package: either a separate `@lattice/cli` package, or strict subpath exports with disjoint dep closures and dependency-cruiser/depcheck enforcement that the library entry transitively imports zero CLI-only deps.
- Library entry must not import from `./cli/*`. Enforce via a build-time check and a published-tarball test (`require('lattice'); require('lattice/cli')` — second should be possible but optional).
- Prefer zero-dep / small-dep CLI ingredients: `node:util parseArgs` over `commander`, `node:tty` color detection over `chalk`. Lattice's "small core" constraint applies to the CLI too.
- Forbid network-on-load behaviors (`update-notifier`, telemetry pings) without explicit opt-in.

**Warning signs:**
- `pnpm why chalk` from the library entry returns hits.
- Install size jumps materially in the CLI phase.
- `require('lattice')` triggers a network call.

**Phase to address:** Repro-CLI phase (set up dependency boundaries up front). The eval CLI phase should not have to re-do this work.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single signing key, no `kid` | Simpler v1.1 API | Cannot rotate keys without breaking historical receipts; revocation impossible | Never for production — must include `kid` from day one |
| `JSON.stringify` for "good enough" canonicalization | No new dependency | Receipts silently fail to verify across Node versions; opaque debugging | Never in the signing path |
| Floats for cost / quality / latency in receipts | Direct mapping from provider responses | Cross-platform/cross-Node verification failures from float→string drift | Acceptable for unsigned telemetry only |
| Tripwire DSL with one verb (`abort`) | Smaller surface area | Forces enforce-from-day-one, kills adoption due to false positives | Acceptable only if a `mode: shadow` flag is added before first user fixture |
| Single-run LLM-judge in CI | Fast | Flaky CI → disabled CI | Acceptable behind `LATTICE_EVAL_FAST=1` for local dev only |
| Receipt builder reads from module-level config | Less plumbing | Multi-tenant cost/identity leakage | Never |
| CLI in same package as library, shared deps | Smaller repo | Library install size bloat, surprise side effects | Acceptable only with strict exports + depcheck gate |
| `npx` as the documented CLI entry | Zero install friction | Fails under air-gapped CI, ESM-shim Windows issues, signature verification races | Acceptable as a secondary path; primary path must be `npm i -g` or a vendored binary |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Phase 5 replay envelopes | Building a *second* envelope for receipts | Receipts wrap the existing redacted envelope; one redactor, one envelope schema |
| Phase 5 default redaction | Running redaction *after* signing | Sign over the redacted form; record a `redactions[]` manifest inside the signed payload |
| Phase 2 artifact fingerprints | Re-hashing artifacts in the receipt | Reference Phase 2 fingerprints by id; the receipt commits to fingerprint values, not raw bytes |
| Phase 3 plan JSON | Letting plan JSON drift from receipt schema | Treat plan JSON as a subdocument of the signed receipt; one canonicalizer for both |
| Phase 3 fallback chain | Retrying after a tripwire abort | Tripwire violations carry `terminal: true`; fallback chain reads this flag |
| Phase 4 context packs | Storing the unredacted context pack in the receipt | Context pack records trust labels and reasons (Phase 4 design) but field values flow through the same redactor |
| Phase 4 provider packaging | Receipt records provider name only | Record provider id + adapter version + model fingerprint + packaging hash |
| OpenAI / Anthropic / Bedrock providers | Trusting `model` field as the identity | Capture both `requested` and `observed` (with provider-specific fingerprint), record provider id |
| `node:crypto` for Ed25519 | Hex-encoded private keys passed as strings | Use `KeyObject` with non-extractable storage; never accept raw private key bytes in public APIs |
| MCP-like tool imports (Phase 5) | Tool args not redacted before signing | Tool args go through the same redactor as user inputs; redaction rules apply to tool-call payloads |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-chunk semantic invariant evaluation | p95 latency 3–10× higher than no-invariants baseline | Default semantic predicates to `evaluateAt: 'end'`; opt-in to streaming windows | At first long-output run (>1k tokens streaming) |
| Re-canonicalizing on every receipt verification | Verification dominates CI runtime | Cache canonical bytes alongside the signed digest in the receipt envelope (unsigned cache + signed canonical) | At ~1k receipts in eval CI |
| Synchronous Ed25519 signing in request path | p99 latency spike when CPU contended | Sign asynchronously after the run completes; signature is a post-condition, not a precondition | Under load (~100 rps) |
| LLM-judge evals re-run on unchanged fixtures | Eval CI takes 10+ minutes for trivial PRs | Cache judge outputs by `hash(fixture, model_fingerprint, judge_prompt)`; only re-run on miss | At ~100 fixtures or first PR-only change |
| Receipt storage as one document per run | Massive blob count, slow listing | Index receipts by `(tenant, day, status)` from day one | At first day with >10k receipts |
| Tripwire DSL recompiled per run | Setup cost dominates short runs | Compile DSL once at SDK init; per-run only evaluates the compiled form | At small runs with many invariants |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Signed payload includes unredacted user inputs | Receipts become permanent PII liability and a non-repudiable disclosure | Sign over redacted form; include redaction manifest with hashes (Pitfall 1) |
| Private signing key on disk in cleartext | Single file compromise revokes the entire receipts feature | Document HSM / KMS / OS-keyring paths; never log key material; never accept raw bytes in public APIs |
| Verification accepts any signed receipt without `kid` lookup | Forged receipts from leaked-but-not-revoked keys remain trusted forever | Mandatory `kid`; `KeySet` with revocation state |
| Replay envelopes shipped to dev laptops contain cleartext | PII exfiltration via routine debugging | Repro envelope is the redacted form; cleartext requires explicit `--unsafe-unredacted` opt-in (Pitfall 7) |
| Receipts signed before invariant evaluation | A violated run produces a "valid" receipt indistinguishable from a clean run | Receipt structure binds contract verdict (`pass`/`fail`/`aborted-by-invariant`); verdict is in the signed payload |
| Public-key trust pinned in code | Cannot rotate trust anchors without a release | Trust anchor configurable; document trust-on-first-use vs static pinning tradeoffs |
| Verifier panics on malformed receipts | DoS via crafted input | All parsing returns typed errors; never throw across the verification boundary |
| CLI prints receipt contents to terminal by default | Shoulder-surfing / terminal-recording leakage | Default to `--summary`; `--full` requires explicit flag and warns on TTY |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `lattice repro` fails with cryptic "verification failed" | Developer can't tell if it's a key mismatch, canonicalization drift, redaction-of-signed-fields, or environment drift | Typed error union: `KeyNotFound`, `CanonicalizationMismatch`, `RedactionDrift`, `EnvironmentDrift`, `Tampered` — each with remediation hint |
| Contract violations produce generic errors | "No route satisfies contract" with no detail; developer guesses | Typed `NoContractMatch` result with `{ requestedBudget, availableRoutes[], missingCapabilities[], cheapestOverBudget }` |
| Tripwire abort message exposes the rule text | Adversarial users learn what to avoid | Receipt records full rule provenance; user-facing error references rule id only |
| Eval CI failure says "quality regressed" without context | Devs can't tell which fixture, which dimension | Failure points at a specific fixture + dimension + delta + baseline reference; ideally a `lattice eval --explain <fixture>` |
| Receipts displayed as raw JSON | Unreadable | `lattice show <receipt-id>` renders a human summary; raw JSON behind `--json` |
| CLI demands a key file path on every invocation | Friction kills adoption | Conventional `~/.lattice/keys.json` (verification keys only); `LATTICE_KEYSET` env var; `--keyset` flag for overrides |
| Contract definitions are inline strings | No type safety, easy typos, no IDE completion | `contract({...})` builder with TypeScript inference, mirroring Lattice's existing `output(...)` ergonomics from Phase 1 |
| Invariant violations during streaming surface as broken UI | User sees half a response then an error toast | Document the abort contract clearly; provide a `safeStream` helper that buffers until contract verdict, for UI cases |

---

## "Looks Done But Isn't" Checklist

- [ ] **Signed receipts:** Often missing cross-Node-version verification — verify the same fixture produces an identical signed digest on Node 22, 24, 25, Bun, Deno.
- [ ] **Signed receipts:** Often missing the `kid`/key-rotation story — verify a receipt signed with key A still verifies after key B becomes the active signer.
- [ ] **JCS canonicalization:** Often missing the RFC 8785 appendix test vectors — run the full vector suite as a unit test.
- [ ] **Redaction-before-signing:** Often missing the round-trip test — verify that after redacting a stored receipt's mirror copy, the signature still verifies (because the signed form was already redacted).
- [ ] **Contracts:** Often missing the "no route satisfies" path — every contract test should include a fixture where pre-flight refuses execution and surfaces a typed result.
- [ ] **Tripwire DSL:** Often missing `shadow` mode — verify a shadow invariant records to the receipt without aborting.
- [ ] **Tripwire DSL:** Often missing the cost-on-abort accounting — verify partial-stream tokens are committed to the contract budget.
- [ ] **Repro CLI:** Often missing the redacted-by-default behavior — verify that running `lattice repro` against a prod receipt without `--unsafe-unredacted` produces a redacted local file.
- [ ] **Repro CLI:** Often missing the environment-drift surfacing — verify that replaying against a different Node version / model fingerprint produces an `EnvironmentDrift` warning, not a silent pass.
- [ ] **Repro CLI:** Often missing Windows smoke test — verify global install + invocation on `windows-latest` in CI.
- [ ] **Eval CI:** Often missing N>1 judge runs — verify a single fixture is scored N times and aggregated by median.
- [ ] **Eval CI:** Often missing baseline-relative gating — verify gates compare to last green main, not absolute thresholds.
- [ ] **Eval CI:** Often missing histogram reporting — verify cost/latency reports include p50/p95/max, not just mean.
- [ ] **Eval CI:** Often missing the model fingerprint as a regression dimension — verify a fingerprint change is surfaced.
- [ ] **CLI packaging:** Often missing the published-tarball smoke test — `npm pack` → install tarball → invoke `lattice --version` in a fresh container.
- [ ] **CLI packaging:** Often missing the shebang-survives-build check — assert published bin starts with `#!/usr/bin/env node`.
- [ ] **CLI packaging:** Often missing dep-closure check — assert the library entry has zero transitive imports from the CLI dep tree.
- [ ] **Cost attribution:** Often missing parallel-run isolation — run two receipts in parallel with distinct tenants and assert no field cross-contamination.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Signing-before-redaction shipped | HIGH (existing receipts are tainted) | (1) Reissue keys; (2) mark old receipts as `legacy-unredacted`; (3) re-canonicalize from sources if available, re-sign with new key; (4) verifier rejects old format by default |
| JCS drift detected post-ship | HIGH (verification breaks) | (1) Pin a known-good JCS library version; (2) ship a transitional verifier that accepts both forms; (3) re-sign at next opportunity; (4) deprecate legacy form |
| Key compromise | HIGH | (1) Mark `kid` as `revoked` in the keyset; (2) re-sign affected receipts from sources if available; (3) document blast radius to users |
| Tripwire false positives in production | MEDIUM | (1) Flip rule to `shadow` mode immediately; (2) collect failing fixtures into eval suite; (3) tune rule until eval grades it; (4) flip back to `enforce` |
| Tripwire budget overrun | MEDIUM | (1) Add `terminal: true` to invariant violations; (2) add per-retry budget check; (3) backfill cost-on-abort to existing receipts |
| Repro CLI leaked PII to laptops | HIGH (cannot un-leak) | (1) Audit laptop store, document scope; (2) ship a cleanup command (`lattice repro --purge`); (3) flip default to redacted; (4) require `--unsafe-unredacted` |
| Model fingerprint not in receipts | MEDIUM | (1) Add field; (2) backfill where possible; (3) `lattice eval` treats missing fingerprint as "old format, no regression dimension" |
| Eval CI disabled by team | HIGH (cultural, not technical) | (1) Replace single-threshold with layered gates; (2) cache judge outputs; (3) start in advisory mode for 2 weeks; (4) require explicit on-call sign-off to disable |
| CLI broken on Windows post-ship | LOW–MEDIUM | (1) Patch release with CJS bin or `.mjs` extension fix; (2) add Windows CI; (3) republish |
| Library install bloat post-ship | LOW–MEDIUM | (1) Split package or tighten subpath exports; (2) version bump (minor or major depending on imports); (3) document migration |

---

## Pitfall-to-Phase Mapping

Phases below are placeholders matched to the v1.1 ROADMAP's likely structure (Contracts → Tripwires → Receipts → Repro CLI → Eval CI). The roadmap planner should confirm exact names.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| #1 Signing before redaction | Receipts phase | Property-based test: redact-then-sign and sign-then-redact produce different digests; only the redact-then-sign form is accepted by `verifyReceipt` |
| #2 JCS / canonicalization drift | Receipts phase | RFC 8785 appendix vectors as fixtures; cross-Node-version CI matrix |
| #3 Ed25519 key rotation / `kid` | Receipts phase | Test: rotate signing key, old receipt still verifies via `kid` lookup; revoked key produces typed error |
| #4 Tripwire abort burns budget on retry | Tripwire phase (define `terminal`); receipts phase (cost-on-abort) | Test: invariant violation in fallback chain does not retry; partial-stream tokens appear in receipt cost |
| #5 Tripwire over-aborts / false positives | Tripwire phase (DSL); eval-CI phase (grading) | Test: invariant in `shadow` mode records to receipt without aborting; eval CI fixtures grade false-positive rate |
| #6 Streaming evaluation cost | Tripwire phase (DSL semantics); eval-CI phase (latency split) | Test: semantic predicate defaults to end-of-stream; opt-in mid-stream evaluation runs at declared window |
| #7 Repro CLI leaks PII | Repro-CLI phase (redacted default); receipts phase (envelope shape) | Test: `lattice repro` against a PII fixture produces a redacted local file; `--unsafe-unredacted` requires explicit flag |
| #8 Model fingerprint vs model name | Receipts phase (schema); repro-CLI phase (drift surfacing); eval-CI phase (regression dimension) | Test: receipt records both `requested` and `observed` fingerprint; replay with different fingerprint surfaces `EnvironmentDrift` |
| #9 Flaky eval CI | Eval-CI phase | Test: same fixture run 5× with stable judge gives consistent verdict; baseline-relative gating; layered checks |
| #10 Cost gates mean-vs-p95 | Eval-CI phase (gates); receipts phase (per-call cost detail) | Test: eval report contains p50/p95/max; gates configurable per statistic; histogram preserved |
| #11 Multi-tenant attribution leakage | Receipts phase (builder purity); eval-CI phase (end-to-end check) | Property-based test: parallel receipt construction from distinct contexts shows zero cross-field contamination |
| #12 CLI ESM/Windows bin bugs | Repro-CLI phase (sets the pattern); eval-CI phase (reuses) | CI matrix: ubuntu+macos+windows; published-tarball smoke test; shebang-survives-build assertion |
| #13 CLI bloats library install | Repro-CLI phase | Depcheck/dependency-cruiser gate: library entry has zero transitive imports from CLI dep tree; install-size delta budget |

---

## Sources

- [RFC 8785: JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785) — authoritative on canonical form, number serialization constraints, and I-JSON subset (HIGH).
- [W3C Data Integrity EdDSA Cryptosuites v1.0 (2025)](https://www.w3.org/TR/2025/REC-vc-di-eddsa-20250515/) — `eddsa-jcs-2022` and `eddsa-rdfc-2022` cryptosuites; key-mixing warnings (HIGH).
- [RFC 8037: CFRG Elliptic Curve Signatures in JOSE](https://www.rfc-editor.org/rfc/rfc8037) — Ed25519 key formats for interop (HIGH).
- [libsodium Ed25519 issue #170 — leaks private key on incorrect public key](https://github.com/jedisct1/libsodium/issues/170) — concrete Ed25519 fault-attack precedent (HIGH).
- [json-canonicalize on npm](https://www.npmjs.com/package/json-canonicalize) — practical JS JCS implementation; documented edge-case caveats (MEDIUM).
- [cyberphone/json-canonicalization](https://github.com/cyberphone/json-canonicalization) — reference JCS test vectors including float edge cases (HIGH).
- [Deep Dive: V8's JSON.stringify Optimizations (Aug 2025)](https://www.thakurcoder.com/blog/2025-08-20-deep-dive-v8s-jsonstringify-optimizations-and-deterministic-output) — V8 JSON.stringify and Grisu3→Dragonbox migration context; cross-version determinism risk (MEDIUM).
- [Node.js issue #15628 — deterministically generating a string from object](https://github.com/nodejs/node/issues/15628) — `JSON.stringify` does not guarantee deterministic property order (HIGH).
- [npm/cmd-shim issue #45 — CMD shims and shell metachars](https://github.com/npm/cmd-shim/issues/45) — Windows shim brittleness in real installs (HIGH).
- [npm/cmd-shim issue #51 — PowerShell shim PATH issues](https://github.com/npm/cmd-shim/issues/51) — Windows PowerShell shim brittleness (HIGH).
- [nodejs/node issue #49444 — ESM in executable files](https://github.com/nodejs/node/issues/49444) — known limitations on ESM bin entries (HIGH).
- [2ality: Creating ESM-based shell scripts for Unix and Windows](https://2ality.com/2022/07/nodejs-esm-shell-scripts.html) — pragmatic guide on `.mjs` bin extensions and shebang survival (MEDIUM).
- [Lirantal: TypeScript in 2025 with ESM and CJS npm publishing is still a mess](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) — dual-publish CLI pitfalls in TS (MEDIUM).
- [SakuraSky: Trustworthy AI Agents — Deterministic Replay](https://www.sakurasky.com/blog/missing-primitives-for-trustworthy-ai-part-8/) — environment hermiticity, fingerprint pinning patterns (MEDIUM).
- [BSWEN: Handling LLM Model Drift (Mar 2026)](https://docs.bswen.com/blog/2026-03-21-llm-model-drift-production/) — provider model id vs build drift discussion (MEDIUM).
- [Puneet Ludu: Taming the Dice Roll — Deterministic LLM Systems](https://puneet.io/taming-the-dice-roll-building-deterministic-llm-systems/) — pinning, snapshots, fingerprint logging (MEDIUM).
- [Braintrust: LLM Evaluation Guide](https://www.braintrust.dev/articles/llm-evaluation-guide) — baseline-relative regression testing, CI gating practice (MEDIUM).
- [Coverge: LLM regression testing — catching quality drift](https://coverge.ai/blog/llm-regression-testing) — N-run median, layered gating, baseline-relative thresholds (MEDIUM).
- [Confident AI: LLM Evaluation Metrics](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation) — judge variance characterization, 0.05–0.15 score spread (MEDIUM).
- [Langfuse: Testing LLM Applications (Oct 2025)](https://langfuse.com/blog/2025-10-21-testing-llm-applications) — layered testing strategy, snapshot regression (MEDIUM).
- [Mavik Labs: AI End-to-End Testing in 2026](https://www.maviklabs.com/blog/ai-end-to-end-testing-2026/) — p95 vs mean for LLM workloads, scenario-weighted gating (MEDIUM).
- [Traceloop: From Bills to Budgets — token cost per user](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user) — multi-tenant attribution patterns (MEDIUM).
- [TrueFoundry: LLM Cost Attribution in Agentic CI/CD](https://www.truefoundry.com/blog/llm-cost-attribution-agentic-cicd) — gateway-level mandatory tagging pattern (MEDIUM).
- [DEV: Hierarchical Budget Controls for Multi-Tenant LLM Gateways](https://dev.to/pranay_batta/building-hierarchical-budget-controls-for-multi-tenant-llm-gateways-ceo) — graduated enforcement (alert→throttle→downgrade→block) (MEDIUM).
- [DEV: OpenAI's guardrails don't control costs](https://dev.to/pat9000/openais-guardrails-dont-control-costs-heres-the-gap) — retry-cost amplification on guardrail violations (MEDIUM).
- [Invariant Labs: Guardrails — contextual security for agents](https://invariantlabs.ai/blog/guardrails) — streaming guardrails, retry cost amplification (MEDIUM).
- [Guardrails AI: Concurrency docs](https://www.guardrailsai.com/docs/concepts/concurrency) — concurrent validation patterns (MEDIUM).
- [Statsig: PII Redaction Privacy in LLMs](https://www.statsig.com/perspectives/piiredactionprivacyllms) — redaction-before-egress patterns (MEDIUM).
- [LogRocket: Privacy-safe session replay](https://blog.logrocket.com/product-management/privacy-safe-session-replay-guide/) — replay PII protection patterns; sensitivity audits (MEDIUM).
- Lattice internal: `.planning/PROJECT.md`, `.planning/milestones/v1.0-ROADMAP.md` — Phase 2 artifact fingerprints, Phase 3 plan JSON / fallback chain, Phase 4 context packs and provider packaging, Phase 5 replay envelopes and default redaction — the integration surfaces every pitfall above must respect (HIGH).

---
*Pitfalls research for: TypeScript capability runtime SDK (Lattice v1.1 — Capability Receipts milestone)*
*Researched: 2026-05-11*
