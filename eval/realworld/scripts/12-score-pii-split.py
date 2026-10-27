"""Score a named frozen split from cached predictions, without model calls.

Emit predictions first with 06-lattice-spans.mjs using PII_DATASET_FILE,
PII_DATASET_NAME=dev (or holdout), and PII_CONTEXTUAL=1 for that profile.
Holdout must only be scored after the caller freezes its baseline and candidate.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
from pathlib import Path

from pii_metrics import load_span_rows, score
from pii_split import sha256, verify_frozen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--split-directory", type=Path, default=Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data")) / "pii-split")
    parser.add_argument("--split", choices=("dev", "holdout"), required=True)
    parser.add_argument("--profile", choices=("default", "contextual"), required=True)
    parser.add_argument("--spans", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = verify_frozen(args.split_directory)
    spec = importlib.util.spec_from_file_location("pii_tools", Path(__file__).with_name("06-pii-tools.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    entry = manifest["splits"][args.split]
    docs = module.load_gold(args.split_directory / entry["file"], lambda row: (row["text"], row["spans"]))
    preds, times, metadata = load_span_rows(args.spans, {args.split: docs})
    if metadata[args.split]["contextual"] != (args.profile == "contextual"):
        raise ValueError("Cached prediction profile does not match requested profile")
    commit = subprocess.check_output(["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "HEAD"], text=True).strip()
    report = {
        "dataset": args.split,
        "profile": args.profile,
        "commit": (metadata[args.split]["provenance"] or {}).get("commit"),
        "scorerCommit": commit,
        "predictionProvenance": metadata[args.split]["provenance"],
        "manifestSha256": sha256((args.split_directory / "manifest.json").read_bytes()),
        "datasetSha256": entry["sha256"],
        "predictionSha256": sha256(args.spans.read_bytes()),
        "documents": len(docs),
        "source": manifest["source"],
        "extraction": metadata[args.split]["extraction"],
        **score(docs, preds[args.split]),
        "latencyMs": module.latency_summary(times[args.split]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "documents": len(docs), "profile": args.profile, "manifestSha256": report["manifestSha256"]}))


if __name__ == "__main__":
    main()
