# Architecture Research

**Domain:** Lattice v1.6 protocol and runtime integrity bridge
**Researched:** 2026-07-16
**Confidence:** HIGH for current-code findings; MEDIUM-HIGH for compatibility defaults pending requirements sign-off

## Standard Architecture

### System Overview

v1.6 should add two explicit integrity boundaries without redesigning the public runtime:

1. A **protocol boundary** that always issues standards-compliant DSSE and isolates legacy verification behind an observable compatibility policy.
2. An **execution boundary** that turns a context plan into provider-visible artifacts before packaging, while owning artifact persistence and session resolution.

```text
Public APIs / CLI
       |
       v
intent -> artifact preparation -> persistence -> routing -> context plan
                                                    |
                                                    v
                                      context materialization
                                      - included current inputs
                                      - stored session inputs
                                      - generated summaries
                                      - omitted/archived excluded
                                                    |
                                                    v
                                      provider packaging -> adapter -> result
                                                    |                    |
                                                    +------ storage -----+
                                                                         |
                                                                         v
                                                            receipt policy
                                                            - off
                                                            - best effort
                                                            - required
                                                                         |
                                                                         v
                                                        standard DSSE issuer

Receipt verification
  decode/schema/canonical/key checks
                    |
                    v
           standard DSSE PAE first
                    |
          explicit bridge policy only
                    v
         quarantined legacy PAE verifier
```

The context plan remains useful audit metadata, but it is not evidence of execution. The materialized artifact set passed to provider packaging is the execution truth.

### Component Responsibilities

| Component | Status | Responsibility | Primary integration points |
|---|---|---|---|
| `receipts/pae.ts` | **New** | Build standard DSSE PAE from raw payload bytes; contain a separately named legacy base64-PAE helper for verification only | Receipt issuer, verifier, conformance generators |
| `receipts/verify.ts` | **Modified** | Verify standard PAE first; invoke legacy verification only under policy; report which profile succeeded | Public `verifyReceipt`, CLI, conformance harnesses |
| `receipts/policy.ts` | **New** | Normalize `off`, `best-effort`, and `required` issuance behavior and emit observable failures | Runtime, agent loop, checkpoints, crew, external audit |
| `context/materialize.ts` | **New** | Resolve the context plan into actual provider-visible artifacts, including stored session content and summaries | Context packer, artifact store, session store, provider packaging |
| Runtime preparation pipeline | **Modified/extracted** | Persist prepared artifacts, route, plan context, materialize it once, then package the authoritative set | `create-ai.ts`, standalone core, fallback attempts |
| Artifact/session stores | **Modified usage** | Persist current, derived, summary, and output artifacts; store references that can later be resolved | `ArtifactStore`, `SessionStore.save/appendTurn` |
| `routing/cost.ts` | **New** | One cost calculation from normalized per-token pricing | Router scoring and contract preflight |
| Agent receipt collector | **New internal** | Associate checkpoint receipts with iterations and mint one terminal result receipt | `agent/runtime.ts`, checkpoint hook, crew runtime |
| CLI eval reporting | **Modified** | Count fixture load failures and map them to exit code 2; prevent partial baseline writes | Eval runner, command, JSON/human reporters |
| Conformance/package/canary workflows | **Modified/new** | Prove standard DSSE independently, verify legacy bridge behavior, exercise packed artifacts, and validate published tarballs | CI, release workflow, scheduled secret-backed canary |

## Recommended Project Structure

```text
packages/lattice/src/
  receipts/
    pae.ts                       # NEW: standard and quarantined legacy PAE
    policy.ts                    # NEW: issuance policy and typed failure
    envelope.ts                  # MODIFY: envelope encoding only
    receipt.ts                   # MODIFY: standard PAE issuance only
    verify.ts                    # MODIFY: standards-first bridge verification
  context/
    context-pack.ts              # KEEP: pure inclusion/summarization plan
    materialize.ts               # NEW: authoritative artifact resolution
  runtime/
    create-ai.ts                 # MODIFY: call shared preparation pipeline
    prepare-run.ts               # NEW/EXTRACT: persist -> route -> plan -> materialize
  routing/
    cost.ts                      # NEW: normalized estimator
    router.ts                    # MODIFY: use shared estimator
  contract/
    preflight.ts                 # MODIFY: preserve public wrapper, use estimator
  agent/
    receipt-collector.ts         # NEW internal
    checkpoint-hook.ts           # MODIFY: callback/policy support
    runtime.ts                   # MODIFY: populate documented receipt fields

packages/lattice-cli/src/
  eval/runner.ts                 # MODIFY: loadFailed summary
  commands/eval.ts               # MODIFY: exit precedence and baseline safety

spec/                            # MODIFY: standards-compliant envelope profile
conformance/vectors/
  standard/                      # NEW current golden vectors
  legacy/                        # NEW frozen compatibility vectors
conformance/{typescript,python}/ # MODIFY: assert verification profile

scripts/
  package-consumer-check.mjs     # NEW: clean tarball consumers
.github/workflows/
  conformance.yml                # MODIFY: independent standard interop
  release-candidate.yml          # NEW reusable deterministic gate
  provider-canary.yml            # NEW scheduled/manual live gate
```

