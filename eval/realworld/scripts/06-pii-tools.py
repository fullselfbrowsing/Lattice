"""Score PII detectors on the cached public sets.

Texts are not written into the repository. Lattice spans come from
06-lattice-spans.mjs, which this script re-runs unless REUSE_LATTICE_SPANS=1.
Other tools are imported only when installed. PII_SKIP_LLM_GUARD=1 leaves LLM
Guard to 06-llm-guard-only.py, which windows long documents.
"""
from __future__ import annotations

import importlib.metadata
import json
import os
import re
import shutil
import statistics
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data"))
RESULTS = ROOT / "results"
SPANS = Path(os.environ.get("LATTICE_SPANS", CACHE / "lattice-spans.jsonl"))
NODE_BIN = os.environ.get("NODE_BIN") or shutil.which("node") or "node"
TYPES = ("email", "us-ssn", "us-phone", "credit-card")
TYPE_MAP = {
    "EMAIL": "email",
    "email": "email",
    "SOCIALNUMBER": "us-ssn",
    "ssn": "us-ssn",
    "social_security_number": "us-ssn",
    "TEL": "us-phone",
    "phone": "us-phone",
    "phone_number": "us-phone",
    "CREDITCARD": "credit-card",
    "CREDITCARDNUMBER": "credit-card",
    "credit_card": "credit-card",
    "credit_card_number": "credit-card",
    "card_number": "credit-card",
    "EMAIL_ADDRESS": "email",
    "EMAIL_ADDRESS_RE": "email",
    "US_SSN": "us-ssn",
    "US_SSN_RE": "us-ssn",
    "PHONE_NUMBER": "us-phone",
    "CREDIT_CARD": "credit-card",
    "CREDIT_CARD_RE": "credit-card",
    "SSN": "us-ssn",
    "PHONENUMBER": "us-phone",
    "TELEPHONENUMBER": "us-phone",
}


def mapped(label: str) -> str | None:
    return TYPE_MAP.get(label) or TYPE_MAP.get(label.lower())


def pkg_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def lattice_meta() -> dict:
    try:
        commit = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        commit = None
    return {"commit": commit}


def load_gold(path: Path, adapt) -> list[dict]:
    docs = []
    with path.open() as handle:
        for line in handle:
            if not line.strip():
                continue
            raw = json.loads(line)
            text, spans = adapt(raw)
            gold = {name: [] for name in TYPES}
            for span in spans:
                kind = mapped(str(span["label"]))
                if kind:
                    gold[kind].append((span["start"], span["end"]))
            docs.append({"text": text, "gold": gold})
    return docs


def overlaps(start: int, end: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < stop and end > begin for begin, stop in spans)


def score(docs: list[dict], predictions: list[list[dict]]) -> dict:
    document = {name: {"tp": 0, "fp": 0, "fn": 0, "goldDocs": 0} for name in TYPES}
    span = {name: {"tp": 0, "fp": 0, "fn": 0, "goldSpans": 0, "predSpans": 0} for name in TYPES}
    for doc, preds in zip(docs, predictions, strict=True):
        by_type: dict[str, list[tuple[int, int]]] = {name: [] for name in TYPES}
        for pred in preds:
            kind = pred["type"]
            if kind in by_type:
                by_type[kind].append((pred["start"], pred["end"]))
        for name in TYPES:
            gold = doc["gold"][name]
            guessed = by_type[name]
            if gold:
                document[name]["goldDocs"] += 1
            hit = any(overlaps(start, end, gold) for start, end in guessed)
            if guessed and hit:
                document[name]["tp"] += 1
            elif guessed:
                document[name]["fp"] += 1
            if gold and not hit:
                document[name]["fn"] += 1
            span[name]["goldSpans"] += len(gold)
            span[name]["predSpans"] += len(guessed)
            for start, end in guessed:
                if overlaps(start, end, gold):
                    span[name]["tp"] += 1
                else:
                    span[name]["fp"] += 1
            for begin, stop in gold:
                if not any(overlaps(start, end, [(begin, stop)]) for start, end in guessed):
                    span[name]["fn"] += 1
    return {"document": finish(document), "span": finish(span)}


