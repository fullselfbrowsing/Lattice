# Project Research Summary

**Project:** Lattice v1.6 Protocol and Runtime Integrity Bridge
**Domain:** Brownfield DSSE interoperability, execution integrity, and audit correctness for a TypeScript-first AI runtime SDK
**Researched:** 2026-07-16
**Confidence:** HIGH for corrective scope and protocol/runtime findings; MEDIUM-HIGH for public naming and provider-canary coverage

## Executive Summary

v1.6 is a correctness and compatibility milestone, not a feature expansion. New receipts must use standards-compliant DSSE PAE over canonical payload bytes, while historical base64-PAE receipts remain readable only through an explicit, observable, read-only bridge. The TypeScript runtime, Python client, specification, schemas, vectors, CLI, and conformance CI must migrate together. A new signed receipt-profile discriminator should identify corrected writes, while verification must still report the cryptographic profile that actually succeeded and keep schema-version checks independent.

Runtime integrity requires the context plan to become execution-authoritative. One resolved artifact projection must drive provider packaging, token/cost estimates, input hashes, receipts, tracing, persistence, and session continuity. Included current/session content and materialized summaries enter the request; omitted, archived, and summarized raw artifacts do not. Configured storage must perform real lifecycle writes and expose typed failures rather than reporting fictional completion.

Lattice already has the production stack needed for this work. Add no npm or Python runtime dependency; add only `securesystemslib==1.4.0` to Python test extras as an independent DSSE oracle. The main risks are a silent downgrade bridge, circular vectors, plan/request drift that leaks omitted data, privacy regressions from newly active sessions/storage, and strict modes that still return false success. The roadmap should establish protocol semantics first, migrate conformance surfaces second, then correct runtime state before layering audit, agent, and operational guarantees on top.

## Key Findings

### Recommended Stack

Keep the existing Node 24/TypeScript, WebCrypto/Ed25519, RFC 8785 canonicalization, Python `cryptography`/`rfc8785`, Vitest, fast-check, and AJV stack. The work is missing integration and policy, not a framework. Preserve the published engine compatibility rather than changing the runtime floor during a bridge release; use Node 24 as the primary target and retain clean-package checks for every currently supported Node line.

**Core technologies:**
- **DSSE v1.0.2:** receipt signing contract; PAE covers raw serialized payload bytes and UTF-8 byte lengths.
- **Existing WebCrypto and `@noble/ed25519`:** TypeScript signing and verification; no new runtime crypto package.
- **Existing Python `cryptography` and `rfc8785`:** Python Ed25519 and canonical JSON; no runtime dependency change.
- **`securesystemslib==1.4.0` (test-only):** independent Python DSSE PAE/signature oracle; never exposed as a client runtime dependency.
- **Vitest, fast-check, and AJV:** regression, property, and schema/conformance coverage using the existing toolchain.
- **GitHub Actions scheduled/manual workflows:** protected, bounded real-provider canaries kept separate from deterministic PR conformance.

See [STACK.md](./STACK.md) for versions, integration details, and rejected alternatives.

### Resolved Research Decisions

The research reports agree on behavior but differ at several implementation boundaries. Requirements should encode these resolutions:

1. **Receipt schema and signing profile are separate axes.** Use a new receipt body schema version with a required signed profile discriminator for corrected writes. Also return the profile that cryptographically verified. Do not infer successful verification solely from the body version or a payload-only CID.
2. **Legacy verification reproduces the exact historical input.** Standard verification decodes `envelope.payload` and signs raw bytes. The compatibility attempt uses the exact validated payload text from the envelope because that is what old issuers signed; it must not normalize alternate base64 spellings first.
3. **Legacy policy is entrypoint-specific and observable.** Existing compatibility entrypoints may temporarily accept legacy receipts, but strict audit/conformance modes reject them unless explicitly testing migration. Every success reports `standard` or `legacy`; there is no universal silent fallback and no legacy mint path.
4. **Receipt issuance normalizes to three internal states.** `off`, `best-effort`, and `required` cover no signer, existing signer-only behavior, and audit-strict execution. Exact public names may remain additive, but required mode cannot return receipt-less success.
5. **Context authority fails closed.** If the final plan says an artifact is included and it cannot be materialized, execution fails before the provider call. A warn/omit policy is valid only if the plan is updated to record the omission before execution.
6. **One estimator, one hard-budget unknown rule.** A shared kernel returns known cost, zero, or unknown. Router and contract layers may make different decisions when no ceiling exists, but any `maxCostUsd` boundary treats unknown pricing consistently and fail-closed.
7. **Configured persistence is real or failed.** No store means `skipped`; a configured required lifecycle write either succeeds and supplies its returned reference or produces a typed storage outcome. Best-effort behavior, if retained, must be explicit and observable.

