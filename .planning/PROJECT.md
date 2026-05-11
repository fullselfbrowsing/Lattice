# Lattice

## What This Is

Lattice is a TypeScript-first capability runtime SDK for AI applications. Developers describe the job, provide any mix of artifacts, declare desired outputs, and set policy constraints; Lattice handles provider routing, context packing, artifact transport, fallback, replay, and inspectable execution plans.

The product is for developers building multimodal AI features who do not want to wire together separate chat, image, transcription, speech, file, memory, routing, and provider abstractions by hand.

## Core Value

Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.

## Current Milestone: v1.1 Capability Receipts

**Goal:** Make every Lattice run contract-bound, signed, and reproducible — turning a thumbs-down in prod into a deterministic local repro and a CI-gated regression check.

**Target features:**
- Capability Contracts declared on `ai.run` (budget + invariants + qualityFloor)
- Pre-flight contract proof — router refuses to execute when no route can satisfy the contract; typed no-contract-match result
- Tripwire invariants — semantic/policy invariants evaluated mid-stream with abort-on-violation
- Signed Capability Receipts — Ed25519-signed attestation per run (input hashes, route, packaging, model versions, contract verdict, redaction-aware)
- `lattice repro <receipt-id>` CLI — reconstructs deterministic replay session from a receipt
- `lattice eval` CI command — runs receipts + fixtures as regression suite; fails CI on cost-per-task or quality-floor regressions

## Requirements

### Validated

- [x] Phase 1 package/API spine: named `createAI`, `artifact`, and `output` exports; typed `ai.run({ task, artifacts, outputs, policy, session })`; `ai.session(id)` placeholder references; Lattice-owned config, provider, policy, storage, tracing, artifact, session, result, and output contract types; Standard Schema/Zod-compatible output inference and validation.
- [x] Phase 2 artifact lifecycle and storage: text, JSON, file, image, audio, document, URL, tool-result, and derived artifacts; payload-free refs; metadata, privacy, size, storage refs, fingerprints, and lineage; memory/local development stores; runtime/output/public package artifact boundaries.
- [x] Phase 3 deterministic planning and execution: `ai.plan(...)`, stable execution-plan JSON, capability catalog routing, deterministic hard filters/scoring, fallback chains, typed no-route outcomes, fake providers, provider-independent execution, and typed run events.
- [x] Phase 4 context, sessions, and provider packaging: memory session store, turns/artifacts/plan history/branching, context packs with reasons and trust labels, progressive overrides, policy-safe provider packaging, and narrow OpenAI/OpenAI-compatible/AI SDK adapter factories.
- [x] Phase 5 tools, replay, and observability: Standard Schema local tools, explicit MCP-like tool imports, artifact-backed tool results, replay envelopes, offline replay, live rerun warnings, default redaction, and structured event/tracing hooks.
- [x] Phase 6 work-inbox showcase: executable public API example with message, photo, transcript, PDF/policy artifacts, structured action output, route/context/packaging inspection, offline replay, and adversarial fixtures.

### Active

v1.1 requirements are tracked in `.planning/REQUIREMENTS.md` and mapped to phases in `.planning/ROADMAP.md`. They cover capability contracts, pre-flight contract proof, tripwire invariants, signed receipts (Ed25519), the `lattice repro` CLI, and the `lattice eval` CI gate.

### Out of Scope

- Hosted control plane — the first version should prove the runtime SDK before adding hosted infrastructure.
- Graph DSL — the v0.1 product should feel smaller than orchestration frameworks and avoid making users design graphs first.
- Multi-agent handoff framework — agent orchestration is not the initial differentiator.
- Building 100 custom provider adapters from scratch — broad provider coverage should initially lean on an existing provider/routing surface where practical.
- Frontend hook library as the center of the product — UI bindings can exist, but the core bet is the runtime.
- Opaque AI-selected routing in v1 — routing should be deterministic and inspectable first.

## Context

As of April 2026, comparable tools each cover part of the desired surface:

- Vercel AI SDK offers a broad provider-agnostic TypeScript toolkit with provider/model management, multimodal generation, agents, subagents, and memory approaches, but it remains a toolkit with multiple explicit surfaces.
- TanStack AI is philosophically close on the TypeScript side, emphasizing a lightweight core, runtime adapter switching, multimodal content, generation hooks, and realtime voice.
- LiteLLM is strong routing infrastructure with a common interface across many providers plus fallback, context-window fallback, image generation, transcription, speech, and MCP gateway capabilities.
- LangChain/LangGraph and OpenAI Agents SDK are strong on context, orchestration, sessions, compaction, tracing, and voice, but they do not provide the tiny universal capability runtime described here.

