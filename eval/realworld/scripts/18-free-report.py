"""Report the separate free-model cohort without inference or private answers."""
from __future__ import annotations

import importlib.util
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RESULTS = ROOT / "eval/realworld/results"
spec = importlib.util.spec_from_file_location("validated_report", Path(__file__).with_name("16-validated-report.py"))
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


def summarize(full, judge, ledger):
    env = full["env"]
    assert env["cohort"] == "free"
    counts = env["counts"]
    expected = {"transport": (counts["transport"], ["direct", "signed"]),
                "privacy": (counts["privacy"], ["signed"]),
                "agent": (counts["agents"], ["signed"]), "crew": (counts["agents"], ["signed"]),
                "citations": (counts["citations"], ["prompt-only", "contract"]),
                "latency": (counts["latency"], ["direct", "unsigned", "signed"])}
    judged = {(r["targetModel"], r["arm"], r["id"].removeprefix(r["targetModel"] + ":")): r
              for r in judge.get("rows", [])}
    seen = set()
    for row in full["rows"]:
        identity = (row["model"], row["suite"], row["arm"], row["id"])
        if identity in seen:
            raise ValueError("Duplicate evaluation row")
        seen.add(identity)
    groups = []
    for model in [m["id"] for m in env["models"]]:
        for suite, (n, arms) in expected.items():
            for arm in arms:
                rows = [r for r in full["rows"] if (r["model"], r["suite"], r["arm"]) == (model, suite, arm)]
                result = {"model": model, "suite": suite, "arm": arm, **metrics.coverage(rows, n)}
                result["receipts"] = metrics.receipt_counts(rows)
                result["correct"] = metrics.tally(rows, "correct") if suite in ("transport", "agent", "crew", "latency") else None
                if suite == "transport":
                    result["byModality"] = {kind: {"attempted": sum(r.get("modality") == kind for r in rows),
                                                  "correct": sum(r.get("modality") == kind and r.get("correct") is True for r in rows)}
                                            for kind in ("image", "json")}
                if suite == "privacy":
                    result.update({field: metrics.tally(rows, field) for field in
                                   ("answerAvailable", "answerContainsMarker", "rawOutputContainsMarker", "signedMarkerLeak")})
                if suite == "crew":
                    result.update({field: metrics.tally(rows, field) for field in ("chainClosed", "childExecuted")})
                if suite == "citations":
                    assert n == 60, "Citation metric denominator must match frozen set"
                    result["citations"] = metrics.citation_summary(rows, judged)
                if suite == "latency":
                    # Only correct, HTTP-successful answers enter timing summaries. Failures remain above.
                    eligible = [r for r in rows if r.get("ok") is True and r.get("correct") is True]
                    result["timing"] = {field: metrics.timing_stats(
                        [(r[field] - r.get("pacingMs", 0) if field == "wallMs" else r[field]) for r in eligible],
                        model + ":" + arm + ":" + field, 10000)
                        for field in ("wallMs", "providerMs", "processingMs")}
                groups.append(result)
    rows = [r for r in full["rows"] if r["suite"] in expected]
    calls = [c for r in full["rows"] for c in r["calls"]]
    citation_pairs = {}
    for row in rows:
        if row["suite"] == "citations" and row["calls"]:
            citation_pairs.setdefault((row["model"], row["id"]), {})[row["arm"]] = [c["bodyHash"] for c in row["calls"]]
    paired = [pair for pair in citation_pairs.values() if len(pair) == 2]
    quality_failures = Counter()
    for row in judge.get("rows", []):
        if not metrics.valid_judge(row):
            continue
        claims = row["claims"]
        failures = {"incorrectAnswer": not row["answerCorrect"], "abstained": row["abstained"],
                    "emptyClaims": not claims, "unsupportedClaim": any(not c["supported"] for c in claims),
                    "uncitedClaim": any(not c["cited"] or not c["citationCount"] for c in claims),
                    "irrelevantCitation": any(c["relevantCitations"] < c["citationCount"] for c in claims)}
        quality_failures.update(k for k, failed in failures.items() if failed)
    return {"version": "free-report/v1", "env": env, "groups": groups,
            "overlappingJudgeFailureCounts": dict(quality_failures),
            "judgeModel": judge.get("env", {}).get("judgeModel", env.get("judgeModel")),
            "judgeEnv": judge.get("env"), "judgeProbes": judge.get("probes", []),
            "wrappedJudgeRows": sum(r.get("judgeWrappedJson") is True for r in judge.get("rows", [])),
            "expected": sum(g["expected"] for g in groups), "recorded": len(rows),
            "runtimeSuccess": metrics.tally(rows, "ok"),
            "warmupRows": sum(r["suite"] == "latency-warmup" for r in full["rows"]),
            "stopped": full.get("stopped"), "judgeStopped": judge.get("stopped"),
            "statusCounts": dict(Counter(str(c["status"]) for c in calls)),
            "lengthLimitedCalls": sum(c.get("finishReason") == "length" for c in calls),
            "acceptedHttp200Errors": sum(r.get("ok") is True and any(c.get("status") == 200 and c.get("errorCode") for c in r["calls"]) for r in rows),
            "citationRequestPairs": {"bothArmsSubmitted": len(paired),
                                     "identicalBodyHashes": sum(p["prompt-only"] == p["contract"] for p in paired)},
            "accounting": {"requestsAcrossStages": len(ledger["entries"]),
                           "reportedCostUsd": sum(e["costUsd"] or 0 for e in ledger["entries"]),
                           "unreportedCosts": sum(e["costUsd"] is None for e in ledger["entries"]),
                           "requestCap": ledger["maxRequests"], "inferencePriceGuard": "zero-priced :free models and endpoints only"},
            "limitations": ["Separate exploratory free-model cohort; do not pool with the earlier paid cohort.",
                            "Provider-default reasoning is included; output allowances differ from paid results.",
                            "Free-tier queueing and availability limit latency generalization; 20 trials per arm are descriptive.",
                            "Processing is residual wall time including harness hashing, ledger writes and JSON work, not pure SDK overhead.",
                            "Fixed free judge is not human validated; its judgments are exploratory and not official ALCE scores.",
                            "Synthetic non-disclosure prompts are not an adversarial privacy evaluation.",
                            "16x16 solid-color images are narrow transport fixtures, not a general vision benchmark."]}


