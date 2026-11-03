# C2 integration provenance and author-review record

Date: November 3, 2026. GSD quick task: `261103-mbs`. Baseline: `759e939`; measured refund revision: `f8a6914`.

## Authorization and assistance

Lakshman explicitly requested: “draft it I'm gonna edit it (i just need a reference)” and then approved the implementation plan. OpenAI Codex prepared the separate 794-word reference narrative, TikZ workflow, evidence table, numerical presentation script and generated table notes. It also made the section-roadmap and AI-declaration editorial updates, updated the checklist, verified saved results and inspected the compiled PDF.

The model/version for this drafting session is **unconfirmed**. The author's previously reported list of models across coding tools is not evidence of which model ran this session; no mapping is inferred. The workflow caption records OpenAI Codex assistance and the unresolved version. The evaluated Nemotron and Dots models are research subjects, not attributed as the authors of this reference draft.

The reference narrative is **AI-generated**, not human-drafted or merely copyedited. It remains outside `main.tex`. The manuscript additions consist of the workflow figure, evidence and results tables with factual captions/notes, and the limited editorial adjustments described above. No human revision or approval of these deliverables has yet been recorded.

The authors still need to settle A1/P5: original writing, verification of content and references, tool/model records, terms of use and final declarations. Calling the text a reference, editing it or disclosing assistance does not itself establish compliance with the [publisher's first-draft restriction](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/). No new manuscript narrative is silently attributed to the authors.

## Claim and evidence audit

| Claim or presentation | Source checked | Boundary retained |
|---|---|---|
| Moffatt motivation | [Primary judgment copy](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf), paragraphs 14–17, 27–32; retrieved again Nov 3 | No finding of tampering, no identified LLM architecture, no Lattice deployment or prevention claim; source used only in the separate reference draft |
| Actors, USD 180 routine path, USD 240 dispute | [Frozen fixtures](../../eval/refund/fixtures.mjs), [workflow](../../eval/refund/workflow.mjs), [saved rows](../../eval/refund/results/live.json) | Invented policies and amounts; prior denial scripted; approvals, roles and payments simulated |
| 32 planned runs, two excluded development calls, per-model counts | [Protocol](../../eval/refund/results/protocol.json), [live rows](../../eval/refund/results/live.json), [summary](../../eval/refund/results/summary.json) | Eight structured scenarios, two repetitions per model; not a representative operational benchmark |
| All decisions/rules matched; 28/32 full-rubric passes | Frozen scorer reapplied to exact saved outputs | Four required customer-request source omissions retained; source coverage differs from format checks and semantic support |
| 32 verified run-evidence packages | Saved bundle hashes and signatures rechecked against the public key, fixtures, expected bindings and [saved verification](../../eval/refund/results/verification.json) | Integrity of commitments; no provider-honesty, real authorization, correctness or re-execution claim |
| 18 scoped checks; separate wrong-but-signed control | [Controls](../../eval/refund/results/controls.json); all 18 reproduced in memory; saved wrong-answer bundle reverified and rescored | Intact controls included; one routine bundle used; wrong output scripted offline rather than a live-model failure |
| USD 0 added spend | All 34 saved call-cost entries and account delta | No new inference during this integration; historical paid spend elsewhere is not changed |

## Reproduction and validation

- `node paper/scripts/refund-tables.mjs` reads and rechecks frozen evidence, then writes only `paper/refund-results.tex`. `--check` verifies the existing generated presentation without writing it.
- The presentation script validates protocol/trust/fixture/code hashes, all 32 bundle hashes and regraded results, model IDs, per-case repetitions, saved verification results and scoped controls. It does not alter or rerun the live cohort.
- `make -C paper tectonic` builds the manuscript; the final log has no undefined references/citations or overfull boxes. Existing underfull warnings in historical tables/bibliography remain.
- The PDF has 54 pages. The workflow is on page 8, evidence table on page 9, and refund results on page 38. A stranded section heading found during visual inspection was fixed. Declarations and adjacent section transitions were checked as well.
- A pre-edit PDF, protected-file hashes and rendered page images are retained privately under `.context/jitcar-c2-integration/`. All 510 protected files in the refund and historical result directories remain unchanged; the frozen-code manifest is also checked by the presentation script.

## Handoff

**C2: evidence integrated; author narrative and review pending.** The process figure/evidence table and measured-outcomes checklist items are complete. C4's author walkthrough/requirements mapping remains open. C3 was not started. The separate reference draft supplies material for author rewriting and is not evidence that the paper's authorship review is complete.
