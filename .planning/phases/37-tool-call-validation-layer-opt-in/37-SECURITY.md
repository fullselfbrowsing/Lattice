---
phase: 37
slug: tool-call-validation-layer-opt-in
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-09
---

# Phase 37 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Provider response -> Lattice adapter | Untrusted model text is parsed for prompt-reencoded `tool_calls` envelopes. | Model-generated JSON-like text and provider response metadata |
| Caller tool registry -> validator | Consumer-supplied tool names and input schemas define the allowlist. | Tool names, Standard Schema/Zod validators |
| Adapter response -> agent runtime | Normalized `ProviderRunResponse.toolCalls` can bypass runtime parser fallback. | Validated tool-call ids, names, and args |
| Package surface -> SDK consumers | New public types/options are exported through the package root and release note. | Type declarations, changeset documentation |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-37-01 | Tampering / Integrity | `validateToolCallRequests` | mitigate | Validator allowlists tool names, validates args, and returns only valid calls; throw/drop/callback tests cover invalid exclusion. Evidence: `packages/lattice/src/tools/tool-call-validation.ts`, `packages/lattice/src/tools/tool-call-validation.test.ts`. | closed |
| T-37-02 | Compatibility / Availability | Public provider contract | mitigate | Added only optional fields (`ProviderRunResponse.toolCalls`, `validateToolCalls` options), and absent option returns `undefined` / omits `toolCalls`. Evidence: `packages/lattice/src/providers/provider.ts`, `packages/lattice/src/providers/adapters.test.ts`. | closed |
| T-37-03 | Integrity | Extra-field detection | mitigate | Extra-field detection is scoped to object schemas with known shape; malformed required fields remain `invalid_args`; allow/reject tests cover both paths. Evidence: `packages/lattice/src/tools/tool-call-validation.ts`, `packages/lattice/src/tools/tool-call-validation.test.ts`. | closed |
| T-37-04 | Integrity | Tool-call envelope parser | mitigate | Existing parser was extracted as `parseToolUseEnvelope` and `formatToolsForProvider(...).parseToolUse` delegates to it; parser parity test prevents grammar drift. Evidence: `packages/lattice/src/agent/format-tools.ts`, `packages/lattice/src/agent/format-tools.test.ts`. | closed |
| T-37-05 | Integrity | OpenAI-compatible wrapper providers | mitigate | Validation is applied once in `createOpenAICompatibleProvider`; wrappers inherit via options and forwarding; xAI callback test asserts one validation callback. Evidence: `packages/lattice/src/providers/adapters.ts`, `packages/lattice/src/providers/xai.test.ts`. | closed |
| T-37-06 | Integrity | Agent runtime | mitigate | Runtime prefers `response.toolCalls` when defined and keeps parser fallback when absent. Evidence: `packages/lattice/src/agent/runtime.ts`, `packages/lattice/src/agent/runtime.test.ts`. | closed |
| T-37-07 | Elevation of Privilege / Integrity | Tool execution loop | mitigate | Dropped invalid calls produce an empty validated call list and are not executed by `runAgent`; test asserts no tool invocation. Evidence: `packages/lattice/src/agent/runtime.test.ts`. | closed |
| T-37-08 | Tampering | OpenAI-compatible raw outputs and raw response | mitigate | Validation does not replace provider raw body; adapter tests assert `rawOutputs` and `rawResponse` preservation. Evidence: `packages/lattice/src/providers/adapters.test.ts`. | closed |
| T-37-09 | Integrity | Anthropic and Gemini direct adapters | mitigate | Direct adapters mirror the OpenAI-compatible validation flow; all-seven parity covers valid/drop/throw behavior. Evidence: `packages/lattice/src/providers/anthropic.ts`, `packages/lattice/src/providers/gemini.ts`, `packages/lattice/src/providers/parity.test.ts`. | closed |
| T-37-10 | Tampering | Direct provider raw response bodies | mitigate | Direct adapter tests assert original Anthropic/Gemini `rawResponse` and response text are preserved while `toolCalls` is populated. Evidence: `packages/lattice/src/providers/anthropic.test.ts`, `packages/lattice/src/providers/gemini.test.ts`. | closed |
| T-37-11 | Repudiation / Observability | Drop and callback modes | mitigate | Callback mode requires a callback and invokes it once per invalid call; drop mode returns explicit empty `toolCalls` in adapter/runtime tests. Evidence: `packages/lattice/src/tools/tool-call-validation.test.ts`, `packages/lattice/src/providers/parity.test.ts`. | closed |
| T-37-12 | Documentation / Misconfiguration | Changeset and public release note | mitigate | Changeset describes opt-in returned tool-call envelope validation and explicitly avoids native provider tool API claims. Evidence: `.changeset/v1.3.0-tool-call-validation.md`. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-09 | 12 | 12 | 0 | codex-inline |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-09