def markdown(report):
    lines = ["# Free-model evaluation", "", "This is a separate cohort; earlier paid results remain unchanged.", "",
             f"Recorded **{report['recorded']}/{report['expected']}** planned cases, with **{report['runtimeSuccess']}** runtime successes. "
             f"An additional {report['warmupRows']} warmup rows are excluded from those totals.", "",
             f"Reported inference cost across development smoke, evaluation and judging: **${report['accounting']['reportedCostUsd']:.6f}** "
             f"over {report['accounting']['requestsAcrossStages']} requests. "
             f"{report['accounting']['unreportedCosts']} requests did not return a cost; they used verified zero-priced routes.", "",
             f"Evaluation stop: {report['stopped'] or 'none'}. Judge stop: {report['judgeStopped'] or 'none'}.", "",
             f"Collection restarts: {len(report.get('collectionRestarts', []))}; failed rows and free request counts were retained. Details are in validated-free-resumes.json when present.", "",
             "## Runtime and transport", "", "| Model | Suite | Arm | Recorded / planned | Runtime success | Correct |", "|---|---|---|---:|---:|---:|"]
    for g in report["groups"]:
        lines.append(f"| {g['model']} | {g['suite']} | {g['arm']} | {g['attempted']}/{g['expected']} | {g['runtimeSuccess']} | {g['correct'] if g['correct'] is not None else '—'} |")
    lines += ["", "Runtime success means execution completed; it does not establish answer quality. Correct transport requires the exact JSON token or named image color. Correct agents/crews require actual tool use/delegation plus the supplied policy and source marker.", "",
              "## Citations", "", "| Model | Arm | Format valid / 60 | Usable / 60 | Valid judge / attempted | Strict supported answer / 60 |", "|---|---|---:|---:|---:|---:|"]
    for g in report["groups"]:
        if g["suite"] == "citations":
            c = g["citations"]
            lines.append(f"| {g['model']} | {g['arm']} | {c['formatValid']} | {c['usable']} | {c['judgeValid']}/{c['judgeAttempted']} | {c['strictSuccess'] if c['strictSuccess'] is not None else 'unmeasured'} |")
    lines += ["", "Strict success requires a usable, correct, non-abstaining answer with at least one factual claim; every claim must be supported and cited, and every listed citation for that claim must be relevant.", "",
              f"Fixed exploratory judge: `{report['judgeModel']}`. Invalid/unavailable outputs stay in the 60-question denominator. Unjudged quality is unknown. Sources and frozen question manifest match the prior evaluation protocol; no heldout prompt tuning or automatic repair was used.", "",
              f"The replacement judge passed {sum(p.get('judgeValid') is True for p in report['judgeProbes'])} synthetic supported/contradicted probes; this is not human calibration. {report['wrappedJudgeRows']} judge replies required removal of a single outer JSON fence. Candidate answers were never normalized. The initial rate-limited Xing attempt is preserved separately and not pooled. Collector hashes distinguish sequential and bounded concurrent grading with the same model, rubric and generation settings.", "",
              "Overlapping judge failure categories (answers can appear in several): " + ", ".join(f"`{k}`: {v}" for k, v in sorted(report["overlappingJudgeFailureCounts"].items())) + ". These are model judgments, not human-confirmed error labels.", "",
              f"{report['citationRequestPairs']['identicalBodyHashes']}/{report['citationRequestPairs']['bothArmsSubmitted']} completed citation request pairs had identical body hashes. The contract validates format after generation; it neither repairs output nor verifies entailment. Differences in generated answer quality across these arms do not establish that the contract improved generation.", "",
              "## Latency", "", "Medians below use successful, correct non-warmup cases. Wall time excludes recorded request pacing. JSON includes bootstrap median intervals and p95; these small free-tier samples do not estimate production latency.", "",
              "| Model | Arm | Eligible / 20 | Wall median ms | HTTP median ms | Processing median ms |", "|---|---|---:|---:|---:|---:|"]
    for g in report["groups"]:
        if g["suite"] == "latency":
            t = g["timing"]
            lines.append(f"| {g['model']} | {g['arm']} | {t['wallMs']['n']} | {metrics.number(t['wallMs']['p50'])} | {metrics.number(t['providerMs']['p50'])} | {metrics.number(t['processingMs']['p50'])} |")
    lines += ["", "## Receipt and privacy checks", ""]
    for model in [m["id"] for m in report["env"]["models"]]:
        groups = [g for g in report["groups"] if g["model"] == model]
        present = sum(g["receipts"]["present"] for g in groups)
        bound = sum(g["receipts"]["expectedBindingsVerified"] for g in groups)
        crew = next(g for g in groups if g["suite"] == "crew")
        privacy = next(g for g in groups if g["suite"] == "privacy")
        lines.append(f"- `{model}`: {bound}/{present} terminal receipts verified with expected bindings; {crew['chainClosed']}/{crew['attempted']} crew chains closed. Privacy answers available {privacy['answerAvailable']}/{privacy['expected']}; answer marker leaks {privacy['answerContainsMarker']}, raw-output marker leaks {privacy['rawOutputContainsMarker']}, signed marker leaks {privacy['signedMarkerLeak']}.")
    if report.get("formatDiagnostics"):
        lines += ["", "## Post-hoc format diagnosis", "", "Counts below explain failures without changing their scores. Empty citation lists are not automatically treated as justified abstentions.", "",
                  "| Model | Arm | Failure category | Count |", "|---|---|---|---:|"]
        for group in report["formatDiagnostics"]["groups"]:
            for category, count in sorted(group["categories"].items()):
                if category != "valid":
                    lines.append(f"| {group['model']} | {group['arm']} | {category} | {count} |")
        finishes = Counter()
        for group in report["formatDiagnostics"]["groups"]:
            finishes.update(group.get("emptyContentFinishReasons", {}))
        lines += ["", "Empty-response finish reasons: " + ", ".join(f"`{k}`: {v}" for k, v in sorted(finishes.items())) +
                  ". Token exhaustion and content filtering are distinct outcomes; filtered responses should not be treated as JSON-repair opportunities."]
    lines += ["", "## Next experiments", "",
              "1. On a separate development set, compare explicit reasoning allowances and output budgets against the current provider defaults. Record visible-answer completion, token use and supported-answer quality together; a larger budget alone is not evidence of improvement.",
              "2. Define and evaluate an explicit abstention result, then validate citation-list and inline-marker consistency. Keep supported answers, justified abstentions, filtering and transport failures separate. Do not silently repair or rescore the frozen answers.",
              "3. On development questions, test claim-level evidence selection and minimal supporting citations. Track irrelevant citations, unsupported claims and answer correctness separately; adding more citations can lower precision without improving support.",
              "4. Calibrate the support judge with blinded human labels before using it to rank models or claim quality gains. The synthetic probes check basic behavior only; a same-vendor judge may introduce bias.",
              "5. Confirm the HTTP-200 error-envelope fix with the existing offline regressions and a new independently recorded cohort when needed. Measure provider availability separately from task quality, and use more timing trials for production latency claims."]
    lines += ["", "## Provenance and limits", "", f"Measured revision: `{report['env']['revision']}`. Runtime hash: `{report['env']['codeHash']}`.", "",
              f"The measured runtime accepted {report['acceptedHttp200Errors']} upstream error envelope inside HTTP 200 as empty output. The task-answer check excluded it from latency statistics. A subsequent adapter fix rejects error envelopes in ordinary and streaming responses; the recorded verdict is retained rather than rewritten.", "",
              "All request bodies are hashed before egress without mutation. Catalog and endpoint prices, model IDs, generation limits, harness hashes and dataset manifests are recorded in the JSON artifacts. The paid ledger was never opened for writes by the free runner.", ""]
    lines += ["- " + item for item in report["limitations"]]
    lines += ["", "[OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free) document zero-cost access and separate availability limits. [Rate-limit documentation](https://openrouter.ai/docs/api/reference/limits) describes the daily free-request quota.", ""]
    return "\n".join(lines)