def finish(counts: dict) -> dict:
    out = {}
    for name, row in counts.items():
        precision = None if row["tp"] + row["fp"] == 0 else row["tp"] / (row["tp"] + row["fp"])
        recall = None if row["tp"] + row["fn"] == 0 else row["tp"] / (row["tp"] + row["fn"])
        f1 = None
        if precision is not None and recall is not None and precision + recall > 0:
            f1 = 2 * precision * recall / (precision + recall)
        out[name] = {**row, "precision": precision, "recall": recall, "f1": f1}
    return out


def latency_summary(samples: list[float]) -> dict:
    if not samples:
        return {"n": 0}
    ordered = sorted(samples)
    def q(p: float) -> float:
        return ordered[min(len(ordered) - 1, int(p * len(ordered)))]
    return {
        "n": len(samples),
        "mean": statistics.fmean(samples),
        "p50": q(0.5),
        "p95": q(0.95),
        "min": ordered[0],
        "max": ordered[-1],
    }


def presidio_tool(docs: list[dict]) -> tuple[list[list[dict]], list[float], dict]:
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
    })
    engine = AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["en"])
    entities = ["EMAIL_ADDRESS", "PHONE_NUMBER", "US_SSN", "CREDIT_CARD"]
    preds, times = [], []
    for index, doc in enumerate(docs):
        t0 = time.perf_counter()
        found = engine.analyze(text=doc["text"], language="en", entities=entities)
        times.append((time.perf_counter() - t0) * 1000)
        preds.append([
            {"type": mapped(item.entity_type), "start": item.start, "end": item.end}
            for item in found
            if mapped(item.entity_type)
        ])
        if index and index % 1000 == 0:
            print("presidio", index, flush=True)
    import spacy
    return preds, times, {
        "version": pkg_version("presidio-analyzer"),
        "spacy": spacy.__version__,
        "spacyModel": "en_core_web_sm",
        "spacyModelVersion": pkg_version("en_core_web_sm"),
        "entitiesRequested": entities,
        "note": "Pattern and spaCy recognizers for the four in-scope Presidio entities.",
    }


def spacy_tool(docs: list[dict]) -> tuple[list[list[dict]], list[float], dict]:
    import spacy
    nlp = spacy.load("en_core_web_sm")
    preds, times = [], []
    labels = {}
    for doc in docs:
        t0 = time.perf_counter()
        parsed = nlp(doc["text"])
        times.append((time.perf_counter() - t0) * 1000)
        spans = []
        for ent in parsed.ents:
            labels[ent.label_] = labels.get(ent.label_, 0) + 1
            kind = mapped(ent.label_)
            if kind:
                spans.append({"type": kind, "start": ent.start_char, "end": ent.end_char})
        preds.append(spans)
    return preds, times, {
        "version": spacy.__version__,
        "model": "en_core_web_sm",
        "modelVersion": pkg_version("en_core_web_sm"),
        "labelCounts": labels,
        "note": "Default NER labels. None of PERSON, ORG, GPE, DATE, or CARDINAL are mapped onto email, US SSN, US phone, or credit card.",
    }


def gliner_tool(docs: list[dict]) -> tuple[list[list[dict]], list[float], dict]:
    from gliner import GLiNER
    model_id = "urchade/gliner_small-v2.1"
    revision = os.environ.get("GLINER_REVISION") or None
    model = GLiNER.from_pretrained(model_id, revision=revision) if revision else GLiNER.from_pretrained(model_id)
    labels = ["email", "social security number", "phone number", "credit card number"]
    label_map = {
        "email": "email",
        "social security number": "us-ssn",
        "phone number": "us-phone",
        "credit card number": "credit-card",
    }
    preds, times = [], []
    for index, doc in enumerate(docs):
        t0 = time.perf_counter()
        found = model.predict_entities(doc["text"], labels, threshold=0.5)
        times.append((time.perf_counter() - t0) * 1000)
        preds.append([
            {"type": label_map[item["label"]], "start": item["start"], "end": item["end"]}
            for item in found
            if item.get("label") in label_map
        ])
        if index and index % 250 == 0:
            print("gliner", index, flush=True)
    return preds, times, {
        "model": model_id,
        "revision": revision,
        "threshold": 0.5,
        "labels": labels,
        "version": pkg_version("gliner"),
        "transformers": pkg_version("transformers"),
        "torch": pkg_version("torch"),
    }


