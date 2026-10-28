"""Generate aggregate reports and figures without inference or raw-corpus reads.

Only public result JSON files and the optional budget ledger are read. Partial
collection remains incomplete; smoke cases never enter evaluation denominators.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import shutil
from collections import Counter
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

VERSION = "validated-report/v1"
BOOTSTRAP_SEED = 20261027
DEFAULT_MODELS = ["openai/gpt-4.1-mini", "google/gemini-2.5-flash-lite", "anthropic/claude-haiku-4.5"]
SHORT = dict(zip(DEFAULT_MODELS, ("GPT-4.1 mini", "Gemini Flash Lite", "Claude Haiku 4.5")))
TYPES = ("email", "us-ssn", "us-phone", "credit-card")
ARMS = {"direct": "D", "unsigned": "U", "signed": "S", "prompt-only": "Prompt", "contract": "Contract"}
EXPECTED = {"latency": (50, ("direct", "unsigned", "signed")),
            "transport": (20, ("direct", "signed")), "privacy": (20, ("signed",)),
            "agent": (5, ("signed",)), "crew": (5, ("signed",)),
            "citations": (60, ("prompt-only", "contract"))}
TIMINGS = ("wallMs", "providerMs", "processingMs")
TIMING_NAMES = {"wallMs": "Wall", "providerMs": "Provider HTTP", "processingMs": "Processing"}
ALCE_URL = "https://github.com/princeton-nlp/ALCE"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def finite(value) -> bool:
    return type(value) in (int, float) and math.isfinite(value)


def fraction(numerator, denominator):
    return numerator / denominator if denominator else None


def number(value, places=3):
    return f"{value:.{places}f}" if finite(value) else "—"


def percent(value):
    return f"{value * 100:.1f}%" if finite(value) else "—"


def tally(rows, field):
    return sum(row.get(field) is True for row in rows)


def timing_stats(values, key, draws):
    values = np.asarray(sorted(value for value in values if finite(value) and value >= 0), dtype=float)
    if not len(values):
        return {"n": 0, "p50": None, "p95": None, "medianCI95": None}
    interval = None
    if len(values) >= 2:
        seed = int(digest(f"{BOOTSTRAP_SEED}:{key}".encode())[:16], 16)
        rng = np.random.default_rng(seed)
        medians = np.median(rng.choice(values, size=(draws, len(values)), replace=True), axis=1)
        interval = [float(value) for value in np.quantile(medians, [0.025, 0.975])]
    return {"n": len(values), "p50": float(np.median(values)),
            "p95": float(np.quantile(values, 0.95)), "medianCI95": interval}


def coverage(rows, expected):
    if len(rows) > expected:
        raise ValueError("Observed cases exceed the preregistered denominator")
    success = tally(rows, "ok")
    return {"expected": expected, "attempted": len(rows), "unattempted": expected - len(rows),
            "runtimeSuccess": success, "runtimeFailure": len(rows) - success,
            "runtimeSuccessPerExpected": fraction(success, expected),
            "errorKinds": dict(sorted(Counter(str(row.get("errorKind") or "unspecified")
                                               for row in rows if row.get("ok") is not True).items())),
            "httpStatuses": dict(sorted(Counter(str(call.get("status"))
                                                for row in rows for call in row.get("calls", [])).items()))}


def receipt_counts(rows):
    fields = ("present", "verified", "taskBound", "policyBound", "requestBound",
              "expectedBindingsVerified", "submittedBodiesCovered",
              "outputBindingEligible", "outputHashMatch", "editedOutputDetected")
    return {field: sum(row.get("receipt", {}).get(field) is True for row in rows) for field in fields}


def valid_judge(row):
    if not row or row.get("ok") is not True or row.get("judgeValid") is not True:
        return False
    if type(row.get("answerCorrect")) is not bool or type(row.get("abstained")) is not bool:
        return False
    claims = row.get("claims")
    return isinstance(claims, list) and all(
        isinstance(claim, dict) and type(claim.get("supported")) is bool and type(claim.get("cited")) is bool
        and type(claim.get("citationCount")) is int and type(claim.get("relevantCitations")) is int
        and 0 <= claim["relevantCitations"] <= claim["citationCount"] for claim in claims
    )


def citation_summary(rows, judged):
    result = coverage(rows, 60)
    result.update({"formatValid": tally(rows, "formatValid"), "usable": tally(rows, "usableAnswer"),
                   "judgeAttempted": 0, "judgeRuntimeSuccess": 0, "judgeValid": 0,
                   "usableJudgeValid": 0, "judgeAbstained": 0, "emptyClaimJudgments": 0,
                   "answerCorrect": 0, "usableAnswerCorrect": 0, "strictSuccess": 0})
    counts = {"claims": 0, "supported": 0, "cited": 0, "supportedAndCited": 0,
              "relevantCitations": 0, "totalCitations": 0}
    for row in rows:
        judge = judged.get((row["model"], row["arm"], str(row["id"])))
        if not judge:
            continue
        result["judgeAttempted"] += 1
        result["judgeRuntimeSuccess"] += judge.get("ok") is True
        if not valid_judge(judge):
            continue
        result["judgeValid"] += 1
        usable = row.get("ok") is True and row.get("formatValid") is True and row.get("usableAnswer") is True
        result["usableJudgeValid"] += usable
        result["judgeAbstained"] += judge["abstained"]
        result["answerCorrect"] += judge["answerCorrect"]
        result["usableAnswerCorrect"] += usable and judge["answerCorrect"]
        claims = judge["claims"]
        result["emptyClaimJudgments"] += not claims
        for claim in claims:
            counts["claims"] += 1
            counts["supported"] += claim["supported"]
            counts["cited"] += claim["cited"]
            counts["supportedAndCited"] += claim["supported"] and claim["cited"]
            counts["relevantCitations"] += claim["relevantCitations"]
            counts["totalCitations"] += claim["citationCount"]
        strict = (usable and judge["answerCorrect"] and not judge["abstained"] and bool(claims)
                  and all(claim["supported"] and claim["cited"] and claim["citationCount"] > 0
                          and claim["relevantCitations"] == claim["citationCount"] for claim in claims))
        result["strictSuccess"] += strict
    result.update({"judgeInvalid": result["judgeAttempted"] - result["judgeValid"],
                   "unjudgedOrInvalidPerExpected": 60 - result["judgeValid"],
                   "usableUnjudgedOrInvalid": result["usable"] - result["usableJudgeValid"],
                   "formatInvalidOrUnavailable": 60 - result["formatValid"],
                   "answerCorrectPerExpected": result["usableAnswerCorrect"] / 60,
                   "strictSuccessPerExpected": result["strictSuccess"] / 60,
                   "answerCorrectAmongValidJudgments": fraction(result["answerCorrect"], result["judgeValid"]),
                   "claims": {**counts, "support": fraction(counts["supported"], counts["claims"]),
                              "citedCompleteness": fraction(counts["cited"], counts["claims"]),
                              "supportedAndCitedCompleteness": fraction(counts["supportedAndCited"], counts["claims"]),
                              "citationPrecision": fraction(counts["relevantCitations"], counts["totalCitations"])}})
    result["measurementStatus"] = "measured-with-fixed-denominator" if result["judgeValid"] else "not-measured"
    if not result["judgeValid"]:
        for field in ("answerCorrect", "usableAnswerCorrect", "strictSuccess",
                      "answerCorrectPerExpected", "strictSuccessPerExpected"):
            result[field] = None
    return result


def budget_summary(ledger, snapshots):
    if ledger is not None:
        entries = ledger["entries"]
        confirmed = math.fsum(entry["chargedUsd"] for entry in entries if entry["settled"])
        charged = math.fsum(entry["chargedUsd"] for entry in entries)
        out = {"source": "persisted-ledger", "limitUsd": ledger["limitUsd"],
               "confirmedUsd": confirmed, "chargedOrReservedUsd": charged,
               "requests": len(entries), "unresolvedRequests": sum(not entry["settled"] for entry in entries)}
    else:
        available = [snapshot["budget"] for snapshot in snapshots if snapshot and snapshot.get("budget")]
        if not available:
            return {"available": False, "billingReconciled": False, "withinCap": None}
        out = {**max(available, key=lambda item: item.get("requests", 0)), "source": "result-snapshot"}
    out.update({"available": True, "unresolvedReservedUsd": out["chargedOrReservedUsd"] - out["confirmedUsd"],
                "billingReconciled": out["unresolvedRequests"] == 0,
                "approvalCapUsd": 10,
                "withinCap": 0 < out["limitUsd"] <= 10 and out["chargedOrReservedUsd"] <= out["limitUsd"] + 1e-9,
                "remainingReservedCapacityUsd": max(0, out["limitUsd"] - out["chargedOrReservedUsd"])})
    return out


def macro(report, metric):
    values = [report.get(metric, {}).get(kind, {}).get("f1") for kind in TYPES]
    return math.fsum(values) / len(TYPES) if all(finite(value) for value in values) else None


def pii_summary(profiles, promotion):
    comparisons = {}
    for split in ("dev", "holdout"):
        baseline, candidate = profiles.get(split + "-default"), profiles.get(split + "-contextual")
        if not baseline or not candidate:
            comparisons[split] = {"available": False}
            continue
        comparable = all(baseline.get(key) == candidate.get(key) and baseline.get(key) is not None
                         for key in ("manifestSha256", "datasetSha256", "scorerVersion", "offsetUnit", "documents"))
        exact = {"default": macro(baseline, "spanExact"), "contextual": macro(candidate, "spanExact")}
        overlap = {"default": macro(baseline, "span"), "contextual": macro(candidate, "span")}
        precision = {}
        for kind in TYPES:
            before, after = baseline["spanExact"][kind]["precision"], candidate["spanExact"][kind]["precision"]
            precision[kind] = {"default": before, "contextual": after,
                               "delta": after - before if finite(before) and finite(after) else None}
        comparisons[split] = {"available": True, "comparable": comparable, "documents": baseline["documents"],
                              "exactMacroF1": exact, "overlapMacroF1": overlap,
                              "exactMacroF1Delta": exact["contextual"] - exact["default"]
                              if all(finite(value) for value in exact.values()) else None,
                              "overlapMacroF1Delta": overlap["contextual"] - overlap["default"]
                              if all(finite(value) for value in overlap.values()) else None,
                              "exactPrecision": precision}
    dev, holdout = comparisons["dev"], comparisons["holdout"]
    manifest_match = bool(promotion and promotion.get("manifestSha256") and len(profiles) == 4
                          and all(row.get("manifestSha256") == promotion["manifestSha256"] for row in profiles.values()))
    deltas = [entry["delta"] for entry in holdout.get("exactPrecision", {}).values()]
    gate = {
        "frozenBeforeHoldout": bool(promotion and promotion.get("frozenBeforeHoldout") is True),
        "manifestMatches": manifest_match,
        "sameDataAndScorer": all(row.get("comparable") is True for row in comparisons.values()),
        "supportiveDevelopment": finite(dev.get("exactMacroF1Delta")) and dev["exactMacroF1Delta"] > 0,
        "holdoutExactMacroF1Improves": finite(holdout.get("exactMacroF1Delta")) and holdout["exactMacroF1Delta"] > 0,
        "perTypePrecisionLossWithinOnePoint": len(deltas) == len(TYPES)
        and all(finite(value) and value >= -0.01 - 1e-12 for value in deltas),
    }
    return {"profiles": profiles, "comparisons": comparisons, "preregisteredPromotion": promotion,
            "promotionChecks": gate, "eligibleForDefaultPromotion": all(gate.values()),
            "decision": "eligible-for-review" if all(gate.values()) else "retain-opt-in",
            "interpretation": "Corpus annotation agreement, not estimated deployment precision. Four supported PII types; prose rows do not measure structured-field cues. Historical single-match and many-to-one span scores are not comparable."}


def summarize(full, judge, profiles, promotion, accountability, ledger, termination, draws):
    rows = full.get("rows", [])
    models = list(dict.fromkeys([item["id"] for item in full.get("env", {}).get("models", [])]
                               or DEFAULT_MODELS))
    if any(row["model"] not in models for row in rows):
        raise ValueError("Result row model is absent from the recorded model catalog")
    identifiers = [(row["suite"], row["model"], row["arm"], str(row["id"])) for row in rows]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("Duplicate evaluation cases would inflate denominators")
    source_manifest = full.get("env", {}).get("citationManifest") or {}
    judge_manifest = (judge.get("env", {}).get("citationManifest") or {}) if judge else {}
    evaluation_hash = source_manifest.get("splits", {}).get("evaluation", {}).get("sha256")
    judge_compatible = bool(judge) and bool(evaluation_hash) and (
        judge_manifest.get("splits", {}).get("evaluation", {}).get("sha256") == evaluation_hash
        and judge_manifest.get("revision") == source_manifest.get("revision")
        and judge_manifest.get("rawSha256") == source_manifest.get("rawSha256"))
    judged = {}
    if judge_compatible:
        for row in judge.get("rows", []):
            if row.get("suite") != "citation-judge":
                continue
            model = row.get("targetModel")
            prefix = str(model) + ":"
            if not model or not str(row["id"]).startswith(prefix):
                raise ValueError("Judge row cannot be joined to a source case")
            key = (model, row["arm"], str(row["id"])[len(prefix):])
            if key in judged:
                raise ValueError("Duplicate judge cases")
            judged[key] = row
    groups = []
    for model in models:
        for suite, (expected, arms) in EXPECTED.items():
            for arm in arms:
                selected = [row for row in rows if (row["model"], row["suite"], row["arm"]) == (model, suite, arm)]
                if suite == "latency":
                    selected = [row for row in selected if not row.get("warmup")
                                and not (str(row["id"]).lstrip("-").isdigit() and int(row["id"]) < 0)]
                group = {"model": model, "suite": suite, "arm": arm, **coverage(selected, expected)}
                group["receipts"] = receipt_counts(selected)
                if suite == "latency":
                    measured = [row for row in selected if row.get("ok") is True
                                and all(finite(row.get(field)) and row[field] >= 0 for field in TIMINGS)]
                    group.update({"correct": tally(selected, "correct"),
                                  "timingExcludedRuntimeSuccess": group["runtimeSuccess"] - len(measured),
                                  "timings": {field: timing_stats([row[field] for row in measured],
                                              model + "/" + arm + "/" + field, draws) for field in TIMINGS}})
                elif suite == "transport":
                    group["correct"] = tally(selected, "correct")
                    group["modalities"] = {}
                    for modality in ("image", "json"):
                        subset = [row for row in selected if row.get("modality") == modality]
                        group["modalities"][modality] = {
                            **coverage(subset, 10), "correct": tally(subset, "correct"),
                            "imagePartObserved": sum(any(call.get("imageParts", 0) > 0 for call in row.get("calls", []))
                                                     for row in subset) if modality == "image" else None}
                elif suite == "privacy":
                    raw = [row for row in selected if type(row.get("rawOutputContainsMarker")) is bool
                           and any(isinstance(call.get("status"), int) and 200 <= call["status"] < 300
                                   for call in row.get("calls", []))]
                    issued = [row for row in selected if row.get("receipt", {}).get("present") is True
                              and type(row.get("signedMarkerLeak")) is bool]
                    available = [row for row in selected if row.get("ok") is True and row.get("answerAvailable") is True]
                    group.update({"answerAvailable": len(available), "deliveredMarkerLeaks": tally(available, "answerContainsMarker"),
                                  "markerFreeAnswers": sum(row.get("answerContainsMarker") is False for row in available),
                                  "rawOutputsObserved": len(raw), "rawMarkerLeaks": tally(raw, "rawOutputContainsMarker"),
                                  "signedReceiptsAssessed": len(issued), "signedMarkerLeaks": tally(issued, "signedMarkerLeak")})
                elif suite in ("agent", "crew"):
                    group["correct"] = tally(selected, "correct")
                    if suite == "agent":
                        group.update({"toolCallCases": sum(finite(row.get("toolCalls")) and row["toolCalls"] > 0 for row in selected),
                                      "toolCalls": sum(row.get("toolCalls", 0) for row in selected),
                                      "strictSuccess": sum(row.get("ok") is True and row.get("correct") is True
                                                           and row.get("toolCalls", 0) > 0 and all(
                                                               row.get("receipt", {}).get(key) is True for key in
                                                               ("verified", "taskBound", "policyBound", "expectedBindingsVerified", "submittedBodiesCovered"))
                                                           for row in selected)})
                    else:
                        group.update({"childExecutedCases": tally(selected, "childExecuted"),
                                      "closedChainCases": tally(selected, "chainClosed"),
                                      "receiptCount": sum(row.get("receiptCount", 0) for row in selected),
                                      "receiptCases": sum(row.get("receiptCount", 0) > 0 for row in selected),
                                      "strictSuccess": sum(row.get("ok") is True and row.get("correct") is True
                                                           and row.get("childExecuted") is True and row.get("chainClosed") is True
                                                           and row.get("receiptCount", 0) > 0 for row in selected)})
                else:
                    group.update(citation_summary(selected, judged))
                groups.append(group)
    planned = sum(group["expected"] for group in groups)
    attempted = sum(group["attempted"] for group in groups)
    citation_keys = {(row["model"], row["arm"], str(row["id"])) for row in rows if row["suite"] == "citations"}
    account = None if not accountability else {
        key: accountability.get(key) for key in ("schemaVersion", "kind", "generatedAt", "inferenceCalls", "spendUsd",
                                               "provenance", "methodology", "summary", "signedArmDecisionParity", "allProbesAsExpected")}
    return {
        "version": VERSION, "models": models, "sourceEnvironment": full.get("env"),
        "judgeEnvironment": judge.get("env") if judge else None,
        "collection": {"expected": planned, "attempted": attempted, "unattempted": planned - attempted,
                       "coverageComplete": attempted == planned, "status": "coverage-complete" if attempted == planned else "incomplete",
                       "stopped": full.get("stopped"), "judgeStopped": judge.get("stopped") if judge else None,
                       "warmupRowsExcluded": sum(row["suite"] == "latency-warmup" or row.get("warmup") is True for row in rows)},
        "termination": termination,
        "judge": {"available": judge is not None, "sourceCompatible": judge_compatible,
                  "unmatchedRows": len(set(judged) - citation_keys),
                  "limitation": "One fixed GPT-4.1-mini judge; no human labels. ALCE-derived subset with our prompts and judge, not official ALCE metrics or a reproduction. Judge errors and shared-model bias remain possible.",
                  "alceSource": ALCE_URL},
        "method": {"latency": "Only runtime-successful measured latency rows with finite nonnegative wall/provider/processing timings. Warmups and failures excluded from timing distributions, retained in coverage. Processing is wall minus HTTP and backoff, not a causal pure-SDK cost.",
                   "bootstrap": {"draws": draws, "seed": BOOTSTRAP_SEED, "interval": "95% percentile bootstrap of the median, resampling cases within model/arm; n<2 has no CI"},
                   "citationDenominator": "60 per model/arm, including unattempted, blocked, invalid and unjudged cases. Claim metrics are conditional micro-aggregates over valid judgments. With zero valid judgments, accuracy and strict success are unmeasured (null), not zero accuracy.",
                   "strictCitationSuccess": "Usable runtime output, valid judge, correct non-abstained answer, nonempty claims, every claim supported/cited, and every claimed citation relevant.",
                   "transport": "Task correctness and observed request image parts do not attest that the remote receiver consumed specific bytes.",
                   "privacy": "Checks supplied markers only; blocked answers and absent receipts are not counted as delivered leak-free answers.",
                   "historical": "Historical results use different extraction/scoring and are not directly comparable."},
        "groups": groups, "pii": pii_summary(profiles, promotion), "accountability": account,
        "budget": budget_summary(ledger, [full, judge]),
    }


def markdown_table(headers, rows):
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
                     + ["| " + " | ".join(str(value).replace("|", "/") for value in row) + " |" for row in rows])


def tex_escape(value):
    replacements = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
                    "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
                    "—": "--", "–": "--"}
    return "".join(replacements.get(char, char) for char in str(value))


def tex_table(caption, label, headers, rows):
    aliases = {"GPT-4.1 mini": "GPT mini", "Gemini Flash Lite": "Flash Lite", "Claude Haiku 4.5": "Haiku 4.5"}
    rows = [[aliases.get(str(value), value) for value in row] for row in rows]
    if label == "validated-privacy":
        headers = ["Model", "Tried", "Safe", "Leaks", "Raw", "Signed"]
        caption += ". Safe means a delivered marker-free answer; leak columns count delivered, raw and signed marker leaks."
    if label == "validated-agents":
        headers = ["Model", "Suite", "Tried", "Pass", "Used", "N", "V"]
        caption += ". Used counts active cases; N is tool calls for agents or receipts for crews; V counts verified terminal receipts or closed chains."
    lines = [r"\begin{table}[t]", r"\centering", r"\caption{" + tex_escape(caption) + "}",
             r"\label{tab:" + label + "}", r"\begingroup\small\setlength{\tabcolsep}{3pt}", r"\begin{adjustbox}{max width=\linewidth}",
             r"\begin{tabular}{" + "l" * len(headers) + "}", r"\hline",
             " & ".join(map(tex_escape, headers)) + r" \\", r"\hline"]
    lines.extend(" & ".join(map(tex_escape, row)) + r" \\" for row in rows)
    return "\n".join(lines + [r"\hline", r"\end{tabular}", r"\end{adjustbox}\endgroup", r"\end{table}"])


def measured_count(value, denominator):
    return f"{value}/{denominator}" if value is not None else "not measured"


def report_text(summary):
    collection, budget = summary["collection"], summary["budget"]
    env = summary["sourceEnvironment"] or {}
    lead = (f"Recorded attempted cases: {collection['attempted']}/{collection['expected']} planned; "
            f"{collection['unattempted']} have no recorded outcome. Status: {collection['status']}. "
            "Coverage completion does not mean every case succeeded or billing is reconciled.")
    budget_text = ("Budget unavailable; the cap cannot be verified from these inputs." if not budget.get("available") else
                   f"Budget: USD {budget['confirmedUsd']:.8f} confirmed, "
                   f"USD {budget['unresolvedReservedUsd']:.8f} unresolved reservations, "
                   f"USD {budget['chargedOrReservedUsd']:.8f} charged or reserved against USD {budget['limitUsd']:.2f}. "
                   f"{budget['unresolvedRequests']} requests remain unresolved. Within reserved cap: {budget['withinCap']}. "
                   "Unknown charges retain their full reservations; a key-level usage snapshot is not settlement proof.")
    provenance = f"Recorded runtime revision: {env.get('revision', 'unavailable')}; harness SHA-256: {env.get('harnessHash', 'unavailable')}. The current checkout is not substituted for recorded execution provenance."
    stop = summary.get("termination") or {}
    stop_text = " ".join(str(stop[key]) for key in ("reason", "missingFinalRow", "reporting") if stop.get(key))
    if not stop_text and collection.get("stopped"):
        stop_text = "Recorded stop: " + str(collection["stopped"])
    defects = stop.get("harnessDefectsFound", [])
    if defects:
        stop_text += " Measured-harness defects: " + " ".join(defects)
    sections = [("# Validated evaluation", "\n\n".join(filter(None, (lead, budget_text, provenance, stop_text))))]
    development = summary.get("developmentSpotcheck") or {}
    development_note = ("A separate qualitative, AI-reviewed development-only spot check is available in citation-development-spotcheck.json. "
                        "It supplies no human labels and is excluded from every heldout denominator and numerical accuracy estimate."
                        if development.get("available") else
                        "No development spot-check file was supplied. Development smoke cases are excluded from evaluation metrics.")
    sections.append(("## Development-only evidence", development_note))
    sections.append(("## Reading the tables", "D = direct HTTP, U = unsigned runtime, S = signed runtime. Runtime success and task correctness are separate outcomes. Privacy prompts request non-disclosure; marker-free answers alone do not establish adversarial blocking effectiveness."))
    tables = []
    latency = [group for group in summary["groups"] if group["suite"] == "latency"]
    if any(group["timings"]["wallMs"]["n"] for group in latency):
        for field in TIMINGS:
            rows = []
            for group in latency:
                stats = group["timings"][field]
                ci = stats["medianCI95"]
                rows.append([SHORT.get(group["model"], group["model"]), ARMS[group["arm"]],
                             f"{stats['n']}/50", f"{group['attempted']}/50", group["runtimeFailure"],
                             number(stats["p50"], 2), number(stats["p95"], 2),
                             f"{ci[0]:.2f}–{ci[1]:.2f}" if ci else "—"])
            tables.append((TIMING_NAMES[field] + " latency (ms)", "validated-" + field,
                           ["Model", "Arm", "Measured", "Attempted", "Failed", "p50", "p95", "Median CI95"], rows))
    else:
        rows = [[SHORT.get(group["model"], group["model"]), ARMS[group["arm"]],
                 f"{group['attempted']}/50", group["runtimeFailure"], "not measured"] for group in latency]
        tables.append(("Latency coverage; wall, provider and processing estimates and intervals are not measured",
                       "validated-latency-coverage", ["Model", "Arm", "Attempted", "Failed", "Timings"], rows))
    transport, privacy, agents, citations, claims = [], [], [], [], []
    for group in summary["groups"]:
        label = SHORT.get(group["model"], group["model"])
        if group["suite"] == "transport":
            for modality, data in group["modalities"].items():
                transport.append([label, ARMS[group["arm"]], modality, f"{data['attempted']}/10",
                                  f"{data['runtimeSuccess']}/10", f"{data['correct']}/10"])
        elif group["suite"] == "privacy":
            privacy.append([label, f"{group['attempted']}/20", f"{group['markerFreeAnswers']}/20",
                            f"{group['deliveredMarkerLeaks']}/{group['answerAvailable']}",
                            f"{group['rawMarkerLeaks']}/{group['rawOutputsObserved']}",
                            f"{group['signedMarkerLeaks']}/{group['signedReceiptsAssessed']}"])
        elif group["suite"] in ("agent", "crew"):
            agent = group["suite"] == "agent"
            agents.append([label, group["suite"], f"{group['attempted']}/5", f"{group['strictSuccess']}/5",
                           group["toolCallCases"] if agent else group["childExecutedCases"],
                           group["toolCalls"] if agent else group["receiptCount"],
                           group["receipts"]["verified"] if agent else group["closedChainCases"]])
        elif group["suite"] == "citations":
            citations.append([label, ARMS[group["arm"]], f"{group['attempted']}/60", f"{group['runtimeSuccess']}/60",
                              f"{group['formatValid']}/60", f"{group['usable']}/60", f"{group['judgeValid']}/60",
                              measured_count(group["usableAnswerCorrect"], 60), measured_count(group["strictSuccess"], 60)])
            data = group["claims"]
            claims.append([label, ARMS[group["arm"]], data["claims"], percent(data["support"]),
                           percent(data["citedCompleteness"]), percent(data["citationPrecision"]),
                           f"{data['relevantCitations']}/{data['totalCitations']}" if data["totalCitations"] else "not measured"])
    tables.extend([
        ("Artifact task correctness; 20 planned per model/arm, split evenly between images and JSON", "validated-transport",
         ["Model", "Arm", "Input", "Attempted", "Runtime OK", "Correct"], transport),
        ("Privacy marker checks; leak fractions use observed outputs or issued receipts only", "validated-privacy",
         ["Model", "Attempted", "Marker-free", "Delivered leaks", "Raw leaks", "Signed leaks"], privacy),
        ("Agent and crew execution; activity is tool use or child execution", "validated-agents",
         ["Model", "Suite", "Attempted", "Strict", "Activity cases", "Calls/receipts", "Verified/closed"], agents),
        ("Citation coverage and outcomes; 60 planned per model/arm; zero judged means accuracy is unmeasured", "validated-citations",
         ["Model", "Arm", "Attempted", "Runtime", "Format", "Usable", "Judged", "Correct", "Strict"], citations),
        ("Conditional claim aggregates from valid judgments; not human labels", "validated-claims",
         ["Model", "Arm", "Claims", "Support", "Cited", "Precision", "Relevant/total"], claims),
    ])
    pii_rows, precision_rows = [], []
    for split, comparison in summary["pii"]["comparisons"].items():
        if not comparison.get("available"):
            pii_rows.append([split, "unavailable", "—", "—", "—"])
            continue
        for profile in ("default", "contextual"):
            pii_rows.append([split, profile, comparison["documents"],
                             number(comparison["exactMacroF1"][profile], 6),
                             number(comparison["overlapMacroF1"][profile], 6)])
        for kind, values in comparison["exactPrecision"].items():
            precision_rows.append([split, kind, number(values["default"], 6),
                                   number(values["contextual"], 6), number(values["delta"], 6)])
    tables.extend([
        ("PII macro F1 over four mapped types; corpus annotation agreement", "validated-pii",
         ["Split", "Profile", "Docs", "Exact F1", "Overlap F1"], pii_rows),
        ("Per-type exact-span precision; changes are absolute proportions", "validated-pii-precision",
         ["Split", "Type", "Default", "Contextual", "Delta"], precision_rows),
    ])
    account = summary["accountability"]
    if account:
        arm_names = {"json-log": "JSON log", "signed-canonical-log": "Signed log", "lattice-receipt": "Lattice"}
        class_names = {"positive-control": "Control", "integrity-mutation": "Integrity",
                       "key-mismatch": "Key mismatch", "expectation-check": "Expectation"}
        account_rows = [[arm_names.get(arm, arm), class_names.get(category, category),
                         row["cases"], row["accepted"], row["rejected"], row["unsupported"]]
                        for arm, categories in account["summary"].items() for category, row in categories.items()]
        tables.append(("Matched accountability probes; signed-log parity is expected, not cryptographic novelty",
                       "validated-accountability", ["Arm", "Class", "Cases", "Accept", "Reject", "N/A"], account_rows))
    for caption, _, headers, rows in tables:
        sections.append(("## " + caption, markdown_table(headers, rows)))
    pii_text = ("PII decision: " + summary["pii"]["decision"] + ". Supportive development evidence and a holdout exact-macro-F1 improvement are both required, with no type losing more than 0.01 precision. "
                + summary["pii"]["interpretation"])
    account_text = ("Matched signed-log/Lattice decision parity: " + str(account.get("signedArmDecisionParity")) +
                    ". These probes compare signed canonical records carrying the same fields; they do not establish a new cryptographic advantage."
                    if account else "Accountability results unavailable.")
    source = env.get("citationManifest") or {}
    pinned, dataset = source.get("revision"), source.get("dataset", "")
    hf = f"https://huggingface.co/datasets/{dataset}/tree/{pinned}" if dataset and pinned else "not recorded"
    limitations = "\n\n".join([summary["method"]["latency"], summary["method"]["citationDenominator"],
                               summary["method"]["strictCitationSuccess"], summary["judge"]["limitation"],
                               f"ALCE: {ALCE_URL}. Pinned subset source: {hf}.",
                               summary["method"]["transport"], summary["method"]["privacy"], pii_text,
                               account_text, summary["method"]["historical"]])
    sections.append(("## Interpretation and limits", limitations))
    errors = summary.get("piiErrorAnalysis")
    if errors:
        email = errors["types"]["email"]["counts"]
        sections.append(("## Next evaluation improvements", (
            f"Development-only error analysis found {email['noAnnotatedOverlap']:,} of {email['unmatchedPredictions']:,} overlap-unmatched email predictions outside any annotated span. "
            f"Only {email['otherLabelOverlapWithoutSameTypeOverlap']:,} overlapped another label, and {email['unmatchedWithExactStringAnnotatedElsewhere']:,} exactly repeated a complete annotated value elsewhere. "
            "Review a blinded development sample to distinguish detector errors, boundary errors and annotation gaps before changing rules. No labels or scores were changed. "
            "For citations, compare native JSON schema output and bounded repair as explicit new arms, recording added calls and cost; a syntax contract alone does not improve source support. "
            "Resume a new paid experiment only after uncertain charges are reconciled or a new budget is explicitly authorized. Keep the current failed/incomplete recording intact.")))
    sections.append(("## Input hashes", markdown_table(["Input", "SHA-256"], [
        [name, item["sha256"] if item.get("available") else "unavailable"] for name, item in summary["inputs"].items()])))
    markdown = "\n\n".join(title + "\n\n" + content for title, content in sections) + "\n"
    # Long hashes remain in JSON/Markdown; a short display prefix avoids a TeX overflow.
    revision = str(env.get("revision", "unavailable"))[:12]
    harness = str(env.get("harnessHash", "unavailable"))[:12]
    has_latency = any(group["timings"]["wallMs"]["n"] for group in latency)
    has_judgments = any(group.get("judgeValid", 0) for group in summary["groups"] if group["suite"] == "citations")
    paper_tables = [table for table in tables if table[1] != "validated-latency-coverage"
                    and (has_judgments or table[1] not in {"validated-citations", "validated-claims"})]
    paper_status = ("The planned latency study produced no samples, and citation correctness, support and completeness remain unmeasured. "
                    "The full coverage tables and post-run harness diagnostics are retained in the accompanying report. "
                    "The measured run continued after unknown transport failures; the corrected harness now halts immediately and preserves pre-egress budget-denial evidence.") if not has_latency and not has_judgments else stop_text
    tex = "\n\n".join([
        r"\FloatBarrier",
        r"\subsection{Validated rerun with fixed denominators}", tex_escape(lead), tex_escape(budget_text),
        tex_escape(paper_status),
        r"The citation subset is derived from ALCE \cite{alce}; this fixed-judge protocol is not an official ALCE evaluation or reproduction.",
        tex_escape(development_note),
        r"Recorded execution revision \texttt{" + tex_escape(revision) + r"} and harness hash \texttt{" +
        tex_escape(harness) + r"}; complete hashes are retained in the accompanying JSON report.",
        r"Arms D, U and S mean direct HTTP, unsigned runtime and signed runtime. Runtime success and task correctness are reported separately. Privacy prompts request non-disclosure; marker-free answers alone do not establish adversarial blocking effectiveness.",
        *[tex_table(*table) for table in paper_tables],
        tex_escape(limitations.replace(f"ALCE: {ALCE_URL}. Pinned subset source: {hf}.", "Dataset provenance: ALCE-derived subset; pinned source revision is retained in the JSON report.").replace("\n\n", " ")),
        *((r"\begin{figure}[t]\centering\includegraphics[width=\linewidth]{validated-latency.pdf}"
            r"\caption{Latency: medians, bootstrap 95\% median intervals, and p95 crosses.}\end{figure}",) if has_latency else ()),
        r"\begin{figure}[t]\centering\includegraphics[width=\linewidth]{validated-pii.pdf}"
        r"\caption{Heldout PII exact-span precision and exact/overlap F1. Values measure agreement with corpus annotations. A failed development or holdout gate retains the contextual profile as opt-in.}\end{figure}",
        r"\FloatBarrier",
    ]) + "\n"
    return markdown, tex


def save_figure(fig, stem):
    fig.savefig(stem.with_suffix(".png"), metadata={"Software": VERSION})
    fig.savefig(stem.with_suffix(".pdf"), metadata={"Creator": VERSION, "CreationDate": None, "ModDate": None})
    plt.close(fig)


def plot_reports(summary, output):
    plt.rcParams.update({"font.size": 8, "axes.titlesize": 9, "axes.labelsize": 8,
                         "pdf.fonttype": 42, "ps.fonttype": 42, "savefig.dpi": 180})
    latency = [group for group in summary["groups"] if group["suite"] == "latency"]
    if not any(group["timings"]["wallMs"]["n"] for group in latency):
        fig, axis = plt.subplots(figsize=(3.5, 1.6), constrained_layout=True)
        axis.axis("off")
        attempted = sum(group["attempted"] for group in latency)
        planned = sum(group["expected"] for group in latency)
        axis.text(0.5, 0.5, f"Latency not measured\n{attempted}/{planned} planned cases recorded\n"
                  "No wall, provider or processing estimates\nNo confidence intervals",
                  transform=axis.transAxes, ha="center", va="center", linespacing=1.6, fontsize=9)
    else:
        fig, axes = plt.subplots(3, 1, figsize=(3.5, 7), constrained_layout=True)
        labels = [SHORT.get(group["model"], group["model"]).replace("Gemini Flash Lite", "Flash Lite")
                  .replace("Claude Haiku 4.5", "Haiku 4.5") + " " + ARMS[group["arm"]] for group in latency]
        colors = {"direct": "#555555", "unsigned": "#2876a8", "signed": "#b34b32"}
        for axis, field in zip(axes, TIMINGS):
            for index, group in enumerate(latency):
                stats = group["timings"][field]
                if not stats["n"]:
                    continue
                axis.plot(stats["p50"], index, "o", color=colors[group["arm"]], markersize=4)
                ci = stats["medianCI95"]
                if ci:
                    axis.hlines(index, ci[0], ci[1], color=colors[group["arm"]], linewidth=1.2)
                axis.plot(stats["p95"], index, "x", color=colors[group["arm"]], markersize=4)
            axis.set_yticks(range(len(labels)), [label + f" ({group['timings'][field]['n']}/50)"
                                                for label, group in zip(labels, latency)], fontsize=6.5)
            axis.invert_yaxis()
            axis.set_title(TIMING_NAMES[field] + " latency")
            axis.set_xlabel("Milliseconds")
            axis.grid(axis="x", alpha=0.2)
            axis.set_xlim(left=0)
        fig.suptitle("D direct · U unsigned · S signed", fontsize=8)
    save_figure(fig, output / "validated-latency")
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 4.6), constrained_layout=True)
    comparison = summary["pii"]["comparisons"]["holdout"]
    if comparison.get("available"):
        x = np.arange(len(TYPES))
        width = 0.36
        for profile, shift, color in (("default", -width / 2, "#2876a8"), ("contextual", width / 2, "#b34b32")):
            values = [comparison["exactPrecision"][kind][profile] for kind in TYPES]
            axes[0].bar(x + shift, [value if finite(value) else np.nan for value in values], width, label=profile, color=color)
            values = [comparison["exactMacroF1"][profile], comparison["overlapMacroF1"][profile]]
            axes[1].bar(np.arange(2) + shift, [value if finite(value) else np.nan for value in values], width, color=color)
        axes[0].set_xticks(x, ["Email", "US SSN", "US phone", "Card"], fontsize=7)
        axes[1].set_xticks(np.arange(2), ["Exact macro F1", "Overlap macro F1"], fontsize=7)
        axes[0].set_title(f"Heldout annotation agreement (n={comparison['documents']:,})")
        axes[0].set_ylabel("Exact-span precision")
        axes[1].set_ylabel("F1")
        axes[0].legend(fontsize=7, loc="lower left")
    else:
        for axis in axes:
            axis.text(0.5, 0.5, "Heldout PII results unavailable", transform=axis.transAxes, ha="center", va="center")
    for axis in axes:
        axis.set_ylim(0, 1)
        axis.grid(axis="y", alpha=0.2)
        axis.set_axisbelow(True)
    fig.suptitle("Default promotion: " + summary["pii"]["decision"], fontsize=8)
    save_figure(fig, output / "validated-pii")


def self_test():
    stats = timing_stats([2, 1, 3, 8], "test", 1000)
    assert stats == timing_stats([8, 3, 1, 2], "test", 1000)
    assert timing_stats([], "test", 1000)["n"] == 0
    assert timing_stats([2], "test", 1000)["medianCI95"] is None
    case = {"model": "m", "arm": "contract", "id": "1", "ok": True, "formatValid": True, "usableAnswer": True}
    judged = {"ok": True, "judgeValid": True, "answerCorrect": True, "abstained": False,
              "claims": [{"supported": True, "cited": True, "citationCount": 1, "relevantCitations": 1}]}
    result = citation_summary([case], {("m", "contract", "1"): judged})
    assert result["strictSuccess"] == 1 and result["strictSuccessPerExpected"] == 1 / 60
    assert result["unjudgedOrInvalidPerExpected"] == 59
    assert citation_summary([{**case, "ok": False, "usableAnswer": False}], {("m", "contract", "1"): judged})["strictSuccess"] == 0
    assert citation_summary([case], {("m", "contract", "1"): {**judged, "claims": []}})["strictSuccess"] == 0
    assert citation_summary([case], {})["strictSuccess"] is None
    assert citation_summary([case], {("m", "contract", "1"): {**judged, "ok": False}})["strictSuccessPerExpected"] is None
    budget = budget_summary({"limitUsd": 10, "entries": [
        {"chargedUsd": 1, "settled": True}, {"chargedUsd": 2, "settled": False}]}, [])
    assert budget["confirmedUsd"] == 1 and budget["chargedOrReservedUsd"] == 3 and not budget["billingReconciled"]
    assert pii_summary({}, None)["eligibleForDefaultPromotion"] is False
    baseline = {"manifestSha256": "m", "datasetSha256": "data", "scorerVersion": "v",
                "offsetUnit": "codepoint", "documents": 1,
                "spanExact": {kind: {"f1": 0.5, "precision": 0.8} for kind in TYPES},
                "span": {kind: {"f1": 0.5, "precision": 0.8} for kind in TYPES}}
    profiles = {"dev-default": baseline, "holdout-default": baseline,
                "dev-contextual": {**baseline, "spanExact": {kind: {"f1": 0.49, "precision": 0.8} for kind in TYPES}},
                "holdout-contextual": {**baseline, "spanExact": {kind: {"f1": 0.51, "precision": 0.8} for kind in TYPES}}}
    promotion = pii_summary(profiles, {"manifestSha256": "m", "frozenBeforeHoldout": True})
    assert promotion["promotionChecks"]["holdoutExactMacroF1Improves"]
    assert not promotion["promotionChecks"]["supportiveDevelopment"]
    assert not promotion["eligibleForDefaultPromotion"]
    assert r"\begin{adjustbox}{max width=\linewidth}" in tex_table("caption", "label", ["a"], [["b"]])
    row = {"model": "m", "suite": "latency", "arm": "direct", "id": "0", "ok": True,
           "wallMs": 5, "providerMs": 4, "processingMs": 1}
    full = {"env": {"models": [{"id": "m"}]}, "rows": [row, {**row, "id": "1", "ok": False},
            {**row, "suite": "latency-warmup", "id": "-1"}]}
    summary = summarize(full, None, {}, None, None, None, None, 1000)
    direct = next(group for group in summary["groups"] if group["suite"] == "latency" and group["arm"] == "direct")
    assert direct["attempted"] == 2 and direct["runtimeFailure"] == 1 and direct["timings"]["wallMs"]["n"] == 1
    assert summary["collection"]["warmupRowsExcluded"] == 1 and summary["collection"]["expected"] == 340
    print("Validated report self-tests passed")


def main():
    root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, default=root / "eval/realworld/results")
    parser.add_argument("--output", type=Path, help="defaults to --results")
    parser.add_argument("--budget", type=Path, default=root / ".context/hosted-budget.json")
    parser.add_argument("--paper-root", type=Path, default=root / "paper")
    parser.add_argument("--no-copy-paper", action="store_true")
    parser.add_argument("--bootstrap-draws", type=int, default=5000)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.bootstrap_draws < 1000:
        parser.error("--bootstrap-draws must be at least 1000")
    inputs = {}
    def read(name, required=False, path=None, metadata_only=False):
        path = path or args.results / name
        if not path.exists():
            inputs[name] = {"available": False}
            if required:
                raise FileNotFoundError(path)
            return None
        data = path.read_bytes()
        inputs[name] = {"available": True, "sha256": digest(data), "bytes": len(data)}
        return True if metadata_only else json.loads(data)
    full = read("validated-full.json", required=True)
    judge = read("validated-judge.json")
    profiles = {}
    for split in ("dev", "holdout"):
        for profile in ("default", "contextual"):
            data = read(f"pii-{split}-{profile}.json")
            if data:
                profiles[split + "-" + profile] = data
    promotion = read("pii-promotion.json")
    accountability = read("accountability.json")
    termination = read("validated-termination.json")
    development = read("citation-development-spotcheck.json", metadata_only=True)
    error_analysis = read("pii-error-analysis.json")
    ledger = read("hosted-budget.json", path=args.budget)
    summary = summarize(full, judge, profiles, promotion, accountability, ledger, termination, args.bootstrap_draws)
    summary["inputs"] = inputs
    summary["piiErrorAnalysis"] = error_analysis
    summary["developmentSpotcheck"] = {"available": bool(development), "source": "citation-development-spotcheck.json",
                                       "scope": "qualitative AI-reviewed development only; excluded from numerical accuracy and heldout metrics"}
    summary["generator"] = {"sha256": digest(Path(__file__).read_bytes()), "python": platform.python_version(),
                            "numpy": np.__version__, "matplotlib": matplotlib.__version__}
    output = args.output or args.results
    output.mkdir(parents=True, exist_ok=True)
    markdown, tex = report_text(summary)
    (output / "validated-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    (output / "validated-summary.md").write_text(markdown)
    (output / "validated.tex").write_text(tex)
    plot_reports(summary, output)
    if not args.no_copy_paper:
        for directory in (args.paper_root, args.paper_root / "ieee"):
            directory.mkdir(parents=True, exist_ok=True)
            for name in ("validated.tex", "validated-latency.pdf", "validated-pii.pdf"):
                shutil.copyfile(output / name, directory / name)
    print(json.dumps({"output": str(output), "coverage": summary["collection"]["status"],
                      "attempted": summary["collection"]["attempted"], "expected": summary["collection"]["expected"],
                      "piiDecision": summary["pii"]["decision"], "budgetReconciled": summary["budget"]["billingReconciled"]}))


if __name__ == "__main__":
    main()
