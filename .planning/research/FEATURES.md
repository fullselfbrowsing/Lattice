# Feature Research: v1.6 Protocol and Runtime Integrity Bridge

**Domain:** TypeScript-first AI capability runtime SDK
**Researched:** 2026-07-16
**Confidence:** HIGH for repository gaps and DSSE semantics; MEDIUM for final public API naming

## Research Frame

v1.6 is a correctness and compatibility milestone, not a surface-area expansion. Its job is to make signed receipts, runtime context, storage, audit gates, pricing, and agent results tell the same truth across code, plans, documentation, and conformance tooling.

The public names below are recommendations, not locked API decisions. The behavioral contracts are the requirement.

### Current-State Evidence

| Area | Current behavior | Integrity gap |
|------|------------------|---------------|
| DSSE | TypeScript, Python, spec, and vectors construct PAE from the base64 payload text | DSSE requires PAE over the decoded serialized body bytes; all implementations agree on the same non-standard behavior |
| Verification | Legacy receipts verify without identifying the signature construction used | Consumers cannot distinguish standards-compliant evidence from the compatibility path |
| Context packing | The plan classifies artifacts and session turns as included, summarized, omitted, or archived | Provider requests still receive the full artifact list; summaries and prior turns are not execution-authoritative |
| Artifact storage | `LatticeConfig.storage` accepts an `ArtifactStore` | The runtime does not call it, yet reports persistence as completed |
| Required receipts | Receipt issuance catches errors and returns `undefined` | A run can report success without required audit evidence |
| Evaluation | Malformed or unloadable fixtures become `load-failed` rows | The command can still exit 0 and baseline initialization can write a partial baseline |
| Cost estimates | Contract preflight normalizes per-1k and per-1M pricing | Router policy uses a separate per-1M-only calculation, so routing and contracts can disagree |
| Agents | Result types and docs describe iteration and terminal receipts | The agent runtime does not attach those receipts to returned records/results |
| Interop | TypeScript and Python cross-check generated fixtures | The harnesses share the same assumption and lack an independent DSSE oracle |
| Provider validation | Adapter tests use mocks; registry drift is live | No scheduled credentialed call verifies real provider request/response behavior |
| Documentation | Several pages and source comments retain phase/plan language or stale release claims | Current behavior and durable rationale are mixed with workflow history |

## Feature Landscape

### Table Stakes

Features required for v1.6 to satisfy its stated integrity goal.

| Feature | Expected behavior | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| Standards-compliant DSSE writes | Every new receipt signs `PAE(UTF8(payloadType), canonicalPayloadBytes)`. Base64 remains envelope transport only. TypeScript, Python, schemas, fixtures, CLI, and spec agree. | HIGH | Authenticated receipt profile/version decision |
| Bounded legacy verification | Existing base64-PAE receipts remain readable through an explicit compatibility path. New-profile receipts never fall back to legacy verification. | HIGH | Correct standard verifier, signed profile/version boundary |
| Verification observability | Verification reports which profile succeeded, such as `dsse-v1` or `lattice-legacy-base64-pae`, plus a stable warning/deprecation signal. Strict callers can require standard DSSE. | MEDIUM | Legacy bridge |
| Independent conformance | At least one oracle or fixed upstream DSSE vector validates PAE independently of Lattice production helpers. Cross-mint covers TypeScript to Python and Python to TypeScript. | MEDIUM | Correct writers/verifiers and regenerated fixtures |
| Execution-authoritative context | The exact included context pack, not the original artifact array, drives provider packaging and requests. Omitted and archived raw content never leaves the runtime. | HIGH | Resolved context model |
| Materialized summaries | Only selected artifacts are summarized; generated summaries carry source lineage, trust, and policy metadata and replace raw inputs in live context. | HIGH | Context authority, summarizer failure policy |
| Session continuity | Selected prior turns and resolvable artifact references are materialized into provider context. Missing history follows an explicit warn/omit/fail policy. | HIGH | Context authority, storage loading |
| Real artifact persistence | Configured stores receive lifecycle-defined input, derived, tool, and provider-output artifacts. Returned and session references use store-produced keys and fingerprints. | HIGH | Persistence contract, context/session integration |
| Strict receipt mode | An explicit required mode rejects missing signer configuration before provider work and converts issuance failure into a typed terminal audit failure with preserved safe diagnostics. | MEDIUM-HIGH | Correct receipt issuance primitive |
| Strict eval input handling | Any fixture load, verification, materialization, or replay prerequisite failure makes the evaluation session fail. Reports retain all per-fixture diagnostics. | LOW-MEDIUM | Stable CLI exit precedence |
| Unified pricing estimate | Routing score, policy budget, execution plan, and contract preflight call one normalized estimator with identical units and unknown/free semantics. | MEDIUM | Shared pricing normalization |
| Agent receipt/result consistency | Iteration and terminal receipts promised by types/docs are returned on the corresponding records/results; crew summaries reference the same envelopes without duplicate minting. | HIGH | Receipt outcome primitive, strict mode composition |
| Real-provider canaries | Scheduled/manual, credentialed, low-cost calls validate representative provider request shaping and normalized outputs outside fork PR checks. | MEDIUM | Runtime and adapter behavior stabilized |
| Package and documentation validation | Published package shape, examples, migration guidance, schemas, vectors, and reference docs describe implemented v1.6 behavior. | MEDIUM | All behavioral work |
| Durable comment hygiene | Production comments explain enduring invariants and external constraints, not phases, plans, gates, or internal planning IDs. CI scanning has documented exclusions. | MEDIUM | Final code shape |