def llm_guard_tool(docs: list[dict]) -> tuple[list[list[dict]], list[float], dict]:
    from llm_guard.input_scanners import Anonymize
    from llm_guard.vault import Vault
    scanner = Anonymize(Vault(), use_onnx=False)
    preds, times = [], []
    for index, doc in enumerate(docs):
        t0 = time.perf_counter()
        found = scanner._analyzer.analyze(
            text=doc["text"],
            language=scanner._language,
            entities=scanner._entity_types,
            score_threshold=scanner._threshold,
        )
        times.append((time.perf_counter() - t0) * 1000)
        preds.append([
            {"type": mapped(item.entity_type), "start": item.start, "end": item.end}
            for item in found
            if mapped(item.entity_type)
        ])
        if index and index % 250 == 0:
            print("llm-guard", index, flush=True)
    return preds, times, {
        "version": pkg_version("llm-guard"),
        "transformers": pkg_version("transformers"),
        "recognizer": "Isotonic/deberta-v3-base_finetuned_ai4privacy_v2",
        "revision": "9ea992753ab2686be4a8f64605ccc7be197ad794",
        "entityTypes": list(scanner._entity_types),
        "threshold": scanner._threshold,
        "note": "Default Anonymize scanner. The DeBERTa checkpoint is finetuned on ai4privacy, so the English validation score can be optimistic. US_SSN is requested; the NER label map has no SOCIALNUMBER label and also ships US_SSN_RE.",
    }


def nemo_status() -> dict:
    return {
        "tool": "nemo-guardrails",
        "measured": False,
        "status": "from docs, not measured",
        "reason": "nemoguardrails is not installed, and en_core_web_lg is not downloaded. The built-in sensitive-data rails call Presidio, which is scored on its own. The library also documents a separate GLiNER rail.",
        "docs": "https://docs.nvidia.com/nemo/guardrails/configure-guardrails/guardrail-catalog/pii-detection",
    }


def guardrails_status() -> dict:
    try:
        from guardrails.hub import DetectPII  # noqa: F401
        return {"measured": False, "reason": "DetectPII imported unexpectedly without a hub install; not scored."}
    except Exception as exc:
        # Drop the absolute site-packages path from the import error.
        reason = re.sub(r" \(/[^)]*\)", "", f"{type(exc).__name__}: {exc}")
        return {
            "tool": "guardrails-detect-pii",
            "measured": False,
            "status": "from docs, not measured",
            "version": pkg_version("guardrails-ai"),
            "reason": reason[:400],
            "docs": "Guardrails AI validators can reject a string that contains PII. The hub package guardrails/detect_pii was not installed in this environment.",
        }