### Structure Rationale

- DSSE encoding and compatibility detection are protocol concerns, not envelope serialization concerns. Separating them prevents an issuer from accidentally calling the legacy algorithm.
- Context selection is a pure planning function; storage resolution and summarization are effectful materialization. Keeping those stages separate makes plan/run drift testable.
- Cost arithmetic should be shared while policy remains local. Routing may tolerate unknown cost while a strict contract rejects it, but both must calculate known cost identically.
- Receipt strictness is a cross-runtime policy. A shared helper prevents the core run, agent loop, checkpoints, and crew path from silently diverging again.

## Architectural Patterns

### Pattern 1: Compatibility at the Verifier Boundary

All v1.6 issuers sign standard DSSE PAE over raw canonical payload bytes and UTF-8 byte lengths. No public or internal option may mint the legacy base64-string PAE.

```ts
type ReceiptVerificationProfile =
  | "dsse-v1"
  | "lattice-legacy-base64-pae";

interface VerifyReceiptOptions {
  legacy?: "accept" | "reject";
}
```

`verifyReceipt(envelope, keySet, options?)` should perform common decode, schema, canonical-payload, and key checks once. It then attempts standard PAE verification. Only a cryptographic mismatch may enter the legacy branch, and only when legacy acceptance is enabled. A successful result reports `verificationProfile`; a legacy success also produces a warning/event.

For the v1.6 bridge, preserve existing callers with `legacy: "accept"` as the temporary default and provide strict rejection for CI, audit, and newly minted receipts. Time-box removal in a future major release using telemetry and vector usage, not heuristic receipt-body detection.

The receipt body schema and CID need not change solely for this correction: the envelope payload remains the same and the CID is derived from payload bytes. The protocol specification must nevertheless identify the signing profile and the bounded legacy bridge.

### Pattern 2: Plan, Materialize, Then Package

`buildContextPack` should remain a deterministic classifier. A new materializer consumes its IDs and returns concrete artifacts:

```ts
interface MaterializedContext {
  artifacts: ArtifactInput[];
  artifactRefs: ArtifactRef[];
  summaryRefs: ArtifactRef[];
  omittedIds: string[];
  warnings: ContextMaterializationWarning[];
}
```

The materializer must:

1. Index persisted current and derived artifacts.
2. Resolve included session artifact/output references through the configured store.
3. Summarize only items classified as `summarized`, persist the resulting artifacts, and include their content.
4. Resolve stored session summaries selected by policy.
5. Stable-deduplicate by artifact ID.
6. Exclude `omitted` and `archived` items by construction.
7. Fail before provider execution when an item declared included cannot be resolved; a warning is insufficient because the plan would misrepresent execution.

Provider adapters continue receiving `ProviderRunRequest.artifacts`, but that field now contains only `MaterializedContext.artifacts`. `contextPack` remains explanatory metadata and must not substitute for content.

Fallback attempts must package the materialized set for the attempted route. If fallback models have different context limits, either plan against the minimum limit in the fallback chain or rematerialize per attempt and record the attempt-specific pack. Reusing a pack that exceeds a fallback model's limit is not valid.

### Pattern 3: Explicit Storage Lifecycle

Configured storage becomes part of the execution contract:

```text
prepared current/tool/transform artifacts
  -> store.put before planning/materialization
  -> session and context use stored refs
  -> generated summary artifacts store.put
  -> provider runs with resolved values
  -> output artifacts store.put
  -> session turn appends stored input/output refs
  -> receipt and plan reflect completed/failed persistence
```

With no configured store, persistence stages are `skipped`, not `completed`. With a configured store, a failed required write produces a typed storage failure. A provider success followed by output persistence failure cannot be represented as an ordinary fully persisted success.

