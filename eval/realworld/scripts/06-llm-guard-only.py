"""Score LLM Guard one batch per process and merge it into pii-tools.json.

A single process retained analyzer state until the kernel OOM-killed it.
Each batch exits so the operating system reclaims the model. A rerun
resumes from the span file.
"""
from __future__ import annotations

import importlib.util
import json
import logging
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
CACHE = Path("/tmp/realworld-data")
SPANS = CACHE / "llm-guard-spans.jsonl"
BATCH = 250
WINDOW = 1500
OVERLAP = 200


def load_pii():
    path = Path(__file__).with_name("06-pii-tools.py")
    spec = importlib.util.spec_from_file_location("pii_tools", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_docs(module):
    ai4 = module.load_gold(CACHE / "english_openpii_8k.jsonl", lambda raw: (
        raw["source_text"],
        [{"label": span["label"], "start": span["start"], "end": span["end"]} for span in raw.get("privacy_mask") or []],
    ))
    gretel = module.load_gold(CACHE / "gretel.jsonl", lambda raw: (
        raw["text"],
        [{"label": span["label"], "start": span["start"], "end": span["end"]} for span in raw.get("spans") or []],
    ))
    docs = [("ai4privacy", index, doc) for index, doc in enumerate(ai4)]
    docs += [("gretel", index, doc) for index, doc in enumerate(gretel)]
    return ai4, gretel, docs


def quiet_logs() -> None:
    logging.basicConfig(level=logging.ERROR)
    for name in ("llm_guard", "presidio-analyzer", "transformers"):
        logging.getLogger(name).setLevel(logging.ERROR)


def span_count() -> int:
    if not SPANS.exists():
        return 0
    count = 0
    with SPANS.open() as handle:
        for line in handle:
            if line.strip():
                count += 1
    return count


def worker(start: int, count: int) -> None:
    quiet_logs()
    try:
        import torch
        torch.set_num_threads(2)
    except Exception:
        pass
    module = load_pii()
    _, _, docs = load_docs(module)
    from llm_guard.input_scanners import Anonymize
    from llm_guard.vault import Vault
    quiet_logs()
    scanner = Anonymize(Vault(), use_onnx=False)
    quiet_logs()
    stop = min(len(docs), start + count)
    with SPANS.open("a") as handle:
        for cursor in range(start, stop):
            dataset, index, doc = docs[cursor]
            spans = []
            error = None
            started = time.perf_counter()
            text = doc["text"]
            step = max(1, WINDOW - OVERLAP)
            try:
                for offset in range(0, max(len(text), 1), step):
                    piece = text[offset:offset + WINDOW]
                    if not piece:
                        break
                    found = scanner._analyzer.analyze(
                        text=piece,
                        language="en",
                        entities=scanner._entity_types,
                        score_threshold=scanner._threshold,
                    )
                    for item in found:
                        kind = module.mapped(item.entity_type)
                        if not kind:
                            continue
                        spans.append({"type": kind, "start": item.start + offset, "end": item.end + offset})
                    if offset + WINDOW >= len(text):
                        break
                spans = list({(item["type"], item["start"], item["end"]): item for item in spans}.values())
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"[:240]
            elapsed = (time.perf_counter() - started) * 1000
            handle.write(json.dumps({
                "dataset": dataset,
                "i": index,
                "ms": round(elapsed, 3),
                "spans": spans,
                "error": error,
            }) + "\n")
            handle.flush()
    print("batch", start, stop, flush=True)


def finish() -> None:
    module = load_pii()
    ai4, gretel, _ = load_docs(module)
    preds = {"ai4privacy": [[] for _ in ai4], "gretel": [[] for _ in gretel]}
    times = {"ai4privacy": [], "gretel": []}
    errors = 0
    with SPANS.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            preds[row["dataset"]][row["i"]] = row["spans"]
            times[row["dataset"]].append(row.get("ms") or 0)
            if row.get("error"):
                errors += 1
    meta = {
        "recognizer": "Isotonic/deberta-v3-base_finetuned_ai4privacy_v2",
        "revision": "9ea992753ab2686be4a8f64605ccc7be197ad794",
        "threshold": 0.5,
        "batch": BATCH,
        "errors": errors,
        "windowChars": WINDOW,
        "overlapChars": OVERLAP,
        "note": "Default Anonymize scanner with a fresh Vault in each batch process. The DeBERTa checkpoint is finetuned on ai4privacy, so the English validation score can be optimistic. A single process was OOM-killed on long inputs, so each document is analyzed in 1500-character windows with 200 characters of overlap and the scanner process exits every 250 documents. Raw SSN labels are mapped when the NER map returns them unchanged.",
    }
    record = {"tool": "llm-guard-anonymize", "measured": True, "meta": meta, "datasets": {}}
    for dataset, gold in (("ai4privacy", ai4), ("gretel", gretel)):
        record["datasets"][dataset] = {
            **module.score(gold, preds[dataset]),
            "latencyMs": module.latency_summary(times[dataset]),
        }
        email = record["datasets"][dataset]["document"]["email"]
        print(dataset, "emailF1", None if email["f1"] is None else round(email["f1"], 4), flush=True)
    path = RESULTS / "pii-tools.json"
    report = json.loads(path.read_text())
    tools = report["tools"]
    for index, tool in enumerate(tools):
        if tool.get("tool") == "llm-guard-anonymize":
            tools[index] = record
            break
    else:
        tools.append(record)
    path.write_text(json.dumps(report, indent=2) + "\n")
    print("LLM_GUARD_DONE", flush=True)


def main() -> None:
    if len(sys.argv) >= 4 and sys.argv[1] == "--worker":
        worker(int(sys.argv[2]), int(sys.argv[3]))
        return
    module = load_pii()
    _, _, docs = load_docs(module)
    done = span_count()
    print("docs", len(docs), "resume", done, flush=True)
    while done < len(docs):
        count = min(BATCH, len(docs) - done)
        print("spawn", done, count, flush=True)
        subprocess.run([sys.executable, str(Path(__file__)), "--worker", str(done), str(count)], check=True)
        done = span_count()
    finish()


if __name__ == "__main__":
    main()
