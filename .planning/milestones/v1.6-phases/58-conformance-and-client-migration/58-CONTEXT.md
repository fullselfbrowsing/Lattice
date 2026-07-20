# Phase 58: Conformance and Client Migration - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Mode:** Autonomous discussion - approved milestone defaults

<domain>
## Phase Boundary

Move the public receipt specification, schemas, examples, conformance corpora,
TypeScript and Python harnesses, CLI entrypoints, package-consumer checks, and CI
to the corrected v1.4 DSSE profile as one interoperable surface. Historical
receipts remain readable only through the bounded bridge established in Phase 57.
This phase does not change production signing semantics or remove compatibility.

</domain>

<decisions>
## Implementation Decisions

### Vector Corpus Boundary
- **D-01:** Preserve the existing legacy vector JSON bytes unchanged under an explicitly labeled `conformance/vectors/legacy/` tree. A dedicated legacy manifest must prove that the historical corpus did not change during the move.
- **D-02:** Generate corrected vectors under a separate `conformance/vectors/standard/` tree with distinct positive and adversarial-negative corpora. Standard vectors must identify the expected signature profile without relying on directory inference alone.
- **D-03:** The standard positive corpus must exercise representative v1.4 bodies, including Unicode/redaction content, a minimal body shape, and lineage or agent fields. The negative corpus must independently exercise profile, PAE, signature, base64, key, canonicalization, and version failures.
- **D-04:** The aggregate manifest must cover every tracked vector JSON file and reject unlisted files. Generated standard artifacts are checked by regeneration into a temporary location followed by a byte-for-byte diff; normal tests must never rewrite committed goldens.

### CLI Migration Policy
- **D-05:** `lattice verify` and `lattice repro` retain the v1.6 bridge default of allowing historical receipts, but both gain an explicit `--standard-only` mode that maps to the verifier's reject policy.
- **D-06:** Successful CLI verification and replay always report `profile=<verification profile>` and `deprecated=<true|false>` so compatibility acceptance is observable without parsing prose.
- **D-07:** Replay applies one consistent verification policy before materialization and during any materializer verification. A strict legacy rejection uses the existing typed `legacy-profile-rejected` verdict and preserves each command's established exit-code class.

### Independent Interoperability Proof
- **D-08:** Pin `securesystemslib==1.4.0` only in the Python test extra. It must not become a Python runtime dependency or a JavaScript package dependency.
- **D-09:** The oracle check compares PAE bytes and independently verifies standard-vector Ed25519 signatures. Lattice remains responsible for schema, key-state, and bridge policy semantics; the oracle is not used to duplicate those product rules.
- **D-10:** TypeScript and Python must each mint a standard-profile receipt that the other language verifies. Cross-language checks must assert body bytes, profile, CID, and verdict rather than accepting a boolean-only success.

### Specification and Delivery Gates
- **D-11:** Add the normative v1.4 schema and update the specification's signing and verification algorithms, error taxonomy, profile policy, and examples so an implementer does not need production source. Historical framing belongs in a migration appendix, not the primary worked example.
- **D-12:** Add a focused v1.4 migration guide covering library and CLI defaults, strict operation, result fields, legacy deprecation, vector layout, and the absence of a legacy signing path.
- **D-13:** Conformance CI must fail on stale aggregate or legacy manifests, generated-artifact drift, TypeScript/Python drift, independent-oracle failure, and clean packed runtime or CLI consumer incompatibility.
- **D-14:** The packed smoke in this phase covers standard mint/verify plus CLI profile and standard-only behavior. The broader Node-version and provider-wire compatibility matrix remains Phase 62 scope.

