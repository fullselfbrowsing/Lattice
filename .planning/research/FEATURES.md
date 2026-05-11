# Feature Research

**Domain:** TypeScript capability-runtime SDK — milestone v1.1 Capability Receipts
**Researched:** 2026-05-11
**Confidence:** MEDIUM-HIGH (Context7 not consulted; findings cross-checked across multiple official docs and 2026 industry sources; novel synthesis for Lattice-specific edge cases marked LOW where appropriate)

Scope reminder: this file covers ONLY new features for v1.1. Already-shipped v1.0 surfaces (`ai.run` / `ai.plan` / `ai.session`, artifact lifecycle, deterministic router, replay envelopes, schema-validated tools, default redaction, typed run events) are treated as fixed dependencies rather than candidates.

---

## Feature Landscape

### Table Stakes (Users Expect These for a "Capability Receipts" Milestone)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Capability Contract object on `ai.run`** (budget, invariants, qualityFloor) | Every production AI SDK in 2026 (MLflow AI Gateway, LiteLLM, Vercel AI SDK guardrails) lets the caller declare budget/policy *before* execution rather than discovering violations after. | MEDIUM | Must be a plain TypeScript shape attached to `RunInput.policy`. Re-uses existing policy contract; adds `contract: { budget, invariants[], qualityFloor }`. Depends on existing policy/runtime types. |
| **Pre-flight contract proof** (router refuses if no route satisfies contract) | Mirrors LiteLLM / OpenRouter `models[]` fallback semantics and MLflow Gateway's reject-on-budget action: callers expect the system to fail fast with a typed reason before tokens are spent. | MEDIUM | Extends the deterministic router (Phase 3) with a contract-satisfaction filter step before scoring. Returns typed `NoContractMatchResult` (new sibling of existing `NoRouteResult`). Depends on capability catalog + scoring. |
| **Tripwire invariants — abort-on-violation mid-stream** | OpenAI Guardrails, NeMo Guardrails, and Anthropic's mid-stream content filters all support `abort(reason)` semantics; users expect "kill the stream the moment X happens" or the invariant is theatre. | HIGH | Requires a streaming evaluator loop tied to existing run events. Each invariant is a `{ id, check, severity }` shape; on violation, run terminates with typed `TripwireViolationResult`. Depends on event stream + tracing hooks (Phase 5). |
| **Signed Capability Receipts (Ed25519)** | Sigstore/cosign-style signed attestations are the 2026 baseline for any artifact that claims provenance; in-toto Statement+Predicate is the de facto wire shape. | HIGH | New `Receipt` artifact type. Signs over a canonical JSON of `{ inputHashes, route, packagingFingerprint, modelVersions, contractVerdict, redactionPolicyId, timestamp }`. Reuses artifact fingerprint subsystem (Phase 2) and execution plan JSON (Phase 3). |
| **Redaction-aware receipt content** | Anyone in an enterprise will ask "what about PII?" within five minutes. GDPR Art. 17 + EU AI Act Art. 12 (enforcement Aug 2026) create a real tension between immutable audit trails and erasure rights. | MEDIUM | Receipt stores *hashes of redacted spans*, never the spans themselves. Inherits the default redaction layer already in Phase 5; needs an explicit redaction-policy identifier baked into the signed payload so verifiers know what was elided. |
| **Receipt verification API** (`lattice verify <receipt>`) | A signature you cannot verify is performative. cosign and in-toto both ship a verify command beside the sign command; users will refuse to adopt signing without it. | LOW-MEDIUM | Pure function over canonical receipt JSON + public key. No runtime/provider dependency. Should also surface the receipt's contract verdict and redaction-policy id in human-readable form. |
| **`lattice repro <receipt-id>` CLI** | LangGraph time-travel (`get_state_history` → resume) and Replay.io record/replay both prove this is now the expected developer ergonomic. A thumbs-down in prod should resolve to one shell command. | HIGH | New CLI surface. Reads a receipt, rehydrates the corresponding replay envelope (Phase 5), pins model versions, restores artifacts via lineage refs (Phase 2), and runs offline replay. Heavy dependency on Phase 5 envelopes + Phase 2 artifact stores. |
| **`lattice eval` CI command** | Braintrust, Langfuse, and Maxim AI all advertise CI/CD blocking on quality/cost regressions in 2026; teams already expect this from their evaluation vendor and will expect it from a runtime SDK that emits receipts. | HIGH | Reads a directory of receipts + fixtures, re-runs them under a configurable model/provider, compares against baselines, exits non-zero on regression. Depends on receipts, replay envelopes, and existing fake providers for hermetic CI. |
| **Cost & token accounting on the run result** | Every gateway (LiteLLM, MLflow, Vercel) exposes per-call cost; receipts and eval gates are meaningless without it. | MEDIUM | Extends existing `RunResult` with `usage: { promptTokens, completionTokens, costUSD }`. Depends on provider adapter factories (Phase 4) to surface usage data uniformly. |
| **Stable canonical-JSON serialisation for receipts** | RFC 8785-style canonicalisation is the only way Ed25519 signatures actually verify across versions. Without it, every minor TS upgrade breaks signature checks. | MEDIUM | Single small library (or hand-rolled deterministic stringify). Must lock key ordering, number formatting, Unicode normalisation. Touches both signing and verify paths. |