### Expected Features

**Must have (table stakes):**
- Standards-compliant DSSE writes in TypeScript and Python, with byte-length-correct PAE and standard envelope base64.
- Bounded, read-only legacy verification with profile reporting, strict rejection, warning/telemetry, and no corrected-profile fallback.
- Frozen legacy vectors plus separately labeled standard and negative vectors, reciprocal TypeScript/Python mint/verify, and an independent DSSE oracle.
- One materialized execution projection that exactly matches provider-visible context and receipt input commitments.
- Selected-only summaries with source lineage, trust/privacy metadata, and summarized raw content excluded from provider requests.
- Session continuity through policy-scoped loading of selected stored turns/artifacts, with explicit missing-reference behavior.
- Actual configured-store writes for input, derived, summary, tool, and output artifacts, with truthful stages and returned refs.
- Required receipt issuance across all terminal paths without provider re-execution after a signing failure.
- Strict eval accounting and exit status for invalid/unevaluable inputs, including atomic baseline initialization.
- Unified route, policy, contract, agent/crew, plan, and diagnostic cost estimation with distinct free/unknown states.
- Iteration and terminal receipts populated on public agent results; crew references reuse the same envelopes without duplicate minting.
- Deterministic packed-package gates plus bounded scheduled/manual real-provider canaries.
- Updated migration/reference documentation and a deterministic comment-hygiene scanner with narrow exclusions.

**Competitive outcomes:**
- Compatibility debt is measurable rather than hidden because every verification exposes the accepted profile.
- Execution plans describe the actual provider-visible artifacts, including summaries, omissions, and fallback-specific repacking.
- Audit-strict runs cannot report success without evidence while existing best-effort consumers retain bounded compatibility.
- Receipt lineage is consistent across `run`, agent iterations, terminal results, resume, and crews.

**Defer beyond v1.6:**
- Removal of legacy verification; use measured acceptance and a separately announced sunset.
- New storage backends, hosted migration/billing services, or new agent orchestration features.
- PyPI publication solely because the protocol code changed.
- A live canary for every provider/model/modality; begin with representative native wire families.
- A pricing ingestion service or decimal settlement arithmetic.

See [FEATURES.md](./FEATURES.md) for the complete behavioral contracts and anti-features.

### Architecture Approach

Add two integrity boundaries without redesigning the public runtime. The protocol boundary issues standard DSSE only and quarantines legacy handling in verifier policy. The execution boundary converts a deterministic context plan into one immutable, concrete artifact projection before provider packaging. Shared receipt policy, cost estimation, persistence, and agent collection helpers then consume these corrected primitives.

**Major components:**
1. **PAE/profile boundary** - standard raw-byte PAE, verification-only legacy PAE, profile-aware results, and independent body-version checks.
2. **Receipt policy** - shared `off`/`best-effort`/`required` issuance semantics for runtime, replay/audit, checkpoints, agents, and crews.
3. **Context materializer** - resolve included current/session artifacts and summaries; exclude omitted/archived/raw-summarized inputs by construction.
4. **Shared preparation/persistence pipeline** - persist, route, plan, materialize, package, store outputs, and append resolvable session refs.
5. **Cost kernel and eval gate** - one estimator plus complete eval diagnostics, exit-code precedence, and atomic baselines.
6. **Agent receipt collector** - stable iteration association, terminal cumulative receipts, resume deduplication, and crew ownership.
7. **Conformance and delivery gates** - standard/legacy corpora, independent oracle, packed consumers, release-candidate gate, and protected canaries.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for component seams, data flow, compatibility treatment, and test boundaries.

### Migration Policy

- New v1.6 writers issue only the authenticated standard profile; no public or internal `mintLegacy` path exists.
- Historical envelopes remain immutable and are retained as a labeled legacy corpus.
- Verification performs common decode/schema/canonical/key checks, attempts standard DSSE first, and enters the exact legacy algorithm only after cryptographic mismatch and explicit policy permission.
- Successful legacy verification returns structured profile/deprecation data. Strict audit, corrected-profile, and standard conformance paths reject it.
- Receipt body version, signature profile, verifier policy, and payload-derived CID semantics are tested separately.
- Protocol spec, schemas, generators, vectors, TypeScript, Python, CLI, and CI change atomically before downstream receipt work proceeds.
- Runtime migration may shadow-compare plans/projections but must execute the provider only once. Omission/privacy enforcement is never rolled back to sending original artifacts.
- Provider canaries begin informational, report `passed`/`failed`/`not-run` distinctly, and become a release freshness criterion only after stable operation.

