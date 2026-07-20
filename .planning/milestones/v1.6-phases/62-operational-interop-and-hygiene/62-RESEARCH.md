# Phase 62: Operational Interop and Hygiene - Research

**Researched:** 2026-07-17
**Confidence:** HIGH

## Executive Summary

Phase 62 is the v1.6 release-closure phase. The runtime, receipt bridge, authoritative
state, audit/evaluation/cost controls, and agent evidence paths already exist. What is
missing is independent proof that the published artifacts work outside the workspace,
a bounded live check for three distinct provider protocols, synchronized v1.6 release
documentation, and a durable production-comment standard.

The smallest complete implementation is:

1. turn the existing real-tarball protocol smoke into the authoritative packed
   runtime/CLI consumer and run it on Node 24 LTS and Node 26 Current;
2. add one shared output-token option to the three canary adapters, then run each
   public adapter through a packed `createAI` installation with one request, one
   timeout, one spend bound, and sanitized evidence;
3. add a repository-owned comment-aware scanner with narrow source/exclusion rules,
   then rewrite only workflow-history comments while retaining durable rationale; and
4. advance all runtime, CLI, protocol, migration, compatibility, and version surfaces
   to the truthful v1.6 state after the executable gates pass.

No provider, receipt schema, storage method, retry layer, or new orchestration API is
needed.

## Repository Findings

### Supported Node lines and current metadata disagree

The workspace, runtime package, and CLI package already declare
`engines.node: ">=24"`. Current package metadata and documentation nevertheless retain
a `node20-compatible` modular tier plus a dedicated Node 20 smoke script. Node's
official release table now lists Node 24 as LTS, Node 26 as Current, and Node 20 and 25
as EOL. The v1.6 support claim should therefore be exactly Node 24 and Node 26, without
rewriting historical changelog entries.

The package module metadata can use one current-runtime label for all public facades
and preserve the narrower adapter-specific label where runtime dependencies genuinely
require it. The module-boundary checker and public tests must validate the new label
set rather than merely renaming prose.

### The clean consumer already owns most of OPSVAL-01

`scripts/check-protocol-package-consumer.mjs` already builds and packs both packages,
installs only the resulting tarballs in a temporary ESM project, rejects manifests
that contain workspace references, checks installed realpaths, verifies standard and
legacy receipt fixtures, and invokes the packed CLI. Expanding this script is safer
than introducing a parallel packaging harness.

The expanded consumer should also import representative root and modular entrypoints,
run a real `createAI` call against a deterministic injected provider, issue and verify
a standard receipt under strict legacy rejection, inspect both package versions, and
exercise CLI success and failure behavior. A root `check:packed-consumer` command can
become the descriptive authority while retaining `check:protocol-package` as a
compatibility alias if external automation may call it.

Pull-request CI should run only this bounded packed gate in a Node 24/26 matrix. The
full monorepo suite remains on Node 24, avoiding an unnecessary doubling of the heavy
test graph. Release validation reruns the same packed gate on Node 24 against the
publish candidate; conformance can keep its focused Node 24 invocation.

### The provider adapters need a caller-controlled output ceiling

The public OpenAI-compatible, Anthropic, and Gemini adapters already accept injected
`fetch`, forward `AbortSignal`, normalize provider usage, expose raw-response metadata,
and execute without an application retry loop. Their output ceilings are not suitable
for a bounded canary: OpenAI-compatible sends none, while Anthropic and Gemini hard-code
2000.

Add an exact-optional `maxOutputTokens` setting, validated as a positive integer. Both
streaming and non-streaming builders serialize the same value:

- OpenAI-compatible Chat Completions: `max_tokens`;
- Anthropic Messages: `max_tokens`;
- Gemini `generateContent`: `generationConfig.maxOutputTokens`.

Defaults must preserve existing behavior for ordinary consumers. The canary supplies
16 explicitly and verifies the transmitted request with a local server before any
live workflow is trusted.

### One packed canary runner can prove three native wire families

The canary should build and pack the runtime once, install it in a clean temporary ESM
consumer, and execute a copied consumer module from that directory. The consumer uses
the public provider factory for each family plus `createAI`, required receipt mode, an
in-memory Ed25519 signer/key set, and strict receipt verification. It must not import
workspace source or internal modules.

Each configured family receives a fresh abort deadline and transport counter. Preflight
validates model, credential, pricing, spend ceiling, input ceiling, and output ceiling
before the adapter is constructed. Missing or invalid configuration emits a sanitized
`not-run` record and performs zero network calls. Once a call is attempted, the only
terminal states are `passed` and `failed`.