### Differentiators (Where Lattice Beats Existing Tools)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Contract verdict as a first-class run-result discriminant** | LangGraph, Vercel AI SDK, and OpenAI Agents return success/failure; none returns a typed `{ kind: 'contract-satisfied' \| 'no-contract-match' \| 'tripwire-violation' \| 'budget-exceeded' }`. TypeScript users get exhaustive `switch` checks for free. | MEDIUM | Pure type design + result construction. Depends on existing typed-result inference (Phase 1). Lattice's TS-first stance makes this strictly nicer than competitors' string-keyed status fields. |
| **Pre-flight proof returns *why* every route was rejected** | MLflow rejects with HTTP 429; LiteLLM falls back silently. Lattice can return a per-candidate `{ route, failedConstraint, observedScore }` array — debuggable by humans without re-running. | MEDIUM | Extends router scoring (Phase 3) to retain per-candidate rejection reasons. Already conceptually close to existing `NoRouteResult`. |
| **Receipts that link the *entire* artifact lineage, not just the model call** | Sigstore/cosign sign one blob. LangGraph checkpoints record state but do not sign it. Lattice's artifact-fingerprint+lineage subsystem (Phase 2) can sign the full DAG from inbound artifact to outbound output. | HIGH | Receipt payload includes lineage merkle root over artifact fingerprints. Hard dependency on lineage descriptors already in Phase 2. Differentiator only if it stays a single hash, not a megabyte of nested JSON. |
| **Prod-to-laptop repro with drift warnings** | LangGraph time-travel re-executes nodes and silently produces different outputs when the model changes. Lattice can detect that the receipt's pinned model version differs from the currently configured provider and surface a typed `DriftWarning` rather than pretending the rerun matches. | MEDIUM-HIGH | Builds on existing live-rerun drift warnings (Phase 5). Receipt provides the pinned baseline; CLI diffs against actual run. |
| **`lattice eval` budgets are *iteration budgets*, not just $ caps** | MLflow caps spend at the gateway. Braintrust scores quality. Neither caps "this CI suite gets N retries across all receipts". Lattice can expose `--max-iterations` and per-receipt iteration counts, mirroring MLflow Gateway's iteration policy but local. | MEDIUM | New CLI flag + counter threaded through eval run. No new subsystem; uses existing run-event totals. |
| **Receipts replayable across providers** | Most competitors hard-couple receipts/checkpoints to a specific provider. Because Lattice's router is deterministic and providers are abstracted, a receipt can in principle be replayed with `provider=fake` for hermetic CI or `provider=openai-compat` for cross-vendor regression. | MEDIUM | Depends on adapter factories (Phase 4) and execution-plan JSON (Phase 3) staying portable. Differentiation only holds if drift warnings (above) are honest. |
| **Tripwire invariants reusable as eval scorers** | OpenAI Guardrails has runtime invariants. Braintrust has eval scorers. Nobody offers the same object in both roles. Lattice can let the same `Invariant` declaration gate prod streams AND fail CI in `lattice eval`. | MEDIUM | Shared `Invariant` interface; runtime uses it as a tripwire, CI uses it as an assertion. Pure type/factoring work once Tripwires exist. |
| **Schema-validated contracts (Standard Schema / Zod)** | Lattice already validates output shapes with Standard Schema; extending the same pattern to budget/invariant declarations means typos like `budget.usd` vs `budget.dollars` fail at compile time. | LOW | Reuses existing Standard Schema integration (Phase 1). Minor type plumbing. |
| **Receipts include a `redactionPolicyId` so verifiers know what was removed** | Most signed-audit-log discussions in 2026 either skip redaction (cosign) or treat it as informal (Langfuse PII filters). Naming the policy in the signed payload converts "trust me, we redacted" into "trust this declared policy version". | LOW-MEDIUM | Tiny field addition. Real work is governance: defining policy ids and keeping them stable. |

