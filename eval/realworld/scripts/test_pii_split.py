import tempfile
import unittest
import json
import subprocess
import sys
from pathlib import Path

from pii_split import historical_template, prepare_split, template_hash, verify_frozen, write_frozen


def example(prefix: str, email: str = "one@example.com") -> dict:
    text = prefix + " " + email
    return {"text": text, "spans": [{"label": "email", "start": len(prefix) + 1, "end": len(text)}]}


class PiiSplitTests(unittest.TestCase):
    def corpus(self) -> list[dict]:
        return [example(prefix, email) for prefix in ("alpha", "beta", "gamma", "delta", "epsilon")
                for email in ("one@example.com", "two@example.com")]

    def test_templates_ignore_sensitive_values_and_residual_numbers(self):
        self.assertEqual(template_hash(example("Invoice 123")), template_hash(example("INVOICE 456", "other@example.net")))

    def test_group_assignment_is_deterministic_and_disjoint(self):
        manifest, splits = prepare_split(self.corpus(), [], {"train": "hash"})
        again, other = prepare_split(list(reversed(self.corpus())), [], {"train": "hash"})
        self.assertEqual((manifest, splits), (again, other))
        self.assertEqual(manifest["splits"]["dev"]["templateGroups"], 4)
        self.assertEqual(manifest["splits"]["holdout"]["templateGroups"], 1)
        self.assertFalse({doc["templateHash"] for doc in splits["dev"]} & {doc["templateHash"] for doc in splits["holdout"]})
        self.assertFalse({doc["id"] for doc in splits["dev"]} & {doc["id"] for doc in splits["holdout"]})

    def test_historical_documents_and_templates_are_excluded(self):
        old = example("alpha")
        data = self.corpus() + [old]
        manifest, splits = prepare_split(data, [old], {})
        self.assertEqual(manifest["excluded"], {
            "historicalText": 1, "historicalTemplate": 1, "duplicateTrainText": 1,
        })
        self.assertNotIn(template_hash(old), {doc["templateHash"] for docs in splits.values() for doc in docs})

    def test_historical_overrun_keeps_template_exclusion_and_records_provenance(self):
        old = example("alpha")
        original_end = old["spans"][0]["end"] + 9
        old["spans"][0]["end"] = original_end
        old["_source"] = {"file": "historical.jsonl", "row": 12}
        manifest, splits = prepare_split(self.corpus(), [old], {"historical.jsonl": "hash"})
        self.assertEqual(manifest["excluded"]["historicalTemplate"], 1)
        self.assertEqual(manifest["historicalAnnotationSummary"]["adjustedSpans"], 1)
        adjustment = manifest["historicalAnnotationAdjustments"][0]
        self.assertEqual((adjustment["sourceFile"], adjustment["sourceRow"]), ("historical.jsonl", 12))
        self.assertEqual(adjustment["original"]["end"], original_end)
        self.assertEqual(adjustment["effective"]["end"], len(old["text"]))
        self.assertEqual(old["spans"][0]["end"], original_end)
        self.assertNotIn(template_hash(example("alpha")), {doc["templateHash"] for docs in splits.values() for doc in docs})
        self.assertNotIn(old["text"], json.dumps(adjustment))
        with self.assertRaises(ValueError):
            prepare_split([old] + self.corpus(), [], {})

    def test_unrecoverable_historical_offsets_are_not_silently_dropped(self):
        for start, end in ((100, 110), (-1, 4), (1, 1), (3, 2), ("0", 4)):
            old = example("alpha")
            old["spans"][0]["start"], old["spans"][0]["end"] = start, end
            with self.assertRaisesRegex(ValueError, "cannot exclude its template safely"):
                historical_template(old)

    def test_frozen_manifest_is_reproducible_and_cannot_be_overwritten(self):
        manifest, splits = prepare_split(self.corpus(), [], {})
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            digest = write_frozen(directory, manifest, splits)
            self.assertEqual(digest, write_frozen(directory, manifest, splits))
            self.assertEqual(manifest, verify_frozen(directory))
            changed = {**manifest, "seed": "different"}
            with self.assertRaises(ValueError):
                write_frozen(directory, changed, splits)
            (directory / "holdout.jsonl").write_text("changed")
            with self.assertRaises(ValueError):
                verify_frozen(directory)

    def test_invalid_gold_and_insufficient_unseen_groups_fail_closed(self):
        bad = example("broken")
        bad["spans"][0]["end"] += 1
        with self.assertRaises(ValueError):
            template_hash(bad)
        with self.assertRaises(ValueError):
            prepare_split([example("same"), example("same", "other@example.net")], [], {})

    def test_cli_scores_frozen_dev_predictions_and_checks_profile(self):
        manifest, splits = prepare_split(self.corpus(), [], {})
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp) / "split"
            digest = write_frozen(directory, manifest, splits)
            spans = Path(tmp) / "spans.jsonl"
            spans.write_text("".join(json.dumps({
                "dataset": "dev", "i": index, "ms": 0.1,
                "textHash": doc["textHash"], "offsetUnit": "codepoint",
                "contextual": False, "extraction": {"email": "all-matches"},
                "spans": [{"type": "email", "start": span["start"], "end": span["end"]} for span in doc["spans"]],
            }) + "\n" for index, doc in enumerate(splits["dev"])))
            output = Path(tmp) / "report.json"
            command = [sys.executable, str(Path(__file__).with_name("12-score-pii-split.py")),
                       "--split-directory", str(directory), "--split", "dev",
                       "--spans", str(spans), "--output", str(output), "--profile"]
            subprocess.run(command + ["default"], check=True, capture_output=True, text=True)
            report = json.loads(output.read_text())
            self.assertEqual(report["manifestSha256"], digest)
            self.assertEqual(report["documents"], len(splits["dev"]))
            self.assertEqual(report["spanExact"]["email"]["recall"], 1)
            rejected = subprocess.run(command + ["contextual"], capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("profile", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