def main() -> None:
    spans_path = SPANS
    if os.environ.get("REUSE_LATTICE_SPANS") != "1" or not spans_path.exists():
        env = os.environ.copy()
        env["REALWORLD_CACHE"] = str(CACHE)
        env["LATTICE_SPANS"] = str(spans_path)
        subprocess.check_call([NODE_BIN, str(Path(__file__).with_name("06-lattice-spans.mjs"))], env=env)
    ai4 = load_gold(CACHE / "english_openpii_8k.jsonl", lambda raw: (
        raw["source_text"],
        [{"label": span["label"], "start": span["start"], "end": span["end"]} for span in raw.get("privacy_mask") or []],
    ))
    gretel = load_gold(CACHE / "gretel.jsonl", lambda raw: (
        raw["text"],
        [{"label": span["label"], "start": span["start"], "end": span["end"]} for span in raw.get("spans") or []],
    ))
    print("docs", len(ai4), len(gretel), flush=True)
    lattice_preds = {"ai4privacy": [[] for _ in ai4], "gretel": [[] for _ in gretel]}
    lattice_ms = {"ai4privacy": [], "gretel": []}
    with spans_path.open() as handle:
        for line in handle:
            row = json.loads(line)
            lattice_preds[row["dataset"]][row["i"]] = row["spans"]
            lattice_ms[row["dataset"]].append(row["ms"])

    tools = [{
        "tool": "lattice-noPII",
        "measured": True,
        "datasets": {
            "ai4privacy": {**score(ai4, lattice_preds["ai4privacy"]), "latencyMs": latency_summary(lattice_ms["ai4privacy"])},
            "gretel": {**score(gretel, lattice_preds["gretel"]), "latencyMs": latency_summary(lattice_ms["gretel"])},
        },
        "note": "Every occurrence of the single substring returned by detect(), the same locate() rule as 02-score.mjs.",
        "meta": lattice_meta(),
    }]
    prior = json.loads((RESULTS / "datasets.json").read_text())
    prior_email = prior["ai4privacy"]["types"]["email"]
    got = tools[0]["datasets"]["ai4privacy"]["document"]["email"]
    tools[0]["matchesPriorDocumentEmail"] = (
        got["tp"] == prior_email["tp"] and got["fp"] == prior_email["fp"] and got["fn"] == prior_email["fn"]
    )
    print("lattice email match", tools[0]["matchesPriorDocumentEmail"], got["tp"], got["fp"], got["fn"], flush=True)

    runners = [
        ("presidio", presidio_tool),
        ("spacy-en_core_web_sm", spacy_tool),
        ("gliner-small", gliner_tool),
    ]
    if os.environ.get("PII_SKIP_LLM_GUARD") != "1":
        runners.append(("llm-guard-anonymize", llm_guard_tool))
    named = {"ai4privacy": ai4, "gretel": gretel}
    for name, runner in runners:
        print("run", name, flush=True)
        try:
            record = {"tool": name, "measured": True, "datasets": {}}
            all_docs = ai4 + gretel
            preds, times, meta = runner(all_docs)
            record["meta"] = meta
            cuts = {"ai4privacy": (0, len(ai4)), "gretel": (len(ai4), len(all_docs))}
            for dataset, (start, stop) in cuts.items():
                record["datasets"][dataset] = {
                    **score(named[dataset], preds[start:stop]),
                    "latencyMs": latency_summary(times[start:stop]),
                }
                print(name, dataset, "p50", record["datasets"][dataset]["latencyMs"].get("p50"), flush=True)
            tools.append(record)
        except Exception as exc:
            tools.append({"tool": name, "measured": False, "status": "not measured", "reason": f"{type(exc).__name__}: {exc}"[:500]})
            print("FAIL", name, exc, flush=True)
        report = base_report(tools)
        (RESULTS / "pii-tools.json").write_text(json.dumps(report, indent=2))
    report = base_report(tools)
    report["not_measured"] = [guardrails_status(), nemo_status()]
    (RESULTS / "pii-tools.json").write_text(json.dumps(report, indent=2))
    print("PII_DONE", flush=True)


def base_report(tools: list[dict]) -> dict:
    return {
        "unit": "Document-level matches the Lattice harness: one document is a true positive when any predicted span of that type overlaps a gold span. Span-level counts each predicted span and each missed gold span. Lattice counts every occurrence of the one substring detect() returns.",
        "datasets": {
            "ai4privacy": "ai4privacy/pii-masking-300k English validation, revision c8c77895a005822682b66ab547fc0422579bc1d3, 7946 docs, academic/non-commercial, no redistribution",
            "gretel": "gretelai/synthetic_pii_finance_multilingual English test, revision 7b844d16738527a04264f50214cb426a4cea0897, Apache-2.0, 2891 docs",
        },
        "tools": tools,
    }


if __name__ == "__main__":
    main()