### Anti-Features (Tempting but Wrong for v1.1)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Blockchain / public transparency log (Rekor-style) anchoring** | "Tamper-evident" is the marketing phrase of 2026; HDK and AuditableLLM both anchor to Hedera/Rekor. | Operational complexity (external dependency, key infrastructure, throughput limits, hash-chain reorg edge cases) for a runtime SDK whose target user runs `npm install`. Punishes the small-team developer the SDK is meant to attract. | Sign with Ed25519 locally now; design the receipt payload so it could be wrapped in an in-toto Statement later if hosted control-plane ships. |
| **Hosted receipt store / control plane** | Braintrust, Langfuse, Maxim all host. | Explicitly out-of-scope per PROJECT.md ("Hosted control plane — first version should prove the runtime SDK"). | Keep receipts as artifacts in the existing local/memory store. Let users layer Langfuse/Braintrust if they want hosting. |
| **Zero-knowledge proofs of correct inference** (VeriLLM, ZK courts) | Cited heavily in 2026 arXiv literature. | Two orders of magnitude too expensive for a developer SDK; verifies "the model ran" not "the contract held". Does not address the user's real question. | Stick with hash-based receipts + replay-based verification. |
| **Cryptographic guarantee of identical outputs across providers** | "Cross-provider determinism" sounds appealing. | Physically impossible — sampling, tokenizers, and model versions diverge. Promising it produces broken trust. | Drift warnings (already in Phase 5) + receipt drift-diffs on replay. Tell the truth. |
| **Auto-mutating tripwires** (LLM-as-judge tripwires that self-update mid-run) | Mirrors StreamGuard-style forecasting (arXiv 2026). | Non-deterministic tripwires defeat the purpose of having a *contract*. A contract whose terms change mid-call is not a contract. | Tripwires are pure functions over the stream. LLM-judge scoring belongs in `lattice eval`, not in the runtime. |
| **Receipts that embed full prompts/responses in plaintext** | "But I want to see what was actually sent." | Directly conflicts with default redaction (Phase 5) and with GDPR Art. 17 erasure. Once signed, plaintext PII is permanent. | Receipt stores *hashes*, replay envelope holds redacted payloads, and `lattice repro` can re-fetch artifacts via lineage refs if storage still has them. |
| **Receipt key management built into Lattice** (KMS, HSM, rotation API) | "Sign with our key" implies "manage our keys". | Vast surface area. Cosign-3 explicitly delegates this to `--trusted-root`/sigstore-config. Building it ourselves competes with KMS vendors badly. | Accept a key reference (`Ed25519KeyRef`) supplied by the caller; document rotation patterns; ship a dev-only in-memory key generator clearly labelled dev-only. |
| **Mandatory contracts on every `ai.run`** | "Make it safe by default!" | Breaks the existing PROJECT.md constraint: "The beginner path should be one `run` call". | Contracts are opt-in. When absent, behaviour is exactly v1.0. When present, they are enforced. |
| **Streaming-token-level signing** (per-chunk signatures) | "Real-time provable streaming!" | Generates O(tokens) signatures, wrecks performance, and is meaningless because the contract is about the whole run, not each token. | One receipt per run, signed at run completion (including tripwire-aborted runs — see edge cases). |
| **Forking receipts** (LangGraph-style branched checkpoint chains) | Users coming from LangGraph will ask. | Receipts are attestations of what *happened*, not state snapshots to fork from. Conflating the two destroys the audit story. | Replay envelopes already support branching; receipts describe a single linear run. Keep them distinct. |

