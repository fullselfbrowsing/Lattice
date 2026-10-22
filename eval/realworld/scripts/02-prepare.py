"""Export compact, uncommitted views of the public datasets into the cache.

The raw corpora stay out of the git tree. ai4privacy's license allows academic
use and forbids redistribution. Gretel and ASQA are Apache-2.0; we still keep
their texts in the cache and commit only aggregate scores.

With --download, the three source files are fetched with huggingface_hub at the
revisions recorded in results/datasets.json and those revisions are recorded.
Without it, the files must already be in REALWORLD_CACHE under the names below,
and the recorded revision is the Hub HEAD at prepare time, which may not be the
revision of the cached file.
"""
import argparse
import json
import os
import shutil
import urllib.request
from pathlib import Path

import pyarrow.parquet as pq

CACHE = os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data")
os.makedirs(CACHE, exist_ok=True)
RESULTS = Path(__file__).resolve().parents[1] / "results"

# Hugging Face repo, file inside the repo, and the local cache name.
SOURCES = {
    "ai4privacy": ("ai4privacy/pii-masking-300k", "data/validation/1english_openpii_8k.jsonl", "english_openpii_8k.jsonl"),
    "gretel": ("gretelai/synthetic_pii_finance_multilingual", "data/English_test-00000-of-00001.parquet", "gretel_en_test.parquet"),
    "asqa": ("din0s/asqa", "data/dev-00000-of-00001-58a9a40c6e69f07b.parquet", "asqa_dev.parquet"),
}


def revision(repo: str) -> str | None:
    url = f"https://huggingface.co/api/datasets/{repo}"
    req = urllib.request.Request(url, headers={"User-Agent": "lattice-eval"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = json.load(response)
    return data.get("sha")


def pinned_revisions() -> dict[str, str]:
    recorded = json.loads((RESULTS / "datasets.json").read_text())["datasets"]
    return {name: recorded[name]["revision"] for name in SOURCES}


def download() -> dict[str, str]:
    from huggingface_hub import hf_hub_download

    pins = pinned_revisions()
    for name, (repo, filename, local) in SOURCES.items():
        path = hf_hub_download(repo_id=repo, filename=filename, repo_type="dataset", revision=pins[name])
        shutil.copyfile(path, os.path.join(CACHE, local))
        print("downloaded", repo, pins[name][:12], "->", local)
    return pins


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true", help="fetch the source files at the revisions in results/datasets.json")
    args = parser.parse_args()
    pins = download() if args.download else {}

    def rev(name: str) -> str | None:
        return pins[name] if name in pins else revision(SOURCES[name][0])

    source = "pinned download" if pins else "Hub HEAD at prepare time"

    gretel = pq.read_table(os.path.join(CACHE, "gretel_en_test.parquet"))
    with open(os.path.join(CACHE, "gretel.jsonl"), "w", encoding="utf-8") as handle:
        for row in gretel.to_pylist():
            spans = row["pii_spans"]
            if isinstance(spans, str):
                spans = json.loads(spans)
            handle.write(json.dumps({
                "text": row["generated_text"],
                "spans": spans,
            }, ensure_ascii=False) + "\n")

    asqa = pq.read_table(os.path.join(CACHE, "asqa_dev.parquet"))
    with open(os.path.join(CACHE, "asqa.jsonl"), "w", encoding="utf-8") as handle:
        for row in asqa.to_pylist():
            annotations = row.get("annotations") or []
            answer = ""
            if annotations and isinstance(annotations[0], dict):
                answer = annotations[0].get("long_answer") or ""
            titles = []
            for page in row.get("wikipages") or []:
                if isinstance(page, dict) and page.get("title"):
                    titles.append(page["title"])
            handle.write(json.dumps({
                "id": row.get("sample_id"),
                "answer": answer,
                "titles": titles,
            }, ensure_ascii=False) + "\n")

    meta = {
        "ai4privacy": {
            "id": "ai4privacy/pii-masking-300k",
            "file": "data/validation/1english_openpii_8k.jsonl",
            "revision": rev("ai4privacy"),
            "revisionSource": source,
            "license": "Ai4Privacy 2024: academic research and non-commercial use with acknowledgement. Redistribution, uploading, sharing, and derivative works require a written license from licensing@ai4privacy.com. The set is synthetic and watermarked.",
            "local_lines": sum(1 for _ in open(os.path.join(CACHE, "english_openpii_8k.jsonl"), encoding="utf-8")),
        },
        "gretel": {
            "id": "gretelai/synthetic_pii_finance_multilingual",
            "file": "data/English_test-00000-of-00001.parquet",
            "revision": rev("gretel"),
            "revisionSource": source,
            "license": "apache-2.0",
            "rows": gretel.num_rows,
        },
        "asqa": {
            "id": "din0s/asqa",
            "file": "data/dev-00000-of-00001-58a9a40c6e69f07b.parquet",
            "revision": rev("asqa"),
            "revisionSource": source,
            "license": "apache-2.0",
            "rows": asqa.num_rows,
            "note": "ASQA dev long answers are scored with mustCite. The check is syntactic. It does not judge whether a citation supports the claim.",
        },
    }
    with open(os.path.join(CACHE, "dataset-meta.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, indent=2)
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "license"} for k, v in meta.items()}, indent=2))


if __name__ == "__main__":
    main()
