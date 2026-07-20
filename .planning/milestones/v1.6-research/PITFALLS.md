# Pitfalls Research

**Domain:** Lattice v1.6 Protocol and Runtime Integrity Bridge
**Researched:** 2026-07-16
**Confidence:** HIGH for repository-specific failure modes; HIGH for DSSE/JCS contracts; MEDIUM for live-provider canary design because provider behavior and pricing remain external

## Recommended Phase Owners

The roadmap should preserve this order because later work depends on earlier compatibility decisions.

| Owner | Scope |
|-------|-------|
| **Protocol Semantics** | DSSE raw-byte PAE, signing-profile/version contract, bounded legacy policy, verifier result shape |
| **Conformance and Client Migration** | TS/Python/spec/schema updates, legacy and standard corpora, independent verification |
| **Authoritative Runtime State** | Executed context projection, session continuity, storage persistence, privacy enforcement |
| **Audit and Cost Integrity** | Required receipts, strict eval behavior, one cost estimator and unknown-cost policy |
| **Agent Receipt Closure** | Iteration/terminal receipt results, resume behavior, crew receipt ownership |
| **Operational Interop and Hygiene** | Packaged interop, live provider canaries, docs/package checks, comment cleanup |

## Critical Pitfalls

### Pitfall 1: Fixing Issuance While Leaving an Unbounded Legacy Verifier

**What goes wrong:** New receipts use DSSE v1.0 PAE over raw payload bytes, but verification silently accepts the old Lattice PAE over base64 text forever. A caller cannot tell which security profile was accepted, and a future downgrade looks like normal verification.

**Why it happens:** `buildPae` currently receives the base64 payload string in TS and Python. The verifier reconstructs the same legacy bytes, so all local tests agree. DSSE instead signs `PAE(UTF8(payloadType), serializedBodyBytes)`; envelope base64 is transport only. Existing v1.3 receipts still need a migration path.

**How to avoid:** Issue standard DSSE only. Verify standard PAE first, then permit legacy fallback only through an explicit policy with a documented horizon. Return the accepted `verificationProfile`; emit compatibility telemetry. Keep body canonicalization checks before signature acceptance. Treat envelope `keyid` as a lookup hint, not authenticated proof, and scope any first-signature behavior as a Lattice limitation rather than full multi-signature DSSE support.

**Warning signs:** A verifier has one boolean success result with no profile; legacy fixtures pass under default strict policy; new issuer code still accepts a base64 string as the PAE payload; CLI and replay use different verifier defaults.

**Verification:** Use official DSSE raw-byte examples plus positive/negative tests for standard-only, legacy-opt-in, legacy-strict-reject, malformed base64, wrong payload type, wrong key, and signatures over base64 text. Exercise direct verify, materialize, CLI verify/repro/eval, and Python.

**Migration and rollback:** Preserve legacy verification as a bounded read path, not a mint path. Roll back by widening the read policy temporarily; do not resume legacy issuance. Record every legacy acceptance so the bridge can be retired safely.

**Phase to address:** **Protocol Semantics**, then **Conformance and Client Migration**.

---

### Pitfall 2: Conflating Receipt Schema Version With Signature Profile

**What goes wrong:** Code assumes `lattice-receipt/v1.3` identifies either legacy or standard PAE. Both profiles can sign the identical v1.3 body, so version checks cannot distinguish them. Optional markers can be stripped, and a migration can accidentally weaken downgrade defenses.

**Why it happens:** Body version and signature-input algorithm are separate protocol axes. Current downgrade checks reject old body schemas before crypto, while the PAE profile is implicit. `receiptCid` hashes decoded payload bytes only, so legacy and standard signatures over the same body also share a CID.

**How to avoid:** Define both axes explicitly. Prefer an authenticated, required signing-profile field in a new schema version for newly issued receipts. If compatibility requires unmarked bodies, use deterministic standard-first verification with policy-gated fallback and surface the inferred profile. Never infer profile from `payloadType` or the current v1.3 literal. Keep existing body-version downgrade rules independent.

**Warning signs:** A switch maps v1.3 directly to one PAE algorithm; the new profile field is optional; a verified legacy receipt is re-signed in place; lineage treats a payload-only CID as proof of signature profile.

**Verification:** Test every supported body-version/profile combination as a matrix. Assert the accepted profile, strict rejection reason, CID behavior, and parent-receipt lineage semantics. Schema validation must reject a new-version body with its required profile marker removed.