---

## Feature Dependencies

```
Capability Contract (run input shape)
    +-- requires --> Standard Schema validation (Phase 1)
    +-- requires --> Policy contract type (Phase 1)

Pre-flight Contract Proof
    +-- requires --> Capability Contract
    +-- requires --> Deterministic router + capability catalog (Phase 3)
    +-- requires --> Typed no-route outcomes (Phase 3, sibling pattern)

Tripwire Invariants
    +-- requires --> Run event stream (Phase 3)
    +-- requires --> Tracing hooks (Phase 5)
    +-- requires --> Capability Contract (invariants declared there)

Cost & Token Accounting
    +-- requires --> Provider adapter factories (Phase 4) [uniform usage extraction]

Signed Capability Receipt
    +-- requires --> Artifact fingerprints + lineage (Phase 2)
    +-- requires --> Execution plan JSON (Phase 3)
    +-- requires --> Default redaction layer (Phase 5)
    +-- requires --> Canonical JSON serialisation (new)
    +-- requires --> Ed25519 signing primitive (new)
    +-- requires --> Cost & Token Accounting (budget verdict)
    +-- requires --> Contract verdict from Pre-flight + Tripwire results

Receipt Verification API
    +-- requires --> Signed Capability Receipt (payload format)
    +-- requires --> Canonical JSON serialisation

`lattice repro` CLI
    +-- requires --> Signed Capability Receipt
    +-- requires --> Replay envelopes (Phase 5)
    +-- requires --> Artifact stores + lineage (Phase 2)
    +-- requires --> Live-rerun drift warnings (Phase 5)

`lattice eval` CI command
    +-- requires --> Signed Capability Receipt
    +-- requires --> `lattice repro` (or shared internals)
    +-- requires --> Fake providers (Phase 3) [hermetic CI]
    +-- enhances --> Tripwire Invariants (reused as eval scorers)

Tripwires-as-Eval-Scorers (differentiator)
    +-- requires --> Tripwire Invariants
    +-- requires --> `lattice eval`

Cross-Provider Replay (differentiator)
    +-- requires --> `lattice repro`
    +-- requires --> Drift warnings (Phase 5)
    +-- conflicts --> any promise of bit-identical outputs

Redaction-Policy Identifier
    +-- requires --> Signed Capability Receipt
    +-- requires --> Default redaction (Phase 5)
    +-- conflicts --> Plaintext prompts in receipts
```

### Dependency Notes

- **Pre-flight contract proof must ship before tripwires.** Otherwise users learn at violation-time that no satisfying route existed, defeating the contract.
- **Receipts must ship after both pre-flight and tripwires.** The receipt's `contractVerdict` enumerates `satisfied | no-match | tripwire-violated | budget-exceeded`; you cannot honestly sign a verdict whose machinery does not yet exist.
- **`lattice repro` and `lattice eval` share an internal "execute from receipt" routine.** Build the library function first, then expose two CLI wrappers. This avoids the trap where eval reimplements repro and they drift.
- **Cost accounting is on the critical path for receipts**, not a nice-to-have. Without per-run cost, `budget` invariants cannot be evaluated and the eval cost-regression gate cannot fire.
- **Redaction-policy ids must be stable across versions** or every Lattice upgrade silently invalidates older receipts. This is a versioning discipline question, not a code question.

---

## MVP Definition

### Launch With (v1.1)

The full v1.1 milestone from PROJECT.md. Cutting any of these breaks the value proposition ("turn a thumbs-down in prod into a deterministic local repro and a CI-gated regression check"):