Do not add a required method to `SessionStore`; that would break external implementations. Persist summary updates through existing `load`/`save`, or add only an optional convenience method. Extract the artifact persistence behavior already used by `core/standalone.ts` so standalone and `createAI` cannot diverge.

### Pattern 4: Policy-Driven Receipt Issuance

Add an optional receipt policy while preserving `signer` as shorthand:

| Configuration | Effective behavior |
|---|---|
| no signer | `off` |
| existing `signer` only | `best-effort` |
| `receiptPolicy: "required"` plus signer | required; configuration rejects a missing signer |

Best-effort issuance may omit a receipt, but must emit an observable warning/trace event. Required issuance returns a typed `receipt-issuance-failed` terminal result (or a documented typed exception) and must never return a normal success without a receipt.

The same policy helper must serve `ai.run`, agent completion, checkpoint hooks, crew receipts, and external execution audits. Otherwise strict mode is only nominal.

### Pattern 5: One Estimator, Separate Decisions

Normalize modern per-1k pricing and deprecated per-1M pricing in `routing/cost.ts`; prefer explicit modern fields when both exist. Preserve the public `estimateRouteCost` export as a wrapper.

Unknown pricing remains `null`, distinct from free cost `0`. Router and contract code may apply different rules to `null`, but any known route/input/output tuple must yield the same number in both paths.

### Pattern 6: Aggregate Diagnostics, Strict Exit Status

Eval should continue loading all fixtures so users receive a complete report. Add `summary.loadFailed` and use exit precedence:

```text
one or more load failures -> 2 (invalid evaluation input)
otherwise regression      -> 1
otherwise                 -> 0
```

`--init-baseline` must not write a partial baseline when any fixture fails to load. JSON output can still include the aggregated report before exiting 2.

## Data Flow

### Capability Run

1. Validate intent and prepare declared/tool-derived artifacts.
2. Persist and fingerprint prepared artifacts when storage is configured.
3. Load or create the session and route using declared capability/modality facts.
4. Build the context plan for the selected route budget.
5. Materialize actual context from current values, storage-backed session references, and generated summaries.
6. Package only materialized artifacts for the selected provider; record omitted/archived entries in the plan.
7. Execute the adapter and persist output artifacts.
8. Append stored refs to the session.
9. Create the terminal receipt under the normalized policy using the actual execution lineage.
10. Return a result whose persistence and receipt stages match what occurred.

For receipt compatibility, keep declared source refs visible in the plan. Receipt `inputHashes` should commit to provider-visible materialized inputs; source-to-summary and packaging transforms belong in artifact lineage so the receipt proves the executed request rather than the unexecuted declaration.

### DSSE Issue and Verify

```text
receipt body -> redact -> canonical raw bytes
             -> standard DSSE PAE(payloadType bytes, raw payload bytes)
             -> signer -> envelope(payload = base64(raw bytes))

envelope -> decode raw payload bytes -> common validation
         -> standard PAE verify -> success(profile=dsse-v1)
         -> [policy permits + signature mismatch only]
              legacy base64-PAE verify
              -> success(profile=legacy, warning)
```

### Agent Run

The auto-registered checkpoint hook should expose an additive `onReceipt` callback. An internal collector attaches successful checkpoint envelopes to the matching `IterationRecord.receipt`. At terminal success or failure, the agent mints a distinct cumulative receipt and assigns the already-documented `AgentSuccess.receipt` or `AgentFailure.receipt`.

The terminal receipt is not an alias for the final step receipt: it covers cumulative usage, terminal verdict, output hashes, and full lineage. Crew execution should consume member result receipts rather than mint duplicate completion envelopes; parent CID context should be passed into the member run.

## Public API Compatibility

| Surface | v1.6 treatment |
|---|---|
| `createReceipt`, `ReceiptEnvelope` | Same signature/wire fields; corrected standard signature bytes |
| `verifyReceipt` | Add optional options argument and additive verification-profile success field |
| Existing legacy receipts | Accepted by temporary default bridge, observable, rejectable in strict mode |
| `LatticeConfig.signer` | Preserved as best-effort shorthand; new receipt policy is additive |
| `ArtifactStore` / `SessionStore` | No new required interface members |
| `ProviderRunRequest` | Same shape; `artifacts` semantics become authoritative by fixing behavior |
| `AgentSuccess.receipt`, `AgentFailure.receipt`, iteration receipt | Existing optional fields are populated; no type removal |
| `estimateRouteCost` | Existing export preserved through shared implementation |
| Eval report | Additive `loadFailed`; exit 2 on invalid inputs is intentional CLI behavior correction |