### Critical Pitfalls

1. **Silent or unbounded legacy fallback** - centralize entrypoint policy, report the verified profile, and never issue legacy signatures.
2. **Schema/profile/CID conflation** - authenticate the intended new profile but verify it independently; test the full body-version/profile matrix and lineage semantics.
3. **Circular golden vectors** - freeze historical vectors and require an independent oracle plus reciprocal packed-package cross-mint.
4. **Advisory-only context** - derive packaging, HTTP bodies, hashes, receipts, and traces from one projection; use sentinel tests to prove omissions.
5. **Session/storage privacy regression** - apply tenant, privacy, retention, and summarizer policy before persistence or rehydration; fail closed on forbidden content.
6. **False strict success** - required receipt failures are typed post-execution audit failures without retry; invalid eval input exits 2 and cannot update a baseline.
7. **Cost semantic drift** - normalize units/precedence once, preserve unknown versus free, and shadow route changes before enforcement.
8. **Tracer-only or duplicate agent evidence** - attach actual envelopes to results, key by stable iteration identity, and define resume/crew ownership.
9. **Unsafe/flaky live canaries** - keep secrets out of PRs, cap retries/time/tokens/spend, use benign inputs, and assert protocol invariants rather than prose.
10. **Destructive comment cleanup** - classify findings, rewrite durable rationale in domain language, fix generators, and isolate hygiene changes last.

See [PITFALLS.md](./PITFALLS.md) for warning signs, verification matrices, and recovery strategies.

## Implications for Roadmap

### Phase 1: Protocol Semantics

**Rationale:** Every new receipt and all later audit work depend on an unambiguous standard signing contract.

**Delivers:** New authenticated receipt profile/version contract, raw-byte DSSE PAE in the issuer/verifier, standards-first policy-gated legacy verification, structured verification profiles, downgrade/CID/lineage rules, and regression tests proving no legacy mint path.

**Avoids:** Silent downgrade acceptance and schema/profile/CID conflation.

### Phase 2: Conformance and Client Migration

**Rationale:** The protocol correction is incomplete until every language and artifact agrees independently.

**Delivers:** Atomic spec/schema/generator/vector/TypeScript/Python/CLI updates; immutable legacy corpus; standard and negative corpora; `securesystemslib` oracle; reciprocal cross-mint; expanded SHA-pinned CI and packed-package checks.

**Uses:** Existing crypto/JCS stack plus the single test-only dependency.

### Phase 3: Authoritative Runtime State

**Rationale:** Receipt strictness and agent evidence must attest actual execution, so context, sessions, and storage must become truthful first.

**Delivers:** Shared preparation/materialization boundary, selected-only summaries, fallback-aware packaging, selected session rehydration, configured artifact persistence, stored output/session refs, privacy enforcement, and plan/request/receipt parity tests.

**Avoids:** Omitted-data disclosure, fictional persistence, and unresolvable session history.

### Phase 4: Audit and Cost Integrity

**Rationale:** With protocol and execution truth established, strict policies can safely enforce evidence and budget outcomes.

**Delivers:** Shared receipt policy across terminal runtime branches, typed post-execution issuance failure, strict eval load accounting and atomic baselines, and one cost estimator used by routing, contracts, agents/crews, plans, and diagnostics.

**Avoids:** Receipt-less strict success, false-green evals, unknown-as-free budgets, and route/preflight disagreement.

### Phase 5: Agent Receipt Closure

**Rationale:** Agents and crews can now compose the corrected issuer, strict policy, and authoritative execution lineage instead of creating a parallel evidence model.

**Delivers:** Iteration receipt collector, terminal cumulative receipts, public result population, stable resume deduplication, crew receipt ownership/order, and result-only success/failure/safety/budget/resume tests.

**Avoids:** Tracer-only evidence and duplicate or divergent receipt chains.

### Phase 6: Operational Interop and Hygiene

**Rationale:** Live and packaging gates should validate stable behavior, and workflow-history cleanup should occur after semantic code stops moving.