### the agent's Discretion
- Exact vector counts, fixture names, generator module boundaries, and test-file layout are implementation details, provided every required semantic axis is independently covered.
- The agent may extend the existing package-surface smoke script or add a focused conformance consumer script, whichever gives the clearest deterministic CI failure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/ROADMAP.md` - Phase 58 goal, dependencies, success criteria, and Phase 62 boundary.
- `.planning/REQUIREMENTS.md` - Normative `CONF16-01` through `CONF16-06` requirements.
- `.planning/research/SUMMARY.md` - Milestone synthesis and recommended sequencing.
- `.planning/research/STACK.md` - Test-only oracle version and dependency constraints.
- `.planning/research/FEATURES.md` - Required conformance and migration behavior.
- `.planning/research/ARCHITECTURE.md` - Cross-language boundary and atomic migration design.
- `.planning/research/PITFALLS.md` - Downgrade, vector mutation, manifest, and oracle hazards.

### Phase 57 Protocol Contract
- `.planning/phases/57-protocol-semantics/57-CONTEXT.md` - Locked v1.4 profile and bounded legacy policy.
- `.planning/phases/57-protocol-semantics/57-RESEARCH.md` - DSSE and codebase findings used by the implementation.
- `.planning/phases/57-protocol-semantics/57-01-SUMMARY.md` - TypeScript protocol implementation.
- `.planning/phases/57-protocol-semantics/57-02-SUMMARY.md` - Python parity implementation.
- `.planning/phases/57-protocol-semantics/57-VERIFICATION.md` - Verified Phase 57 guarantees and evidence.

### Current Specification and Conformance Surface
- `spec/SPEC.md` - Existing normative receipt document requiring v1.4 migration.
- `spec/CHANGELOG.md` - Protocol change history to extend for v1.4.
- `spec/schema/v1.1.json` - First historical schema.
- `spec/schema/v1.2.json` - Historical lineage schema.
- `spec/schema/v1.3.json` - Historical agent schema.
- `conformance/generate/src/main.ts` - Existing generator entrypoint with obsolete historical framing.
- `conformance/verify-ts/src/positive.test.ts` - Existing TypeScript positive-corpus harness.
- `conformance/vectors/MANIFEST.sha256` - Current flat-corpus integrity manifest.
- `conformance/vector0-fixture.json` - Existing historical worked fixture.

### Language, CLI, and CI Integration
- `packages/lattice/src/receipts/envelope.ts` - Standard PAE and envelope helpers.
- `packages/lattice/src/receipts/verify.ts` - TypeScript profile policy and typed results.
- `clients/python/src/lattice_receipt/_core.py` - Python mint, verify, and profile bridge.
- `clients/python/pyproject.toml` - Python test-extra dependency boundary.
- `packages/lattice-cli/src/commands/verify.ts` - CLI verification policy and output.
- `packages/lattice-cli/src/commands/repro.ts` - CLI replay verification policy and summary.
- `packages/lattice/src/replay/materialize.ts` - Replay materializer verification integration.
- `.github/workflows/conformance.yml` - Conformance CI entrypoint and path filters.
- `scripts/check-package-version-surfaces.mjs` - Existing packed runtime and CLI smoke foundation.

### External Standards
- `https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md` - DSSE v1.0 PAE and signing protocol.
- `https://github.com/secure-systems-lab/securesystemslib/blob/v1.4.0/securesystemslib/dsse.py` - Exact independent oracle implementation.
- `https://pypi.org/project/securesystemslib/1.4.0/` - Exact oracle release and Python compatibility metadata.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Standard TypeScript and Python issuance and verification from Phase 57 already provide the protocol behavior that conformance must expose.
- Existing vector generators, language harnesses, cross-mint tests, and SHA-256 manifest checks provide a migration base rather than requiring a new framework.
- Existing package tarball smoke infrastructure already installs the runtime and CLI as external consumers.

### Established Patterns
- Receipt payloads use RFC 8785 canonical JSON, standard base64 transport, payload-byte CIDs, typed non-throwing verification results, and signed-body key cross-checks.
- Corrected writes are v1.4-only while direct compatibility entrypoints default to `allow`; strict consumers opt into `reject`.
- GitHub Actions are SHA-pinned, and conformance fixtures are intended to be deterministic committed evidence.

### Integration Points
- The schema, generator, corpora, and manifest layout must change atomically so no harness consumes an ambiguous mixture.
- CLI policy must be threaded through replay materialization rather than applied only to display logic.
- Python's test extra, TypeScript and Python harnesses, cross-mint scripts, packed smoke, and the conformance workflow form one release gate.

</code_context>

<specifics>
## Specific Ideas

The approved v1.6 posture is a bridge: corrected issuance is mandatory, historical
verification is explicit and visible, and strict consumers can reject it today.
Independent reproducibility is the deciding standard for this phase; production
source must not be the only explanation of protocol behavior.

</specifics>

<deferred>
## Deferred Ideas

- Changing the direct-library default from `allow` to `reject`, or removing historical verification, requires a later deprecation milestone with measured adoption evidence.
- Broad Node-version, provider-wire-family, documentation-hygiene, and production-comment checks remain Phase 62 scope.

</deferred>

---

*Phase: 58-conformance-and-client-migration*
*Context gathered: 2026-07-16*