## Migration Boundaries

### DSSE Vectors and Independent Interop

- Freeze existing v1.1-v1.3 vectors under `conformance/vectors/legacy`; do not silently regenerate them.
- Generate new standard vectors from the corrected issuer and identify expected verification profile in manifests.
- Make strict conformance reject legacy signatures for newly generated artifacts.
- Keep bridge tests proving frozen legacy vectors still verify only when enabled.
- Add at least one verifier/minter that does not import Lattice's TypeScript PAE helper. Cross-mint and cross-verify both directions against a standards-compliant DSSE implementation or independently written harness.
- Update TypeScript, Python, schemas, generator scripts, protocol specification, and conformance CI in one protocol phase. A partial migration would create mutually unverifiable receipts.

### Context and Storage

- Introduce materialization behind existing runtime APIs; do not ask provider adapters to independently interpret session refs or omissions.
- Do not mark a summarized item as included unless a concrete summary artifact exists.
- Do not silently drop an included but unavailable stored ref.
- Keep `ai.plan()` and `ai.run()` on one preparation pipeline. Because planning already invokes tools/summarizers/session creation, either document storage writes during planning or add an explicit dry-run mode later; duplicating the pipeline is worse than the side effect.

## Testing Strategy

| Boundary | Required tests |
|---|---|
| Standard DSSE | Golden PAE bytes, UTF-8 byte lengths, standard TS/Python cross-verification, tamper/key/canonical failures |
| Legacy bridge | Standards-first behavior, explicit accept/reject, reported legacy profile, no legacy mint path |
| Context authority | Fake provider captures included current/session/summary content; omitted and archived IDs are absent |
| Storage lifecycle | Spy store verifies write order and stored session refs; missing refs and input/summary/output write failures are explicit |
| Provider parity | First-party adapters receive the same authoritative artifact set before provider-specific packaging |
| Plan/run consistency | Stable context membership and lineage for equivalent plan/run preparation |
| Receipt policy | Best-effort warning, required-mode terminal failure, no success without required receipt |
| Cost consistency | Per-1k, per-1M, precedence, partial/unknown/free pricing produce identical router/preflight estimates |
| Agent receipts | Iteration and terminal receipts verify; terminal receipt has cumulative usage/output/verdict; crews do not duplicate |
| Eval exits | Mixed valid/load-failed fixtures report all failures and exit 2; baseline file remains untouched |
| Package gates | Clean Node 20 and Node 24 tarball consumers import public subpaths and execute mint/verify/runtime/CLI smoke tests |

## Build Order

1. **Lock regressions and protocol contract.** Add failing DSSE, context-authority, storage, cost, eval, and agent-result tests against the reconciled `origin/main` tree.
2. **Correct DSSE end-to-end.** Implement standard PAE, explicit legacy verification, spec/schema/vector/Python updates, and independent interop before producing more receipts elsewhere.
3. **Unify cost estimation.** Small isolated change that removes router/contract disagreement and stabilizes budget tests.
4. **Build the shared preparation boundary.** Persist artifacts, plan context, materialize it, and feed only the materialized set to packaging; then persist outputs/session refs.
5. **Add receipt policy.** Centralize off/best-effort/required semantics over the corrected issuer and integrate core runs/checkpoints/audits.
6. **Complete agent result receipts.** Collect iteration receipts, mint terminal receipts, and remove duplicate crew completion paths.
7. **Correct eval exit behavior.** Add load-failure accounting and atomic baseline initialization.
8. **Harden delivery gates.** Run deterministic conformance and clean-package consumers before release; add scheduled/manual real-provider canaries; finish docs and durable comment-hygiene checks.

This order places protocol and execution truth beneath every later audit feature. Cost and eval work can proceed in parallel after the protocol contract is fixed.

## Delivery Gates

### Pull Request Gate

- Build, typecheck, unit/integration tests, type tests, lint, `publint`, and `@arethetypeswrong/cli`.
- Standard and legacy conformance on every relevant protocol/runtime/CLI change, not only vector-directory changes.
- Pack real tarballs and install them into clean Node 20 and Node 24 consumers; tests must use package exports, never workspace source imports.
- Exercise root and modular exports, standard mint/verify, strict legacy rejection, one storage/context run, and CLI eval exit codes.

### Release Gate

The release job must depend on or rerun the exact-commit deterministic gate. It must not publish after build/lint/version checks alone. Conformance manifests, clean tarball consumers, package metadata checks, and protocol smoke tests must all pass for the publish candidate.

### Real-Provider Canary

