"""Freeze disjoint ALCE development and evaluation examples without tracking corpus text."""
import hashlib
import json
import os
import tarfile
import urllib.request
from pathlib import Path

REVISION = "334fa2e7dd32040c3fef931a123c4be1a81e91a0"
MEMBER = "ALCE-data/asqa_eval_gtr_top100.json"
RAW_SHA256 = "d72737ce7d46629d3504fc508f29ec0c270e0ddd5cff3fad69625d2c0e4be35b"
CACHE = Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    raw_path = CACHE / "alce-asqa.json"
    if not raw_path.exists():
        url = f"https://huggingface.co/datasets/princeton-nlp/ALCE-data/resolve/{REVISION}/ALCE-data.tar"
        with urllib.request.urlopen(url, timeout=60) as response:
            with tarfile.open(fileobj=response, mode="r|*") as archive:
                for member in archive:
                    if member.name == MEMBER and member.isfile():
                        raw_path.write_bytes(archive.extractfile(member).read())
                        break
                else:
                    raise RuntimeError("Pinned ALCE member is missing")
    raw = raw_path.read_bytes()
    if digest(raw) != RAW_SHA256:
        raise RuntimeError("Cached ALCE bytes do not match the pinned source digest")
    rows = json.loads(raw)
    if isinstance(rows, dict):
        rows = rows["data"]
    ordered = sorted(rows, key=lambda row: digest(("lattice-citation-v1:" + row["question"]).encode()))
    unique = {}
    for row in ordered:
        unique.setdefault(row["question"], row)
    chosen = list(unique.values())[:80]
    if len(chosen) != 80:
        raise RuntimeError("At least 80 distinct citation examples are required")
    folder = CACHE / "citation-split"
    folder.mkdir(exist_ok=True)
    hashes = {}
    for name, values in [("dev", chosen[:20]), ("evaluation", chosen[20:])]:
        records = []
        for row in values:
            records.append({
                "id": digest(row["question"].encode()), "question": row["question"],
                "docs": [{"id": f"s{i + 1}", "title": d.get("title", ""), "text": d["text"]}
                         for i, d in enumerate(row["docs"][:5])],
                "answers": row.get("answers", []), "qa_pairs": row.get("qa_pairs", []),
            })
        content = ("\n".join(json.dumps(row, ensure_ascii=False) for row in records) + "\n").encode()
        target = folder / f"{name}.jsonl"
        if target.exists() and target.read_bytes() != content:
            raise RuntimeError("Refusing to replace a frozen citation split")
        target.write_bytes(content)
        hashes[name] = {"sha256": digest(content), "rows": len(records)}
    manifest = {"version": "citation-split/v1", "dataset": "princeton-nlp/ALCE-data", "revision": REVISION,
                "member": MEMBER, "rawSha256": digest(raw), "sourceSelection": "first five GTR-retrieved passages, no oracle reranking",
                "selection": "question-deduplicated SHA256 order with lattice-citation-v1 salt", "splits": hashes}
    target = folder / "manifest.json"
    content = json.dumps(manifest, indent=2) + "\n"
    if target.exists() and target.read_text() != content:
        raise RuntimeError("Refusing to replace a frozen manifest")
    target.write_text(content)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