The actual-cost calculation should use normalized provider usage and configured
per-1K input/output prices. Gemini output accounting must use total minus prompt tokens
when available so hidden/thinking tokens cannot evade the spend assertion. A pass also
requires one transport call, bounded duration and usage, observed model, a request ID
when the family supplies one, and one strict-verifying standard v1.4 receipt. Generated
text is neither asserted nor retained.

### Live workflow safety is configuration, not application behavior

The provider canary belongs in a dedicated workflow with only `schedule` and
`workflow_dispatch`, repository `contents: read`, a protected `provider-canary`
environment, and a concurrency group that allows one in-progress run. It must not run
for pull requests or share release credentials.

Credentials remain environment secrets. Models, base endpoints without query secrets,
prices, and per-run spend ceilings remain repository/environment variables so market
changes do not require code changes. The retained JSON and step summary use an
allowlisted result projection; raw errors, response bodies, prompts, outputs, headers,
keys, URLs, and receipt payloads never cross that boundary. The workflow can upload
the sanitized report with a SHA-pinned artifact action.

### Receipt and cost primitives are already sufficient

Phase 60 established required receipt issuance and the shared cost kernel. Phase 61
attaches the exact terminal agent evidence. The canary should compose those shipped
public surfaces rather than add a canary-only receipt or pricing implementation.

SDK version 1.6.0 remains distinct from receipt payload type
`lattice-receipt/v1.4`. Strict verification means `legacyPolicy: "reject"` at the
canary read boundary; it does not change the repository-wide compatibility default and
does not create another legacy mint path.

### Comment cleanup needs lexical ownership and a zero baseline

The external hygiene audit reports hundreds of phase-, plan-, ticket-, and workflow-
history references in production TypeScript and operational scripts. A raw text search
would also flag string literals, tests, archived planning material, changelogs, and
published specifications, producing pressure for blanket suppression.

The repository scanner should lex JavaScript/TypeScript comments, Python comments, and
YAML comment lines; report deterministic path, line, column, and rule identifiers; and
scan only repository-owned production surfaces:

- `packages/lattice/src` excluding tests and generated source;
- `packages/lattice-cli/src` excluding tests;
- Python client production source;
- `scripts`; and
- `.github/workflows`.

Central exclusions must name their durable reason: tests/fixtures are evidence,
generated files belong to generators, docs/spec/changelogs/planning preserve history,
and vendor/build/cache trees are not owned source. The committed tree must have zero
findings, with no baseline file or directory-wide escape hatch.

Comment rewrites should remove chronology and keep the actual invariant: protocol
canonicalization, secret boundaries, concurrency ownership, provider quirks, backwards
compatibility, and non-obvious failure behavior. Code and tests should remain
behaviorally unchanged during the cleanup task.

### Release surfaces must advance as one unit

The runtime and CLI are currently 1.5.1. Existing release tooling already stamps
package versions, source version modules, lockfile entries, and checks packed version
surfaces. Phase 62 should use those established paths for 1.6.0 and update root/package
READMEs, modular compatibility docs, package changelogs, protocol specification and
changelog, migration guidance, and maintainer canary documentation in the same closure
plan.

Current documentation must describe the v1.6 bridge behavior without depending on
`.planning` files: standard v1.4 issuance, bounded legacy verification, authoritative
runtime state and persistence, strict audit/eval/cost behavior, exact agent/crew
receipt propagation, Node 24/26 packed proof, and the optional live-canary boundary.

## Recommended Architecture

### Packed consumer authority

Extract the existing build/pack/clean-install primitives into one side-effect-free
`scripts/lib/packed-packages.mjs` helper, keep the broad smoke authority in
`check-protocol-package-consumer.mjs`, and expose it as `pnpm
check:packed-consumer`. The provider canary must reuse the same helper. Add a small
operational static test for workflow triggers, matrix lines, release invocation, and
retired Node 20 tokens so CI wiring is executable rather than review-only.

### Canary modules

Use two responsibilities:

- a repository launcher builds/packs/installs and maps environment configuration;
- a consumer module runs only against the installed public package and writes one
  allowlisted JSON report.

Export pure configuration parsing and sanitization helpers from a side-effect-free
module if that makes Node's built-in test runner practical. Test the full packed path
against a local HTTP server for all three protocols, including missing config,
authentication failure, provider failure, timeout, overspend, response sanitization,
and exact request-body caps.

### Comment hygiene gate

Implement one dependency-free Node scanner with a small state machine for line/block
comments and template/string boundaries. Keep scope/exclusion rules in exported data,
test them with temporary fixtures, add `check:comment-hygiene`, and invoke it in CI and
the final local gate.

## Threat Model