**Migration and rollback:** Do not mutate or replace old envelopes. If re-attestation is needed, mint a distinct signed body linked to the old receipt CID. Rollback must preserve recognition of already-issued standard receipts and must not reinterpret their body version.

**Phase to address:** **Protocol Semantics**.

---

### Pitfall 3: Regenerating Golden Vectors From the Same Incorrect Oracle

**What goes wrong:** Spec examples, TS vectors, Python vectors, and hashes are regenerated together and all pass while still signing the wrong bytes. Overwriting old vectors also destroys the evidence needed to test the compatibility bridge.

**Why it happens:** The current generator imports Lattice receipt helpers, the TS harness verifies with Lattice, and Python copied the same prose. A checksum manifest detects drift, not correctness.

**How to avoid:** Freeze the current corpus as explicitly legacy. Add a separate standards-compliant corpus with expected verification profiles. Produce at least one oracle from an implementation that does not import Lattice PAE/signing code. Update the normative worked example, signatures, expected PAE bytes, schema, and manifest atomically.

**Warning signs:** One generator creates both implementation and expected values; old vectors disappear; cross-mint only tests one direction; manifest validation is described as independent interop.

**Verification:** Require TS-to-Python and Python-to-TS mint/verify, an independent raw-PAE verifier, byte-level PAE assertions, and negative bridge vectors. Run against packed public packages, not source-only imports.

**Migration and rollback:** Keep immutable legacy fixtures in their own directory and manifest. A rollback may restore the prior standard corpus version, but must not relabel standard receipts as legacy or rewrite historical vectors.

**Phase to address:** **Conformance and Client Migration**.

---

### Pitfall 4: Making the Plan Authoritative Without Making Provider Input Authoritative

**What goes wrong:** The plan says artifacts were summarized, archived, or omitted, but adapters still receive every original artifact. Session history and summaries look present in diagnostics yet have no effect on model behavior. Restricted data can reach a provider despite an apparently safe plan.

**Why it happens:** `ContextPack` currently stores references and decisions only. `create-ai.ts` passes the original artifact array into provider requests; summary IDs stay in plan metadata. Routing budgets, receipts, and execution can therefore describe different inputs.

**How to avoid:** Build one immutable execution projection after policy and packing. Use that same projection for token/cost estimates, provider packaging, request bodies, input hashes, receipts, tracing, and session append. Materialize summaries as explicit untrusted artifacts, and exclude omitted/archived originals from all downstream provider paths.

**Warning signs:** Both `artifacts` and `selectedArtifacts` travel through runtime internals; adapters can read the original request; summary references appear only under plan metadata; route estimates do not change when context selection changes.

**Verification:** Capture requests at every adapter boundary. Put a sentinel secret in an omitted artifact and prove it is absent from serialized HTTP, logs, summaries, receipt inputs, and replay materialization. Assert the exact executed projection is stable across routing and receipt issuance.

**Migration and rollback:** Shadow-compute old and new projections without making a second provider call, then compare plans and costs. Roll back optional session enrichment if needed, but never roll back the invariant that omitted/restricted artifacts are absent from provider requests.

**Phase to address:** **Authoritative Runtime State**.

---

### Pitfall 5: Turning Session and Storage Authority Into a Privacy Regression

**What goes wrong:** Once sessions and configured storage actually affect execution, old restricted artifacts, raw tool results, signed URLs, or provider outputs are rehydrated or persisted beyond their allowed lifetime. Persistence is reported complete even when no store was used or a write failed.

**Why it happens:** Runtime `storage` is normalized but not consumed, while sessions currently append successful turns without reconstructing prior content for execution. Wiring both up exposes previously dormant trust, retention, tenant, and failure-semantics decisions.

**How to avoid:** Apply privacy/retention policy before summarization, persistence, and rehydration. Scope records by tenant/session, store hashes or references when bytes are forbidden, preserve summary trust labels, and prevent a summarizer from receiving artifacts it is not allowed to see. Define required versus best-effort persistence and expose attempted/succeeded/failed status truthfully.

**Warning signs:** The summarizer receives all artifact refs; storage writes raw inline payloads by default; a session ID is the only authorization boundary; persistence stages always say `completed`; failures are swallowed.

**Verification:** Add cross-session and cross-tenant isolation tests, retention/deletion tests, restricted-artifact sentinels, storage fault injection, and session continuity tests that inspect the actual provider request. Verify no sensitive content appears in default OpenTelemetry attributes or public logs.

