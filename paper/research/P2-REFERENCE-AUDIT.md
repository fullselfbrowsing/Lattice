# P2: reference identifier and metadata audit

**Identifier audit complete November 9, 2026; final author/source review and post-rewrite citation reconciliation remain open.** GSD task `261109-bo3`, baseline `3a4722e`. See the [machine-readable audit](P2-REFERENCE-AUDIT.json) for all 85 entries, metadata, source URLs, access outcomes, registry-response hashes and exact field changes.

## Outcome

| Measure | Result |
| --- | ---: |
| Entries in the working `.bib` | 85 |
| Distinct entries cited by the active manuscript and its inputs | 82 |
| Existing DOI fields checked against registries | 58 |
| Verified DOI additions | 3 |
| DOI fields after this pass | 61 |
| Original 22 entries retaining an official identifier/URL without an added DOI | 19 |
| Other entries without a DOI | 5: four public decisions and the dated Commission service-desk record |
| Duplicate keys / duplicate DOI values / missing active citation keys | 0 / 0 / 0 |

Three additions are supported by primary metadata:

- **ALCE:** [10.18653/v1/2023.emnlp-main.398](https://aclanthology.org/2023.emnlp-main.398/). Added the full proceedings name, publisher and pages 6465–6488; retained the code repository separately.
- **Agent Flight Recorder:** [10.48550/arXiv.2609.01931](https://arxiv.org/abs/2609.01931). The entry now identifies the consulted arXiv v1 preprint. A note preserves arXiv's report of BCCA 2026 acceptance; no final proceedings identifier or page range was inferred.
- **NovaFabric:** [10.48550/arXiv.2609.12582](https://doi.org/10.48550/arXiv.2609.12582). The arXiv landing page still says registration is pending, but the [DataCite record](https://api.datacite.org/dois/10.48550/arXiv.2609.12582) is findable and the resolver returned the matching arXiv page with HTTP 200 on November 9. The entry remains a v1 preprint, not a journal/conference publication.

Two further metadata corrections were made. Sculley et al. now has pages 2503–2511, confirmed by the [author institution's publication record](https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/); the proceedings server timed out. Gretel's citation now credits the seven people listed in the [pinned dataset-card citation](https://huggingface.co/datasets/gretelai/synthetic_pii_finance_multilingual/blob/7b844d16738527a04264f50214cb426a4cea0897/README.md), with Gretel.ai retained in the note. The card's suggested title refers to North America while the actual repository is multilingual. We retain the descriptive multilingual title and exact repository/revision, and flag that source inconsistency for author review.

## Method and interpretation

The audit extracted all BibTeX entries, traversed active `\input` files from `main.tex`, and compared cited keys with the bibliography. Crossref records were retrieved for article/conference/chapter/report DOIs; DataCite records for arXiv, Zenodo and Hugging Face DOIs. Initial Crossref rate-limit responses were retried sequentially; all 58 existing DOI records and the three additions were retrieved successfully. Titles, author identity, dates and applicable venue/volume/issue/pages were compared. Known online-first versus final-issue years were preserved. No citation key changed.

For missing DOIs, the inspected publisher, repository, specification or dataset record is the authority. **No DOI located in an inspected record is a bounded search outcome**, not proof that no identifier exists anywhere. A law's ELI, a standard number, a decision number or a versioned specification URL can be the appropriate identifier. Do not create DOI-shaped strings or transfer a paper's DOI to a different software artifact.

This is reference management, not a systematic review, an author reading certification or a new review of empirical source claims. Bibliographic identity does not establish that the cited work supports every manuscript sentence. Full-text gaps recorded under C6 remain open.

## Disposition of the original 22

All retrievals below were attempted November 9, 2026. Exact outcomes and sources are also in the JSON record.

| Key | Primary record / identifier | Disposition and version boundary |
| --- | --- | --- |
| `crosby2009` | [USENIX proceedings](https://www.usenix.org/conference/usenixsecurity09/technical-sessions/presentation/efficient-data-structures-tamper-evident) | No DOI in the publisher citation; retain the 2009 proceedings URL. |
| `sculley2015` | [Google Research](https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/) | Author record verified; pages added. No DOI supplied there; proceedings endpoint timed out. |
| `euaiact2024` | [Regulation 2024/1689 ELI](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) | Retain legal identifier. Current automated access challenged; C3 provision work is separate. |
| `iso42001` | [ISO/IEC 42001:2023 catalog](https://www.iso.org/standard/42001) | First edition, December 2023 verified from catalog. No catalog DOI; full standard was not purchased/read in this pass. |
| `dsse` | [Official specification repository](https://github.com/secure-systems-lab/dsse) | No DOI located. Original consulted revision is unrecorded. |
| `slsa` | [SLSA v1.0](https://slsa.dev/spec/v1.0/) | No DOI located; preserve the cited version. |
| `mcp` | [2025-06-18 specification](https://modelcontextprotocol.io/specification/2025-06-18) | No DOI located; preserve the dated specification. |
| `otel` | [Official specification](https://opentelemetry.io/docs/specs/otel/) | No DOI located. Live page is 1.62.0; originally consulted version is unrecorded and was not retroactively set to that value. |
| `lattice` | [Project repository](https://github.com/fullselfbrowsing/Lattice) | No repository DOI located. P4 deposit is still pending; measured commits remain separately recorded. |
| `latticeissue21` | [Issue 21](https://github.com/fullselfbrowsing/Lattice/issues/21) | Issue identifier retained; no DOI located. The live title has an additional submission-blocking suffix. |
| `gretelfinance` | [Pinned dataset card](https://huggingface.co/datasets/gretelai/synthetic_pii_finance_multilingual/blob/7b844d16738527a04264f50214cb426a4cea0897/README.md) | No DOI in the card; author attribution corrected. Revision and dataset identity preserved; title inconsistency noted above. |
| `presidio` | [Historical repository URL](https://github.com/microsoft/presidio) | Redirects to `data-privacy-stack/presidio`. No DOI located; historical Microsoft attribution/URL retained without changing experimental versions. |
| `llmguard` | [Official repository](https://github.com/protectai/llm-guard) | No DOI located; repository record is not a measured release identifier. |
| `litellm` | [Official repository](https://github.com/BerriAI/litellm) | No DOI located; current README capabilities are not imported into historical comparisons. |
| `portkey` | [Official repository](https://github.com/Portkey-AI/gateway) | No DOI located; historical comparison scope retained. |
| `openllmetry` | [Official repository](https://github.com/traceloop/openllmetry) | No DOI located; do not infer the original version from current head. |
| `langchain` | [Official product site](https://www.langchain.com/) | No DOI located; combined LangChain/LangGraph documentation citation has no pinned consulted revision. |
| `cosign` | [Official repository](https://github.com/sigstore/cosign) | No DOI located; the separately cited Sigstore paper has its own DOI. |
| `intoto` | [USENIX proceedings](https://www.usenix.org/conference/usenixsecurity19/presentation/torres-arias) | Publisher citation has no DOI; authors, year and pages match. |
| `bindschaedler2026afr` | [arXiv v1](https://arxiv.org/abs/2609.01931v1) | Verified arXiv DOI added; preprint and reported acceptance distinguished. |
| `ardebili2026novafabric` | [arXiv v1](https://arxiv.org/abs/2609.12582v1) | Verified arXiv DOI added after checking registry and resolver despite stale pending label. |
| `alce` | [ACL Anthology](https://aclanthology.org/2023.emnlp-main.398/) | Verified proceedings DOI and missing venue/page metadata added. |

## Existing DOI exceptions and rendering

- **spaCy:** [DataCite](https://api.datacite.org/dois/10.5281/zenodo.1212303) presents release metadata for the collection DOI. The official [CITATION.cff](https://github.com/explosion/spaCy/blob/master/CITATION.cff) prescribes the existing four-author 2020 project citation with that DOI. Keep the recommended citation; do not convert the experimentally measured version into the registry's currently displayed v3.7.2. The concept DOI has `HasVersion` relationships.
- **Registry transcription:** Crossref includes footnote numerals in the Hevner/Gregor titles, institutional strings among Asatiani's author entries, and `Gergor` for Gregor in the uncited Baskerville record. Those artifacts are not propagated. Raji/Wieringa subtitles are stored separately; they do not identify different works.
- **Dates:** C6's final-issue years for Mökander, Novelli and Schneider remain intact. Rai and Rinta-Kahila also have online-first dates preceding their cited issue years. An older citation key is not an instruction to restore the online-first year.
- **Unused records:** `baskerville2018`, `bommasani2021` and `greshake2023` remain available in the source bibliography but do not appear in the compiled reference list. They are not duplicate works. Reconcile or prune unused source entries when assembling the final P6 package after author rewriting; no new citations were inserted to justify keeping them.
- **Style:** `apalike` does not print native `doi` or `url` fields; URL notes do render. A7 confirms that DOI display is recommended, not mandatory, and a consistent scholarly style is accepted initially. Verified DOI metadata remains in the required `.bib`; no journal-style migration or blanket duplication into notes was performed. The final style and source package must retain these fields.

## Validation and assistance

Only five bibliography entries were edited. `main.tex`, including the narrative, abstract, title, funding and declaration, is unchanged. Existing C2–C8 sources, generated measurements, runtime/API files, Ai4Privacy documentation and the separate IEEE manuscript are protected by the starting hash manifest. The rebuilt PDF and final validation results are recorded in the GSD task summary. No inference, evaluation rerun, external message or submission occurred.

OpenAI Codex performed metadata retrieval/comparison, bibliography corrections, audit records and build/render checks. Exact session model/version is unconfirmed. This assistance belongs in the eventual A1/P5 reconciliation; it does not establish human authorship, completion of author source reading or verification of tool terms. Source-title/version gaps above and the post-rewrite final reference pass remain author/package review items.
