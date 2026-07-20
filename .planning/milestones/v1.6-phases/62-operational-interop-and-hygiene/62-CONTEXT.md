# Phase 62: Operational Interop and Hygiene - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning
**Mode:** Autonomous discussion - approved milestone defaults

<domain>
## Phase Boundary

Close v1.6 as a releaseable product: prove the real runtime and CLI tarballs on
every currently supported Node line, exercise three distinct live provider wire
families through the packed public runtime under hard operational limits, align
all shipped and migration documentation with the completed bridge behavior, and
replace workflow-history commentary in production surfaces with durable technical
rationale. This phase does not add providers, storage backends, orchestration
features, or broad live modality coverage.

</domain>

<decisions>
## Implementation Decisions

### Supported Node and Packed Consumers

- **D-62-01:** The v1.6 package support matrix is Node 24 LTS and Node 26 Current. Both satisfy the declared `engines.node: ">=24"`; Node 25 and Node 20 are EOL and are not support targets.
- **D-62-02:** Retire the package metadata, scripts, and current documentation that advertise a special Node 20 modular-facade tier. Historical changelog entries remain untouched.
- **D-62-03:** The interoperability authority is a clean ESM consumer that builds and packs the real runtime and CLI, installs only those tarballs, proves installed paths and manifests do not resolve to the workspace, and exercises public root, modular, receipt, runtime, and CLI behavior.
- **D-62-04:** Pull-request CI runs that packed consumer in a Node 24/26 matrix. Release validation reruns the same script against the publish candidate on Node 24; conformance may retain its focused Node 24 lane.

### Provider Canary Contract

- **D-62-05:** Live canaries run only from a dedicated `schedule`/`workflow_dispatch` workflow with read-only repository permission, one protected environment, one in-progress run, and no pull-request trigger.
- **D-62-06:** One packed runtime installation exercises three native families: OpenAI-compatible Chat Completions, Anthropic Messages, and Gemini `generateContent`. Each family uses its actual public provider factory and one `createAI` run; one gateway must not impersonate all three families.
- **D-62-07:** Add an optional positive-integer `maxOutputTokens` provider setting where needed so the shipped adapters themselves serialize the canary cap as `max_tokens` for OpenAI-compatible, `max_tokens` for Anthropic, and `generationConfig.maxOutputTokens` for Gemini. Streaming and non-streaming request builders use the same cap.
- **D-62-08:** Each configured family permits exactly one provider request, at most 16 generated tokens, no execution retry, a 20-second timeout, a fixed benign artifact-free prompt, a conservative input-token ceiling, and a configured per-run spend ceiling no greater than the repository-wide canary maximum.
- **D-62-09:** Pricing and model identifiers are explicit workflow variables rather than hard-coded floating market assumptions. Credentials are environment secrets. Missing or invalid required configuration produces `not-run` before network access; an attempted call produces either `passed` or `failed`.
- **D-62-10:** A passing canary requires bounded actual usage/cost, an observed model, a provider/request identifier where the family returns one, a standard-profile v1.4 receipt that verifies under strict legacy rejection, and exactly one transport call. It never asserts generated prose.
- **D-62-11:** Logs, step summaries, and retained JSON artifacts contain only provider family, configured model identifier, observed model, request identifier, status/code, bounded usage/cost/duration, package version, commit, and limits. They never contain credentials, base URLs with query keys, request headers, prompts, outputs, receipt payloads, or raw provider errors.

### Release Documentation

- **D-62-12:** Root and package READMEs describe the same Node support, v1.6 public surfaces, receipt bridge, authoritative context/persistence, strict audit/eval/cost behavior, agent/crew receipt attachment, packed-consumer gate, and live-canary boundary.
- **D-62-13:** Protocol specification/changelog and migration material continue to distinguish SDK v1.6 from receipt schema `lattice-receipt/v1.4`; no document may imply a new legacy mint path or a universal strict-read default.
- **D-62-14:** Runtime and CLI package versions, stamped version modules, lockfile, package changelogs, root version surfaces, compatibility metadata, and release notes advance together to `1.6.0` only after the executable closure gates pass.
- **D-62-15:** Canary configuration and result semantics are documented for maintainers without documenting secret values. Current docs may link archived history but must not depend on `.planning` artifacts to explain public behavior.

### Production Comment Hygiene

- **D-62-16:** Production comments explain stable protocol constraints, security and privacy boundaries, concurrency behavior, compatibility contracts, external API quirks, or non-obvious invariants. Phase/plan/milestone chronology, decision IDs, temporary task names, review history, and planning-file references are removed or rewritten.
- **D-62-17:** A repository-owned comment-aware scanner covers runtime and CLI production source, Python client production source, operational scripts, and GitHub workflows. It scans comments rather than arbitrary strings and emits deterministic file/line/rule diagnostics.
- **D-62-18:** Scanner exclusions are narrow, centralized, and documented with reasons: tests and fixtures are non-production evidence; generated source must be fixed at its generator; docs/changelogs/spec and `.planning` preserve published or archived history; vendored/build/cache directories are outside repository-owned source.
- **D-62-19:** The CI hygiene gate must be clean with no unexplained baseline or blanket suppression. Existing durable comments are retained even when nearby workflow narration is removed.

### The agent's Discretion

- Exact canary script/module split, JSON schema names, workflow cadence within scheduled/manual-only policy, and whether sanitized evidence is uploaded compressed or directly.
- Exact compatibility label spelling after removing `node20-compatible`, provided package metadata and docs agree with `engines >=24` and the Node 24/26 matrix.
- Exact comment lexer implementation and forbidden-token table, provided strings and archived history do not create false positives and every exclusion has a durable reason.
- Exact documentation section order and examples, provided every public claim is verified against exported types and executable behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract

- `.planning/ROADMAP.md` - Phase 62 goal, dependency, and five success criteria.
- `.planning/REQUIREMENTS.md` - Normative `OPSVAL-01` through `OPSVAL-03`, `DOC16-01`, and `HYGIENE-01` through `HYGIENE-02` requirements.
- `.planning/research/ARCHITECTURE.md` - Packed public entrypoint, release-gate, and live-canary architecture.
- `.planning/research/FEATURES.md` - Independent/live validation boundary plus documentation and comment-hygiene requirements.
- `.planning/research/PITFALLS.md` - Secret, cost, false-skip, provider-drift, and destructive-comment-cleanup hazards.
- `.planning/phases/59-authoritative-runtime-state/59-CONTEXT.md` - Authoritative context and persistence behavior that documentation and canaries must describe.
- `.planning/phases/60-audit-evaluation-and-cost-integrity/60-CONTEXT.md` - Receipt mode, eval exit, and cost semantics that documentation and canaries must preserve.
- `.planning/phases/61-agent-receipt-closure/61-CONTEXT.md` - Agent/crew result evidence and compatibility behavior that documentation must expose.

### Package and Release Gates

- `package.json` - Workspace engine and executable gate commands.
- `packages/lattice/package.json` - Runtime engine, exports, compatibility metadata, version, and package scripts.
- `packages/lattice-cli/package.json` - CLI engine, binary, dependency, version, and package scripts.
- `scripts/check-protocol-package-consumer.mjs` - Existing real-tarball runtime/CLI consumer and protocol smoke.
- `scripts/check-package-version-surfaces.mjs` - Packed version-surface authority.
- `.github/workflows/ci.yml` - Required pull-request and mainline gate.
- `.github/workflows/conformance.yml` - Existing independent protocol and packed consumer lane.
- `.github/workflows/release.yml` - Publish-candidate validation and least-privilege release jobs.

### Provider Wire Families

- `packages/lattice/src/providers/adapters.ts` - OpenAI-compatible Chat Completions factory and request/usage normalization.
- `packages/lattice/src/providers/anthropic.ts` - Native Messages request, usage, streaming, and authentication shape.
- `packages/lattice/src/providers/gemini.ts` - Native `generateContent` request, usage, streaming, and authentication shape.
- `packages/lattice/src/runtime/create-ai.ts` - Public runtime signal, receipt policy, routing, and result boundary used by canaries.
- `packages/lattice/src/routing/cost.ts` - Shared pre/post cost calculation and zero-versus-unknown semantics.

### Public Documentation

- `README.md` - Root installation, runtime, modular adoption, agent, CLI, and validation claims.
- `packages/lattice/README.md` - Shipped runtime package documentation.
- `packages/lattice-cli/README.md` - Shipped CLI package documentation.
- `docs/modular-entrypoints.md` - Compatibility metadata and modular boundary claims.
- `spec/SPEC.md` - Normative receipt schema/signing/verification behavior.
- `spec/CHANGELOG.md` - Receipt protocol release history.
- `spec/MIGRATION-v1.4.md` - Standard DSSE issuance and bounded legacy-read bridge.
- `packages/lattice/CHANGELOG.md` - Runtime release notes.
- `packages/lattice-cli/CHANGELOG.md` - CLI release notes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `check-protocol-package-consumer.mjs` already packs both packages, creates an isolated ESM project, rejects workspace references, and runs standard/legacy receipt plus CLI verification smokes.
- All three provider adapters already accept injected `fetch`, propagate `AbortSignal`, normalize usage and cost, expose raw response metadata, and share public factory exports suitable for a real packed canary.
- `createAI`, required receipt mode, in-memory signing/key sets, strict `verifyReceipt`, and the shared cost kernel provide the complete canary evidence path without another dependency.
- Existing SHA-pinned workflow actions and workflow-safety checks provide the repository's CI security pattern.

### Established Patterns

- Package/public changes are additive where compatibility permits, with exact-optional TypeScript contracts and focused request-body tests.
- Release validation packs artifacts and inspects manifests instead of trusting workspace builds.
- Provider adapters use direct Web `fetch`, normalize usage, accept static pricing, and keep credentials out of thrown public diagnostics.
- Operational scripts use Node built-ins, temporary directories, deterministic JSON output, and explicit nonzero exits.

### Integration Points

- CI currently tests only Node 24; the packed consumer can become a separate Node 24/26 matrix without multiplying the full workspace suite.
- Release currently validates build/lint/version surfaces but does not rerun the clean consumer script.
- OpenAI-compatible requests have no output token field, while Anthropic and Gemini hard-code 2000; those request builders are the token-limit integration point.
- Package metadata and current docs still advertise Node 20 facade compatibility despite package engines `>=24` and Node 20 EOL.
- The external hygiene skill reports hundreds of production findings concentrated in provider, capability, agent, runtime, and CLI comments, so cleanup must operate by comment block and preserve technical rationale.

</code_context>

<specifics>
## Specific Ideas

The live workflow is evidence, not a deterministic test replacement. A repository
with no configured provider environment should produce three visible `not-run`
records, while a provider outage should fail only attempted families with bounded,
sanitized diagnostics. The same packed package candidate used by the canary should
be the one whose public imports and version are reported.

</specifics>

<deferred>
## Deferred Ideas

- Additional providers, models, modalities, streaming modes, and tool calls remain `CANARY-F01` future work.
- Supporting Node 22 would require a deliberate package-engine and public-runtime compatibility project.
- Removing historical receipt verification remains a future major-version migration after measured compatibility use.
- PyPI publication and new storage backends remain outside v1.6.

</deferred>

---

*Phase: 62-operational-interop-and-hygiene*
*Context gathered: 2026-07-17*