- [ ] **Capability Contract on `ai.run`** — without it, the rest has nothing to enforce.
- [ ] **Pre-flight contract proof** — fail-fast is the whole point of declaring a contract.
- [ ] **Tripwire invariants with mid-stream abort** — table stakes for any policy-bound runtime in 2026.
- [ ] **Cost & token accounting** — required substrate for both contracts and eval.
- [ ] **Canonical JSON serialisation** — required substrate for signing.
- [ ] **Signed Capability Receipts (Ed25519, redaction-aware, with `redactionPolicyId`)** — the artifact the milestone is named after.
- [ ] **Receipt verification API** — signature without verify is theatre.
- [ ] **`lattice repro <receipt-id>`** — the "turn a thumbs-down into a local repro" half of the goal.
- [ ] **`lattice eval`** — the "CI-gated regression check" half of the goal.
- [ ] **Drift warnings on receipt replay** — using existing Phase 5 machinery, surfaced through the new CLI.

### Add After Validation (v1.2 candidates)

- [ ] **Tripwires-as-eval-scorers (shared `Invariant` factoring)** — desirable but pure refactor; defer until users complain about duplication.
- [ ] **Per-candidate rejection reasons in pre-flight proof** — debuggability win; not blocking adoption.
- [ ] **Iteration budgets in `lattice eval`** — mirrors MLflow; add when teams complain about runaway CI cost.
- [ ] **Cross-provider replay smoke tests** — useful for users running multiple providers; depends on more provider adapters.
- [ ] **Receipt diffing tool** (`lattice receipt diff a.json b.json`) — natural follow-on; not in the milestone goal.

### Future Consideration (v2+)

- [ ] **In-toto Statement wrapping / sigstore Rekor anchoring** — only if hosted control plane appears.
- [ ] **External KMS / HSM key references** — only when enterprise adoption demands it.
- [ ] **Multi-party receipt co-signing** — agent-handoff land; explicitly out-of-scope today.
- [ ] **Hardware-attested receipts** (TPM, TEE) — solves a different threat model than Lattice's.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Capability Contract object | HIGH | LOW | P1 |
| Pre-flight contract proof | HIGH | MEDIUM | P1 |
| Tripwire invariants (mid-stream abort) | HIGH | HIGH | P1 |
| Cost & token accounting | HIGH | MEDIUM | P1 |
| Canonical JSON serialisation | MEDIUM | LOW | P1 |
| Signed Capability Receipts (Ed25519) | HIGH | HIGH | P1 |
| Redaction-aware receipt content | HIGH | MEDIUM | P1 |
| Receipt verification API | HIGH | LOW | P1 |
| `lattice repro <receipt-id>` CLI | HIGH | HIGH | P1 |
| `lattice eval` CI command | HIGH | HIGH | P1 |
| Drift warnings on replay | MEDIUM | LOW (reuses Phase 5) | P1 |
| Contract verdict as typed discriminant | MEDIUM | LOW | P1 (pure types, ship together) |
| Per-candidate rejection reasons | MEDIUM | MEDIUM | P2 |
| Tripwires-as-eval-scorers | MEDIUM | LOW (refactor) | P2 |
| Iteration budgets in eval | LOW-MEDIUM | LOW | P2 |
| Cross-provider replay | MEDIUM | MEDIUM | P2 |
| Receipt diffing tool | LOW | LOW | P3 |
| In-toto / Rekor anchoring | LOW (for SDK users) | HIGH | P3 |
| External KMS integration | LOW (today) | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | LangGraph (time-travel) | Replay.io | Braintrust / Langfuse / Maxim | sigstore/cosign | MLflow AI Gateway | OpenTelemetry GenAI | OpenAI / Anthropic prompt caching | Our Approach |
|---------|------------------------|-----------|-------------------------------|-----------------|-------------------|---------------------|-----------------------------------|--------------|
| **Reproducible re-run from a captured state** | Checkpoints in Postgres; re-executes downstream nodes (LLM calls re-fire and may differ) | Deterministic browser-level capture and replay | N/A (eval-time only) | N/A | N/A | N/A | N/A | Receipt + replay envelope; pinned model version; drift warnings when reality diverges from receipt |
| **Signed attestation of execution** | Not signed | Not signed | Not signed | In-toto Statement + Ed25519/x509, Rekor transparency log | Not signed | Span attributes only, no signing | N/A | Ed25519-signed receipt; in-toto-compatible payload shape so we can opt into Rekor later |
| **Key rotation story** | N/A | N/A | N/A | `--trusted-root` (cosign 3) supports rotation without client updates | N/A | N/A | Per-workspace cache isolation (Feb 2026) — not key rotation, but precedent for scope changes | Accept caller-supplied `Ed25519KeyRef`; document multi-key verify; do not own KMS |
| **Pre-flight policy/budget enforcement** | No | No | Eval-time gates only | No | Budget policies with alert/reject (HTTP 429) | No | No | Pre-flight contract proof returns typed `NoContractMatchResult` with per-candidate reasons |
| **Mid-stream abort on policy violation** | No (graph-step granularity) | N/A | No (eval is offline) | N/A | No | No | Content filters abort, but not user-defined invariants | Tripwire invariants evaluated against streamed events with typed `TripwireViolationResult` |
| **CI/CD regression gate** | No | No | Yes — block merges on quality drop | No | No | No | No | `lattice eval` over receipt fixtures; fails CI on cost-per-task or quality-floor regression |
| **Cost tracking** | No | No | Per-request cost breakdowns and alerts | No | Cumulative spend in USD over windows | Token usage metrics (experimental) | Caching reduces cost; reported per call | `usage.costUSD` on `RunResult`; receipt records final cost; eval gates on regression |
| **Redaction-aware audit** | Not explicit | N/A | PII filters in tracing | Not built-in | Not explicit | Discusses PII in spans informally | Caches are exact-match, no redaction story | Receipts store *hashes* of redacted spans, signed payload names the `redactionPolicyId` |
| **Tamper-evidence** | DB row immutability only | N/A | Vendor-controlled | Rekor transparency log | Audit logs | N/A | N/A | Signature + canonical JSON; deliberately *no* transparency log in v1.1 |
| **Time-travel UX** | `get_state_history` then resume from checkpoint id | Step-by-step UI debugger | N/A | N/A | N/A | N/A | N/A | `lattice repro <receipt-id>` single command; opens replay envelope; surfaces drift |
| **Telemetry standard** | Custom | Custom | OTel-compatible (Langfuse on OTel) | N/A | Custom | Authoritative spec but still Experimental (May 2026) | Returns usage in API response | Already emit typed run events; align attribute names with OTel GenAI where stable; flag experimental names |