**Migration and rollback:** Introduce schema/version metadata for stored records and a dry-run migration report. Roll back new enrichment or durability separately. Privacy enforcement remains fail-closed, and incompatible records should be quarantined rather than silently reinterpreted.

**Phase to address:** **Authoritative Runtime State**.

---

### Pitfall 6: Strict Modes That Still Return Success Without Evidence

**What goes wrong:** A strict runtime returns a receipt-less successful run after signing fails, or `lattice eval` exits zero when every fixture is malformed, unverifiable, missing a sidecar, or lacks a replay target. Baseline initialization can write a partial baseline and report success.

**Why it happens:** `maybeIssueReceipt` catches all failures and returns `undefined`. Eval records `load-failed` fixtures but only `drift` and `regression` affect the exit code; baseline creation skips failed fixtures.

**How to avoid:** Define explicit modes such as `best-effort` and `required`. In required mode, signer absence or mint failure must produce a typed audit failure after the provider result is finalized, without repeating the provider call. Eval strict mode must count invalid/unevaluable inputs, fail zero-evaluable suites unless explicitly allowed, and refuse partial baseline writes. Distinguish valid failure receipts with `outputHash: null` from malformed receipts.

**Warning signs:** Strictness is a check for signer configuration only; receipt issuance still has a blanket catch; reports have no invalid count; `--init-baseline` skips entries; exit status depends only on regression count.

**Verification:** Fault-inject hashing, canonicalization, and signer failures on every terminal runtime branch and streaming path. For eval, test all-invalid, mixed-validity, empty-suite, null-output-hash, and baseline-init cases with exact exit codes and report counts.

**Migration and rollback:** Keep best-effort as an explicit compatibility mode during rollout, with telemetry for skipped/failed receipts. Add report fields additively or version the report. Rollback may relax gating by configuration, but must retain diagnostics and must not overwrite a known-good baseline.

**Phase to address:** **Audit and Cost Integrity**.

---

### Pitfall 7: Unifying Cost APIs Without Unifying Semantics

**What goes wrong:** Routing ranks or admits a model as free while contract preflight rejects it as costly, or unknown pricing bypasses `maxCostUsd`. A field-precedence change unexpectedly reroutes production traffic.

**Why it happens:** Router estimates use legacy per-million fields, while contract preflight prefers per-thousand fields through `effectivePer1kPricing`. Missing values are sometimes treated as zero and sometimes as unknown.

**How to avoid:** Create one pure estimator used by route plan, scoring, policy, contracts, agent/crew budgets, and diagnostics. Define per-1K/per-1M conversion, preferred-field precedence, partial pricing, zero versus unknown, rounding, and exact-boundary behavior. If a hard cost ceiling is requested, unknown pricing should fail closed. Provider-reported usage remains actual billing truth.

**Warning signs:** More than one cost formula exists; `?? 0` is used before a policy decision; route and contract reasons quote different estimates; plans omit estimator/catalog version.

**Verification:** Table-test 1,000 and 1,000,000 tokens, zero, unknown, partial input/output prices, conflicting legacy/new fields, exact budget equality, and deterministic tie-breaking. Assert all consumers receive the same number or unknown state.

**Migration and rollback:** Emit estimator/profile version and shadow-compare route changes before enforcement. Roll back by pinning a catalog/estimator version, not by silently reviving duplicate formulas.

**Phase to address:** **Audit and Cost Integrity**.

---

### Pitfall 8: Agent Receipt Types and Traces Improve While Results Stay Empty

**What goes wrong:** Per-iteration receipts are minted only into trace metadata, while `IterationRecord.receipt`, `AgentSuccess.receipt`, and `AgentFailure.receipt` remain unset. Crew execution may mint a second overlapping receipt chain, and resumed agents may duplicate step receipts.

**Why it happens:** The checkpoint hook returns `void`; integration tests capture envelopes through a custom tracer rather than the public result. Terminal result builders do not attach receipts.

**How to avoid:** Give checkpoint issuance an explicit collector/result channel keyed by stable iteration identity. Attach the actual envelope before freezing iteration records; define which envelope is terminal, how failures are represented, how resume deduplicates, and whether crew root/child/completion receipts include or supersede iteration receipts. Reuse the runtime strictness policy.

**Warning signs:** Tests need a tracer to inspect receipts; public result tests assert only optional types; receipt counts increase after resume; crew and single-agent chains use different ordering rules.

