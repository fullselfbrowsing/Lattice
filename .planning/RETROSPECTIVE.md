# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.3 — Public Release + Model-Aware SDK + Multi-Agent Surface

**Shipped:** 2026-06-15
**Phases:** 13 shipped of 16 planned (24–29, 33–39) | **Plans:** 42 | **REQ-IDs:** 64/87 shipped, 23 superseded

### What Was Built
- First public npm release under `@full-self-browsing/*` via OIDC Trusted Publisher + SLSA provenance, with a tag-driven `release.yml`, PR-time `ci.yml`, and GitHub Release `v1.3.0`.
- A model-aware SDK upgrade: capability registry (~337 profiles auto-generated from the OpenRouter feed + static supplements), adapter quirk flags + capability negotiation, prompt scaffolds, and opt-in output sanitizers + tool-call validators across all 7 adapters.
- Receipt schema v1.2 (`modelClass`, downgrade defenses) and a first-class opt-in multi-agent crew surface (`defineAgent` / `runAgentCrew`, crew budgets, prompt-cache-prefix sharing, rate-limit groups, chained receipts).

### What Worked
- **Additive, opt-in surfaces.** Sanitizers, tool-call validation, capability negotiation, and the crew surface all shipped as opt-in options that left default v1.2 behavior bit-for-bit unchanged (834/834 tests, zero expectation edits on the crew phase). New capability without consumer churn.
- **Auto-generated capability registry.** Seeding the registry from the OpenRouter feed with a weekly drift-check workflow turned a would-be hand-maintained matrix into a regenerable artifact.
- **OIDC + provenance from day one.** For a library that ships cryptographic primitives, supply-chain attestation was a cheap, durable trust signal.

### What Was Inefficient
- **The milestone expanded mid-flight** from "publish + canary" into a model-aware SDK + multi-agent surface (Phases 33–39 added after opening). Worth it, but the scope drift left stale planning prose (PROJECT.md claimed phases 38–39 unbuilt well after they shipped) that had to be reconciled at close.
- **A synthetic canary was planned (Phases 30–32) before validating the cheaper path.** ~23 REQ-IDs were authored for a dedicated `lattice-canary` repo that was ultimately superseded — see Lessons.

### Patterns Established
- **Opt-in adapter hardening** as the default way to add provider-shape guardrails without breaking the parity contract across all 7 adapters.
- **Generated-from-feed + drift-check** for any large external matrix (model capabilities) instead of hand-maintenance.
- **Supersede, don't silently drop.** Descoped work is recorded as `superseded` with rationale in the milestone audit + Key Decisions, not deleted or left as ambiguous "incomplete."

### Key Lessons
1. **Prefer a real consumer over a synthetic one for release validation.** The dedicated synthetic canary (Phases 30–32) was superseded once it was clear FSB — the real downstream product — could consume the published npm package directly. A real consumer validates packaging *and* integration more credibly than contrived assertions. Build synthetic validation only for what the real consumer can't cover (e.g. exhaustive unused-export coverage), and keep it thin.
2. **Reconcile planning docs to reality at phase close, not milestone close.** Stale "in progress / not implemented" prose accumulated because PROJECT.md wasn't evolved per-phase; it all surfaced at milestone close.
3. **Mid-milestone scope expansion is fine if the audit trail keeps up.** The model-aware + crew additions were high-value, but the REQ-ID/phase bookkeeping lagged the code.

### Cost Observations
- Model mix: not instrumented this milestone (model_profile: balanced). Note: GSD research/execute subagents intermittently failed with `Unsupported service_tier: flex`, forcing inline-execution fallbacks on a few phases (35–38).
- Notable: the largest single phase was 39 (multi-agent crew, 8 plans); the publish-infra phases (27, 28) were configuration-driven with no per-plan files.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1.0 | 6 | Foundation; deterministic planning + artifact lifecycle established. |
| v1.1 | 7–13 | Signed receipts + replay + CLI; the verifiability thesis took shape. |
| v1.2 | 14–22 | FSB integration (retro) + agent capability (forward); 7-adapter parity contract. |
| v1.3 | 24–39 | First public npm release + model-aware SDK + multi-agent crew; first use of `superseded` to descope a planned sub-scope (canary) for a cheaper real-consumer path. |

### Top Lessons (Verified Across Milestones)
1. **Opt-in, additive surfaces preserve the parity contract** — validated across v1.2 (adapters) and v1.3 (sanitizers/validators/crew).
2. **Inspectable, signed, reproducible artifacts are the differentiator** — every milestone has leaned further into receipts/replay rather than feature breadth.
