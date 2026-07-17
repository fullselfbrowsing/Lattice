# Phase 62 Pattern Map

## Data Flow

The packed runtime/CLI tarballs are the distribution authority. CI and release invoke
one clean-consumer script against those artifacts. The provider canary installs the
same runtime tarball in a separate clean consumer, maps validated environment config
into public adapters, and emits one sanitized result per native wire family. Comment
hygiene scans repository-owned production comments before version/docs closure.

## File Map

| Target | Role | Closest Existing Pattern | Constraint |
|---|---|---|---|
| `scripts/lib/packed-packages.mjs` | Build, pack, and clean-install package artifacts | Helpers currently embedded in the protocol package consumer | Side-effect-free and shared by consumer/canary |
| `scripts/check-protocol-package-consumer.mjs` | Exercise packed runtime/CLI | Existing fixture, realpath, manifest, receipt, and CLI smoke | One smoke authority; no workspace imports |
| `packages/lattice/package.json` | Engine, module compatibility, version, exports | Existing `lattice.modules` inventory | Labels agree with Node 24/26 and boundary tests |
| `.github/workflows/ci.yml` | Node 24/26 packed matrix | Existing SHA-pinned setup actions | Do not duplicate full workspace suite |
| `.github/workflows/release.yml` | Publish-candidate packed validation | Existing Node 24 release validation | Same command as CI before publish |
| `providers/{adapters,anthropic,gemini}.ts` | Serialize explicit output limit | Existing provider options/request builders | Streaming and non-streaming share one cap |
| `scripts/provider-canary*.mjs` | Packed install, preflight, run, sanitize | Existing Node built-in temp/process helpers | Public imports, one call, no raw evidence |
| `.github/workflows/provider-canary.yml` | Scheduled/manual live evidence | Existing least-privilege and SHA-pinned workflow style | No PR trigger; protected environment |
| `scripts/check-comment-hygiene.mjs` | Lex and report production comments | Existing deterministic `check-*` scripts | Comment-aware, zero baseline, narrow exclusions |
| README/spec/migration/changelog surfaces | Explain shipped v1.6 behavior | Existing authored docs and release notes | SDK 1.6.0 remains receipt schema v1.4 |
| version modules/package manifests/lockfile | One release identity | Existing stamp and version-surface checker | Advance together only in closure plan |

## Concrete Analogs

### Real package isolation

`check-protocol-package-consumer.mjs` already validates that installed realpaths are
inside the temporary consumer and packed manifests contain no `workspace:` reference.
Move its generic build/pack/install primitives to a side-effect-free shared helper,
then extend the consumer program without weakening those assertions or running build
output directly from the repository. The canary imports that helper instead of copying
it.

### Provider request construction

Each provider file owns its external wire envelope and usage normalization. Add
`maxOutputTokens` at that boundary, preserve current defaults, and test request JSON
through injected `fetch`. The canary supplies the stricter value but does not mutate
requests after adapter construction.

### Receipt proof

Use the public `createAI` receipt policy and `verifyReceipt(..., {
legacyPolicy: "reject" })` flow already covered by runtime and package consumer tests.
The canary retains only verification status and package/transport metadata, never the
receipt envelope.

### Operational checks

Existing `check-workflow-safety.mjs` demonstrates dependency-free scripts with stable
diagnostics and nonzero failure exits. New canary/hygiene checks should follow that
interface and add Node built-in tests for temporary fixtures and fake servers.

### Version closure

`stamp-package-version.mjs` and `check-package-version-surfaces.mjs` already define the
package/source/packed version relation. Use them for 1.6.0 and update release prose in
the same task; do not invent another version source.

## Test Patterns

- Provider adapter tests capture injected-fetch request bodies and normalized usage.
- The packed consumer creates a temporary ESM project and invokes real package bins.
- Local HTTP servers can represent all three provider protocols without credentials.
- Static workflow tests inspect parsed text for triggers, permissions, matrix values,
  environment, concurrency, and pinned action refs.
- Hygiene tests create temporary TypeScript, Python, and YAML fixtures to separate
  comments from strings and prove deterministic line/rule output.

## Avoid

- Do not run the full workspace suite twice merely to claim Node 26 support.
- Do not use one OpenAI-compatible gateway as evidence for Anthropic or Gemini native
  request shapes.
- Do not infer a canary pass from missing configuration or an empty response.
- Do not write raw caught errors, provider output, URLs, or receipts to retained
  evidence.
- Do not use regex over entire source files as the comment scanner.
- Do not delete protocol/security/concurrency rationale to satisfy the hygiene gate.
- Do not rewrite archived changelog claims or rename receipt schema v1.4 to SDK v1.6.

---
*Mapped: 2026-07-17*