**Verification:** Run success, tool failure, budget stop, safety denial, signer failure, resume, and crew paths with no tracer installed. Verify result envelopes, order, profile, CID links, and strict-mode behavior.

**Migration and rollback:** Add collection fields without removing trace events. During rollout, compare trace and result envelope IDs. Roll back collection independently, but do not leave documentation claiming receipts that the result cannot return.

**Phase to address:** **Agent Receipt Closure**.

---

### Pitfall 9: Live Provider Canaries Become Flaky Tests or Secret Exfiltration Paths

**What goes wrong:** Live calls run on untrusted pull requests, leak prompts/outputs or request headers, incur uncontrolled cost, or fail because a floating model alias changed. Conversely, missing secrets cause a green skipped job and hide that no canary ran.

**Why it happens:** Provider behavior cannot be fully mocked, but CI semantics differ from deterministic conformance. GitHub does not pass secrets to forked PR workflows, and provider output text is not a stable assertion target.

**How to avoid:** Keep deterministic conformance in required PR CI. Run a small native-protocol canary matrix on schedule/manual release workflows using protected environments, least-privilege keys, benign fixed inputs, token/time/cost caps, and bounded retries. Exercise packed public entrypoints. Assert transport/result shape, observed model, usage, receipt verification, and request ID, not exact prose. Report `passed`, `failed`, and `not-run` distinctly.

**Warning signs:** Canary secrets are referenced from fork PR jobs; source imports bypass package exports; logs include raw headers/content; every provider uses one OpenAI-compatible gateway; skipped jobs appear as success without a required-run policy.

**Verification:** Audit workflow event triggers and permissions, test the missing-secret path, inspect public logs, enforce call budgets/timeouts, and retain a minimal sanitized result artifact. Simulate provider 401, 429, 5xx, timeout, and schema drift.

**Migration and rollback:** Start informational, then make recent canary success a release criterion rather than a PR gate. Disable a failing provider lane independently while preserving an explicit degraded signal and incident record.

**Phase to address:** **Operational Interop and Hygiene**.

---

### Pitfall 10: Comment Cleanup Deletes Constraints or Preserves Planning History

**What goes wrong:** Blindly deleting `Phase`, `Plan`, audit IDs, and workaround comments removes security or protocol rationale. Superficial rewrites leave workflow history in generated code, tests, scripts, declarations, and package output. Comment-only work also becomes tangled with semantic changes.

**Why it happens:** The current scanner finds roughly one thousand workflow-shaped references across core, CLI, conformance, tests, and scripts. Some are pure implementation history; others encode durable constraints using temporary project language.

**How to avoid:** Classify each hit as remove, rewrite, or keep. Remove chronology and task IDs; rewrite durable protocol/security/concurrency reasons in domain language; retain external-standard references. Fix generator sources instead of hand-editing generated outputs. Isolate hygiene commits after semantic work and add a narrow scanner baseline/denylist.

**Warning signs:** A bulk regex deletion has no human review; comments still mention milestones or `CONTEXT.md`; generated files diverge from generators; JSDoc repeats code but no longer explains the constraint.

**Verification:** Run the hygiene scanner before/after, inspect every remaining exception, regenerate generated outputs, and run typecheck/tests/package/docs checks. Diff should contain no behavioral tokens outside comments unless regeneration is intentional.

**Migration and rollback:** Keep cleanup in isolated commits so it can be reverted without reverting protocol work. Restore only durable rationale, expressed without internal workflow history.

