---
phase: 42
slug: openrouter-fallback-capability-catalog-refresh
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-16
---

# Phase 42 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Lattice runtime to OpenRouter chat completions | `createOpenRouterProvider` wraps the existing OpenAI-compatible adapter and sends the selected primary model plus optional OpenRouter fallback candidates. | User task, declared outputs, provider request body, primary model id, fallback model ids |
| OpenRouter provider response to Lattice result and receipt surfaces | The adapter exposes sanitized gateway observations to result metadata, events, plan attempts, and signed receipts. | `requestedModel`, `fallbackModels`, `observedModel`, gateway policy metadata |
| Manual/scheduled catalog refresh to generated registry | `scripts/refresh-model-registry.mjs` fetches OpenRouter model metadata and writes deterministic `registry.generated.ts` rows. | Public model ids, context windows, pricing strings, modalities, supported parameters |
| Optional script environment to OpenRouter models feed | Manual refresh may attach `OPENROUTER_API_KEY` to the feed request only when the operator provides it. | API key in outbound Authorization header; never rendered into generated output or logs |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-42-01 | Supply chain | OpenRouter adapter dependencies | mitigate | OpenRouter fallback support stays on the existing OpenAI-compatible HTTP path; `@openrouter/sdk` is absent and `node scripts/check-core-package-boundary.mjs` passed. | closed |
| T-42-02 | Tampering / routing integrity | Planner route accounting | mitigate | Fallback candidates live only in gateway metadata; `planning-execution.test.ts` asserts `route.fallbackChain` remains empty for OpenRouter fallback models. | closed |
| T-42-03 | Information disclosure / unsafe provider escape hatch | Public OpenRouter request API | mitigate | Public surface exposes only `fallbackModels?: readonly string[]`; no broad `extraBody` escape hatch was added. | closed |
| T-42-04 | Input validation | OpenRouter fallback request serialization | mitigate | `normalizeFallbackModels` trims model ids and drops empty values before serializing the OpenRouter `models` field. | closed |
| T-42-05 | Tampering / route integrity | Runtime result and receipt accounting | mitigate | Tests assert requested route remains `openai/gpt-oss-120b` while observed model is additive; receipt `route.capabilityId` stays requested. | closed |
| T-42-06 | Repudiation / auditability | Terminal run result types | mitigate | `RunSuccess` and `RunFailure` expose optional typed `gateway` metadata so users do not need raw response parsing. | closed |
| T-42-07 | Integrity / model classification | Receipt model-class derivation | mitigate | `resolveReceiptModelClass` prefers `model.observed` when registry-known and falls back to requested model; regression test verifies observed fallback class. | closed |
| T-42-08 | Information disclosure | Public result metadata | mitigate | Runtime propagates sanitized `ProviderGatewayMetadata` only, not raw request bodies, response envelopes, headers, or API keys. | closed |
| T-42-09 | Tampering / reproducibility | Generated capability registry | mitigate | Renderer uses no timestamps, stable `(adapter, id)` sort, explicit key order, trailing newline, and bit-exact tests; `--check` passed. | closed |
| T-42-10 | Information disclosure / auth drift | Catalog refresh script | mitigate | Feed refresh remains no-auth by default; optional `OPENROUTER_API_KEY` is used only as an HTTP header and never logged or rendered. | closed |
| T-42-11 | Integrity / pricing precision | Catalog metadata transform | mitigate | Pricing is stored as raw strings from the feed; tests verify no float conversion or precision loss. | closed |
| T-42-12 | Availability / CI reliability | Registry drift checks | mitigate | Normal tests use fixtures, live fetch is confined to manual/scheduled script paths, and `--check` reports upstream outage as a warning instead of failing CI. | closed |
| T-42-13 | Compatibility / type safety | Public capability profile type expansion | mitigate | New profile metadata fields are optional readonly fields and package-root type tests passed. | closed |

*Status: open - closed*
*Disposition: mitigate (implementation required) - accept (documented risk) - transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Evidence

| Evidence | Result |
|----------|--------|
| `pnpm --filter @full-self-browsing/lattice test -- openrouter create-ai planning-execution capabilities-classifier capabilities-registry public-surface` | Passed: 70 files / 932 tests |
| `pnpm --filter @full-self-browsing/lattice test:types` | Passed: 88 files / 1122 tests, no type errors |
| `node scripts/check-core-package-boundary.mjs` | Passed: core runtime boundary clean |
| `node scripts/check-tarball-leak.mjs` | Passed: inspected 2 package tarballs |
| `node scripts/refresh-model-registry.mjs --check` | Passed: registry matches upstream; expected unknown-prefix classifier warnings only |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-16 | 13 | 13 | 0 | Codex |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-16
