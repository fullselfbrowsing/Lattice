import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from pii_metrics import TYPES, load_span_rows, matched_count, normalize_predictions, score


def document(gold, text="x" * 30):
    return {"text": text, "gold": {name: gold if name == "email" else [] for name in TYPES}}


def prediction(start, end, kind="email"):
    return {"type": kind, "start": start, "end": end}


class PiiMetricsTests(unittest.TestCase):
    def test_multiple_predictions_cannot_claim_the_same_gold_entity(self):
        out = score([document([(0, 5), (10, 15)])], [[prediction(0, 5), prediction(0, 4)]])
        self.assertEqual(out["span"]["email"]["recall"], 0.5)
        self.assertEqual(out["span"]["email"]["precision"], 0.5)
        self.assertEqual(out["span"]["email"]["fn"], 1)

    def test_duplicate_predictions_and_gold_are_deduplicated(self):
        out = score([document([(0, 5), (0, 5)])], [[prediction(0, 5), prediction(0, 5)]])
        self.assertEqual(out["span"]["email"]["tp"], 1)
        self.assertEqual(out["span"]["email"]["predSpans"], 1)

    def test_f1_is_zero_for_misses_and_undefined_only_without_entities(self):
        out = score([document([(0, 5)])], [[]])
        self.assertEqual(out["span"]["email"]["f1"], 0)
        self.assertIsNone(out["span"]["us-ssn"]["f1"])

    def test_matching_maximizes_cardinality_instead_of_greedy_overlap(self):
        self.assertEqual(matched_count([(0, 10), (0, 3)], [(0, 3), (7, 10)], False), 2)

    def test_exact_and_overlap_are_distinct(self):
        out = score([document([(0, 5)])], [[prediction(0, 4)]])
        self.assertEqual(out["span"]["email"]["recall"], 1)
        self.assertEqual(out["spanExact"]["email"]["recall"], 0)

    def test_wrong_type_can_block_sensitive_text_without_correct_classification(self):
        out = score([document([(0, 5)])], [[prediction(0, 5, "us-phone")]])
        self.assertEqual(out["blocking"]["mapped_types"]["tp"], 1)
        self.assertEqual(out["document"]["us-phone"]["fp"], 1)
        self.assertEqual(out["document"]["email"]["fn"], 1)
        self.assertEqual(out["documentClassification"]["email"]["fn"], 1)
        self.assertEqual(out["documentClassification"]["us-phone"]["fp"], 1)

    def test_document_type_classification_does_not_claim_correct_extraction(self):
        out = score([document([(0, 5)])], [[prediction(10, 15)]])
        self.assertEqual(out["documentClassification"]["email"]["tp"], 1)
        self.assertEqual(out["document"]["email"]["tp"], 0)
        self.assertEqual(out["span"]["email"]["tp"], 0)

    def test_harmless_and_out_of_scope_data_have_distinct_blocking_labels(self):
        doc = document([])
        doc["allGold"] = [(0, 5)]
        out = score([doc], [[prediction(0, 5)]])
        self.assertEqual(out["blocking"]["mapped_types"]["fp"], 1)
        self.assertEqual(out["blocking"]["all_annotated_types"]["tp"], 1)

    def test_utf16_surrogate_offsets_are_converted(self):
        text = "😀a@b.co"
        self.assertEqual(normalize_predictions(text, [prediction(2, 8)], "utf16"),
                         [prediction(1, 7)])
        with self.assertRaises(ValueError):
            normalize_predictions(text, [prediction(1, 8)], "utf16")

    def test_invalid_bounds_and_length_mismatch_fail_loudly(self):
        with self.assertRaises(ValueError):
            score([document([])], [[prediction(2, 31)]])
        with self.assertRaises(ValueError):
            score([document([])], [])
        with self.assertRaises(ValueError):
            normalize_predictions("abc", [prediction(False, 2)], "utf16")

    def test_span_cache_rejects_missing_duplicate_stale_and_mixed_rows(self):
        docs = [document([]), document([])]
        row = {
            "dataset": "dev", "i": 0, "ms": 1, "spans": [], "offsetUnit": "utf16",
            "textHash": hashlib.sha256(docs[0]["text"].encode()).hexdigest(),
            "contextual": False, "extraction": {"email": "all-matches"},
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "spans.jsonl"
            def write(rows):
                path.write_text("".join(json.dumps(item) + "\n" for item in rows))
            valid = [row, {**row, "i": 1}]
            write(valid)
            preds, times, metadata = load_span_rows(path, {"dev": docs})
            self.assertEqual(preds, {"dev": [[], []]})
            self.assertEqual(times, {"dev": [1, 1]})
            self.assertFalse(metadata["dev"]["contextual"])
            for rows in (
                [row], [row, row],
                [row, {**row, "i": 1, "textHash": "stale"}],
                [row, {**row, "i": 1, "contextual": True}],
            ):
                write(rows)
                with self.assertRaises(ValueError):
                    load_span_rows(path, {"dev": docs})


if __name__ == "__main__":
    unittest.main()
