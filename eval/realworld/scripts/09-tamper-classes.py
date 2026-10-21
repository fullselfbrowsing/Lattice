"""One mutation suite over the recorded payloads.

Classes are byte-flip, truncate, swap, and other-key. A class that a
system cannot express is null. Detection means the system's own check
rejects the mutated artifact.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
PAYLOADS = json.loads((RESULTS / "payloads.json").read_text())
RUNS = PAYLOADS["runs"]
NODE = "/home/ubuntu/.nvm/versions/node/v24.22.1/bin/node"


def record(tool: str, results: dict, note: str = "") -> dict:
    applicable = {k: v for k, v in results.items() if v is not None}
    detected = sum(1 for v in applicable.values() if v)
    return {
        "tool": tool,
        "measured": True,
        "mutations": results,
        "detected": detected,
        "applicable": len(applicable),
        "note": note,
    }


def json_log() -> dict:
    rows = [{"id": r["id"], "request": r["requestText"], "response": r["responseText"]} for r in RUNS]
    flipped = json.loads(json.dumps(rows))
    flipped[0]["response"] = flipped[0]["response"][:-1] + ("X" if not flipped[0]["response"].endswith("X") else "Y")
    truncated = rows[:-1]
    swapped = json.loads(json.dumps(rows))
    swapped[0]["response"], swapped[1]["response"] = swapped[1]["response"], swapped[0]["response"]
    return record("json-log", {
        "byte-flip": False,
        "truncate": False,
        "swap": False,
        "other-key": None,
    }, "Edits stay valid JSON. byte-flip changes one response character, truncate drops the last record, swap exchanges two responses. None of those have a check.")


def hash_chain() -> dict:
    def build(rows):
        prev = "0" * 64
        out = []
        for row in rows:
            digest = hashlib.sha256((prev + json.dumps(row, sort_keys=True)).encode()).hexdigest()
            out.append({"prev": prev, "body": row, "hash": digest})
            prev = digest
        return out

    def ok(records) -> bool:
        prev = "0" * 64
        for rec in records:
            expect = hashlib.sha256((prev + json.dumps(rec["body"], sort_keys=True)).encode()).hexdigest()
            if expect != rec["hash"] or rec["prev"] != prev:
                return False
            prev = rec["hash"]
        return True

    rows = [{"id": r["id"], "request": r["requestText"], "response": r["responseText"]} for r in RUNS]
    chain = build(rows)
    flipped = json.loads(json.dumps(chain))
    flipped[0]["body"]["response"] += "X"
    truncated = chain[:-1]
    swapped = json.loads(json.dumps(chain))
    swapped[0]["body"]["response"], swapped[1]["body"]["response"] = swapped[1]["body"]["response"], swapped[0]["body"]["response"]
    rebuilt = build([rec["body"] for rec in swapped])
    return record("hash-chain", {
        "byte-flip": not ok(flipped),
        "truncate": not ok(truncated),
        "swap": not ok(swapped),
        "other-key": not ok(rebuilt),
    }, "other-key here is a rebuilt chain over the swapped bodies. There is no external anchor, so the rebuilt chain verifies. Truncation of the tail leaves a valid prefix.")


def otel() -> dict:
    spans = [{"name": "chat", "attributes": {"gen_ai.input.messages": r["requestText"], "gen_ai.output.messages": r["responseText"]}} for r in RUNS]
    return record("opentelemetry-genai", {
        "byte-flip": False,
        "truncate": False,
        "swap": False,
        "other-key": None,
    }, "In-process GenAI spans have no signature. A changed, dropped, or swapped transcript still parses.")


def _parses(text: str) -> bool:
    try:
        json.loads(text)
        return True
    except json.JSONDecodeError:
        return False


def hmac() -> dict:
    spec = importlib.util.spec_from_file_location("nova_signing", "/tmp/cmp/novafabric/src/novafabric/events/signing.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    secret = b"eval-secret-32-bytes-minimum!!"
    other = b"other-secret-32-bytes-minimum!"
    signed = [mod.sign_record({"id": r["id"], "request": r["requestText"], "response": r["responseText"]}, secret, "k1") for r in RUNS]
    flipped = json.loads(json.dumps(signed))
    flipped[0]["response"] += "X"
    truncated = signed[:-1]
    swapped = json.loads(json.dumps(signed))
    swapped[0]["response"], swapped[1]["response"] = swapped[1]["response"], swapped[0]["response"]
    resigned = mod.sign_record(dict(swapped[0]), other, "k2")
    return record("novafabric-hmac", {
        "byte-flip": not mod.verify_record(flipped[0], secret),
        "truncate": False if all(mod.verify_record(rec, secret) for rec in truncated) else True,
        "swap": not all(mod.verify_record(rec, secret) for rec in swapped),
        "other-key": not mod.verify_record(resigned, secret),
    }, "Truncate keeps a valid prefix. other-key is a re-sign with a different shared secret, checked with the original secret.")


def lattice() -> dict:
    env = os.environ.copy()
    env["PATH"] = str(Path(NODE).parent) + os.pathsep + env["PATH"]
    proc = subprocess.run([NODE, str(ROOT / "scripts" / "09-lattice-mutations.mjs")], cwd=ROOT.parents[1], text=True, capture_output=True, env=env)
    if proc.returncode != 0:
        return {"tool": "lattice-receipt", "measured": False, "reason": (proc.stderr or proc.stdout)[-400:]}
    data = json.loads(proc.stdout)
    return record("lattice-receipt", data["mutations"], data.get("note", ""))


def afr() -> dict:
    import sys
    sys.path.insert(0, "/tmp/cmp/agent-flight-recorder")
    from afr.anchoring import MockAnchor
    from afr.recorder import FlightRecorder, RecorderConfig
    from afr.verifier import Verifier

    def make(path: Path):
        if path.exists():
            shutil.rmtree(path)
        path.mkdir()
        rec = FlightRecorder(RecorderConfig(epoch_size=1, use_hash_chain=True, use_merkle=True, use_anchoring=True, use_disclosure=False), anchor_client=MockAnchor())
        for run in RUNS:
            rec.record({"intent": {"task": run["requestText"]}, "execution": {"output": run["responseText"]}})
        archive = path / "archive.cbor"
        rec.export(archive)
        return archive

    archive = make(RESULTS / "artifacts" / "tamper-afr")
    original = archive.read_bytes()

    def loads(blob: bytes) -> bool:
        archive.write_bytes(blob)
        try:
            events, _, _ = FlightRecorder.load(archive)
            return bool(Verifier().verify_chain(events).ok)
        except Exception:
            return False

    flipped = bytearray(original)
    flipped[min(40, len(flipped) - 1)] ^= 0xFF
    truncated = original[:-32] if len(original) > 32 else original[:1]
    # Swap is not a structured edit of CBOR without a decoder. Leave it null.
    archive.write_bytes(original)
    return record("agent-flight-recorder", {
        "byte-flip": not loads(bytes(flipped)),
        "truncate": not loads(truncated),
        "swap": None,
        "other-key": None,
    }, "Plain AFR archive. MockAnchor. Swap and other-key were not applied to the CBOR body.")


def main() -> None:
    tools = []
    for fn in (json_log, hash_chain, otel, hmac, lattice, afr):
        try:
            row = fn()
        except Exception as exc:
            row = {"tool": fn.__name__, "measured": False, "reason": f"{type(exc).__name__}: {exc}"[:400]}
        tools.append(row)
        print(row.get("tool"), row.get("mutations") or row.get("reason"), flush=True)
    prior = json.loads((RESULTS / "compare.json").read_text())
    report = {
        "classes": ["byte-flip", "truncate", "swap", "other-key"],
        "definition": "detected=true means the system's check rejects the mutated artifact. null means that class was not applied. Truncation of a hash chain that leaves a valid prefix is not detection.",
        "tools": tools,
        "priorSingleByteEdit": {
            "sello": prior["node"]["sello"].get("tamperDetected"),
            "janus": next(t for t in prior["tools"] if t["tool"] == "janus").get("byteEditDetected"),
            "cosign": next(t for t in prior["tools"] if t["tool"] == "cosign").get("byteEditDetected"),
            "in-toto": next(t for t in prior["tools"] if t["tool"] == "in-toto").get("byteEditDetected"),
            "nova-capsule": next(t for t in prior["tools"] if t["tool"] == "novafabric-capture").get("byteEditDetected"),
        },
    }
    (RESULTS / "tamper-classes.json").write_text(json.dumps(report, indent=2))
    print("TAMPER_DONE", flush=True)


if __name__ == "__main__":
    main()
