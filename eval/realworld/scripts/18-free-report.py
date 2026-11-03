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
    return {"version": "free-report/v1", "env": env, "groups": groups,
            "expected": sum(g["expected"] for g in groups), "recorded": len(rows),
            "runtimeSuccess": metrics.tally(rows, "ok"),
            "warmupRows": sum(r["suite"] == "latency-warmup" for r in full["rows"]),
            "stopped": full.get("stopped"), "judgeStopped": judge.get("stopped"),
            "statusCounts": dict(Counter(str(c["status"]) for c in calls)),
            "lengthLimitedCalls": sum(c.get("finishReason") == "length" for c in calls),
            "accounting": {"requestsAcrossStages": len(ledger["entries"]),
                           "reportedCostUsd": sum(e["costUsd"] or 0 for e in ledger["entries"]),
                           "unreportedCosts": sum(e["costUsd"] is None for e in ledger["entries"]),
                           "requestCap": ledger["maxRequests"], "inferencePriceGuard": "zero-priced :free models and endpoints only"},
            "limitations": ["Separate exploratory free-model cohort; do not pool with the earlier paid cohort.",
                            "Provider-default reasoning is included; output allowances differ from paid results.",
                            "Free-tier queueing and availability limit latency generalization; 20 trials per arm are descriptive.",
                            "Fixed free judge is not human validated; its judgments are exploratory and not official ALCE scores.",
                            "Synthetic non-disclosure prompts are not an adversarial privacy evaluation.",
                            "16x16 solid-color images are narrow transport fixtures, not a general vision benchmark."]}


def markdown(report):
    lines = ["# Free-model evaluation", "", "This is a separate cohort; earlier paid results remain unchanged.", "",
             f"Recorded **{report['recorded']}/{report['expected']}** planned cases, with **{report['runtimeSuccess']}** runtime successes. "
             f"An additional {report['warmupRows']} warmup rows are excluded from those totals.", "",
             f"Reported inference cost across development smoke, evaluation and judging: **${report['accounting']['reportedCostUsd']:.6f}** "
             f"over {report['accounting']['requestsAcrossStages']} requests. "
             f"{report['accounting']['unreportedCosts']} responses did not report a cost; they used verified zero-priced routes.", "",
             f"Evaluation stop: {report['stopped'] or 'none'}. Judge stop: {report['judgeStopped'] or 'none'}.", "",
             "## Runtime and transport", "", "| Model | Suite | Arm | Recorded / planned | Runtime success | Correct |", "|---|---|---|---:|---:|---:|"]
    for g in report["groups"]:
        lines.append(f"| {g['model']} | {g['suite']} | {g['arm']} | {g['attempted']}/{g['expected']} | {g['runtimeSuccess']} | {g['correct'] if g['correct'] is not None else '—'} |")
    lines += ["", "Runtime success means execution completed; it does not establish answer quality. Correct transport requires the exact JSON token or named image color. Correct agents/crews require actual tool use/delegation plus the supplied policy and source marker.", "",
              "## Citations", "", "| Model | Arm | Format valid / 60 | Usable / 60 | Valid judge / attempted | Strict supported answer / 60 |", "|---|---|---:|---:|---:|---:|"]
    for g in report["groups"]:
        if g["suite"] == "citations":
            c = g["citations"]
            lines.append(f"| {g['model']} | {g['arm']} | {c['formatValid']} | {c['usable']} | {c['judgeValid']}/{c['judgeAttempted']} | {c['strictSuccess'] if c['strictSuccess'] is not None else 'unmeasured'} |")
    lines += ["", f"Fixed exploratory judge: `{report['env']['judgeModel']}`. Invalid/unavailable outputs stay in the 60-question denominator. Unjudged quality is unknown. Sources and frozen question manifest match the prior evaluation protocol; no heldout prompt tuning or automatic repair was used.", "",
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
    lines += ["", "## Provenance and limits", "", f"Measured revision: `{report['env']['revision']}`. Runtime hash: `{report['env']['codeHash']}`.", "",
              "All request bodies are hashed before egress without mutation. Catalog and endpoint prices, model IDs, generation limits, harness hashes and dataset manifests are recorded in the JSON artifacts. The paid ledger was never opened for writes by the free runner.", ""]
    lines += ["- " + item for item in report["limitations"]]
    lines += ["", "[OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free) document zero-cost access and separate availability limits. [Rate-limit documentation](https://openrouter.ai/docs/api/reference/limits) describes the daily free-request quota.", ""]
    return "\n".join(lines)


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
        print("free-report self-test passed")
        return
    full = json.loads((RESULTS / "validated-free-full.json").read_text())
    judge_path = RESULTS / "validated-free-judge.json"
    judge = json.loads(judge_path.read_text()) if judge_path.exists() else {}
    ledger = json.loads((ROOT / ".context/free-request-ledger.json").read_text())
    report = summarize(full, judge, ledger)
    (RESULTS / "validated-free-summary.json").write_text(json.dumps(report, indent=2) + "\n")
    (RESULTS / "validated-free-summary.md").write_text(markdown(report))
    print(json.dumps({k: report[k] for k in ("recorded", "expected", "runtimeSuccess", "stopped", "accounting")}))


if __name__ == "__main__":
    main()
