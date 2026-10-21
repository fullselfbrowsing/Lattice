"""Replace the Lattice block in pii-tools.json using every substring occurrence.

The long PII process may have scored the first match only. This pass reads
lattice-spans-all.jsonl and leaves the other tools untouched. It also records
NeMo Guardrails as documentation-only when that row is missing.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
CACHE = Path("/tmp/realworld-data")
SPANS = CACHE / "lattice-spans-all.jsonl"


def load_pii():
    path = Path(__file__).with_name("06-pii-tools.py")
    spec = importlib.util.spec_from_file_location("pii_tools", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    module = load_pii()
    report_path = RESULTS / "pii-tools.json"
    report = json.loads(report_path.read_text())
    ai4 = module.load_gold(CACHE / "english_openpii_8k.jsonl", lambda raw: (
        raw["source_text"],
        [{"label": span["label"], "start": span["start"], "end": span["end"]} for span in raw.get("privacy_mask") or []],
    ))
    gretel = module.load_gold(CACHE / "gretel.jsonl", lambda raw: (
        raw["text"],
        [{"label": span["label"], "start": span["start"], "end": span["end"]} for span in raw.get("spans") or []],
    ))
    preds = {"ai4privacy": [[] for _ in ai4], "gretel": [[] for _ in gretel]}
    times = {"ai4privacy": [], "gretel": []}
    with SPANS.open() as handle:
        for line in handle:
            row = json.loads(line)
            preds[row["dataset"]][row["i"]] = row["spans"]
            times[row["dataset"]].append(row["ms"])
    lattice = {
        "tool": "lattice-noPII",
        "measured": True,
        "datasets": {
            "ai4privacy": {**module.score(ai4, preds["ai4privacy"]), "latencyMs": module.latency_summary(times["ai4privacy"])},
            "gretel": {**module.score(gretel, preds["gretel"]), "latencyMs": module.latency_summary(times["gretel"])},
        },
        "note": "Every occurrence of the single substring returned by detect(), the same locate() rule as 02-score.mjs.",
    }
    prior = json.loads((RESULTS / "datasets.json").read_text())
    checks = []
    for dataset, prior_key in (("ai4privacy", "ai4privacy"), ("gretel", "gretel_english_test")):
        got = lattice["datasets"][dataset]["document"]["email"]
        expected = prior[prior_key]["types"]["email"]
        checks.append(got["tp"] == expected["tp"] and got["fp"] == expected["fp"] and got["fn"] == expected["fn"])
    lattice["matchesPriorDocumentEmail"] = all(checks)
    tools = report["tools"]
    replaced = False
    for index, tool in enumerate(tools):
        if tool.get("tool") == "lattice-noPII":
            tools[index] = lattice
            replaced = True
    if not replaced:
        tools.insert(0, lattice)
    report["unit"] = (
        "Document-level matches the Lattice harness: one document is a true positive when any predicted span of that type overlaps a gold span. "
        "Span-level counts each predicted span and each missed gold span. "
        "Lattice counts every occurrence of the one substring detect() returns."
    )
    missing = report.setdefault("not_measured", [])
    if not any(item.get("tool") == "nemo-guardrails" for item in missing):
        missing.append(module.nemo_status())
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    email = lattice["datasets"]["gretel"]["document"]["email"]
    print("RESCORE", lattice["matchesPriorDocumentEmail"], email["tp"], email["fp"], email["fn"])


if __name__ == "__main__":
    main()