### Differentiators

| Feature | Why it matters | Complexity |
|---------|----------------|------------|
| Observable compatibility bridge | Lattice can preserve historical evidence without pretending old signatures are standard or silently downgrading new receipts. | HIGH |
| Truthful execution plans | The context plan becomes a verifiable description of bytes and references actually offered to a provider, including fallback-specific repacking. | HIGH |
| Audit-strict execution | Applications can opt into a mode where success without evidence is impossible while existing best-effort consumers remain compatible. | MEDIUM-HIGH |
| Cross-language evidence portability | Independent DSSE checks plus reciprocal TypeScript/Python minting show interoperability rather than mere agreement between copied helpers. | MEDIUM |
| Receipt continuity across execution forms | One receipt model composes through `run`, agent iterations, terminal agent results, and crews without tracer-only evidence or double issuance. | HIGH |
| Runtime/store/session coherence | Persisted references, future session reconstruction, context budgeting, and outbound provider inputs derive from one resolved artifact graph. | HIGH |

### Anti-Features

| Do not build | Why |
|--------------|-----|
| Silent dual verification | It hides weaker legacy evidence and makes migration impossible to measure. |
| Legacy fallback for corrected-profile receipts | It creates a downgrade path. The authenticated receipt profile/version must bound compatibility. |
| Re-signing or mutating historical receipts | It destroys the original evidence. Retain labeled legacy fixtures and verify them through the bridge. |
| Continued legacy issuance | Compatibility is read-only; every v1.6 writer emits standard DSSE. |
| Advisory-only context plans | A plan that says omitted while the request includes the artifact is an integrity defect. |
| Sending raw content alongside its summary | It defeats budgeting, omission, privacy, and trust decisions. |
| Best-effort behavior inside required audit mode | Required means absence or issuance failure is terminal and observable. |
| Green eval runs with skipped load failures | A comparison set that could not be loaded is not a passing evaluation. |
| Partial baseline creation | Baselines must be atomic with respect to fixture validity. |
| Duplicate pricing formulas | Separate calculations will drift again. |
| Treating unknown price as free | `0` is free; missing or incomplete pricing is unknown and must remain distinguishable. |
| Tracer side effects as the only receipt return channel | Evidence promised in result types must be directly accessible from results. |
| Live provider calls on every PR or fork | Secrets are unavailable to forked pull requests and provider behavior is inherently less deterministic than unit/conformance tests. |
| Exact natural-language assertions in canaries | Canary checks should validate protocol shape and normalized invariants, not provider wording. |
| Blanket deletion of comments or released changelog history | Durable rationale and historical records are useful; rewrite only workflow-specific production narration and stale current claims. |
| Hosted migration service, billing service, or new storage backend | These expand product scope without being necessary to correct the bridge. |

## Behavioral Contracts

### 1. Receipt Signature Bridge

The corrected writer must sign canonical receipt bytes, not their base64 representation. The envelope still carries `payload` as base64, but verification decodes it before constructing standard PAE. Byte length, not JavaScript character count, determines the PAE length fields.

