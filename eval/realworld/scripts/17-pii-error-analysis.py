"""Aggregate-only development-set PII error analysis; no detector or score changes."""
from __future__ import annotations

import argparse
import ast
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys


SCRIPT = Path(__file__).resolve()
REPO = SCRIPT.parents[3]
TYPES = ("email", "us-ssn", "us-phone", "credit-card")
DEV_FILE = Path("pii-split/dev.jsonl")
PREDICTIONS_FILE = Path("pii-dev-default-spans.jsonl")


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dependencies(directory: Path):
    """Load the scorer read-only and extract the official source-label map."""
    metrics_path = directory / "pii_metrics.py"
    spec = importlib.util.spec_from_file_location("pii_error_analysis_metrics", metrics_path)
    if spec is None or spec.loader is None:
        raise ValueError("Scorer module cannot be loaded")
    metrics = importlib.util.module_from_spec(spec)
    previous = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(metrics)
    finally:
        sys.dont_write_bytecode = previous
    mapping_path = directory / "06-pii-tools.py"
    tree = ast.parse(mapping_path.read_text(encoding="utf8"))
    maps = [
        ast.literal_eval(statement.value)
        for statement in tree.body
        if isinstance(statement, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "TYPE_MAP" for target in statement.targets)
    ]
    if len(maps) != 1 or not isinstance(maps[0], dict):
        raise ValueError("Expected one literal source-label mapping")
    type_map = maps[0]
    if not all(isinstance(key, str) and value in TYPES for key, value in type_map.items()):
        raise ValueError("Unsupported source-label mapping")
    if tuple(metrics.TYPES) != TYPES:
        raise ValueError("Scorer types differ from analysis types")
    return metrics, type_map


def mapped(label: str, type_map: dict) -> str | None:
    return type_map.get(label) or type_map.get(label.lower())


def adapt_document(raw: dict, metrics, type_map: dict) -> dict:
    text = raw["text"]
    if not isinstance(text, str) or not isinstance(raw["spans"], list):
        raise ValueError("Invalid development document shape")
    if raw.get("textHash") != hashlib.sha256(text.encode("utf8")).hexdigest():
        raise ValueError("Development document text hash mismatch")
    gold = {kind: [] for kind in TYPES}
    annotations = []
    for annotation in raw["spans"]:
        start, end, label = annotation["start"], annotation["end"], annotation["label"]
        if not isinstance(label, str):
            raise ValueError("Annotation label is not a string")
        metrics.unique_spans([(start, end)], len(text))
        kind = mapped(label, type_map)
        annotations.append((start, end, kind))
        if kind is not None:
            gold[kind].append((start, end))
    return {
        "text": text, "gold": gold,
        "allGold": [(start, end) for start, end, _ in annotations],
        "annotations": annotations,
    }