**Delivers:** Exact-commit release-candidate gate, clean supported-Node tarball consumers, scheduled/manual protected provider canaries, migration/reference/release documentation, regenerated package surfaces, and isolated durable comment cleanup with CI scanning.

**Avoids:** Source-only confidence, secret/cost exposure, stale documentation, and deletion of enduring rationale.

### Phase Ordering Rationale

- Lock body/profile/legacy semantics before generating any new vector or receipt.
- Prove cross-language and independent interoperability before corrected receipt primitives spread into runtime and agent paths.
- Establish one provider-visible artifact graph before receipts, budgets, sessions, or persistence claim execution truth.
- Apply strict receipt and eval behavior only after their underlying issuance and execution outcomes are reliable.
- Complete agent/crew result closure after common policy and lineage exist.
- Run live canaries and comment cleanup last so they test and document a stable packed product.
- The shared cost kernel is technically independent after Phase 1 and may be planned in parallel, but its enforcement belongs with Phase 4 audit-policy convergence.

### Research Flags

Phases needing focused planning research:
- **Phase 1:** Lock the exact new schema/profile field, literals, payload type, entrypoint-specific legacy defaults, and compatibility horizon.
- **Phase 3:** Audit tenant/privacy/retention rules, fallback context budgets, summarizer eligibility, and storage failure semantics against existing interfaces.
- **Phase 5:** Define stable iteration identity, terminal receipt contents, resume deduplication, and crew root/child ownership before implementation.
- **Phase 6:** Select representative native provider wire families, protected credentials, spend limits, and release freshness policy.

Phases using established patterns:
- **Phase 2:** Committed-vector conformance, reciprocal cross-mint, pinned test oracle, and packed-consumer CI are well understood once Phase 1 is locked.
- **Phase 4:** Shared pure estimator, typed policy outcomes, aggregate diagnostics, and deterministic exit precedence are standard implementation patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing dependencies cover production work; only the independent Python test oracle is new. |
| Features | HIGH | Gaps are confirmed directly in current runtime, receipt, CLI, routing, and agent code. |
| Architecture | HIGH | The existing interfaces provide the needed seams without a public redesign. |
| Migration policy | MEDIUM-HIGH | Behavioral boundary is clear; exact schema/profile naming and per-entrypoint defaults need requirements sign-off. |
| Provider canaries | MEDIUM | Workflow pattern is known, but credentials, model stability, and spend policy are deployment choices. |
| Pitfalls | HIGH | Protocol rules are primary-source-backed and runtime risks are repository-specific. |

**Overall confidence:** HIGH

### Gaps to Address

- **Profile naming/version:** Requirements must lock the new required signed field/literal and schema/payload version; the security behavior is not optional.
- **Entrypoint legacy defaults:** Inventory `verify`, replay/materialize, CLI, eval, and agent/audit callers and assign explicit accept/reject policy to each.
- **Storage policy:** Define which writes are required versus explicitly best-effort and how tenant/retention scope is represented without breaking existing store interfaces.
- **Agent lineage:** Specify terminal body commitments and crew/resume ownership before collector code is written.
- **Canary matrix:** Choose credentials and representative wire families during Phase 6 planning; absence must report `not-run`, never green success.
- **Legacy sunset:** Out of scope for v1.6; add observability now so a later removal decision has evidence.

## Sources

### Primary (HIGH confidence)
- [DSSE v1.0.2 protocol](https://github.com/secure-systems-lab/dsse/blob/v1.0.2/protocol.md) - raw-byte PAE and length semantics.
- [DSSE v1.0.2 envelope](https://github.com/secure-systems-lab/dsse/blob/v1.0.2/envelope.md) - envelope encoding, signatures, and unauthenticated `keyid` hint.
- [RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785) - deterministic canonical payload bytes and I-JSON constraints.
- [securesystemslib DSSE v1.4.0](https://github.com/secure-systems-lab/securesystemslib/blob/v1.4.0/securesystemslib/dsse.py) - independent test oracle.
- [GitHub Actions secret guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) - fork-secret restrictions and protected workflow design.
- Lattice receipt, context, runtime, storage, routing, eval, agent, conformance, and workflow code enumerated in the four detailed research reports.

### Research Reports
- [Stack research](./STACK.md)
- [Feature research](./FEATURES.md)
- [Architecture research](./ARCHITECTURE.md)
- [Pitfalls research](./PITFALLS.md)

---
*Research completed: 2026-07-16*
*Ready for requirements and roadmap: yes*