---

## Edge Cases (Required by Quality Gate)

These are the edge cases the roadmap and requirements must explicitly address. Several are unique to Lattice because we sit at the intersection of replay, signing, and policy enforcement — competitors sidestep them by owning only one corner.

1. **Redaction conflict — signed receipts vs. right-to-be-forgotten.**
   The receipt is immutable once signed; redacted spans referenced by hash cannot later be "un-hashed" without invalidating the signature. If a user invokes GDPR Art. 17 erasure against the underlying artifact store, the receipt's hashes become dangling. **Mitigation:** receipts store hashes only (never plaintext); a separate "tombstone" mechanism in the artifact store can record erasure without touching receipts; `lattice repro` returns a typed `ArtifactErasedResult` when lineage refs no longer resolve. Document explicitly that signatures over a tombstoned input are still mathematically valid — they just cannot be replayed.

2. **Hash-chain reorg / receipt re-issuance.**
   If a developer fixes a bug in canonical JSON serialisation, every old receipt becomes unverifiable. **Mitigation:** version the canonical-JSON algorithm inside the signed payload (`canonicalisationVersion`); verifier supports all historical versions; never re-issue old receipts (they describe what happened with the *then-current* code).

3. **Signed-receipt key rotation.**
   Cosign 3 solves this with `--trusted-root`; Lattice must not own KMS. **Mitigation:** receipts include a `keyId` (not the key); verification accepts a key set rather than a single key; users rotate by adding a new key to the trust set while old receipts still verify against the prior key. Spell out in docs that revoked keys remain valid for past receipts (signing is a historical fact, not a current permission).

4. **Cross-provider replay drift.**
   A receipt produced against OpenAI replayed against an OpenAI-compatible adapter will diverge. **Mitigation:** receipts pin `providerId`, `modelId`, and `modelVersion`; `lattice repro` emits typed `DriftWarning` events when the active provider differs; `lattice eval` configurable as `strict` (fail on drift) vs. `tolerant` (warn). Never claim bit-identity across providers.

