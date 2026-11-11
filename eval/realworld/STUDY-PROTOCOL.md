# Auditor study protocol and materials

Status: preparation only. No recruitment, consent collection, participant data, or claims of human evaluation. Obtain the authors' institutional ethics determination and approval before recruiting; register hypotheses, analysis, exclusions, compensation and data retention before data collection.

## Question and design

Can auditors using Lattice's execution semantics identify evidence gaps faster or more accurately than auditors viewing an ordinary JSON log or a generic signed log?

Use a within-participant, counterbalanced three-condition design. All conditions receive the same underlying record and available public key. The generic signed condition signs every field in the Lattice receipt, including task, policy and provider-request digests. Its verifier receives equivalent expected-value checks. Do not attribute Ed25519's integrity benefit uniquely to Lattice. The treatment is presentation and integrated execution/contract semantics, which the offline benchmark does not measure.

Use the synthetic fixtures and mutation classes from `scripts/15-accountability.mjs`. Generate fresh identifiers for parallel forms; preserve difficulty and evidence content. Recruit only after approval. Determine sample size from a separate pilot's within-participant variance and a prespecified meaningful effect, not from the result of an underpowered main study.

## Participant briefing and consent draft

You will inspect synthetic AI-run records and decide what conclusions their evidence supports. Tasks involve no real customer data. Participation is voluntary, you may skip questions or stop without penalty, and performance will not be shared with employers. The approved consent form must specify compensation, investigator contact, withdrawal procedure, recordings, retention period and who can access identifiable data. Do not deploy this draft as an approved consent form.

Explain signature verification, expected-value checks and trusted-issuer limitations with one worked practice record. Give every condition the same factual explanation and time for practice. Do not tell participants which interface is expected to win.

## Task bank and scoring key

| Scenario | Prompt to participant | Correct conclusion |
| --- | --- | --- |
| Intact record | Is this the expected task, policy and output under the supplied key? | Accept integrity and explicit expected-value checks; do not infer truth of the model answer. |
| Edited output | Has the kept answer changed after signing? | Signed arms reject stale-signature edits; an unanchored ordinary log cannot establish historical integrity. |
| Edited task | Does this receipt establish the requested instruction? | Require the task expectation; mere signature validity does not establish the relying party's intended task. |
| Wrong policy | Did the run commit to the required policy? | Compare normalized policy digest to the expectation. |
| Changed input | Is the supplied artifact the committed artifact? | Recompute its digest; mismatch rejects the artifact association. |
| Changed submitted body | Does the request sequence match the expected submission? | Compare exact ordered body digests; no claim of receiver consumption. |
| Wrong key | Is the record attributable to the trusted issuer? | Reject untrusted-key signatures. |
| Trusted signer rewrite | Can a valid signature reveal a dishonest trusted issuer? | No. An authorized signer can issue a fresh, internally valid false record. |
| Missing binding | Does an older valid signature prove task/request identity? | No; require the optional binding explicitly. |
| Failed run | Can an absent output hash be treated as a replay mismatch? | No; classify the run as ineligible for output replay. |
| Missing crew member | Does the provided closed chain establish completeness? | Require closure and validate the member set; check signer errors too. |
| Unsupported citation | Does a valid citation ID establish claim support? | No; source entailment requires separate checking. |

Score each task 0–2: one point for the decision and one for the evidence boundary. Use two blinded raters for free-text justifications; resolve disagreements under a preregistered rubric. Report agreement before adjudication.

## Procedure and measures

1. Consent, experience questionnaire and balanced tutorial.
2. Practice tasks excluded from analysis.
3. Three counterbalanced blocks with equivalent task variants and equal tools; randomize order within blocks.
4. Record decision, justification, confidence and elapsed time per task. Cap time equally and record timeouts rather than deleting them.
5. Brief workload and usability questions, then a neutral debrief.

Primary outcome: task accuracy (decision plus boundary). Secondary outcomes: completion time, false assurance rate, confidence calibration and workload. Compare conditions using participant and task effects; report uncertainty and multiplicity handling. Analyze timeouts and missing answers as prespecified failures, with sensitivity analyses. Keep recruitment, exclusions and all analyzed denominators visible.

## Data and reproducibility checklist

Before recruitment: ethics determination, approved consent, preregistration, power rationale, finalized stimuli, counterbalancing seed, scoring rubric, accessible interfaces and retention policy. Store participant identities separately from coded responses. Publish only approved anonymized aggregates and synthetic materials. A model or agent spot-check of citations must never be labeled participant or human validation.
