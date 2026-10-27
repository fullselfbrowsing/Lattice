"""Citation checks on ASQA dev.

mustCite is the Lattice syntactic invariant. The baselines do not call a model.
The optional NLI stage is a local cross-encoder over the gold knowledge text.
"""
from __future__ import annotations

import importlib.metadata
import json
import os
import re
import time
from pathlib import Path

import pyarrow.parquet as pq

CACHE = Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data"))
RESULTS = Path(__file__).resolve().parents[1] / "results"
BRACKET = re.compile(r"\[([^\]\n]{1,120})\]")


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", text.lower())).strip()


def main() -> None:
    prior = json.loads((RESULTS / "datasets.json").read_text())["asqa_dev"]
    rows = pq.read_table(CACHE / "asqa_dev.parquet").to_pylist()
    n = 0
    title_cs = 0
    title_ci = 0
    bracket_gold = 0
    any_bracket = 0
    knowledge_chars = []
    prepared = []
    for row in rows:
        n += 1
        answer = row["annotations"][0]["long_answer"] if row.get("annotations") else ""
        titles = [page["title"] for page in (row.get("wikipages") or []) if page.get("title")]
        knowledge = " ".join(
            item.get("content") or ""
            for item in (row["annotations"][0].get("knowledge") or [])
        ) if row.get("annotations") else ""
        knowledge_chars.append(len(knowledge))
        if any(title and title in answer for title in titles):
            title_cs += 1
        folded = answer.casefold()
        if any(title and title.casefold() in folded for title in titles):
            title_ci += 1
        brackets = BRACKET.findall(answer)
        if brackets:
            any_bracket += 1
        title_norms = [norm(title) for title in titles if title]
        if any(piece and any(norm(piece) and (norm(piece) in title or title in norm(piece)) for title in title_norms) for piece in brackets):
            bracket_gold += 1
        prepared.append({"answer": answer, "knowledge": knowledge[:1800]})
    report = {
        "dataset": "din0s/asqa dev, revision 084060f16b46f3165318f760b2339208b19a0bde, Apache-2.0",
        "n": n,
        "mustCiteAnyGold": prior["mustCiteAnyGold"],
        "mustCiteStructuredDefault": prior.get("mustCiteStructuredDefault"),
        "mustCiteNote": "Copied from datasets.json. mustCiteAnyGold uses mustCiteOptions. mustCiteStructuredDefault uses the structured-list default and does not read the answer text. The invariant is syntactic and case-sensitive.",
        **({"mustCiteOptions": prior["mustCiteOptions"]} if prior.get("mustCiteOptions") else {}),
        "titleSubstringCaseSensitive": title_cs,
        "titleSubstringCaseInsensitive": title_ci,
        "answersWithSquareBracket": any_bracket,
        "bracketOverlapsGoldTitle": bracket_gold,
        "knowledgeChars": {
            "n": n,
            "mean": sum(knowledge_chars) / n if n else None,
            "max": max(knowledge_chars) if knowledge_chars else None,
        },
        "nli": {"measured": False, "reason": "not run in this stage"},
    }
    argv = __import__("sys").argv
    if "--nli" in argv:
        report["nli"] = run_nli(prepared)
    elif (RESULTS / "citations.json").exists():
        previous = json.loads((RESULTS / "citations.json").read_text()).get("nli")
        if previous:
            report["nli"] = previous
    (RESULTS / "citations.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in report if k != "nli"}, indent=2))
    print("nli", report["nli"].get("measured"), report["nli"].get("entailed"), report["nli"].get("reason"))


def run_nli(rows: list[dict]) -> dict:
    try:
        from transformers import pipeline
    except Exception as exc:
        return {"measured": False, "reason": f"{type(exc).__name__}: {exc}"[:300]}
    model_id = "typeform/distilbert-base-uncased-mnli"
    t0 = time.perf_counter()
    clf = pipeline("text-classification", model=model_id, device=-1, truncation=True)
    entailed = 0
    labels = {}
    times = []
    for index, row in enumerate(rows):
        if not row["knowledge"].strip() or not row["answer"].strip():
            labels["empty"] = labels.get("empty", 0) + 1
            continue
        start = time.perf_counter()
        # premise, hypothesis. DistilBERT MNLI accepts "premise [SEP] hypothesis" via the pair API.
        result = clf({"text": row["knowledge"], "text_pair": row["answer"]}, truncation=True)
        times.append((time.perf_counter() - start) * 1000)
        label = result[0]["label"] if isinstance(result, list) else result["label"]
        labels[label] = labels.get(label, 0) + 1
        if label.upper() in {"ENTAILMENT", "ENTAILS"}:
            entailed += 1
        if index and index % 100 == 0:
            print("nli", index, flush=True)
    try:
        transformers_version = importlib.metadata.version("transformers")
    except importlib.metadata.PackageNotFoundError:
        transformers_version = None
    return {
        "measured": True,
        "model": model_id,
        "modelRevision": getattr(clf.model.config, "_commit_hash", None),
        "transformers": transformers_version,
        "n": len(rows),
        "scored": sum(labels.values()) - labels.get("empty", 0),
        "entailed": entailed,
        "labels": labels,
        "latencyMsP50": sorted(times)[len(times) // 2] if times else None,
        "loadS": time.perf_counter() - t0,
        "note": "Premise is the gold ASQA knowledge text truncated to 1800 characters. Hypothesis is the long answer. This is support, not a citation-string check.",
    }


if __name__ == "__main__":
    main()