**Phase to address:** **Operational Interop and Hygiene**, last.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One verifier default for every entrypoint | Small API | CLI, replay, and libraries silently disagree on legacy policy | Never; centralize an explicit verification policy |
| Optional profile marker on an old schema | No schema bump | Marker deletion and ambiguous downgrade behavior | Never for a security boundary |
| Overwrite the old vector directory | Simple corpus | No migration evidence or bridge regression tests | Never |
| Keep original artifacts beside executed artifacts | Easy implementation | Privacy and receipt drift | Only inside a short-lived local builder, never past projection finalization |
| Treat unknown price as zero | Fewer rejections | Budget policy becomes unenforceable | Only when no cost bound is requested and unknown is visible |
| Store all content for replay | Easy replay | Retention and privacy violations | Only in explicit local test stores with synthetic data |
| Use trace events as the receipt API | No result changes | Consumers cannot rely on documented result fields | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DSSE | Sign base64 envelope text | Sign raw serialized body bytes under PAE |
| DSSE key selection | Treat `keyid` as authenticated identity | Use it only as a hint, then validate against trusted key policy/body commitments |
| RFC 8785 JCS | Canonicalize after signing or accept duplicate/non-I-JSON data | Validate, canonicalize bytes once, sign and compare those exact bytes |
| Python client | Mirror TS output without an independent oracle | Use independent JCS/Ed25519 implementation and shared protocol vectors |
| OpenTelemetry GenAI | Capture prompt/output content by default | Keep content capture opt-in and sanitized |
| GitHub Actions | Assume secrets exist in fork workflows | Use protected scheduled/manual jobs and explicit `not-run` status |
| Provider canaries | Assert exact model prose | Assert protocol shape, IDs, usage, bounded behavior, and receipt validity |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Double provider execution during shadow migration | Duplicate charges and side effects | Shadow only planning/projection; execute once | First non-idempotent tool or billed call |
| Summarizing every artifact before selection | Latency and privacy growth | Select first; summarize only eligible over-budget content | Large sessions or multimodal inputs |
| Rehydrate full session history | Context inflation and route churn | Apply authoritative live/summary/archive budgets | Long-running sessions |
| Persist bytes synchronously on the hot path | Tail latency and partial failures | Explicit required/best-effort semantics, content-addressed dedupe | Large files or remote stores |
| Retry live canaries without bounds | Cost spikes and rate-limit amplification | Fixed attempt, timeout, token, and spend caps | Provider incident or 429 burst |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Silent legacy signature fallback | Downgrade acceptance cannot be audited | Explicit policy, profile result, telemetry, sunset |
| Optional authenticated-profile field | Marker stripping | New required schema field or explicit unmarked compatibility class |
| Trusting payload-only CID as signature-profile identity | Chains cannot distinguish legacy from standard signature | Carry verified profile separately or commit it in a new body |
| Sending omitted artifacts to adapters | Restricted data disclosure | One authoritative execution projection and request capture tests |
| Rehydrating sessions by ID alone | Cross-tenant disclosure | Tenant/auth scope and policy recheck on load |
| Logging canary prompts, outputs, or keys | Secret/PII leakage | Benign inputs, redacted logs, least-privilege keys |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `verify: true` without a profile | User cannot assess compatibility debt | Return standard/legacy profile and key state |
| Strict receipt failure reported as provider failure | User may retry and duplicate work | Typed post-execution audit failure with preserved usage/output metadata |
| Eval says zero regressions when inputs failed | False-green CI | Separate passed, regressed, invalid, unevaluable, and not-run counts |
| Context plan differs from actual request | Inspection is misleading | Show the exact executed projection and transformations |
| Canary skip looks green | Release confidence is false | Surface last successful run and explicit required/not-run status |

## "Looks Done But Isn't" Checklist