A bounded compatibility design should use an authenticated receipt discriminator. The least ambiguous option is a new signed receipt body version for corrected writes, for example `lattice-receipt/v1.4`:

- New version: standard DSSE verification only.
- Existing supported versions: try standard DSSE first, then legacy base64-PAE only when compatibility policy permits.
- Successful legacy verification: return success plus the legacy signature profile and deprecation warning.
- Strict verification: reject the legacy profile with a stable reason while retaining diagnostics.
- Receipt CID: continue deriving from decoded canonical payload bytes so the signature construction does not redefine content identity.

The verifier should use the exact validated envelope payload text when reconstructing the historical legacy algorithm, since that is what old writers signed. It should not make corrected receipts eligible for that branch.

Required evidence:

- Standard and legacy positive fixtures are separately labeled.
- Tampered payload, type, signature, key ID, and malformed base64 vectors fail.
- TypeScript and Python mint corrected envelopes and verify each other's output.
- An independent PAE fixture/oracle does not import Lattice's `buildPae` implementation.
- Generated vectors and schemas have freshness checks in CI.
- CLI verification and replay surface the signature profile without exposing receipt content.

### 2. Context, Session, and Persistence Authority

The runtime needs one resolved context artifact graph per route attempt. It is the source for provider packaging, token estimates, execution-plan details, session recording, and persistence events.

Required behavior:

1. Resolve live inputs, selected prior turns, stored artifact references, generated summaries, and omissions.
2. Invoke the summarizer only for artifacts classified as summarized.
3. Replace summarized raw artifacts with generated summary artifacts that retain lineage, trust, and relevant policy labels.
4. Package only the resolved live set for the chosen provider.
5. Re-resolve or revalidate the set for a fallback route whose context window or media capabilities differ.
6. Persist lifecycle-defined artifacts when a store is configured and use the returned references in results and session turns.
7. Report persistence completion only after required writes succeed.

Reference-only artifacts with no local value must not be fabricated and written. Existing store references should be preserved and loaded only when execution requires their contents. Persistence failure must be a typed, observable outcome rather than a success plan with a false completed stage.

Adapter-spy tests should assert the exact outbound list: included originals plus generated summaries and selected session context, with omitted, archived, and summarized raw artifacts absent.

### 3. Strict Audit and Evaluation Gates

Best-effort receipt issuance may remain the compatibility default. A required mode changes the contract:

- Required mode without a signer fails validation before any billable provider call.
- Signing failure after provider execution returns a typed audit failure and preserves safe usage, plan, and partial-output metadata.
- Every terminal branch follows the same rule, including no-route, validation, policy tripwire, provider failure, and success.
- Receipt errors and signer internals are redacted from events and user-visible diagnostics.

Evaluation has a parallel integrity rule. `load-failed` is a session failure, not a comparison result. The report should include a `loadFailed` count and retain every row, while exit code 2 takes precedence over regression exit code 1. Baseline initialization writes nothing if any fixture fails.

### 4. Unified Cost Semantics

One estimator should normalize legacy per-1M and preferred per-1k hints and feed:

- route scoring,
- route policy `maxCostUsd`,
- contract preflight `maxCostUsd`, and
- the execution plan's estimate and source metadata.

The estimator must distinguish free (`0`) from unknown (missing or incomplete price data). Provider-reported usage remains the post-execution billing authority; preflight estimates must be labeled as estimates. Table-driven and property tests should prove that route policy and contract policy reach the same verdict for the same route, token assumptions, and budget.

### 5. Agent and Crew Result Truth

The implementation should establish one explicit return model:

- An iteration receipt belongs on the exact `IterationRecord` it attests.
- A terminal agent receipt belongs on `AgentSuccess` or `AgentFailure` when minted.
- A failure after a signed iteration retains that iteration's receipt.
- Crew `receipts`, per-agent receipt CIDs, child summary receipt CIDs, and nested agent results reference the same envelopes in documented order.
- Strict receipt mode composes with single agents and crews; default mode remains compatible.

The checkpoint hook therefore needs a receipt outcome channel, such as a collector/callback or returned result. Emitting only tracer metadata cannot satisfy the typed result contract.

### 6. Independent and Live Validation

Conformance CI and provider canaries solve different problems:

