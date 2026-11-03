---
type: quick
id: 261103-mbs
date: 2026-11-03
status: in_progress
---

# C2 reference draft and evidence integration

Implement the user-approved plan on the existing branch. The user explicitly requested an AI-generated reference draft to rewrite; keep it separate from manuscript narrative and retain the A1 authorship review.

## Tasks

1. Prepare an approximately 800-word labeled reference draft from the verified judgment and frozen demonstration. Cover actors, ordinary USD 180 and disputed USD 240 paths, recorded evidence, measured results and limits. Record provenance without guessing a tool/model version.
2. Add a compact TikZ workflow and evidence table immediately before the artifact description. Add a separately generated refund results table within Evaluation, using only frozen saved data. Distinguish live recommendations, simulated approvals/payments, four source omissions, 18 scoped checks and the offline wrong-but-signed control. Preserve all measured code/results and historical evidence; no inference or runtime/API changes.
3. Validate the data presentation and workflow against source evidence, build the PDF, inspect affected rendered pages, update C2 to evidence integrated / author narrative and review pending, and record scoped commits plus GSD state. Do not start C3 or mark C2 complete.

## Acceptance checks

- Draft is explicitly AI-generated, outside main.tex, and roughly 800 words excluding source/author notes.
- Presentation generation reproduces per-model 16/16 decisions, 14/16 strict passes and 16/16 verified evidence, 32 total runs, two excluded development calls and zero added spend.
- Figure separates runtime verification from application rules and simulated identity/payment evidence; no correctness, compliance, deployment or managerial-benefit claim is inferred from signatures.
- Existing frozen code, inputs and results remain byte-for-byte unchanged.
- `make -C paper tectonic` passes with no undefined references/citations or new overfull layout defects; affected pages are rendered and visually inspected under .context.
- README documents regeneration; checklist and provenance retain author rewrite/disclosure work.