def latex(report):
    names = {"nvidia/nemotron-3.5-super-vl:free": "Nemotron VL",
             "dots-studio/dots-3-note-preview:free": "Dots Note"}
    models = [m["id"] for m in report["env"]["models"]]
    lookup = {(g["model"], g["suite"], g["arm"]): g for g in report["groups"]}
    lines = [r"\FloatBarrier", r"\subsection{Separate zero-cost hosted cohort}",
             f"A separate follow-up recorded {report['recorded']}/{report['expected']} planned cases, excluding "
             f"{report['warmupRows']} latency warmups. It used the free catalog variants of Nemotron 3.5 Super VL and Dots 3 Note Preview. "
             "Model and endpoint prices were checked as zero before inference; model fallback and server-side extensions were disallowed. "
             f"Provider-reported charges across development, evaluation and judging total USD {report['accounting']['reportedCostUsd']:.6f} "
             f"over {report['accounting']['requestsAcrossStages']} requests; {report['accounting']['unreportedCosts']} requests lack a reported cost. "
             "The earlier paid ledger and its unresolved reservations were preserved.",
             "These results are not pooled with the paid cohort. An initial development smoke found Gemma 4 31B rate-limited and "
             "small output allowances exhausted by Nemotron reasoning. Before heldout inference, the second model was changed to Dots "
             "and output caps were fixed at 1024 tokens for simple tasks and 4096 for citations and agents, "
             "with temperature zero and provider-default reasoning. Development recordings remain separate.",
             "Both citation arms use the same 60 frozen ALCE-derived questions and retrieved passages. "
             f"{report['citationRequestPairs']['identicalBodyHashes']}/{report['citationRequestPairs']['bothArmsSubmitted']} "
             "completed citation request pairs had identical body hashes. The contract validates syntax and citation identifiers "
             "after generation; it does not repair answers or establish entailment. Differences in generated quality between arms "
             "therefore do not demonstrate that the contract improved generation."]
    behavior = []
    for model in models:
        transport = sum(lookup[model, "transport", a]["correct"] for a in ("direct", "signed"))
        privacy = lookup[model, "privacy", "signed"]
        behavior.append([names.get(model, model), f"{transport}/20",
                         f"{lookup[model, 'agent', 'signed']['correct']}/2",
                         f"{lookup[model, 'crew', 'signed']['correct']}/2",
                         f"{privacy['answerAvailable'] - privacy['answerContainsMarker']}/10"])
    lines.append(metrics.tex_table("Free-cohort task outcomes. Artifact correctness combines 10 image and 10 JSON calls per model. "
                                   "Agent and crew passes require actual tool use or delegation. Privacy counts delivered marker-free "
                                   "answers to non-disclosure prompts, not adversarial blocking.", "free-behavior",
                                   ["Model", "Artifacts", "Agent", "Crew", "Privacy"], behavior))
    cited = []
    for model in models:
        for arm in ("prompt-only", "contract"):
            c = lookup[model, "citations", arm]["citations"]
            cited.append([names.get(model, model), "Prompt" if arm == "prompt-only" else "Contract",
                          f"{c['formatValid']}/60", f"{c['usable']}/60", f"{c['judgeValid']}/{c['judgeAttempted']}",
                          f"{c['strictSuccess']}/60" if c['strictSuccess'] is not None else "unknown"])
    lines.append(metrics.tex_table("Free-cohort citation outcomes. Judge is valid/attempted judgments; strict means a non-abstaining answer "
                                   "judged correct with at least one claim, every claim supported and cited, and every citation relevant. Missing judgments remain unknown.",
                                   "free-citations", ["Model", "Arm", "Format", "Usable", "Judge", "Strict"], cited))
    judge_name = "Nemotron 3 Ultra" if report.get("judgeModel", "").startswith("nvidia/nemotron-3-ultra") else "Xing 4.0"
    lines.append(f"The fixed free {judge_name} judge is exploratory and has not been calibrated against human annotations. "
                 "These support judgments are neither human accuracy labels nor official ALCE scores. "
                 "Invalid or unavailable answers remain in the 60-question denominator. An initial Xing judge attempt was rate-limited "
                 "and is retained separately, not pooled. The replacement passed two synthetic supported/contradicted probes. "
                 "It uses temperature zero, a 4096-token output cap and a 1024-token reasoning allowance. "
                 "Judge replies may have one outer JSON fence removed; candidate answers are unchanged. Independent judgments "
                 "use a shared rate limiter and at most four concurrent requests; collector hashes record the scheduling transition.")
    failures = report["overlappingJudgeFailureCounts"]
    lines.append(f"Overlapping judge failure labels include {failures.get('irrelevantCitation', 0)} answers with an irrelevant citation, "
                 f"{failures.get('incorrectAnswer', 0)} incorrect answers, {failures.get('uncitedClaim', 0)} answers with an uncited claim, "
                 f"and {failures.get('unsupportedClaim', 0)} with an unsupported claim. These counts overlap and are not human-confirmed labels.")
    if report.get("formatDiagnostics"):
        categories = Counter()
        finishes = Counter()
        for group in report["formatDiagnostics"]["groups"]:
            categories.update(group["categories"])
            finishes.update(group.get("emptyContentFinishReasons", {}))
        descriptions = {"empty-content": "empty responses", "empty-citation-list": "empty citation lists",
                        "unused-source-id": "unused source identifiers", "transport-unavailable": "unavailable responses",
                        "invalid-json": "invalid JSON outputs"}
        failures = [f"{count} {descriptions.get(category, category)}"
                    for category, count in sorted(categories.items()) if category != "valid"]
        lines.append("Post-hoc format diagnostics found " + ", ".join(failures) + ". "
                     f"Among empty responses, {finishes.get('length', 0)} ended at the token limit and "
                     f"{finishes.get('content_filter', 0)} were filtered. These diagnoses do not change scores. "
                     "Empty citation lists are not automatically justified abstentions; filtered outputs are not JSON-repair opportunities.")
    times = []
    for model in models:
        for arm in ("direct", "unsigned", "signed"):
            t = lookup[model, "latency", arm]["timing"]
            times.append([names.get(model, model), metrics.ARMS[arm], t["wallMs"]["n"],
                          metrics.number(t["wallMs"]["p50"], 1), metrics.number(t["processingMs"]["p50"], 2)])
    lines.append(metrics.tex_table("Free-cohort latency medians in milliseconds. D/U/S are direct, unsigned and signed; "
                                   "N counts correct successful trials out of 20, excluding warmups and pacing.",
                                   "free-latency", ["Model", "Arm", "N", "Wall", "Residual"], times))
    lines.append("Residual time includes harness hashing, ledger writes and JSON processing, and is not pure SDK overhead. "
                 "The JSON report includes bootstrap median intervals and p95 values. Small samples and free-tier queueing "
                 "limit latency generalization. Solid-color images and short policy tools are narrow runtime fixtures.")
    lines.append(f"The measured runtime accepted {report['acceptedHttp200Errors']} upstream HTTP-200 error envelope as empty text. "
                 "The answer check excluded it from latency statistics. The adapter was subsequently corrected to reject such envelopes "
                 "in ordinary and streaming responses; the original measurement is retained.")
    if report.get("collectionRestarts"):
        lines.append(f"Collection restarted {len(report['collectionRestarts'])} times after guarded stops, using the same "
                     "harness and free request ledger. Failed cases were retained rather than rerun or replaced; the restart log is included with the results.")
    lines.append(r"Recorded revision \texttt{" + metrics.tex_escape(report["env"]["revision"][:12]) +
                 r"}; full code, harness, model, endpoint and dataset provenance is retained in the free-cohort JSON artifacts.")
    lines.append(r"\FloatBarrier")
    return "\n\n".join(lines) + "\n"