- Conformance is deterministic and required on relevant pull requests. It covers spec, schemas, generated fixtures, both clients, reciprocal mint/verify, negative vectors, and an independent DSSE oracle.
- Live canaries are scheduled or manually dispatched because they require secrets and incur cost. They validate a small representative set of provider protocol families with fixed spend/time ceilings, redacted diagnostics, stable low-cost models, and invariant-based assertions.

Canary failures should distinguish authentication/configuration errors from provider protocol regressions. They should record provider and request identifiers where available, never raw credentials or sensitive response bodies. A local-only adapter such as LM Studio remains a manual diagnostic rather than a hosted credentialed canary.

## Dependencies

```text
Authenticated receipt profile/version
    -> standard DSSE writer and verifier
    -> bounded legacy read bridge
    -> TS/Python/schema/vector regeneration
    -> independent oracle and migration observability

Resolved context artifact graph
    -> summary and session materialization
    -> authoritative provider packaging
    -> configured-store persistence
    -> truthful session reuse and plan reporting

Shared pricing normalization
    -> router scoring and policy budget
    -> contract preflight and plan estimate

Receipt issuance outcome primitive
    -> strict run mode
    -> agent iteration/terminal results
    -> crew receipt consistency

Correct runtime and adapter behavior
    -> real-provider canaries
    -> package validation, docs, and comment hygiene
```

### Dependency Notes

- Decide the authenticated receipt profile boundary before regenerating any fixtures; otherwise compatibility behavior will be encoded inconsistently.
- Context selection must become authoritative before persistence and session continuity are finalized, because both need the same artifact identity graph.
- Strict receipts should use the corrected issuance primitive before it is threaded through agents and crews.
- Pricing and eval strictness are largely independent and can be implemented while context work proceeds.
- Real-provider canaries should follow stable request shaping so they diagnose regressions instead of moving implementation targets.
- Migration docs accompany the protocol bridge; broad documentation and comment cleanup close the milestone after behavior is verified.

## Milestone Scope

### Ship in v1.6

| Priority | Capability | Rationale |
|----------|------------|-----------|
| P0 | Correct DSSE issuance and bounded, observable legacy verification | The protocol defect affects the trust meaning of every newly issued receipt. |
| P0 | TypeScript/Python/spec/schema/vector parity plus independent oracle | A protocol fix is incomplete until all interoperability surfaces agree independently. |
| P0 | Execution-authoritative context, summaries, omission, and session continuity | Current plans can disagree with provider inputs, including privacy and budget decisions. |
| P0 | Configured artifact persistence with truthful outcomes | The advertised configuration currently has no runtime effect. |
| P0 | Required receipt mode and eval load-failure gating | Audit and CI success must not conceal missing evidence or inputs. |
| P0 | Unified route/contract cost estimation | Budget enforcement must be deterministic across policy layers. |
| P0 | Agent and crew receipt/result consistency | Public types and documentation must match returned evidence. |
| P1 | Independent conformance workflow expansion | Prevents regression to shared-bug parity. |
| P1 | Scheduled/manual real-provider canaries | Covers provider drift that mocks cannot detect. |
| P1 | Package validation, docs refresh, migration guide, and durable comment hygiene | Makes the corrected behavior consumable and maintainable. |

### Defer

| Feature | Reason |
|---------|--------|
| Removal of legacy receipt verification | v1.6 is the compatibility bridge; removal requires measured usage and a separately announced deadline. |
| Publishing the Python client solely because protocol code changed | Validate it in conformance now; package publication is a separate release/distribution decision. |
| New durable storage backends | Existing `ArtifactStore` behavior must work before adding adapters. |
| Full live matrix for every provider/model/modality | Start with representative protocol families and expand from evidence. |
| Pricing ingestion or billing service | This milestone unifies estimator semantics, not commercial cost data operations. |
| New agent orchestration features | Correct the current receipt contract before expanding the agent surface. |

### Future Considerations

- Make legacy verification opt-in or remove it after telemetry and a documented deprecation window.
- Add more independent DSSE implementations to the conformance matrix if interoperability demand grows.
- Expand canaries by modality and provider only where unit tests cannot cover protocol drift.
- Add stronger compile-time result typing for required receipt mode after the runtime policy proves stable.
- Add production storage adapters after the core persistence lifecycle has conformance tests.