5. **Tripwire fires mid-stream — receipt still required.**
   An aborted run is still a run that consumed tokens and made decisions. **Mitigation:** receipts are emitted for tripwire-aborted runs with `contractVerdict: 'tripwire-violated'` and the violating invariant id captured. Streaming-token signing (per-chunk) is rejected as an anti-feature precisely because the receipt is one-per-run.

6. **Pre-flight proof says "no route" but operator forces execution.**
   Operators will demand an override knob; without one, contracts become unworkable. **Mitigation:** `policy.contract.onNoMatch: 'fail' | 'warn-and-route'`; the receipt records *both* the pre-flight verdict and the override decision; verification surfaces the override explicitly so downstream auditors can see it.

7. **Invariant whose check function itself throws.**
   A tripwire that crashes must not silently allow the run to continue. **Mitigation:** wrap each invariant in a try/catch; thrown exceptions are treated as violations with severity `error` and a typed `InvariantExecutionFailure` reason; receipt captures both the original invariant id and the failure.

8. **Multi-stage runs (`ai.plan` with N stages) — receipt granularity.**
   One receipt for the whole `ai.run` or one per stage? **Mitigation:** one receipt per `ai.run`, but the receipt payload includes the execution plan JSON (Phase 3) so each stage's route, packaging, and model version are inspectable. Avoids fan-out of N receipts that all describe one user-facing operation.

9. **Eval drift from upstream model deprecation.**
   `lattice eval` in CI six months from now will hit deprecated models. **Mitigation:** eval supports `--allow-substitute-model` with explicit substitution rules; substitutions are recorded in the eval's output report; default is `fail-on-deprecated` to keep the regression-gate signal honest.

10. **Tripwire invariants in eval vs. runtime — semantic drift.**
    A tripwire that aborts a stream in prod might be evaluated *after* full generation in eval, producing different verdicts. **Mitigation:** when an invariant is reused as an eval scorer, evaluate it against the same event sequence that streaming would have produced, not against the final output. Share the evaluator, not just the predicate. Document this contract or the differentiator silently lies.

11. **Receipt size growth from artifact-lineage merkle inclusion.**
    Lineage DAGs can be deep. **Mitigation:** include only the lineage *root hash* in the signed payload; full DAG lives unsigned beside the receipt. The signature still binds the DAG transitively because changing any node changes the root.

12. **OpenTelemetry GenAI semconv is Experimental in May 2026.**
    Adopting names like `gen_ai.request.model` today risks breakage when stability lands. **Mitigation:** dual-emit (legacy Lattice event names + GenAI experimental names) and gate via env var, mirroring `OTEL_SEMCONV_STABILITY_OPT_IN`. Mark all GenAI-aligned fields as experimental in our typings.

---

## What Lattice Should Own vs Delegate (Quality Gate)

**Lattice owns:**
- The capability contract shape and its TypeScript types.
- Pre-flight contract evaluation against its own deterministic router.
- Tripwire evaluator against its own event stream.
- The receipt payload schema and canonical JSON.
- Ed25519 signing/verification primitives (using `@noble/ed25519` or `node:crypto`).
- Replay-from-receipt orchestration via existing replay envelopes.
- The eval driver loop, regression gating, and exit-code contract.
- The redaction-policy identifier (governance + stable ids).

**Lattice delegates:**
- Key storage and rotation — to the host application or KMS; we accept references, not keys.
- Transparency-log anchoring — to sigstore/Rekor if/when a hosted control plane ships.
- Provider-side cost data — we ingest `usage` from the adapter; we do not price models ourselves.
- LLM-as-judge scoring — to Braintrust/Langfuse/Maxim; eval can call out to them but does not host them.
- OTel exporter wiring — we emit, the host wires up exporters.
- Compliance certification (SOC2, HIPAA, EU AI Act) — receipts are *building blocks* for compliance, not certified compliance themselves.

---

## Sources

Prior art examined:

- LangGraph time-travel and persistence:
  - [Use time-travel — Docs by LangChain](https://docs.langchain.com/oss/python/langgraph/use-time-travel)
  - [time travel in LangGraph — Concepts](https://langchain-ai.github.io/langgraph/concepts/time-travel/)
  - [time travel then invoke, checkpoint id no longer updates — Issue #4987](https://github.com/langchain-ai/langgraph/issues/4987)
  - [LangGraph Persistence Guide: Checkpointers & State (2026)](https://fast.io/resources/langgraph-persistence/)

- Replay.io determinism model:
  - [Replay — Time Travel: How does time travel work?](https://docs.replay.io/basics/time-travel/how-does-time-travel-work)
  - [How to debug an Effectively Deterministic Time Travel Debugger?](https://blog.replay.io/how-to-debug-an-effectively-deterministic-time-travel-debugger-(seriously...how!))

- Eval CI gates:
  - [Braintrust — observability platform](https://www.braintrust.dev/)
  - [Latitude vs Langfuse, LangSmith, Arize, Braintrust (2026)](https://latitude.so/blog/best-llm-observability-tools-agents-latitude-vs-langfuse-langsmith)
  - [Top 3 AI Testing Platforms: Maxim AI vs Langfuse vs Braintrust](https://www.getmaxim.ai/articles/top-3-ai-testing-platforms-in-2025-comparison-between-maxim-ai-langfuse-and-braintrust/)

- Sigstore / cosign / in-toto:
  - [Sigstore Quickstart with Cosign](https://docs.sigstore.dev/quickstart/quickstart-cosign/)
  - [Cosign v3 release notes](https://blog.sigstore.dev/cosign-3-0-available/)
  - [cosign verify-attestation docs](https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md)
  - [Sigstore Security Model](https://docs.sigstore.dev/about/security/)
  - [in-toto Attestation Framework](https://github.com/in-toto/attestation)
  - [SLSA Provenance predicate](https://github.com/in-toto/attestation/blob/main/spec/predicates/provenance.md)

- Prompt caching (signing-flow inspiration only):
  - [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  - [LiteLLM prompt caching](https://docs.litellm.ai/docs/completion/prompt_caching)

- MLflow AI Gateway iteration / budget policies:
  - [Control LLM Spend with AI Gateway Budget Alerts and Limits](https://mlflow.org/blog/gateway-budget-alerts-limits)
  - [How to Prevent Runaway Agent Costs with MLflow AI Gateway](https://mlflow.org/blog/agent-costs-mlflow-gateway)
  - [Budget Alerts & Limits — MLflow docs](https://mlflow.org/docs/latest/genai/governance/ai-gateway/budget-alerts-limits)

- OpenTelemetry GenAI semconv (Experimental, May 2026):
  - [Semantic conventions for generative AI systems — OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
  - [GenAI client spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
  - [GenAI agent and framework spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
  - [GenAI metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)

- Mid-stream guardrails and abort semantics:
  - [OpenAI Guardrails — Streaming vs Blocking](https://openai.github.io/openai-guardrails-python/streaming_output/)
  - [NVIDIA NeMo Guardrails — streaming](https://developer.nvidia.com/blog/stream-smarter-and-safer-learn-how-nvidia-nemo-guardrails-enhance-llm-output-streaming/)
  - [Mastering LLM Guardrails: Complete 2026 Guide](https://orq.ai/blog/llm-guardrails)
  - [Predict, Do not React: Value-Based Safety Forecasting for LLM Streaming (arXiv 2026)](https://arxiv.org/abs/2604.03962v1)

- Cryptographic LLM audit trails and reproducibility:
  - [AuditableLLM — hash-chain audit framework (MDPI)](https://www.mdpi.com/2079-9292/15/1/56)
  - [HDK: Tamper-Evident LLM Audit Trails](https://redact-app.com/publications/hdk-tamper-evident-llm-audit.html)
  - [VeriLLM publicly verifiable inference (arXiv)](https://arxiv.org/html/2509.24257v3)

- Redaction vs immutability:
  - [The Right To Be Forgotten vs Audit Trail Mandates](https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates)
  - [Art. 17 GDPR — Right to erasure](https://gdpr-info.eu/art-17-gdpr/)
  - [Complete Guide to GDPR Compliance and Document Redaction](https://document-logistix.com/complete-guide-to-gdpr-compliance-and-document-redaction/)

---
*Feature research for: Lattice v1.1 — Capability Receipts*
*Researched: 2026-05-11*
