"""PII metrics with explicit units and one-to-one entity matching.

All scoring offsets are Python Unicode code points. The historical document
overlap metric is retained as document; it is not an entity extraction
metric or the boolean privacy blocking metric.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

TYPES = ("email", "us-ssn", "us-phone", "credit-card")
SCORER_VERSION = "pii-metrics/v2"


def overlaps(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < stop and end > begin for begin, stop in spans)


def unique_spans(spans: list[tuple[int, int]], length: int) -> list[tuple[int, int]]:
    for start, end in spans:
        if type(start) is not int or type(end) is not int or not 0 <= start < end <= length:
            raise ValueError(f"Invalid span bounds ({start}, {end}) for text length {length}")
    return sorted(set(spans))


def normalize_predictions(text: str, predictions: list[dict], offset_unit: str) -> list[dict]:
    """Convert explicitly declared UTF-16 offsets; never guess their unit."""
    if offset_unit not in {"codepoint", "utf16"}:
        raise ValueError(f"Unknown offset unit: {offset_unit}")
    boundaries = {0: 0}
    utf16 = 0
    for index, char in enumerate(text):
        utf16 += 2 if ord(char) > 0xFFFF else 1
        boundaries[utf16] = index + 1
    out = []
    for pred in predictions:
        start, end = pred["start"], pred["end"]
        if type(start) is not int or type(end) is not int:
            raise ValueError("Span bounds must be integers")
        if offset_unit == "utf16":
            if start not in boundaries or end not in boundaries:
                raise ValueError("A UTF-16 span splits a surrogate pair or lies outside the text")
            start, end = boundaries[start], boundaries[end]
        unique_spans([(start, end)], len(text))
        out.append({**pred, "start": start, "end": end})
    return out


def load_span_rows(path: Path, datasets: dict[str, list[dict]]) -> tuple[dict, dict, dict]:
    """Reject stale, incomplete, duplicated or incorrectly aligned span caches."""
    predictions = {name: [[] for _ in docs] for name, docs in datasets.items()}
    times = {name: [] for name in datasets}
    metadata: dict[str, dict] = {}
    seen: set[tuple[str, int]] = set()
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        name, index = row["dataset"], row["i"]
        if name not in datasets or type(index) is not int or not 0 <= index < len(datasets[name]):
            raise ValueError("Unexpected dataset or document index in span cache")
        key = (name, index)
        if key in seen:
            raise ValueError("Duplicate document in span cache")
        seen.add(key)
        doc = datasets[name][index]
        if row.get("textHash") != hashlib.sha256(doc["text"].encode("utf-8")).hexdigest():
            raise ValueError("Span cache text hash is missing or does not match the corpus")
        if "offsetUnit" not in row:
            raise ValueError("Old span cache: regenerate with explicit offsetUnit")
        predictions[name][index] = normalize_predictions(doc["text"], row["spans"], row["offsetUnit"])
        times[name].append(row["ms"])
        current = {
            "contextual": row.get("contextual", False),
            "extraction": row.get("extraction", {}),
            "provenance": row.get("provenance"),
        }
        if name in metadata and metadata[name] != current:
            raise ValueError("Mixed detector profiles or extraction modes in one span cache")
        metadata[name] = current
    if len(seen) != sum(map(len, datasets.values())):
        raise ValueError("Incomplete span cache; absent documents are not negative predictions")
    return predictions, times, metadata


def matched_count(predicted: list[tuple[int, int]], gold: list[tuple[int, int]], exact: bool) -> int:
    """Maximum-cardinality bipartite matching, deterministic for fixed spans."""
    neighbors = [
        [j for j, target in enumerate(gold)
         if (candidate == target if exact else overlaps(*candidate, [target]))]
        for candidate in predicted
    ]
    assigned: dict[int, int] = {}

    def augment(index: int, seen: set[int]) -> bool:
        for target in neighbors[index]:
            if target in seen:
                continue
            seen.add(target)
            if target not in assigned or augment(assigned[target], seen):
                assigned[target] = index
                return True
        return False

    return sum(augment(index, set()) for index in range(len(predicted)))


def finish(counts: dict) -> dict:
    out = {}
    for name, row in counts.items():
        precision = None if row["tp"] + row["fp"] == 0 else row["tp"] / (row["tp"] + row["fp"])
        recall = None if row["tp"] + row["fn"] == 0 else row["tp"] / (row["tp"] + row["fn"])
        denominator = 2 * row["tp"] + row["fp"] + row["fn"]
        f1 = 2 * row["tp"] / denominator if denominator else None
        out[name] = {**row, "precision": precision, "recall": recall, "f1": f1}
    return out


def score(docs: list[dict], predictions: list[list[dict]]) -> dict:
    document = {name: {"tp": 0, "fp": 0, "fn": 0, "goldDocs": 0} for name in TYPES}
    classification = {name: {"tp": 0, "fp": 0, "fn": 0, "tn": 0, "goldDocs": 0} for name in TYPES}
    span = {
        mode: {name: {"tp": 0, "fp": 0, "fn": 0, "goldSpans": 0, "predSpans": 0} for name in TYPES}
        for mode in ("exact", "overlap")
    }
    blocking = {
        name: {"tp": 0, "fp": 0, "fn": 0, "tn": 0, "goldDocs": 0}
        for name in ("mapped_types", "all_annotated_types")
    }
    for doc, preds in zip(docs, predictions, strict=True):
        by_type = {name: [] for name in TYPES}
        for pred in preds:
            if pred["type"] in by_type:
                by_type[pred["type"]].append((pred["start"], pred["end"]))
        normalized_gold = {
            name: unique_spans(doc["gold"][name], len(doc["text"])) for name in TYPES
        }
        for name in TYPES:
            gold = normalized_gold[name]
            guessed = unique_spans(by_type[name], len(doc["text"]))
            document[name]["goldDocs"] += bool(gold)
            hit = any(overlaps(start, end, gold) for start, end in guessed)
            document[name]["tp"] += bool(guessed and hit)
            document[name]["fp"] += bool(guessed and not hit)
            document[name]["fn"] += bool(gold and not hit)
            classified = classification[name]
            classified["goldDocs"] += bool(gold)
            classified["tp" if guessed and gold else "fp" if guessed else "fn" if gold else "tn"] += 1
            for mode in span:
                count = matched_count(guessed, gold, exact=mode == "exact")
                row = span[mode][name]
                row["goldSpans"] += len(gold)
                row["predSpans"] += len(guessed)
                row["tp"] += count
                row["fp"] += len(guessed) - count
                row["fn"] += len(gold) - count
        flagged = any(by_type.values())
        for name, positive in (
            ("mapped_types", any(normalized_gold.values())),
            ("all_annotated_types", bool(doc.get("allGold", [
                item for spans in normalized_gold.values() for item in spans
            ]))),
        ):
            row = blocking[name]
            row["goldDocs"] += positive
            row["tp" if flagged and positive else "fp" if flagged else "fn" if positive else "tn"] += 1
    return {
        "scorerVersion": SCORER_VERSION,
        "offsetUnit": "codepoint",
        "document": finish(document),
        "documentClassification": finish(classification),
        "span": finish(span["overlap"]),
        "spanExact": finish(span["exact"]),
        "blocking": finish(blocking),
    }