## Suggested Delivery Order

| Order | Work package | Complexity | Exit evidence |
|-------|--------------|------------|---------------|
| 1 | Receipt profile decision, standard DSSE core, legacy bridge | HIGH | Standard/legacy vectors and downgrade tests pass |
| 2 | Polyglot clients, schemas, spec, CLI visibility, independent conformance | HIGH | Reciprocal mint/verify and oracle pass in CI |
| 3 | Resolved context graph, summaries, sessions, fallback packaging | HIGH | Adapter spies match plans exactly |
| 4 | Artifact persistence and session-backed reference loading | HIGH | Spy stores prove writes, reads, failures, and returned refs |
| 5 | Strict receipts, eval failures, unified pricing | MEDIUM-HIGH | Terminal-branch, CLI-exit, and budget parity matrices pass |
| 6 | Agent/crew receipt results | HIGH | Returned evidence and CID relationships pass across success/failure |
| 7 | Live canaries, package validation, docs, and comment hygiene | MEDIUM | Scheduled workflow and release validation pass; no unexplained production comment findings |

## Prior Art and Positioning

| Source | Relevant practice | v1.6 application |
|--------|-------------------|------------------|
| DSSE v1.0 | PAE signs byte sequences for payload type and serialized body; base64 belongs to the envelope | Correct all writers/verifiers and use byte lengths |
| RFC 8785 | Canonical JSON produces a deterministic byte representation | Keep canonical receipt payload bytes stable before signing and hashing |
| Sigstore conformance practice | Independent clients, negative tests, and periodic conformance reduce shared implementation drift | Add an oracle beyond Lattice's TS/Python copies and retain adversarial vectors |
| GitHub Actions secret/event model | Scheduled/manual workflows can use repository secrets, while fork pull requests do not receive ordinary secrets | Keep credentialed provider canaries separate from required fork PR checks |
| Lattice execution-plan model | Inspectability is already a core product promise | Make plan context, persistence, pricing, and receipts authoritative rather than descriptive only |

## Documentation and Hygiene Requirements

The v1.6 migration/reference material should state:

- which receipt versions/profiles are written and accepted,
- how callers detect or reject the legacy verification profile,
- that the compatibility path is read-only and deprecated,
- what context is actually sent, summarized, omitted, or reconstructed from sessions,
- when configured storage writes occur and how failures surface,
- what required receipt mode guarantees,
- eval exit code precedence and atomic baseline behavior,
- price estimate units and unknown/free semantics,
- where iteration, terminal, and crew receipts appear in results, and
- what deterministic conformance and live canaries each cover.

Source comments should retain security boundaries, external protocol quirks, concurrency constraints, and non-obvious rationale. Rewrite or remove comments that mention phases, plans, waves, internal decision IDs, `.planning`, or temporary workflow gates. Exclude generated artifacts and released historical changelogs from destructive cleanup; fix stale `Unreleased` and current documentation claims directly.

## Sources

### Primary External Sources

- [DSSE v1.0 protocol](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md)
- [DSSE v1.0 envelope format](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/envelope.md)
- [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)
- [Sigstore community roadmap](https://github.com/sigstore/community/blob/main/ROADMAP.md)
- [sigstore-go conformance implementation](https://github.com/sigstore/sigstore-go)
- [GitHub Actions workflow events and fork-secret behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

### Repository Evidence

- `packages/lattice/src/receipts/envelope.ts`, `receipt.ts`, and `verify.ts`
- `clients/python/src/lattice_receipt/_core.py`
- `spec/SPEC.md` and `conformance/generate/src/positive.ts`
- `packages/lattice/src/context/context-pack.ts`
- `packages/lattice/src/runtime/create-ai.ts` and `config.ts`
- `packages/lattice/src/storage/storage.ts`
- `packages/lattice-cli/src/eval/runner.ts`, `types.ts`, and `commands/eval.ts`
- `packages/lattice/src/routing/catalog.ts`, `router.ts`, and `contract/preflight.ts`
- `packages/lattice/src/agent/types.ts`, `runtime.ts`, `contract/checkpoint.ts`, and `agent/crew/run-crew.ts`
- `.github/workflows/conformance.yml` and `.github/workflows/registry-drift.yml`

---

*Feature research for Lattice v1.6 Protocol and Runtime Integrity Bridge*
