"""Freeze unseen Gretel English train dev/holdout views; no scoring occurs.

First run 02-prepare.py --download-train and prepare the existing historical
views with 02-prepare.py. Raw texts and the frozen files stay in REALWORLD_CACHE.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from pii_split import GRETEL_REVISION, GRETEL_TRAIN_FILE, prepare_split, sha256, write_frozen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data")))
    parser.add_argument("--output", type=Path, help="new immutable split directory (default: CACHE/pii-split)")
    args = parser.parse_args()
    cache = args.cache
    train_path = cache / "gretel_en_train.parquet"
    provenance = json.loads((cache / "gretel-train-source.json").read_text())
    train_hash = sha256(train_path.read_bytes())
    if (provenance["revision"] != GRETEL_REVISION or provenance["file"] != GRETEL_TRAIN_FILE
            or provenance["sha256"] != train_hash):
        raise ValueError("Train cache lacks matching pinned download provenance")
    import pyarrow.parquet as pq
    train = []
    for row in pq.read_table(train_path).to_pylist():
        spans = row["pii_spans"]
        train.append({"text": row["generated_text"], "spans": json.loads(spans) if isinstance(spans, str) else spans})
    historical = []
    sources = {"gretel_en_train.parquet": train_hash}
    for filename in ("gretel.jsonl", "english_openpii_8k.jsonl"):
        path = cache / filename
        sources[filename] = sha256(path.read_bytes())
        for line in path.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                historical.append({
                    "text": row["text"] if filename == "gretel.jsonl" else row["source_text"],
                    "spans": row.get("spans" if filename == "gretel.jsonl" else "privacy_mask") or [],
                })
    manifest, splits = prepare_split(train, historical, sources)
    digest = write_frozen(args.output or cache / "pii-split", manifest, splits)
    print(json.dumps({
        "manifestSha256": digest, "splits": manifest["splits"], "excluded": manifest["excluded"],
    }, indent=2))


if __name__ == "__main__":
    main()