def matched_indices(predicted: list, gold: list, metrics) -> set[int]:
    """Return the scorer's deterministic maximum-cardinality overlap assignment."""
    neighbors = [
        [index for index, target in enumerate(gold) if metrics.overlaps(*candidate, [target])]
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

    for index in range(len(predicted)):
        augment(index, set())
    result = set(assigned.values())
    if len(result) != metrics.matched_count(predicted, gold, exact=False):
        raise ValueError("Analysis assignment differs from official overlap scorer")
    return result


def analyze_documents(docs: list[dict], predictions: list[list[dict]], metrics) -> dict:
    counters = {kind: Counter() for kind in TYPES}
    other_types = {kind: Counter() for kind in TYPES}
    repeated_by_bucket = {kind: defaultdict(Counter) for kind in TYPES}
    unmatched_values_by_bucket = {kind: defaultdict(Counter) for kind in TYPES}
    for doc, document_predictions in zip(docs, predictions, strict=True):
        text = doc["text"]
        # Sensitive strings remain local to this document and never enter results.
        annotated_values = defaultdict(list)
        for start, end, kind in doc["annotations"]:
            annotated_values[text[start:end]].append((start, end, kind))
        for kind in TYPES:
            count = counters[kind]
            raw = [(pred["start"], pred["end"]) for pred in document_predictions if pred["type"] == kind]
            predicted = metrics.unique_spans(raw, len(text))
            gold = metrics.unique_spans(doc["gold"][kind], len(text))
            matched = matched_indices(predicted, gold, metrics)
            count["documents"] += 1
            count["documentsWithPredictions"] += bool(predicted)
            count["documentsWithSameTypeGold"] += bool(gold)
            count["rawPredictions"] += len(raw)
            count["duplicateIdenticalSpansRemoved"] += len(raw) - len(predicted)
            count["deduplicatedPredictions"] += len(predicted)
            count["matchedPredictions"] += len(matched)
            count["goldSpans"] += len(gold)
            count["unmatchedGoldSpans"] += len(gold) - len(matched)
            distinct_values = {text[start:end] for start, end in predicted}
            count["distinctPredictedStringsWithinDocuments"] += len(distinct_values)
            count["additionalOccurrencesBeyondFirstOfSameStringWithinDocument"] += len(predicted) - len(distinct_values)
            document_buckets = set()
            bucket_values = defaultdict(Counter)
            for index, (start, end) in enumerate(predicted):
                if index in matched:
                    continue
                count["unmatchedPredictions"] += 1
                if metrics.overlaps(start, end, gold):
                    bucket = "sameTypeOverlapAfterOneToOneMatching"
                elif metrics.overlaps(start, end, doc["allGold"]):
                    bucket = "otherLabelOverlapWithoutSameTypeOverlap"
                    overlapping_types = {
                        target_kind or "outside-four-mapped-types"
                        for begin, stop, target_kind in doc["annotations"]
                        if start < stop and end > begin
                    }
                    for target in overlapping_types:
                        other_types[kind][target] += 1
                else:
                    bucket = "noAnnotatedOverlap"
                count[bucket] += 1
                document_buckets.add(bucket)
                bucket_values[bucket][text[start:end]] += 1
                elsewhere = [
                    target_kind
                    for begin, stop, target_kind in annotated_values.get(text[start:end], [])
                    if stop <= start or begin >= end
                ]
                if elsewhere:
                    repeat_kind = "sameMappedType" if kind in elsewhere else "otherOrUnmappedTypeOnly"
                    repeated_by_bucket[kind][bucket]["anyAnnotatedType"] += 1
                    repeated_by_bucket[kind][bucket][repeat_kind] += 1
                    count["unmatchedWithExactStringAnnotatedElsewhere"] += 1
                    count[f"unmatchedWithExactStringAnnotatedElsewhere_{repeat_kind}"] += 1
                if bucket == "noAnnotatedOverlap" and not elsewhere:
                    count["noAnnotatedOverlapAndNoExactStringAnnotatedElsewhere"] += 1
            count["documentsWithUnmatchedPredictions"] += bool(document_buckets)
            for bucket in document_buckets:
                count[f"documents_{bucket}"] += 1
                values = bucket_values[bucket]
                unmatched_values_by_bucket[kind][bucket]["distinctStringsWithinDocuments"] += len(values)
                unmatched_values_by_bucket[kind][bucket]["additionalOccurrencesBeyondFirst"] += sum(values.values()) - len(values)

    scores = metrics.score(docs, predictions)
    output = {}
    bucket_names = (
        "sameTypeOverlapAfterOneToOneMatching",
        "otherLabelOverlapWithoutSameTypeOverlap",
        "noAnnotatedOverlap",
    )
    for kind in TYPES:
        count = counters[kind]
        score = scores["span"][kind]
        if (count["matchedPredictions"], count["unmatchedPredictions"], count["unmatchedGoldSpans"]) != (score["tp"], score["fp"], score["fn"]):
            raise ValueError("Error categories do not reproduce official scoring counts")
        if sum(count[name] for name in bucket_names) != count["unmatchedPredictions"]:
            raise ValueError("Unmatched prediction categories do not partition false positives")
        for name in (*bucket_names, "unmatchedPredictions", "noAnnotatedOverlapAndNoExactStringAnnotatedElsewhere", "unmatchedWithExactStringAnnotatedElsewhere", "unmatchedWithExactStringAnnotatedElsewhere_sameMappedType", "unmatchedWithExactStringAnnotatedElsewhere_otherOrUnmappedTypeOnly"):
            count[name] += 0
        output[kind] = {
            "overlapScoreUnchanged": score,
            "exactScoreUnchanged": scores["spanExact"][kind],
            "counts": dict(sorted(count.items())),
            "otherAnnotatedOverlapTypes": dict(sorted(other_types[kind].items())),
            "exactStringAnnotatedElsewhereByBucket": {
                bucket: {
                    key: repeated_by_bucket[kind][bucket][key]
                    for key in ("anyAnnotatedType", "sameMappedType", "otherOrUnmappedTypeOnly")
                }
                for bucket in bucket_names
            },
            "repeatedUnmatchedPredictionStringsByBucket": {
                bucket: {key: unmatched_values_by_bucket[kind][bucket][key] for key in ("distinctStringsWithinDocuments", "additionalOccurrencesBeyondFirst")}
                for bucket in bucket_names
            },
            "potentialAnnotationGapCount": repeated_by_bucket[kind]["noAnnotatedOverlap"]["sameMappedType"],
        }
    return output


def self_test(metrics, type_map: dict) -> None:
    text = "😀 a@example.invalid a@example.invalid 12345"
    first = text.index("a@example.invalid")
    second = text.index("a@example.invalid", first + 1)
    end = len("a@example.invalid")
    number = text.index("12345")
    raw = {
        "text": text, "textHash": hashlib.sha256(text.encode()).hexdigest(),
        "spans": [
            {"start": first, "end": first + end, "label": "EMAIL"},
            {"start": number, "end": number + 5, "label": "TEL"},
        ],
    }
    # The astral prefix makes every following UTF-16 offset one larger.
    predictions = metrics.normalize_predictions(text, [
        {"type": "email", "start": first + 1, "end": first + end + 1},
        {"type": "email", "start": second + 1, "end": second + end + 1},
        {"type": "email", "start": second + 1, "end": second + end + 1},
        {"type": "email", "start": number + 1, "end": number + 6},
    ], "utf16")
    result = analyze_documents([adapt_document(raw, metrics, type_map)], [predictions], metrics)["email"]
    assert result["counts"]["unmatchedPredictions"] == 2
    assert result["counts"]["duplicateIdenticalSpansRemoved"] == 1
    assert result["counts"]["noAnnotatedOverlap"] == 1
    assert result["counts"]["otherLabelOverlapWithoutSameTypeOverlap"] == 1
    assert result["potentialAnnotationGapCount"] == 1
    assert result["otherAnnotatedOverlapTypes"] == {"us-phone": 1}
    assert result["repeatedUnmatchedPredictionStringsByBucket"]["noAnnotatedOverlap"] == {"distinctStringsWithinDocuments": 1, "additionalOccurrencesBeyondFirst": 0}
    assert len(matched_indices([(0, 4), (0, 5)], [(0, 5)], metrics)) == 1


def revision(directory: Path) -> str | None:
    try:
        return subprocess.check_output(["git", "-C", str(directory), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path(os.environ.get("REALWORLD_CACHE", REPO / ".context/eval-cache")))
    parser.add_argument("--output", type=Path, default=SCRIPT.parent.parent / "results/pii-error-analysis.json")
    parser.add_argument("--scorer-dir", type=Path, default=SCRIPT.parent, help="Directory containing pii_metrics.py and 06-pii-tools.py")
    parser.add_argument("--self-test", action="store_true", help="Run synthetic counterexamples without reading the development cache")
    args = parser.parse_args()
    metrics, type_map = dependencies(args.scorer_dir)
    if args.self_test:
        self_test(metrics, type_map)
        print(json.dumps({"selfTest": "passed", "documentsRead": 0}))
        return

    dev_path = args.cache / DEV_FILE
    predictions_path = args.cache / PREDICTIONS_FILE
    docs = []
    with dev_path.open(encoding="utf8") as handle:
        for line in handle:
            if line.strip():
                docs.append(adapt_document(json.loads(line), metrics, type_map))
    if not docs:
        raise ValueError("Development corpus is empty")
    with predictions_path.open(encoding="utf8") as handle:
        first = next(json.loads(line) for line in handle if line.strip())
    dataset = first["dataset"]
    if not isinstance(dataset, str):
        raise ValueError("Span cache dataset identifier is not a string")
    predictions, _, metadata = metrics.load_span_rows(predictions_path, {dataset: docs})
    profile = metadata[dataset]
    if profile["contextual"] is not False:
        raise ValueError("Expected the default non-contextual development profile")
    for document_predictions in predictions[dataset]:
        if any(prediction["type"] not in TYPES for prediction in document_predictions):
            raise ValueError("Unexpected prediction type")
    aggregate = analyze_documents(docs, predictions[dataset], metrics)
    report = {
        "schemaVersion": "lattice-pii-error-analysis/v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dataset": "development-only",
        "documents": len(docs), "holdoutRead": False,
        "scorerVersion": metrics.SCORER_VERSION, "offsetUnit": "codepoint",
        "provenance": {
            "analysisCodeRevision": revision(REPO),
            "scorerCodeRevision": revision(args.scorer_dir),
            "analysisScriptSha256": file_hash(SCRIPT),
            "scorerSha256": file_hash(args.scorer_dir / "pii_metrics.py"),
            "labelMappingScriptSha256": file_hash(args.scorer_dir / "06-pii-tools.py"),
            "developmentFileSha256": file_hash(dev_path),
            "predictionFileSha256": file_hash(predictions_path),
            "predictionMetadataSha256": hashlib.sha256(json.dumps(profile, sort_keys=True).encode()).hexdigest(),
            "contextual": False,
            "python": sys.version.split()[0],
        },
        "methodology": {
            "matching": "Official UTF-16 normalization, span deduplication, source-label mapping, and deterministic one-to-one maximum-cardinality overlap matching. Reproduced TP/FP/FN counts are asserted against pii_metrics.score; metrics are unchanged.",
            "partition": "Every unmatched prediction belongs to exactly one bucket: overlaps same-type gold but loses one-to-one matching; overlaps only other annotated labels; or overlaps no annotation of any type.",
            "repeatedStrings": "Case-sensitive exact equality with a complete annotated span at another non-overlapping location in the same document. Counts are cross-tabulated by unmatched bucket; values are never exported.",
            "interpretation": "No-overlap predictions repeating a same-type annotated string are potential annotation gaps, not automatically true positives. Other-label overlaps may reflect taxonomy disagreements, boundaries, or detector mistakes. Unannotated strings without this evidence remain unexplained by this analysis.",
            "privacy": "Only aggregate counts, metrics, and file-level provenance hashes are published. No raw text, matched values, document IDs, individual offsets, or per-value hashes are emitted. Only the fixed development files are read.",
        },
        "types": aggregate,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"documents": len(docs), "types": {
        kind: {"overlap": row["overlapScoreUnchanged"], "unmatched": row["counts"]["unmatchedPredictions"], "noAnnotatedOverlap": row["counts"]["noAnnotatedOverlap"], "potentialAnnotationGaps": row["potentialAnnotationGapCount"]}
        for kind, row in aggregate.items()
    }}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never echo an exception that might contain cached dataset content.
        print(json.dumps({"error": type(error).__name__, "message": "Input validation or scoring failed; no dataset content is emitted."}), file=sys.stderr)
        raise SystemExit(1) from None