Use a scheduled/manual, secret-backed workflow rather than a required PR job. Keep prompts and budgets minimal and bound retries/concurrency. For each supported credential, assert successful transport/stream or structured result, provider usage/model metadata, standard-profile receipt verification, and contract limits. Record the exact commit and package candidate; do not let a canary silently test workspace source while release publishes a tarball.

## Anti-Patterns

- **Dual-mode issuance:** new signers that choose standard or legacy perpetuate the migration indefinitely.
- **Silent verifier fallback:** legacy acceptance without a reported profile makes deprecation immeasurable.
- **Metadata-only context packing:** sending all artifacts while recording omissions is an integrity defect, not a harmless optimization.
- **Adapter-specific context resolution:** seven implementations will drift and make receipts incomparable.
- **Ephemeral session refs:** recording IDs without a resolvable store value creates sessions that cannot continue.
- **Required-but-best-effort receipts:** swallowing signer errors under a strict policy invalidates the audit promise.
- **Duplicated price math:** shared pricing types do not guarantee shared semantics.
- **Partial eval baselines:** skipping malformed fixtures can bless an incomplete baseline.
- **Source-only package tests:** they cannot validate exports, declarations, bundled files, or installation constraints.

## Scaling Considerations

| Concern | Current milestone design | Later pressure point |
|---|---|---|
| Artifact count/size | Stream/load only selected artifacts; stable-dedupe by ID | Batched store reads and streaming transforms |
| Session history | Context plan archives old turns; materializer resolves selected refs | Incremental durable summaries and indexed stores |
| Receipt verification volume | Shared parsing plus one standard attempt; legacy retry only on signature mismatch | Cache key resolution and remove legacy branch |
| Provider fallback | Attempt-specific packaging and recorded context pack | Precomputed compatible packs by model family |
| CI cost | Deterministic local gates on every PR; live canaries scheduled/manual | Credential matrix and release promotion environments |

## Integration Points

### Internal

- `runtime/create-ai.ts` is the central integration point for preparation, materialization, packaging, persistence, session updates, and terminal issuance.
- `core/standalone.ts` supplies the existing artifact-persistence precedent and should share helpers with the main runtime.
- `providers/packaging.ts` must receive the materialized artifact set; provider adapters remain transport-specific.
- `agent/runtime.ts`, checkpoint hooks, and crew runtime must share receipt policy and parent-CID context.
- The CLI eval runner owns classification; the command owns process exit behavior and baseline write atomicity.

### External

- Receipt signers/KMS continue signing provided bytes; those bytes become standards-compliant PAE without a signer API change.
- Python clients and independent harnesses must migrate in the same DSSE phase.
- External artifact/session stores retain their existing interfaces but now observe the documented lifecycle.
- GitHub Actions release permissions and provider secrets remain isolated from PR workflows.

## Sources

### Current code and planning

- `.planning/PROJECT.md` - v1.6 milestone goal and target corrections
- `packages/lattice/src/receipts/{envelope,receipt,verify}.ts` - current base64-string PAE and verification flow
- `clients/python/src/lattice_receipt/_core.py` - matching legacy Python algorithm
- `spec/SPEC.md`, `spec/generate-vector0.ts`, `conformance/` - protocol contract and vectors
- `packages/lattice/src/runtime/{config,create-ai}.ts` - normalized storage, context planning, provider request construction, best-effort receipt handling
- `packages/lattice/src/context/context-pack.ts` - planning-only context classification
- `packages/lattice/src/storage/storage.ts`, `packages/lattice/src/core/standalone.ts` - store contract and existing persistence behavior
- `packages/lattice/src/sessions/session.ts` - reference-only session turns and summary model
- `packages/lattice/src/providers/{provider,packaging}.ts` - provider request and packaging boundary
- `packages/lattice/src/routing/router.ts`, `packages/lattice/src/contract/preflight.ts` - divergent cost estimators
- `packages/lattice/src/agent/{types,runtime}.ts` - documented but unpopulated result receipt fields
- `packages/lattice-cli/src/eval/runner.ts`, `packages/lattice-cli/src/commands/eval.ts` - load-failed verdict and current exit semantics
- `.github/workflows/{ci,conformance,release}.yml` - current deterministic and publish gates

### Protocol references

- DSSE protocol: https://github.com/secure-systems-lab/dsse/blob/master/protocol.md
- In-toto attestation framework: https://github.com/in-toto/attestation

---
*Architecture research for Lattice v1.6 Protocol and Runtime Integrity Bridge.*
