"""Deterministic template-grouped PII development/holdout preparation.

This module never scores a detector. It masks every annotated PII span before
grouping templates, and excludes texts and templates from historical scored
sets. The split manifest contains hashes and counts, never document contents.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path

SPLIT_VERSION = "gretel-pii-split/v1"
GRETEL_REVISION = "7b844d16738527a04264f50214cb426a4cea0897"
GRETEL_TRAIN_FILE = "data/English_train-00000-of-00001.parquet"
SEED = "lattice-pii-dev-holdout-v1"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def normalized_text(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def template_hash(doc: dict) -> str:
    """Ignore annotated values and residual numbers when grouping templates."""
    text = doc["text"]
    spans = sorted(set((span["start"], span["end"]) for span in doc["spans"]))
    merged: list[list[int]] = []
    for start, end in spans:
        if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(text):
            raise ValueError("Invalid code-point annotation in split input")
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    pieces, previous = [], 0
    for start, end in merged:
        pieces.extend((text[previous:start], " <pii> "))
        previous = end
    pieces.append(text[previous:])
    template = re.sub(r"\d+", "#", normalized_text("".join(pieces)))
    return sha256(template.encode("utf-8"))


def prepare_split(train: list[dict], historical: list[dict], sources: dict) -> tuple[dict, dict[str, list[dict]]]:
    """Freeze an 80/20 split by template groups, independent of input order."""
    old_texts = {sha256(normalized_text(doc["text"]).encode("utf-8")) for doc in historical}
    old_templates = {template_hash(doc) for doc in historical}
    excluded = {"historicalText": 0, "historicalTemplate": 0, "duplicateTrainText": 0}
    unique: dict[str, dict] = {}
    for doc in train:
        key = sha256(normalized_text(doc["text"]).encode("utf-8"))
        # Deterministic tie-break if equivalent text has variant annotations.
        if key in unique:
            excluded["duplicateTrainText"] += 1
            if canonical_json(doc) >= canonical_json(unique[key]):
                continue
        unique[key] = doc
    groups: dict[str, list[dict]] = {}
    for key, doc in sorted(unique.items()):
        group = template_hash(doc)
        if key in old_texts:
            excluded["historicalText"] += 1
            continue
        if group in old_templates:
            excluded["historicalTemplate"] += 1
            continue
        text_hash = sha256(doc["text"].encode("utf-8"))
        record = {
            "id": text_hash,
            "textHash": text_hash,
            "templateHash": group,
            "text": doc["text"],
            "spans": sorted(doc["spans"], key=lambda span: (span["start"], span["end"], span["label"])),
        }
        groups.setdefault(group, []).append(record)
    if len(groups) < 2:
        raise ValueError("At least two unseen template groups are required for dev/holdout")
    ordered = sorted(groups, key=lambda group: sha256((SEED + ":" + group).encode()))
    holdout_groups = set(ordered[:math.ceil(len(ordered) * 0.2)])
    splits = {
        name: sorted(
            (doc for group in ordered if (group in holdout_groups) == (name == "holdout") for doc in groups[group]),
            key=lambda doc: doc["id"],
        )
        for name in ("dev", "holdout")
    }
    manifest = {
        "version": SPLIT_VERSION,
        "seed": SEED,
        "offsetUnit": "codepoint",
        "source": {
            "dataset": "gretelai/synthetic_pii_finance_multilingual",
            "revision": GRETEL_REVISION,
            "file": GRETEL_TRAIN_FILE,
        },
        "sourceHashes": sources,
        "method": "Mask all annotated spans, NFKC/case-fold/whitespace normalize, replace residual digit runs; group by SHA-256. Sort groups by seeded hash, reserve ceil(20% of groups) for holdout. Exclude normalized texts and templates from historical scored sets.",
        "targetGroupFraction": {"dev": 0.8, "holdout": 0.2},
        "trainInputDocuments": len(train),
        "historicalInputDocuments": len(historical),
        "excluded": excluded,
        "splits": {},
        "assignments": [],
    }
    for name, docs in splits.items():
        data = b"".join(canonical_json(doc) for doc in docs)
        manifest["splits"][name] = {
            "file": name + ".jsonl",
            "sha256": sha256(data),
            "documents": len(docs),
            "templateGroups": len({doc["templateHash"] for doc in docs}),
            "annotationLabels": dict(sorted(Counter(span["label"] for doc in docs for span in doc["spans"]).items())),
        }
        manifest["assignments"].extend(
            {"documentId": doc["id"], "templateHash": doc["templateHash"], "split": name} for doc in docs
        )
    return manifest, splits


def write_frozen(directory: Path, manifest: dict, splits: dict[str, list[dict]]) -> str:
    """An existing split may be verified, but cannot be silently replaced."""
    files = {
        name + ".jsonl": b"".join(canonical_json(doc) for doc in docs)
        for name, docs in splits.items()
    }
    files["manifest.json"] = canonical_json(manifest)
    directory.mkdir(parents=True, exist_ok=True)
    if any((directory / name).exists() for name in files):
        for name, data in files.items():
            path = directory / name
            if not path.exists() or path.read_bytes() != data:
                raise ValueError("Frozen PII split differs or is incomplete; use a new output directory")
    else:
        for name, data in files.items():
            with (directory / name).open("xb") as handle:
                handle.write(data)
    return sha256(files["manifest.json"])


def verify_frozen(directory: Path) -> dict:
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest["version"] != SPLIT_VERSION:
        raise ValueError("Unsupported PII split manifest")
    for name in ("dev", "holdout"):
        entry = manifest["splits"][name]
        if entry["file"] != name + ".jsonl" or sha256((directory / entry["file"]).read_bytes()) != entry["sha256"]:
            raise ValueError("Frozen PII split content hash does not match")
    return manifest