The missing category is a capability-first runtime SDK rather than another provider wrapper. The developer should provide the task, artifacts, outputs, budget, privacy, latency, and quality constraints; Lattice should build a context pack, prepare artifacts for the chosen providers, execute one or more model stages, handle fallbacks, and return a structured result plus an inspectable plan.

The wedge is the multimodal work inbox: support, insurance, logistics, field operations, healthcare administration, recruiting, and creator tools all need to process combinations of user messages, screenshots/photos, voice notes/call recordings, and PDFs/manuals/policies into answers, structured actions, and sometimes speech.

Phase 1 completed on 2026-04-22. Lattice now has a verified TypeScript package foundation with named public exports, provider-neutral runtime/config/policy/artifact/session contracts, typed multi-output result inference, Standard Schema/Zod validation, a Phase 1 `ai.run` skeleton, and an `ai.session(id)` placeholder.

Phase 2 completed on 2026-04-22. Lattice now has a verified artifact lifecycle model with synchronous constructors, payload-free refs, metadata/privacy/storage/fingerprint fields, lineage descriptors, memory and local filesystem development stores, and artifact refs wired through provider, runtime, output, and public package boundaries.

Phase 3 completed on 2026-04-22. Lattice now has deterministic dry-run planning, capability catalog routing, fallback/no-route behavior, stable execution plan JSON, fake providers, provider-independent execution, and typed run events.

Phase 4 completed on 2026-04-22. Lattice now has explicit memory sessions, context packs, progressive runtime overrides, policy-safe provider packaging, and narrow provider adapter factories.

Phase 5 completed on 2026-04-22. Lattice now has schema-validated local/MCP-like tools, artifact-backed tool results, replay envelopes, offline/live replay helpers, default redaction, and structured event observability.

Phase 6 completed on 2026-04-22. Lattice now includes an executable multimodal work-inbox showcase using the public package entrypoint and deterministic fixtures.

## Constraints

- **Language**: TypeScript-first — closest competitors and early adopters are strongest in the app/product integration ecosystem.
- **Public API**: Capability-first and small — the beginner path should be one `run` call with artifacts, outputs, and policy.
- **Routing**: Deterministic in v0.1 — use capability matrix plus policy scoring and fallback rules before considering opaque AI-chosen routing.
- **Provider surface**: Reuse existing routing/provider infrastructure where it accelerates learning — provider breadth is not the main differentiation.
- **Protocol**: MCP-native where tools/context integration is needed — avoid inventing a proprietary plugin protocol.
- **Architecture**: One umbrella package with modular internals — easy install should coexist with tree-shakable adapters and optional bindings.
- **Transparency**: Every run must be inspectable — model choices, context packing, summaries, artifact transforms, cost, and latency must be explainable.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build Lattice as a capability-first runtime SDK | The missing product is a layer above provider adapters and media APIs, not another wrapper around one model API. | — Pending |
| Start TypeScript-first | The strongest adjacent products and app integration pain are in the TypeScript ecosystem. | — Pending |
| Use a deterministic router for v0.1 | Inspectability and trust matter more than magical but opaque routing early. | Validated in Phase 3: capability catalog routing, hard filters, scoring, fallback chains, and no-route outcomes are implemented. |
| Make artifacts the universal content model | Text, image, audio, video, PDF, JSON, and tool results need the same lifecycle: reference, transform, package, reuse, trace. | Validated in Phase 2: artifact constructors, refs, metadata, storage, fingerprints, lineage, and runtime/output boundaries are implemented. |
| Treat context management as built-in runtime behavior | Manual trimming, summarizer middleware, and developer-managed file stuffing are core pain points this product should remove. | Validated in Phase 4: context packs record included, summarized, archived, omitted, reasons, estimates, and trust labels. |
| Focus the first showcase on the multimodal work inbox | It exercises text, image, audio, files, structured outputs, policy routing, artifact packaging, and optional speech in one understandable workflow. | Validated in Phase 6: executable work-inbox example and fixtures are included. |
| Keep Phase 1 sessions as references only | Full persistence, context packs, summaries, branching, and replay belong in later phases; Phase 1 only needs a stable public placeholder. | `ai.session(id)` returns a `SessionRef` and can be passed into `ai.run`. |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-11 — milestone v1.1 (Capability Receipts) started*