def main():
    if "--self-test" in sys.argv:
        env = {"cohort": "free", "counts": {"transport": 10, "privacy": 10, "agents": 2, "citations": 60, "latency": 20},
               "models": [{"id": "test/model:free"}]}
        row = {"id": "0", "model": "test/model:free", "suite": "latency", "arm": "direct", "ok": True,
               "correct": True, "calls": [], "wallMs": 1500, "pacingMs": 500, "providerMs": 990, "processingMs": 10}
        full = {"env": env, "rows": [row, {**row, "id": "1", "ok": False, "correct": False, "wallMs": 90000},
                                     {**row, "suite": "latency-warmup", "id": "-1"}]}
        result = summarize(full, {}, {"entries": [], "maxRequests": 900})
        assert result["expected"] == 214 and result["recorded"] == 2 and result["warmupRows"] == 1
        timing = next(g for g in result["groups"] if g["suite"] == "latency" and g["arm"] == "direct")
        assert timing["runtimeFailure"] == 1 and timing["timing"]["wallMs"]["p50"] == 1000
        assert timing["timing"]["wallMs"]["n"] == 1
        assert all(g["citations"]["strictSuccess"] is None for g in result["groups"] if g["suite"] == "citations")
        full["rows"].append({**row, "suite": "citations", "arm": "prompt-only", "formatValid": True, "usableAnswer": True})
        judge = {"rows": [{"id": "test/model:free:0", "targetModel": "test/model:free", "arm": "prompt-only",
                           "ok": True, "judgeValid": True, "answerCorrect": True, "abstained": False,
                           "claims": [{"supported": True, "cited": True, "citationCount": 1, "relevantCitations": 1}]}]}
        result = summarize(full, judge, {"entries": [], "maxRequests": 900})
        cited = next(g["citations"] for g in result["groups"] if g["suite"] == "citations" and g["arm"] == "prompt-only")
        assert cited["strictSuccess"] == 1 and cited["strictSuccessPerExpected"] == 1 / 60
        assert cited["unjudgedOrInvalidPerExpected"] == 59
        judge["rows"][0]["claims"][0]["relevantCitations"] = 0
        result = summarize(full, judge, {"entries": [], "maxRequests": 900})
        assert result["overlappingJudgeFailureCounts"] == {"irrelevantCitation": 1}
        cited = next(g["citations"] for g in result["groups"] if g["suite"] == "citations" and g["arm"] == "prompt-only")
        assert cited["strictSuccess"] == 0
        print("free-report self-test passed")
        return
    full = json.loads((RESULTS / "validated-free-full.json").read_text())
    judge_path = RESULTS / "validated-free-judge.json"
    judge = json.loads(judge_path.read_text()) if judge_path.exists() else {}
    ledger = json.loads((ROOT / ".context/free-request-ledger.json").read_text())
    report = summarize(full, judge, ledger)
    resumes_path = RESULTS / "validated-free-resumes.json"
    report["collectionRestarts"] = json.loads(resumes_path.read_text()) if resumes_path.exists() else []
    diagnostics_path = RESULTS / "validated-free-format-analysis.json"
    report["formatDiagnostics"] = json.loads(diagnostics_path.read_text()) if diagnostics_path.exists() else None
    (RESULTS / "validated-free-summary.json").write_text(json.dumps(report, indent=2) + "\n")
    (RESULTS / "validated-free-summary.md").write_text(markdown(report))
    fragment = latex(report)
    for directory in (RESULTS, ROOT / "paper", ROOT / "paper/ieee"):
        (directory / "validated-free.tex").write_text(fragment)
    print(json.dumps({k: report[k] for k in ("recorded", "expected", "runtimeSuccess", "stopped", "accounting")}))


if __name__ == "__main__":
    main()
