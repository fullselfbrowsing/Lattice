# Review of C1 and C4–C7: evidence, claims, sources and relocation

Date: November 5, 2026. GSD quick task: `261105-p6k`. Baseline: `ab62b0d`. Reviewer: Claude (Claude Code, Claude Opus 5.5), at Lakshman Turlapati's direction, with one read-only source-checking subagent for C6 whose findings Claude re-verified against the primary texts. This is an AI review. It does not replace the authors' own confirmation under A1/P5.

**Outcome.** Each of these items had been validated only by the session that produced it, so this pass recomputed results from raw data, read the code behind method claims and tested the literature against primary sources. The measured results hold. **No frozen result, score or denominator changed.** The pass found one misleading cost statement, one wrong cross-reference, eight inaccurate or incomplete cells in the appendix comparison table, and four small attribution or citation errors. All are corrected. Most of the table corrections reduce Lattice's apparent lead over related work.

**No narrative was rewritten.** The request was to review, and redrafting would add AI-drafted manuscript text while the publisher question is open. Edits are limited to factual corrections. Judgment calls are listed in section 6 for the authors.

## 1. C4: evaluation

Recomputed independently of `c4-tables.mjs` and the report scripts:

| Claim | Check | Result |
| --- | --- | --- |
| Hosted timing table, 6 rows × 6 columns | Own quantiles over raw rows in `validated-free-full.json`; 10,000-resample bootstrap with a different seed | All cells match, and the intervals match to the printed precision |
| Residual definition | `14-validated-live.mjs` lines 124–131 | `wallMs − httpMs − backoffMs − pacingMs`, as stated. Hashing, budget ledger and JSON parsing run inside the timed window (`live-observer.mjs`) |
| Quality table, 4 rows × 6 columns | Raw rows joined to judge rows, strict rule re-implemented | All match, including strict support 39/44/42/41. The generator reads these counts from the summary and asserts only their ordering, so this is the first recount from row level |
| 3,570/3,570 attacks; 70 repeats accepted and excluded | `tamper.json`, row counts by category | Match (51 mutations × 70 receipts) |
| Replay 350/350, one-character change, 7 adapters | `replay.json`, `04-replay.mjs` line 43 | Match |
| Routing 1,000 requests, 0 violations; leakage 0/14; mustCite 36/36 | Saved results | Match |
| Matched probes 6, 21, 3 and 12; signed-arm parity | `accountability.json` | Match |
| 428/428 free, 213/1,020 paid, 0/450 paid latency | Row counts and summaries | Match |
| Excluded Dots/U case is the HTTP-200 error envelope | Row 7: `ok: true`, `correct: false`, status 200 | Confirmed |
| 71 verifier checks include closed-chain and signing-failure behavior; released 1.6.0 ignores closure | `v16.json` | Confirmed |
| Measured revisions | `a8c1496`, `5c0d1c8`, `3330ca2`, `07cd900`, `ae99fb5`, `617c565` | All exist. `tamper`, `replay` and `policy` hold deterministic counts with no timestamps, so a rerun at `a8c1496` leaves them byte-identical |

**Finding, corrected.** The requirements table reported the signing cost as "0.214 ms (small text) to 1.354 ms (1 MB image)", which reads as a range. Across the ten measured configurations the signed-minus-unsigned median runs from **0.195 to 5.142 ms**: the 50-artifact run is 5.142 ms and 1 MB text is 2.098 ms. All ten were in the appendix table, and the Section 7.6 prose was accurate because it named its two configurations. `c4-tables.mjs` now derives the range from `overhead.json`, and the requirements table and one sentence of Section 7.6 report it. "Milliseconds per run" in the Conclusion remains correct.

**Checked and dismissed.** A local `overhead_raw.csv` gives different medians, but it is a gitignored leftover from October 22, before the October 26 remeasurement. The paper's values match the committed `overhead.json`.

## 2. C5: managerial implications

Every factual statement in Section 9 and the responsibility table was traced. The 16, 15 and 14 counts come from the generator. Signing failure defaults to `"flag"`, returning `receiptError` (`runtime/config.ts`, `agent/runtime.ts:171`); a crew-start failure always throws. So "the default error response does not itself stop business action" is accurate. Roles, the pilot and its measures are labelled as proposals throughout, and the reference draft stays outside manuscript inputs. No correction was needed.

## 3. C6: related work

The subagent checked metadata for 31 DOIs and 9 arXiv records against Crossref and arXiv, including the three corrected issue years, and found no wrong field. Claude did not repeat that check. Claude did re-read TrustTrack, Janus, Sello, Gregor and Hevner, and Mäntymäki directly and confirmed the quotations below, and confirmed the Baird and Maruping abstract through OpenAlex.