| Ref | Threat | Severity | Required mitigation |
|---|---|---:|---|
| T-62-01 | Workspace links make a packed smoke pass without a publishable package | Critical | tarball-only clean install, manifest/realpath assertions, public imports |
| T-62-02 | A declared supported Node line is never exercised | High | explicit Node 24/26 CI matrix over the same packed command |
| T-62-03 | EOL Node compatibility remains an accidental public promise | Medium | remove current metadata/script/docs claims; retain archived history only |
| T-62-04 | Canary retry or a large generation creates unbounded spend | Critical | one transport call, output 16, no retry, timeout, preflight and postflight spend checks |
| T-62-05 | Missing secrets are reported as a successful live validation | High | `not-run` before transport; attempted calls cannot return `not-run` |
| T-62-06 | One gateway falsely represents three provider protocols | High | native public OpenAI-compatible, Anthropic, and Gemini factories/endpoints |
| T-62-07 | Provider credentials, prompts, outputs, or raw errors leak to logs/artifacts | Critical | allowlisted sanitized result schema and sentinel tests |
| T-62-08 | Usage accounting understates actual provider cost | High | normalized actual usage, Gemini total-minus-prompt output, configured pricing, fail closed |
| T-62-09 | Canary receipt checks exercise a legacy or non-public path | High | packed root imports, required standard issuance, strict legacy rejection |
| T-62-10 | Text scanning deletes rationale or flags non-comments | High | comment-aware lexer, narrow production roots, rule diagnostics, behavior tests |
| T-62-11 | Baselines or blanket exclusions hide new workflow narration | High | zero findings and centralized reasoned exclusions only |
| T-62-12 | Version/docs claim closure before executable gates pass | High | docs/version plan depends on packed, canary, and hygiene plans; rerun full release gate |

## Validation Architecture

Use existing Vitest/typecheck/build/tsd infrastructure for package changes and Node's
built-in test runner for operational scripts. No live credential is required for the
deterministic phase gate; a local HTTP server exercises the exact packed provider
request and response paths. The scheduled workflow is separately visible operational
evidence.

Packed feedback:

`pnpm check:packed-consumer && node --test scripts/operational-interop.test.mjs`

Provider feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/providers/adapters.test.ts src/providers/anthropic.test.ts src/providers/gemini.test.ts`

Canary feedback:

`node --test scripts/provider-canary.test.mjs && node scripts/check-workflow-safety.mjs`

Hygiene feedback:

`node --test scripts/check-comment-hygiene.test.mjs && pnpm check:comment-hygiene`

Final gate:

`pnpm typecheck && pnpm lint:packages && pnpm test && pnpm test:types && pnpm build && pnpm check:package-version && pnpm check:tarball && pnpm check:core-boundary && pnpm check:module-boundaries && pnpm check:packed-consumer && pnpm check:comment-hygiene && node scripts/check-workflow-safety.mjs && node --test scripts/operational-interop.test.mjs scripts/provider-canary.test.mjs scripts/check-comment-hygiene.test.mjs`

The Node 26 portion is proven by the CI matrix because the local developer environment
need not install every supported runtime. Workflow static tests must fail if the
matrix or release invocation is removed.

## Planning Implications

Use four plans with no more than two tasks each:

1. establish the Node 24/26 packed-consumer authority and release/CI wiring;
2. add adapter output caps and the bounded packed provider-canary path;
3. add the comment-aware zero-baseline gate and clean production comments; and
4. synchronize v1.6 documentation/version surfaces and run the complete closure gate.

Plan 2 depends on Plan 1's shared packed-package helper. Plan 3 follows both because it
cleans provider and workflow comments they modify. Plan 4 depends on all executable
gates and owns the 1.6.0 advancement.

## Sources

### Repository

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/62-operational-interop-and-hygiene/62-CONTEXT.md`
- `package.json`
- `packages/lattice/package.json`
- `packages/lattice-cli/package.json`
- `scripts/check-protocol-package-consumer.mjs`
- `scripts/check-package-version-surfaces.mjs`
- `scripts/check-lattice-module-boundaries.mjs`
- `scripts/check-workflow-safety.mjs`
- `.github/workflows/{ci,conformance,release}.yml`
- `packages/lattice/src/providers/{adapters,anthropic,gemini}.ts`
- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/routing/cost.ts`
- root, runtime, CLI, modular, protocol, migration, and changelog documentation listed
  in `62-CONTEXT.md`

### External Primary Sources

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Node.js 26.0.0 release](https://nodejs.org/en/blog/release/v26.0.0)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create)
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages)
- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub Actions secrets](https://docs.github.com/en/actions/reference/security/secrets)

---
*Research completed: 2026-07-17*
