# Literature Matrix for the Lattice Journal Draft

Purpose: support a professor-ready IS / AI governance manuscript by mapping seed
literature, backward-citation trails, and the specific gap Lattice addresses.

## Search And Tracing Strategy

- Start from high-fit seed papers in design science research, AI governance,
  algorithmic accountability, algorithmic auditing, software provenance, and ML
  reproducibility.
- Trace backward from each seed into its foundational references.
- Use Research Rabbit, Connected Papers, Google Scholar, and publisher pages to
  confirm citation clusters and identify newer forward citations.
- Prioritize papers that help explain the paper's two contributions:
  capability receipts as a signed replay primitive, and organizational
  auditability as governance/accountability/reproducibility/control.

## Seed Literature Map

| Cluster | Seed work | Backward-citation trail to inspect | Why it matters for Lattice |
| --- | --- | --- | --- |
| Design science research | Hevner et al. (2004), Peffers et al. (2007), Gregor and Hevner (2013) | March and Smith (1995); Simon's design-science tradition; IS artifact evaluation literature | Justifies Lattice as an artifact and supports the design-requirements/evaluation structure. |
| AI governance | Jobin et al. (2019), Floridi et al. (2018), NIST AI RMF (2023), Berente et al. (2021) | Responsible AI principles; governance practices; accountability and transparency frameworks | Frames the problem as operationalizing governance principles into evidence. |
| Algorithmic accountability | Diakopoulos (2016), Wieringa (2020), Kroll (2021) | Accountability, traceability, explainability, transparency, procedural regularity | Supports the claim that auditability requires traceable evidence, not just model explanations. |
| Internal algorithmic auditing | Raji et al. (2020) | Internal audit practices; model documentation; system lifecycle review | Positions capability receipts as runtime evidence consumed by an audit process. |
| Software provenance | in-toto, DSSE, SLSA, Sigstore, TUF | Signed metadata, attestations, key rotation, supply-chain integrity | Supports the technical mechanism: signed runtime provenance adapted from software supply chains. |
| ML documentation and reproducibility | Model Cards, Datasheets, Pineau et al. (2021), Sculley et al. (2015) | Dataset documentation, model reporting, hidden technical debt, reproducibility programs | Clarifies how run-level receipts complement model/dataset-level documentation. |
| Agent/runtime ecosystem | Vercel AI SDK, LangChain/LangGraph, LiteLLM, OpenAI Agents SDK, MCP | Provider abstraction, agent tracing, tool/context protocols | Establishes what current developer frameworks provide and what they do not: signed replayable run evidence. |

## Gap Statement

The literature provides principles for responsible AI, processes for audit and
accountability, and cryptographic mechanisms for software provenance. It does
not yet provide a runtime-level artifact that binds AI-agent intent, model
routing, policy enforcement, output commitments, and replay metadata into a
portable signed receipt. Lattice occupies this gap by applying software
provenance mechanisms to individual AI runs and connecting them to governance
needs.

## Contribution Mapping

| Draft contribution | Literature anchor | Gap addressed |
| --- | --- | --- |
| Capability-receipt framework | DSSE, in-toto, SLSA, RFC 8785, reproducibility literature | Existing provenance systems focus on build artifacts; Lattice applies provenance to AI runtime execution. |
| Deterministic routing and terminal tripwires | AI governance and accountability literature | Governance principles need evidence of route choice and policy enforcement, not only post-hoc explanations. |
| Organizational auditability model | Algorithmic auditing and internal-control literature | Audit processes need a stable evidence object; traces and logs are operational views, not signed audit artifacts. |
| Cross-language conformance and replay | Reproducibility and software engineering literature | Reproducibility needs executable checks and portable fixtures, not only narrative documentation. |

## Immediate Next Literature Tasks

- Use Research Rabbit on Hevner et al. (2004), Peffers et al. (2007), Raji et al.
  (2020), and Wieringa (2020) to identify the top 20 recurring backward
  citations.
- Build a second matrix with columns: citation, research method, artifact/control
  concept, relevance, and how the Lattice draft uses it.
- Add at least five recent forward citations from 2023-2026 on responsible AI
  governance and AI auditability before submission.
- Ask the professor whether the paper should emphasize IS design science,
  accounting/auditing controls, or software governance in the final target.
