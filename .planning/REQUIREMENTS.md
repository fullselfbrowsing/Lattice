# Requirements: Lattice v1.5.0 Modular Adoption + Execution Parity

**Defined:** 2026-06-20
**Core Value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.

## v1.5.0 Requirements

### Module Boundaries

- [x] **MOD-01**: Developer can import provider, audit, context, artifact, routing, MCP/tools, storage, eval, and agent surfaces without pulling unrelated runtime code into the public API path.
- [x] **MOD-02**: Developer can identify which Lattice modules are Node 20-compatible, Node 24-only, or adapter-specific from package metadata and docs.
- [x] **MOD-03**: Developer can install and use a provider-only or audit-only Lattice path without initializing `createAI()` or `runAgent()`.
- [x] **MOD-04**: Package-boundary tests prove agent modules do not leak into provider-only, audit-only, or context/artifact-only entrypoints.

### Provider Execution Parity

- [x] **PROV-01**: Developer can call provider adapters directly with native tool definitions and provider-native `toolChoice` semantics where the provider supports them.
- [x] **PROV-02**: Developer can request native structured outputs through provider adapters without forcing object schemas through raw text validation.
- [x] **PROV-03**: Developer can preserve provider-specific model IDs, including xAI/GitFly-style `grok-4-1-fast-*` IDs, without capability negotiation degrading to an unusable stub.
- [x] **PROV-04**: Developer can observe streaming/tool-step finish details from provider-only execution paths without using the Lattice agent loop.
- [x] **PROV-05**: Existing `ai.run()` and `ai.runAgent()` behavior remains backward compatible unless the caller opts into the new native provider execution surface.

### External Execution Audit

- [x] **AUD-01**: Developer can wrap an externally executed AI call with Lattice receipts without replacing the executor.
- [x] **AUD-02**: Developer can record raw request/response envelopes, model identity, usage, artifacts, outputs, and policy decisions for external execution runs.
- [x] **AUD-03**: Developer can replay or diff external execution fixtures with the existing CLI where sufficient sidecar data exists.
- [x] **AUD-04**: Developer can use eval gates against external execution receipts and sidecars without depending on Lattice provider adapters.
- [x] **AUD-05**: Receipt signing and verification stay JCS/DSSE/Ed25519-compatible with existing v1.2 receipts.

### Context, Artifacts, Routing, and Storage

- [x] **CORE-01**: Developer can run context packing as a standalone module over artifacts and optional session turns.
- [x] **CORE-02**: Developer can use artifact constructors, refs, metadata, fingerprints, lineage, and transport packaging without provider execution.
- [x] **CORE-03**: Developer can use deterministic routing and capability negotiation as a standalone advisory layer.
- [x] **CORE-04**: Developer can use memory, local filesystem, and optional storage adapters independently of `createAI()`.
- [x] **CORE-05**: Standalone context/artifact/routing/storage modules emit inspectable plans or records suitable for receipts and debugging.

### MCP, Tools, and Agent Optionality

- [x] **TOOL-01**: Developer can import MCP/tool helpers as standalone utilities without enabling the Lattice agent loop.
- [x] **TOOL-02**: Developer can validate tool inputs and returned tool calls independently of provider execution.
- [x] **TOOL-03**: Developer can turn MCP resources, prompts, and tool results into artifacts that can be packed, replayed, and signed.
- [x] **AGNT-01**: Developer can opt out of all agent and crew surfaces while still using every non-agent Lattice module.
- [x] **AGNT-02**: Developer can request typed agent final outputs when they do use `runAgent`, closing the BuildConfig-style object-return gap.

### Compatibility and Dogfood

- [x] **COMP-01**: Node 20 compatibility is tested for every modular layer that does not require Node 24-only APIs.
- [x] **COMP-02**: Node 24 remains the supported full-runtime baseline where required APIs cannot be polyfilled or safely supported on Node 20.
- [x] **DOG-01**: A GitFly-style dogfood scenario proves provider-only native tools and structured outputs do not regress compared with Vercel AI SDK-style flows.
- [x] **DOG-02**: A GitFly-style dogfood scenario proves Lattice audit/receipts/replay can wrap an external executor behind a feature flag.
- [x] **DOG-03**: A generic external-consumer example proves module-by-module adoption for at least two independent slices.
- [x] **DOG-04**: Documentation explains recommended adoption paths: provider-only, audit-only, context/artifact-only, routing advisory, MCP/tools-only, eval-only, and full runtime.

## Future Requirements

### Hosted Runtime

- **HOST-01**: Hosted control-plane orchestration manages runs, receipts, storage, and replay centrally.
- **HOST-02**: Team-level dashboards aggregate receipts, evals, and replay outcomes across apps.

### Deep Framework Bridges

- **BRDG-01**: LangChain, LangGraph, OpenAI Agents SDK, and Vercel AI SDK bridges expose first-class Lattice wrappers for their native execution primitives.
- **BRDG-02**: Framework-specific exporters preserve full native observability payloads beyond the provider-neutral baseline.

### Production Live Sessions

- **LIVE-01**: OpenAI Realtime and Gemini Live bidirectional session implementations move beyond v1.4 interface-level direction.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replacing GitFly's whole AI layer in this milestone | The goal is incremental adoption and dogfood, not a risky production migration. |
| Making the full Lattice runtime Node 20-only | Node 24 remains the documented full-runtime baseline; v1.5.0 scopes Node 20 to modular layers where feasible. |
| Hosted control plane | This milestone stays an embeddable SDK/library milestone. |
| New proprietary plugin protocol | MCP remains the integration protocol for tools/context. |
| Opaque AI-selected routing | Routing remains deterministic and inspectable. |
| Broad new provider count | Provider breadth is already v1.4 work; this milestone focuses on execution parity and modular boundaries. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MOD-01 | Phase 50 | Complete |
| MOD-02 | Phase 50 | Complete |
| MOD-03 | Phase 50 | Complete |
| MOD-04 | Phase 50 | Complete |
| PROV-01 | Phase 51 | Complete |
| PROV-02 | Phase 51 | Complete |
| PROV-03 | Phase 51 | Complete |
| PROV-04 | Phase 51 | Complete |
| PROV-05 | Phase 51 | Complete |
| AUD-01 | Phase 52 | Complete |
| AUD-02 | Phase 52 | Complete |
| AUD-03 | Phase 52 | Complete |
| AUD-04 | Phase 52 | Complete |
| AUD-05 | Phase 52 | Complete |
| CORE-01 | Phase 53 | Complete |
| CORE-02 | Phase 53 | Complete |
| CORE-03 | Phase 53 | Complete |
| CORE-04 | Phase 53 | Complete |
| CORE-05 | Phase 53 | Complete |
| TOOL-01 | Phase 54 | Complete |
| TOOL-02 | Phase 54 | Complete |
| TOOL-03 | Phase 54 | Complete |
| AGNT-01 | Phase 54 | Complete |
| AGNT-02 | Phase 54 | Complete |
| COMP-01 | Phase 55 | Complete |
| COMP-02 | Phase 55 | Complete |
| DOG-01 | Phase 55 | Complete |
| DOG-02 | Phase 55 | Complete |
| DOG-03 | Phase 55 | Complete |
| DOG-04 | Phase 55 | Complete |

**Coverage:**
- v1.5.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-06-20*
*Last updated: 2026-06-20 after Phase 55 completion*