| Location | Was | Source | Now |
| --- | --- | --- | --- |
| `tab:compare`, TrustTrack, log | Not specified | Policies "anchored on-chain"; logs "committed to a shared ledger using Merkle trees" (§§4.2–4.3) | Shared-ledger anchoring proposed |
| `tab:compare`, TrustTrack, output binding | Not specified | "records of inputs, actions, and outputs—signed with its private key" (§4.3) | Proposed: agent-signed logs of inputs, actions and outputs |
| `tab:compare`, TrustTrack, redaction | Not specified | "selective disclosure of relevant events" (§3.2) | Selective disclosure proposed |
| `tab:compare`, Janus, log | Not described | "Janus implements none"; external anchoring "designed but not built" | No; external anchoring designed, not built |
| `tab:compare`, Janus, who signs | Agent runtime, validators, humans | Segment signature by the log owner; "A participant signs what it asks to have recorded"; a person's answer is signed by the relaying participant | Log daemon signs segments; participants sign what they submit |
| `tab:compare`, Janus, effect gating | Yes | "only the MCP edge mediates effects"; "Every real-model result in this paper is on the SDK path" | On the MCP edge; the SDK path is cooperative admission |
| `tab:compare`, Janus, implementation | Implementation | "open source under the MIT license"; Go with a Python SDK | Open-source daemon, SDK and verifier |
| `tab:compare`, Sello, output binding | Signed receipt over the action | `action-input-hash`, `action-output-hash` in the receipt body | Signed receipt with input and output hashes |
| Discussion, "nascent design knowledge" | Cited Gregor & Jones (2007) | The term is Gregor & Hevner's (2013) "Level 2. Nascent design theory" | Cites `gregor2013` |
| Section 2, Baird and Maruping | "This offers a vocabulary for separating…" | This paper's reading; the abstract says artifacts "accept rights and responsibilities" | "We use this vocabulary to separate…" |
| Section 2, Mäntymäki | "external requirements" | "fulfills legal requirements" | "legal requirements" |
| Section 2, comparator pointer | `sec:realworld` | That section has no comparator; it is in `tab:c4-threats` and `tab:validated-accountability` | Points to `tab:c4-threats` |
| `tab:is-synthesis` note | Only the final column is interpretation | Subagent finding, not re-read by Claude: "recording alone does not establish integrity" is not stated by Moreau or Raji | The stated limits and final column are interpretation |

The other attributed claims matched at the access level recorded in the source map. Full text was not available for Baird and Maruping, Berente, Papagiannidis, Wieringa (2020), Gregor and Jones, or Hevner. Their claims are checked at abstract level only, and Wieringa was missing from the map's abstract-only list.

## 4. C7: relocation

Every sentence of the baseline artifact and limitations text (`73a47cf`) was compared with the current manuscript and appendix. Only intentional figure and table condensations differ, so nothing was lost, and the successful-runs-only clarification survives in Appendix A. Appendix A's own claims also hold:

- Both manifests read 1.6.0, Node `>=24` and `pnpm@10.33.1`.
- 1,782/1,782 and 196/196 tests.
- ASQA 0 and 4 of 948.
- Rerun figures: 1.66–3.01 ms, 0.066–0.265%, Liquid p95 0.716%, two budget-stopped crews, no agent stage.
- All named commands and paths exist; `createExternalExecutionAudit` is exported; the IEEE rendering note is accurate.

No correction was needed in the relocation itself. The AI-use declaration pointed to Section 6 for a clarification that now sits in Appendix A, and it is updated.

## 5. C1: abstract and Introduction

The Article 12 sentence does not imply the duty applies today, the roadmap matches the current sections, the abstract is about 170 words, and the limits agree with Sections 7–9. No edit was made, because this text is human-written and awaits author review. One tension is listed in section 6.

## 6. For the authors (not changed)

1. **"We derive requirements" (Introduction) and "develops" (Conclusion).** Section 3 says the runtime came first and the requirements are a retrospective refinement. A reviewer may read "derive … formulate … instantiate" as a forward process. Consider "We refine requirements against governance and auditing literature…".
2. **Accountability definition (Section 2).** It omits consequences, which Wieringa lists as an element following Bovens (2007). Bovens is not in the bibliography. The sentence currently follows Novelli, who treats enforcement separately. Decide which you intend.
3. **Practitioner protocol.** It compares receipts with "conventional logs", but the paper's own result is parity with a signed log. A signed-log arm would be a fairer test. Its opening also says the evaluation "establishes technical efficacy", which is stronger than the rest of the paper.
4. **Read the full texts** listed in section 3 before relying on them (A1/P5, C6).
5. **Smaller wording fits.** `hevner2004` is a weak fit for the artifact/knowledge distinction (Section 2.5), since Gregor and Hevner place it in the pragmatic-design camp. Shneiderman places reliability at team level and oversight at industry level, not "organizational practice". "IS research frames…" rests on one special-issue introduction.
6. **`tab:overhead` caption** defines "Overhead", but the table has no such column. The caption comes from `06-report.py`, which was not rerun.
7. **Bibliography (P2).** `felzmann2019` lacks its article number, `grisold2025` has an en dash where the title has a hyphen, FrugalGPT (TMLR) and RouteLLM (ICLR 2025) are cited as arXiv, and RFC 6962 is obsoleted by RFC 9162.
8. **Before submission.** Red `\todo` items and the "Table prepared with OpenAI Codex" notes still render in the PDF.

## 7. Publisher policy

Unchanged. Taylor & Francis does not allow generative AI to create a first draft of manuscript sections. Sections 3, 4, 5 and the public-record results remain Claude-drafted, the authorship of Sections 2, 6, 7 and 9 is unconfirmed after Codex's edits, and the C4–C6 reference drafts still need author rewriting. This review neither resolves nor worsens that (A1/P5).
