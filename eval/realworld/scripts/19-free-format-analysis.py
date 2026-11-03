"""Post-hoc format diagnostics; exports counts only and never changes scores."""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RESULTS = ROOT / "eval/realworld/results"


def classify(text, ids, available=True):
    if not available:
        return "transport-unavailable"
    if not text.strip():
        return "empty-content"
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        fenced = re.fullmatch(r"\s*```(?:json)?\s*([\s\S]*?)\s*```\s*", text)
        if fenced:
            try:
                json.loads(fenced[1])
                return "markdown-fenced-json"
            except ValueError:
                pass
        return "invalid-json"
    if not isinstance(value, dict) or not isinstance(value.get("answer"), str):
        return "missing-string-answer"
    citations = value.get("citations")
    if not isinstance(citations, list):
        return "missing-citation-list"
    if not citations:
        return "empty-citation-list"
    if any(not isinstance(c, dict) or not isinstance(c.get("source"), str) for c in citations):
        return "missing-source-key"
    if any(c["source"] not in ids for c in citations):
        return "unknown-source-id"
    if any("[" + c["source"] + "]" not in value["answer"] for c in citations):
        return "unused-source-id"
    return "valid"


def main():
    if "--self-test" in sys.argv:
        good = '{"answer":"Known [s1]","citations":[{"source":"s1"}]}'
        assert classify(good, ["s1"]) == "valid"
        assert classify("```json\n" + good + "\n```", ["s1"]) == "markdown-fenced-json"
        assert classify('{"answer":"Insufficient evidence","citations":[]}', ["s1"]) == "empty-citation-list"
        assert classify(good, ["s2"]) == "unknown-source-id"
        assert classify(good.replace("[s1]", "[1]"), ["s1"]) == "unused-source-id"
        assert classify("", ["s1"], False) == "transport-unavailable"
        print("free-format-analysis self-test passed")
        return
    full = json.loads((RESULTS / "validated-free-full.json").read_text())
    cache = ROOT / ".context/eval-cache"
    answers = {(r["model"], r["suite"], r["arm"], r["id"]): r
               for r in json.loads((cache / "validated-free-full-private.json").read_text())}
    examples = {r["id"]: r for r in map(json.loads, (cache / "citation-split/evaluation.jsonl").read_text().splitlines())}
    grouped = defaultdict(lambda: {"cases": 0, "categories": Counter(), "lengthLimited": 0})
    for row in full["rows"]:
        if row["suite"] != "citations":
            continue
        private = answers[row["model"], row["suite"], row["arm"], row["id"]]
        text = private["answer"] if row["ok"] else private["rawAnswer"]
        available = bool(row["calls"]) and row["calls"][-1]["status"] == 200
        category = classify(text, [d["id"] for d in examples[row["id"]]["docs"]], available)
        if (category == "valid") != row["formatValid"]:
            raise ValueError("Diagnostic validity disagrees with recorded scoring")
        group = grouped[row["model"], row["arm"]]
        group["cases"] += 1
        group["categories"][category] += 1
        group["lengthLimited"] += any(c.get("finishReason") == "length" for c in row["calls"])
    result = {"version": "free-format-diagnostics/v1", "scope": "Post-hoc aggregate diagnosis only; no score changes or heldout prompt tuning.",
              "categoriesAreMutuallyExclusive": True,
              "notes": ["Empty citation lists are not automatically classified as justified abstentions.",
                        "Length-limited counts overlap format categories.",
                        "No generated text, questions, document IDs, or source contents are exported."],
              "groups": [{"model": model, "arm": arm, **group} for (model, arm), group in sorted(grouped.items())]}
    (RESULTS / "validated-free-format-analysis.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
