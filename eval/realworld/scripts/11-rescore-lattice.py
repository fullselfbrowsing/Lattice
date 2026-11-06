"""Replace the Lattice block in pii-tools.json using actual detector matches.

Re-scores Lattice without re-running the other detectors. It reads the span
file that 06-lattice-spans.mjs writes (LATTICE_SPANS, default
$REALWORLD_CACHE/lattice-spans.jsonl) and leaves the other tools untouched. It
also records NeMo Guardrails as documentation-only when that row is missing.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
CACHE = Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data"))
SPANS = Path(os.environ.get("LATTICE_SPANS", CACHE / "lattice-spans.jsonl"))


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
    preds, times, extraction_meta = module.load_span_rows(SPANS, {"ai4privacy": ai4, "gretel": gretel})
    lattice = {
        "tool": "lattice-noPII",
        "measured": True,
        "datasets": {
            "ai4privacy": {**module.score(ai4, preds["ai4privacy"]), "latencyMs": module.latency_summary(times["ai4privacy"])},
            "gretel": {**module.score(gretel, preds["gretel"]), "latencyMs": module.latency_summary(times["gretel"])},
        },
        "note": "All-match extraction; first-match fallback for detectors without findAll. No substring occurrence expansion.",
        "meta": {**module.lattice_meta(), "extraction": extraction_meta},
    }
    prior = json.loads((RESULTS / "datasets.json").read_text())
    checks = []
    for dataset, prior_key in (("ai4privacy", "ai4privacy"), ("gretel", "gretel_english_test")):
        got = lattice["datasets"][dataset]["document"]["email"]
        expected = prior[prior_key]["types"]["email"]
        checks.append(got["tp"] == expected["tp"] and got["fp"] == expected["fp"] and got["fn"] == expected["fn"])
    lattice["matchesPriorDocumentEmail"] = all(checks)
    lattice["priorDocumentScorerVersion"] = prior.get("scorerVersion", "legacy-single-substring")
    tools = report["tools"]
    replaced = False
    for index, tool in enumerate(tools):
        if tool.get("tool") == "lattice-noPII":
            tools[index] = lattice
            replaced = True
    if not replaced:
        tools.insert(0, lattice)
    report["scorerVersion"] = module.SCORER_VERSION
    report["unit"] = module.base_report([])["unit"]
    report["comparisonNote"] = "Only the Lattice row was rescored. Competitor rows without scorerVersion remain historical and must not be ranked against corrected span scores."
    missing = report.setdefault("not_measured", [])
    if not any(item.get("tool") == "nemo-guardrails" for item in missing):
        missing.append(module.nemo_status())
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    email = lattice["datasets"]["gretel"]["document"]["email"]
    print("RESCORE", lattice["matchesPriorDocumentEmail"], email["tp"], email["fp"], email["fn"])


if __name__ == "__main__":
    main()