- [ ] **DSSE correction:** New signatures use raw payload bytes, and legacy acceptance is explicit and observable.
- [ ] **Version bridge:** Body schema version, signing profile, verifier policy, and CID semantics are tested separately.
- [ ] **Vectors:** Historical legacy vectors remain immutable; standard vectors pass an independent implementation.
- [ ] **Context:** Omitted content is absent from captured provider HTTP, not only from plan metadata.
- [ ] **Sessions:** Prior turns affect the actual request and remain tenant/privacy scoped.
- [ ] **Storage:** Configured storage is called, failures are represented, and forbidden bytes are not persisted.
- [ ] **Strict receipts:** Every terminal branch either returns a receipt or a typed audit failure without provider re-execution.
- [ ] **Strict eval:** Invalid/unevaluable fixtures and partial baseline initialization fail with documented exit codes.
- [ ] **Costs:** Router, contract, policy, agent, and diagnostics use one estimator and one unknown-cost rule.
- [ ] **Agents:** Receipt fields are populated without installing a tracer; resume and crew paths do not duplicate them.
- [ ] **Canaries:** Packed public APIs hit distinct provider protocols with bounded cost and explicit not-run reporting.
- [ ] **Comments:** Scanner findings are classified; package/docs/tests pass after isolated cleanup.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Unbounded legacy verification shipped | HIGH | Add profile telemetry immediately, default new callers to standard-only, inventory legacy acceptance, publish sunset |
| Golden vectors overwritten | MEDIUM | Recover from git/tag, freeze as legacy corpus, regenerate standard corpus independently |
| Omitted content reached a provider | HIGH | Disable affected execution path, rotate exposed URLs/keys, audit logs/storage, ship fail-closed projection fix |
| Session/storage privacy regression | HIGH | Quarantine records, disable rehydration, run tenant/retention audit, migrate only validated records |
| Strict mode returned receipt-less success | MEDIUM | Preserve run evidence, emit incident/audit event, fix typed failure boundary, avoid replaying side effects |
| Cost change rerouted traffic | MEDIUM | Pin prior estimator/catalog version, compare route plans, correct shared estimator, re-enable gradually |
| Agent receipts duplicated after resume | MEDIUM | Deduplicate by stable step identity and receipt ID; repair lineage with additive attestations, not mutation |
| Canary exposed a secret | HIGH | Revoke credential, scrub retained artifacts where possible, narrow permissions/logging, review workflow triggers |
| Comment cleanup removed rationale | LOW | Revert isolated cleanup commit and rewrite durable constraints in domain terms |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Exit Verification |
|---------|------------------|-------------------|
| Raw PAE plus bounded legacy bridge | Protocol Semantics | Standard-first result profiles; strict legacy rejection; no legacy mint path |
| Version/profile/CID ambiguity | Protocol Semantics | Full schema/profile matrix and lineage assertions |
| Circular golden vectors | Conformance and Client Migration | Frozen legacy corpus plus independent standard oracle and packed cross-mint |
| Advisory context plan | Authoritative Runtime State | Sentinel omitted content absent at every adapter boundary |
| Session/storage privacy and false persistence | Authoritative Runtime State | Tenant, retention, fault-injection, and actual-request continuity tests |
| False strict receipt/eval success | Audit and Cost Integrity | Terminal-branch signer faults and all-invalid eval suites fail correctly |
| Divergent cost semantics | Audit and Cost Integrity | One estimator table suite used by every consumer |
| Empty agent receipt surfaces | Agent Receipt Closure | Result-only tests pass for success, failure, resume, and crew |
| Unsafe/flaky provider canaries | Operational Interop and Hygiene | Protected, bounded, packed scheduled/manual matrix with explicit not-run |
| Workflow-history comments | Operational Interop and Hygiene | Classified scanner baseline and clean package/docs/tests |

## Sources

### External Primary Sources

- [DSSE v1.0 protocol](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md) - PAE parameters are byte sequences; signatures cover raw serialized body bytes.
- [DSSE v1.0 envelope](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/envelope.md) - envelope base64, signatures, and `keyid` semantics.
- [in-toto Attestation Framework envelope specification](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md) - DSSE envelope interoperability context.
- [RFC 8785 JSON Canonicalization Scheme](https://datatracker.ietf.org/doc/html/rfc8785) - canonical bytes, I-JSON constraints, and validation requirements.
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) - receipt schema/version contract.
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) - sensitive input/output attribute guidance.
- [NIST AI RMF Generative AI Profile, NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) - privacy, monitoring, and third-party AI risk controls.
- [GitHub Actions secrets guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) - fork-secret restrictions and safe secret use.
- [GitHub Actions deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) - protected environments and deployment controls.
- [Gemini `generateContent` API](https://ai.google.dev/api/generate-content) - response metadata and live protocol shape.
- [OpenRouter API reference](https://openrouter.ai/docs/api/reference/overview) - normalized response, model routing, and usage behavior.

### Repository Evidence

- `packages/lattice/src/receipts/{envelope,receipt,verify,cid}.ts`
- `clients/python/src/lattice_receipt/_core.py`
- `spec/SPEC.md`, `spec/schema/v1.3.json`, and `conformance/`
- `packages/lattice/src/runtime/create-ai.ts` and `packages/lattice/src/context/context-pack.ts`
- `packages/lattice/src/contract/preflight.ts`, `packages/lattice/src/routing/{catalog,router}.ts`
- `packages/lattice-cli/src/eval/runner.ts` and `packages/lattice-cli/src/commands/eval.ts`
- `packages/lattice/src/agent/{runtime,types,integration.test}.ts` and `packages/lattice/src/agent/crew/`
- `.github/workflows/`
- `comment-hygiene` scanner results across `packages/`, `clients/`, `conformance/`, `scripts/`, and `.github/`

---
*Pitfalls research for: Lattice v1.6 Protocol and Runtime Integrity Bridge*
*Researched: 2026-07-16*
