---
phase: 41
slug: gateway-delegation-litellm-gateway-policy
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-15
---

# Phase 41 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Lattice runtime to OpenAI-compatible gateway | `createLiteLLMProvider` sends Lattice-packaged requests to a caller-provided LiteLLM/OpenAI-compatible HTTP endpoint. | Task text, packaged artifact metadata, output names, optional gateway metadata, optional bearer API key in header only. |
| Gateway policy to provider request body | Typed `PolicySpec.gateway` and provider gateway defaults are normalized into request-body `metadata`. | Route tags, provider preferences, non-secret JSON-like metadata, and explicit `allowFallbacks`. |
| Provider response to Lattice plan/events | Gateway response metadata is normalized into provider response metadata, plan metadata, run events, and attempt records. | Requested model, observed model, sanitized gateway policy, usage. |
| Public package root | Phase 41 adds new package-root value and type exports. | Public API names, public type declarations, changeset. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-41-01 | Tampering / supply chain | LiteLLM provider helper | mitigate | `createLiteLLMProvider` delegates to `createOpenAICompatibleProvider` and adds no package dependency; `check-core-package-boundary` passed. | closed |
| T-41-02 | Information disclosure | Gateway metadata request body | mitigate | `GatewayPolicy.metadata` is JSON-like only, no header field exists, and provider metadata sanitizers drop secret-shaped keys and `sk-` values before request serialization. | closed |
| T-41-03 | Integrity / replayability | Gateway fallback hint | mitigate | LiteLLM defaults `gateway.allowFallbacks` to false and serializes the setting only as explicit gateway metadata. | closed |
| T-41-04 | Repudiation / audit noise | Capability negotiation events | mitigate | LiteLLM negotiation is registry-only with source `registry`; tests verify it does not call fetch. | closed |
| T-41-05 | Integrity | Deterministic route model | mitigate | Observed gateway response model is recorded as `gateway.observedModel`; `route.selected.modelId` and receipt `route.modelId` remain the Lattice-selected model. | closed |
| T-41-06 | Integrity | Lattice fallback chain | mitigate | Runtime and planning tests prove `policy.gateway.allowFallbacks` does not add Lattice fallback routes. | closed |
| T-41-07 | Information disclosure | Plan/event gateway metadata | mitigate | Runtime sanitizers drop secret-shaped metadata before plan/event emission; tests assert plan metadata and events do not contain `sk-`. | closed |
| T-41-08 | Availability / compatibility | `provider.attempt` success event | mitigate | The success event is additive on the existing event kind and preserves existing start/failure semantics; runtime, planning, and full package tests passed. | closed |
| T-41-09 | Tampering / API integrity | Package-root public exports | mitigate | `EXPECTED_PUBLIC_VALUE_EXPORTS` includes `createLiteLLMProvider`, and package-root tsd tests cover LiteLLM and gateway types. | closed |
| T-41-10 | Integrity | Provider parity guardrails | mitigate | LiteLLM participates in provider, sanitizer, and tool-call validation parity matrices. | closed |
| T-41-11 | Repudiation / release hygiene | Release note | mitigate | `.changeset/litellm-gateway-policy.md` documents the public helper and gateway policy addition. | closed |
| T-41-12 | Tampering / supply chain | Optional gateway dependency boundary | mitigate | Manifest/lockfile search found no LiteLLM package dependency, and `node scripts/check-core-package-boundary.mjs` passed. | closed |

*Status: open - closed*
*Disposition: mitigate (implementation required) - accept (documented risk) - transfer (third-party)*

---

## Evidence

| Threat Ref | Evidence |
|------------|----------|
| T-41-01, T-41-12 | `packages/lattice/src/providers/litellm.ts` lines 39-44 delegate to `createOpenAICompatibleProvider`; manifest/lockfile search found no `litellm`; `node scripts/check-core-package-boundary.mjs` passed. |
| T-41-02 | `packages/lattice/src/policy/policy.ts` lines 1-13 define JSON-like gateway metadata; `packages/lattice/src/providers/adapters.ts` lines 119-152 sanitize secret keys and `sk-` values; `litellm.test.ts` lines 80-89 assert API key stays out of metadata. |
| T-41-03 | `packages/lattice/src/providers/litellm.ts` lines 34-37 default `allowFallbacks` to false; `litellm.test.ts` lines 148-156 asserts request metadata includes `allow_fallbacks: false` by default. |
| T-41-04 | `packages/lattice/src/providers/litellm.ts` lines 46-48 synthesize capabilities from registry; `litellm.test.ts` lines 182-189 verifies no fetch is called. |
| T-41-05 | `packages/lattice/src/providers/adapters.ts` lines 421-445 records response model as `observedModel`; `packages/lattice/src/runtime/create-ai.ts` lines 634-643 keep receipt model and capability id on `route.modelId`. |
| T-41-06 | `packages/lattice/test/planning-execution.test.ts` lines 72-103 verifies `allowFallbacks` leaves `fallbackChain` empty. |
| T-41-07 | `packages/lattice/src/runtime/create-ai.ts` lines 161-220 sanitize event metadata; `packages/lattice/test/runtime.test.ts` lines 275-276 asserts no `sk-` in plan metadata or events. |
| T-41-08 | `packages/lattice/src/runtime/create-ai.ts` lines 403-441 emits additive start/succeeded `provider.attempt` metadata; targeted and full package tests passed. |
| T-41-09 | `packages/lattice/test/public-surface.test.ts` lines 53-152 guards value exports; `packages/lattice/test-d/index.test-d.ts` lines 55-69 covers gateway and LiteLLM types. |
| T-41-10 | `packages/lattice/src/providers/parity.test.ts` lines 180-191, 407-418, and 547-556 add LiteLLM to provider, sanitizer, and tool-call validation parity rows. |
| T-41-11 | `.changeset/litellm-gateway-policy.md` contains a minor changeset for `@full-self-browsing/lattice`. |

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-15 | 12 | 12 | 0 | codex-inline |

---

## Verification Commands

```bash
node scripts/check-core-package-boundary.mjs
pnpm --filter @full-self-browsing/lattice test -- litellm runtime planning-execution public-surface parity
pnpm --filter @full-self-browsing/lattice test:types
```

All commands passed.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-15
