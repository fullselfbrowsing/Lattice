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

## Milestone: v1.4 — Provider Breadth + Live Multimodal + Observability Export

**Shipped:** 2026-06-16
**Phases:** 10 (40–49) | **Plans:** 36 | **REQ-IDs:** 44/44

### What Was Built
- Package identity and release guardrails: package-local version stamping, root value-export inventory, package-entrypoint type tests, packed-artifact version checks, tarball leak checks, and native/install-script dependency gates.
- Provider breadth and live surface: first-class LiteLLM helper, typed gateway metadata, OpenRouter fallback arrays and catalog refresh, normalized streaming contract, five streaming adapter implementations, seven-provider parity, and Anthropic/Gemini multimodal request shaping.
- Inspectability upgrades: receipt lineage merkle roots, remote signer/KMS adapter shapes, structural OpenTelemetry export with content-safe defaults, Langfuse/Phoenix OTLP helpers, agent eval CLI, receipt diffing, and LM Studio latency diagnostics.
- Validation closure: offline v1.4 showcase plus isolated FSB package-candidate dogfood from a packed tarball.

### What Worked
- **Fix package identity before API expansion.** Phase 40 closed the `0.0.0` version-stamping defect first, then every later v1.4 public export inherited stronger package and public-surface gates.
- **Gateway delegation stayed deterministic.** LiteLLM/OpenRouter metadata became additive provider/gateway metadata while Lattice route fields remained stable and replayable.
- **Package-candidate dogfood caught the right boundary.** Installing the packed runtime tarball into an isolated FSB temp consumer validated the external-consumer path without relying on workspace symlinks.

### What Was Inefficient
- Some phase summaries were too verbose for milestone extraction, which produced noisy `Status:` bullets in `MILESTONES.md` and required manual cleanup.
- ROADMAP plan lists drifted during late-phase edits; the archive close needed a final reconciliation against the actual plan files.
- A chained verification command hung once even though the underlying package gates passed when rerun separately; future final gates should prefer independent commands with clearer failure boundaries.

### Patterns Established
- **Package-candidate validation** as the final release gate: pack, install in an isolated consumer, run generated smoke, then run downstream compatible tests.
- **Core dependency boundary scans** for optional integrations: native/heavy SDKs remain out of core unless intentionally added.
- **Content-safe observability by default:** telemetry exports structural attributes and receipt pointers, with raw content capture requiring explicit opt-in.

### Key Lessons
1. **Tarball validation should be a first-class gate, not a release afterthought.** It caught the packaging boundary that source-level tests cannot prove.
2. **Archived roadmap generation needs reconciliation against phase artifacts.** If plan lists are manually patched during execution, milestone close should compare them to `*-PLAN.md` files before commit.
3. **Real downstream dogfood and offline showcase cover different risks.** The showcase proves broad v1.4 behavior deterministically; FSB proves install/package compatibility as an external consumer.

### Cost Observations
- Model mix: not instrumented this milestone. Most validation was local/offline against fake providers and package checks.
- Notable: Phase 49 ran the broadest final gate set, including 1026 runtime tests, 157 CLI tests, package version checks, tarball leak checks, offline showcase, and FSB package-candidate dogfood.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1.0 | 6 | Foundation; deterministic planning + artifact lifecycle established. |
| v1.1 | 7–13 | Signed receipts + replay + CLI; the verifiability thesis took shape. |
| v1.2 | 14–22 | FSB integration (retro) + agent capability (forward); 7-adapter parity contract. |
| v1.3 | 24–39 | First public npm release + model-aware SDK + multi-agent crew; first use of `superseded` to descope a planned sub-scope (canary) for a cheaper real-consumer path. |
| v1.4 | 40–49 | Provider/gateway breadth, streaming/multimodal, OTel/eval diagnostics, and package-candidate downstream dogfood became the release-validation pattern. |

### Top Lessons (Verified Across Milestones)
1. **Opt-in, additive surfaces preserve the parity contract** — validated across v1.2 (adapters) and v1.3 (sanitizers/validators/crew).
2. **Inspectable, signed, reproducible artifacts are the differentiator** — every milestone has leaned further into receipts/replay rather than feature breadth.
3. **Validate releases as packages, not just source trees** — v1.3 FSB-via-npm and v1.4 packed-candidate dogfood both found or defended boundaries that workspace-local tests would miss.
