"""Head-to-head wrap of the recorded Ollama payloads.

Each tool seals the same request/response bytes. Generation time is not
included here; that is in live.json. A tool that does not run is recorded
with measured=false and the error string.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
ART = RESULTS / "artifacts"
ART.mkdir(parents=True, exist_ok=True)
PAYLOADS = json.loads((RESULTS / "payloads.json").read_text())
MARKERS = PAYLOADS.get("markers") or []
RUNS = PAYLOADS["runs"]
CACHE = Path(os.environ.get("REALWORLD_CACHE", "/tmp/realworld-data"))
# Comparison checkouts. fetch-competitors.sh clones them here at the commits
# recorded in results/compare.json.
CMP_DIR = Path(os.environ.get("CMP_DIR", ROOT / ".cache" / "cmp"))
PATH = os.environ["PATH"]
if str(Path.home() / ".local/bin") not in PATH:
    os.environ["PATH"] = str(Path.home() / ".local/bin") + os.pathsep + PATH
NODE_BIN = os.environ.get("NODE_BIN") or shutil.which("node")
COSIGN_BIN = os.environ.get("COSIGN_BIN") or shutil.which("cosign")


def pkg_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def blob() -> bytes:
    return json.dumps(
        [{"id": r["id"], "request": r["requestText"], "response": r["responseText"]} for r in RUNS],
        ensure_ascii=False,
    ).encode()


def leaks(data: bytes | str) -> bool:
    raw = data if isinstance(data, str) else data.decode("utf-8", "ignore")
    return any(marker in raw for marker in MARKERS)


def dir_leaks(path: Path) -> bool:
    for file in path.rglob("*"):
        if file.is_file() and leaks(file.read_bytes()):
            return True
    return False


def dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def git_head(path: str) -> str | None:
    try:
        return subprocess.check_output(["git", "-C", path, "rev-parse", "HEAD"], text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def tool_error(name: str, exc: BaseException) -> dict:
    return {"tool": name, "measured": False, "error": f"{type(exc).__name__}: {exc}"[:500]}


def hash_chain() -> dict:
    prev = "0" * 64
    records = []
    t0 = time.perf_counter()
    for run in RUNS:
        body = {"id": run["id"], "request": run["requestText"], "response": run["responseText"]}
        digest = hashlib.sha256((prev + json.dumps(body, sort_keys=True)).encode()).hexdigest()
        records.append({"prev": prev, "body": body, "hash": digest})
        prev = digest
    ms = (time.perf_counter() - t0) * 1000
    raw = json.dumps(records).encode()
    broken = json.loads(raw)
    broken[0]["body"]["response"] += "X"
    ok_walk = True
    prev = "0" * 64
    for rec in broken:
        expect = hashlib.sha256((prev + json.dumps(rec["body"], sort_keys=True)).encode()).hexdigest()
        if expect != rec["hash"]:
            ok_walk = False
            break
        prev = rec["hash"]
    rebuilt_prev = "0" * 64
    for rec in broken:
        rebuilt_prev = hashlib.sha256((rebuilt_prev + json.dumps(rec["body"], sort_keys=True)).encode()).hexdigest()
    (ART / "hash-chain.json").write_bytes(raw)
    return {
        "tool": "hash-chain",
        "measured": True,
        "kind": "baseline written for this evaluation",
        "ms": ms,
        "bytes": len(raw),
        "offlineVerify": True,
        "byteEditDetected": not ok_walk,
        "rebuildAccepted": True,
        "rebuildHeadDiffers": rebuilt_prev != records[-1]["hash"],
        "externalAnchor": False,
        "leak": leaks(raw),
        "routing": False,
        "policy": False,
        "loc": 28,
    }


def json_log() -> dict:
    t0 = time.perf_counter()
    raw = blob()
    ms = (time.perf_counter() - t0) * 1000
    (ART / "json-log.json").write_bytes(raw)
    edited = json.loads(raw)
    edited[0]["response"] += "X"
    return {
        "tool": "json-log",
        "measured": True,
        "kind": "baseline written for this evaluation",
        "ms": ms,
        "bytes": len(raw),
        "offlineVerify": False,
        "byteEditDetected": False,
        "note": "A plain JSON file has no integrity check. An edit still parses.",
        "editedStillParses": True,
        "leak": leaks(raw),
        "routing": False,
        "policy": False,
        "loc": 8,
    }


def otel() -> dict:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = provider.get_tracer("lattice-realworld")
    t0 = time.perf_counter()
    for run in RUNS:
        with tracer.start_as_current_span("chat") as span:
            span.set_attribute("gen_ai.system", "ollama")
            span.set_attribute("gen_ai.request.model", PAYLOADS["model"])
            span.set_attribute("gen_ai.input.messages", run["requestText"])
            span.set_attribute("gen_ai.output.messages", run["responseText"])
    provider.force_flush()
    ms = (time.perf_counter() - t0) * 1000
    spans = []
    for span in exporter.get_finished_spans():
        spans.append({
            "name": span.name,
            "attributes": {k: v for k, v in span.attributes.items()} if span.attributes else {},
        })
    raw = json.dumps(spans).encode()
    (ART / "otel-spans.json").write_bytes(raw)
    return {
        "tool": "opentelemetry-genai",
        "measured": True,
        "kind": "OpenTelemetry SDK in-process span export, no collector",
        "version": pkg_version("opentelemetry-sdk"),
        "ms": ms,
        "bytes": len(raw),
        "offlineVerify": False,
        "byteEditDetected": False,
        "leak": leaks(raw),
        "routing": False,
        "policy": False,
        "loc": 22,
        "note": "Attributes follow the GenAI semantic-convention names and include the transcript. No signature.",
    }


def afr() -> dict:
    sys.path.insert(0, str(CMP_DIR / "agent-flight-recorder"))
    from afr.anchoring import MockAnchor
    from afr.recorder import FlightRecorder, RecorderConfig
    from afr.verifier import Verifier

    def one(disclosure: bool, name: str) -> dict:
        work = ART / name
        if work.exists():
            shutil.rmtree(work)
        work.mkdir()
        anchor = MockAnchor()
        rec = FlightRecorder(
            RecorderConfig(
                epoch_size=1,
                use_hash_chain=True,
                use_merkle=True,
                use_anchoring=True,
                use_disclosure=disclosure,
                master_secret=os.urandom(32) if disclosure else None,
            ),
            anchor_client=anchor,
        )
        t0 = time.perf_counter()
        for run in RUNS:
            rec.record({
                "intent": {"task": run["requestText"]},
                "execution": {"output": run["responseText"]},
            })
        archive = work / "archive.cbor"
        rec.export(archive)
        ms = (time.perf_counter() - t0) * 1000
        events, epochs, _meta = FlightRecorder.load(archive)
        chain_ok = Verifier().verify_chain(events).ok
        original = archive.read_bytes()
        flipped = bytearray(original)
        flipped[min(40, len(flipped) - 1)] ^= 0xFF
        archive.write_bytes(flipped)
        load_failed = False
        try:
            FlightRecorder.load(archive)
        except Exception:
            load_failed = True
        archive.write_bytes(original)
        return {
            "ms": ms,
            "bytes": archive.stat().st_size,
            "chainOk": bool(chain_ok),
            "epochs": len(epochs),
            "byteFlipLoadFailed": load_failed,
            "leak": leaks(original),
            "anchor": "MockAnchor in-memory, not a public chain",
        }

    plain = one(False, "afr-plain")
    hidden = one(True, "afr-disclosure")
    return {
        "tool": "agent-flight-recorder",
        "measured": True,
        "commit": git_head(str(CMP_DIR / "agent-flight-recorder")),
        "plain": plain,
        "disclosure": hidden,
        "offlineVerify": plain["chainOk"],
        "byteEditDetected": plain["byteFlipLoadFailed"],
        "leak": plain["leak"],
        "leakWithDisclosure": hidden["leak"],
        "routing": False,
        "policy": False,
        "bytes": plain["bytes"],
        "ms": plain["ms"],
        "loc": 36,
        "note": "Hash chain, Merkle epochs, and MockAnchor. web3 is imported by the package; no chain transaction was sent.",
    }


def nova_hmac() -> dict:
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "nova_signing",
        str(CMP_DIR / "novafabric" / "src" / "novafabric" / "events" / "signing.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    secret = b"eval-secret-32-bytes-minimum!!"
    t0 = time.perf_counter()
    signed = [
        mod.sign_record({"id": r["id"], "request": r["requestText"], "response": r["responseText"]}, secret, "k1")
        for r in RUNS
    ]
    ms = (time.perf_counter() - t0) * 1000
    raw = json.dumps(signed).encode()
    ok = all(mod.verify_record(rec, secret) for rec in signed)
    tampered = json.loads(raw)
    tampered[0]["response"] += "X"
    detected = not mod.verify_record(tampered[0], secret)
    resigned = mod.sign_record(tampered[0], secret, "k1")
    attacker_accepted = mod.verify_record(resigned, secret)
    (ART / "novafabric-hmac.json").write_bytes(raw)
    return {
        "tool": "novafabric-hmac",
        "measured": True,
        "commit": git_head(str(CMP_DIR / "novafabric")),
        "version": "events/signing.py HMAC-SHA256, not a sealed capsule",
        "ms": ms,
        "bytes": len(raw),
        "offlineVerify": ok,
        "byteEditDetected": detected,
        "resignWithSharedSecretAccepted": attacker_accepted,
        "leak": leaks(raw),
        "routing": False,
        "policy": False,
        "loc": 18,
    }


def nova_capture() -> dict:
    """Seal one captured run with `nova seal init` and check `nova verify`.

    `nova validate` on an unsealed capsule did not reject an appended newline.
    The sealed path is the one recorded here.
    """
    home = ART / "nova-home"
    work = ART / "nova-work"
    if home.exists():
        shutil.rmtree(home)
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    (work / "agent.py").write_text("print(" + json.dumps(RUNS[1]["requestText"]) + ")\n")
    env = os.environ.copy()
    env["NOVAFABRIC_HOME"] = str(home)
    env["NOVAFABRIC_SUGGEST"] = "0"
    env["NOVAFABRIC_COMMUNITY_HINT"] = "0"
    init = subprocess.run(["nova", "seal", "init", "--home", str(home)], text=True, capture_output=True, timeout=60)
    if init.returncode != 0:
        return {"tool": "novafabric-capture", "measured": False, "error": (init.stderr or init.stdout)[-500:]}
    t0 = time.perf_counter()
    proc = subprocess.run(
        ["nova", "capture", "python3", "agent.py"],
        cwd=work,
        env=env,
        text=True,
        capture_output=True,
        timeout=180,
    )
    ms = (time.perf_counter() - t0) * 1000
    capsules = list(home.rglob("capsule.yaml"))
    if not capsules or proc.returncode != 0:
        return {
            "tool": "novafabric-capture",
            "measured": False,
            "returncode": proc.returncode,
            "error": (proc.stderr or proc.stdout)[-500:],
        }
    cap = capsules[-1].parent
    verify = subprocess.run(["nova", "verify", str(cap)], env=env, text=True, capture_output=True, timeout=60)
    target = cap / "outputs" / "stdout.txt"
    original = target.read_bytes()
    target.write_bytes(original + b"\n")
    tamper_verify = subprocess.run(["nova", "verify", str(cap)], env=env, text=True, capture_output=True, timeout=60)
    tamper_validate = subprocess.run(["nova", "validate", str(cap)], env=env, text=True, capture_output=True, timeout=60)
    target.write_bytes(original)
    return {
        "tool": "novafabric-capture",
        "measured": True,
        "version": subprocess.check_output(["nova", "--version"], text=True).strip(),
        "commit": git_head(str(CMP_DIR / "novafabric")),
        "mode": "nova seal init (self-asserted ECDSA P-256, no RFC 3161) then nova capture python3",
        "ms": ms,
        "bytes": dir_size(cap),
        "offlineVerify": verify.returncode == 0,
        "byteEditDetected": tamper_verify.returncode != 0,
        "validateAfterEdit": tamper_validate.returncode,
        "leak": leaks(b"".join(p.read_bytes() for p in cap.rglob("*") if p.is_file())),
        "routing": False,
        "policy": False,
        "loc": 4,
        "verifyTail": (verify.stdout or "")[-400:],
        "note": "nova validate stayed successful after the same stdout edit in a prior unsealed run. nova verify on this sealed capsule is the tamper check.",
    }


def cosign_version(binary: str, env: dict) -> dict:
    try:
        raw = subprocess.check_output([binary, "version", "--json"], text=True, env=env)
        info = json.loads(raw)
        return {"version": info.get("gitVersion"), "gitCommit": info.get("gitCommit")}
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError):
        raw = subprocess.check_output([binary, "version"], text=True, env=env)
        return {"version": raw.splitlines()[-1][:200], "gitCommit": None}


def cosign() -> dict:
    if not COSIGN_BIN:
        return {"tool": "cosign", "measured": False, "error": "cosign not found; set COSIGN_BIN or put cosign on PATH"}
    binary = COSIGN_BIN
    work = ART / "cosign"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    target = work / "log.json"
    target.write_bytes(blob())
    env = os.environ.copy()
    env["COSIGN_PASSWORD"] = ""
    gen = subprocess.run(
        [binary, "generate-key-pair"],
        cwd=work,
        env=env,
        text=True,
        capture_output=True,
    )
    if gen.returncode != 0:
        return {"tool": "cosign", "measured": False, "error": (gen.stderr or gen.stdout)[-500:]}
    t0 = time.perf_counter()
    sig = work / "log.sig"
    # --tlog-upload=false keeps the run local. Without it, sign-blob uploads an
    # entry to the public Rekor log and --yes only skips the consent prompt.
    sign = subprocess.run(
        [binary, "sign-blob", "--key", "cosign.key", "--tlog-upload=false", "--output-signature", str(sig), "--yes", str(target)],
        cwd=work,
        env=env,
        text=True,
        capture_output=True,
    )
    ms = (time.perf_counter() - t0) * 1000
    if sign.returncode != 0:
        return {"tool": "cosign", "measured": False, "error": (sign.stderr or sign.stdout)[-500:], "generate": gen.returncode}
    verify = subprocess.run(
        [binary, "verify-blob", "--key", "cosign.pub", "--insecure-ignore-tlog", "--signature", str(sig), str(target)],
        cwd=work,
        env=env,
        text=True,
        capture_output=True,
    )
    flipped = work / "log-flipped.json"
    raw = bytearray(target.read_bytes())
    raw[-1] ^= 0x1
    flipped.write_bytes(raw)
    bad = subprocess.run(
        [binary, "verify-blob", "--key", "cosign.pub", "--insecure-ignore-tlog", "--signature", str(sig), str(flipped)],
        cwd=work,
        env=env,
        text=True,
        capture_output=True,
    )
    return {
        "tool": "cosign",
        "measured": True,
        "mode": "local key pair, sign-blob --tlog-upload=false, verify-blob --insecure-ignore-tlog. Fulcio and Rekor were not contacted.",
        **cosign_version(binary, env),
        "ms": ms,
        "bytes": target.stat().st_size + sig.stat().st_size + (work / "cosign.pub").stat().st_size,
        "tlogUpload": False,
        "verifyOk": verify.returncode == 0,
        "offlineVerify": verify.returncode == 0,
        "byteEditDetected": bad.returncode != 0,
        "leak": leaks(target.read_bytes()) or leaks(sig.read_bytes()),
        "routing": False,
        "policy": False,
        "loc": 12,
        "keyless": False,
    }


def intoto() -> dict:
    from in_toto.models.metadata import Metadata
    from in_toto.runlib import in_toto_run
    from securesystemslib.signer import CryptoSigner

    work = ART / "intoto"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    material = work / "request.txt"
    product = work / "response.txt"
    material.write_text(RUNS[1]["requestText"])
    product.write_text("")
    signer = CryptoSigner.generate_ed25519()
    cmd = ["python3", "-c", "import pathlib; p=pathlib.Path('response.txt'); p.write_text(pathlib.Path('request.txt').read_text())"]
    t0 = time.perf_counter()
    metadata = in_toto_run(
        "record",
        ["request.txt"],
        ["response.txt"],
        cmd,
        signer=signer,
        base_path=str(work),
        metadata_directory=str(work),
        use_dsse=True,
    )
    ms = (time.perf_counter() - t0) * 1000
    link_files = list(work.glob("*.link"))
    raw = b"".join(p.read_bytes() for p in link_files)
    signature_ok = False
    flipped_verified = None
    intoto_verify_error = None
    if link_files:
        loaded = Metadata.load(str(link_files[0]))
        try:
            loaded.verify([signer.public_key], 1)
            signature_ok = True
        except Exception as exc:
            signature_ok = False
            intoto_verify_error = f"{type(exc).__name__}: {exc}"[:300]
        original = link_files[0].read_bytes()
        mangled = bytearray(original)
        mangled[min(80, len(mangled) - 1)] ^= 0xFF
        link_files[0].write_bytes(mangled)
        try:
            Metadata.load(str(link_files[0])).verify([signer.public_key], 1)
            flipped_verified = True
        except Exception:
            flipped_verified = False
        link_files[0].write_bytes(original)
    return {
        "tool": "in-toto",
        "measured": True,
        "mode": "in_toto_run DSSE link, ed25519 functionary, no layout inspection",
        "version": pkg_version("in-toto"),
        "securesystemslib": pkg_version("securesystemslib"),
        "ms": ms,
        "bytes": len(raw),
        "linkFiles": [p.name for p in link_files],
        "offlineVerify": signature_ok,
        "verifyError": intoto_verify_error,
        "byteEditDetected": flipped_verified is False,
        "leak": leaks(raw) or leaks(product.read_text()),
        "leakInLinkMetadata": leaks(raw),
        "routing": False,
        "policy": False,
        "loc": 24,
        "note": "The link records artifact hashes. Leakage is reported separately for the link file and for the product file the step wrote.",
    }


def janus() -> dict:
    src = CMP_DIR / "janus"
    harness = ROOT / "integrations" / "janus"
    env = os.environ.copy()
    env["GOTOOLCHAIN"] = os.environ.get("GOTOOLCHAIN", "go1.26.8")
    # go.mod and go.sum are gitignored. Create them, point the module at the
    # local checkout, and let `go mod tidy` record the dependency hashes.
    if not (harness / "go.mod").exists():
        subprocess.run(["go", "mod", "init", "lattice-eval-janus"], cwd=harness, env=env, check=True, capture_output=True)
        subprocess.run(["go", "mod", "edit", "-require=github.com/mustafarslan/janus@v0.0.0"], cwd=harness, env=env, check=True)
    subprocess.run(["go", "mod", "edit", f"-replace=github.com/mustafarslan/janus={src}"], cwd=harness, env=env, check=True)
    tidy = subprocess.run(["go", "mod", "tidy"], cwd=harness, env=env, text=True, capture_output=True)
    if tidy.returncode != 0:
        return {"tool": "janus", "measured": False, "error": (tidy.stderr or tidy.stdout)[-800:], "commit": git_head(str(src))}
    go_version = subprocess.run(["go", "version"], cwd=harness, env=env, text=True, capture_output=True).stdout.strip()
    binary = harness / "janus-wrap"
    build = subprocess.run(["go", "build", "-o", str(binary), "."], cwd=harness, env=env, text=True, capture_output=True)
    if build.returncode != 0:
        return {"tool": "janus", "measured": False, "error": (build.stderr or build.stdout)[-800:], "commit": git_head(str(src))}
    work = ART / "janus"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    payload = work / "payload.json"
    payload.write_bytes(blob())
    pub = work / "writer.pub"
    key = work / "writer.key"
    append = subprocess.run(
        [str(binary), "append", "--dir", str(work / "log"), "--payload", str(payload), "--pub", str(pub), "--key", str(key)],
        text=True,
        capture_output=True,
    )
    if append.returncode != 0:
        return {"tool": "janus", "measured": False, "error": (append.stderr or append.stdout)[-800:], "commit": git_head(str(src))}
    info = json.loads(append.stdout)
    verify = subprocess.run(
        [str(binary), "verify", "--dir", str(work / "log"), "--pub", str(pub)],
        text=True,
        capture_output=True,
    )
    # Flip one byte in the largest segment file.
    segments = [p for p in (work / "log").rglob("*") if p.is_file()]
    target = max(segments, key=lambda p: p.stat().st_size)
    original = target.read_bytes()
    mangled = bytearray(original)
    mangled[min(30, len(mangled) - 1)] ^= 0xFF
    target.write_bytes(mangled)
    bad = subprocess.run(
        [str(binary), "verify", "--dir", str(work / "log"), "--pub", str(pub)],
        text=True,
        capture_output=True,
    )
    target.write_bytes(original)
    return {
        "tool": "janus",
        "measured": True,
        "commit": git_head(str(src)),
        "mode": "local evidence.Appender + verify.SegmentDir. Not the orchestrator, WORM store, or gate.",
        "go": go_version,
        "append": info,
        "ms": info.get("ms"),
        "bytes": dir_size(work / "log"),
        "offlineVerify": verify.returncode == 0,
        "verifyStdout": (verify.stdout or "")[:500],
        "byteEditDetected": bad.returncode != 0,
        "leak": dir_leaks(work / "log"),
        "routing": False,
        "policy": False,
        "loc": 70,
    }


def main() -> None:
    tools = []
    for fn in (json_log, hash_chain, otel, afr, nova_hmac, nova_capture, cosign, intoto, janus):
        try:
            row = fn()
        except Exception as exc:  # noqa: BLE001 — one tool must not drop the others
            row = tool_error(fn.__name__, exc)
        tools.append(row)
        print(row.get("tool") or fn.__name__, "measured" if row.get("measured") else row.get("error", "")[:180])
    # Node wrappers (Lattice receipt + Sello).
    env = os.environ.copy()
    if NODE_BIN:
        env["PATH"] = str(Path(NODE_BIN).parent) + os.pathsep + env["PATH"]
    env["CMP_DIR"] = str(CMP_DIR)
    env["SELLO_COMMIT"] = git_head(str(CMP_DIR / "sello")) or ""
    node = subprocess.run(
        [NODE_BIN or "node", "--experimental-strip-types", str(ROOT / "scripts" / "03-wrap.mjs")],
        cwd=ROOT.parent.parent,
        env=env,
        text=True,
        capture_output=True,
    )
    node_doc = None
    if node.returncode == 0 and (RESULTS / "wrap-node.json").exists():
        node_doc = json.loads((RESULTS / "wrap-node.json").read_text())
    else:
        node_doc = {"measured": False, "error": (node.stderr or node.stdout)[-800:]}
    print("node", "ok" if node.returncode == 0 else node_doc.get("error", "")[:200])
    report = {
        "payloads": [{"id": r["id"], "requestChars": len(r["requestText"]), "responseChars": len(r["responseText"])} for r in RUNS],
        "markers": MARKERS,
        "tools": tools,
        "node": node_doc,
        "not_run": [
            {
                "tool": "TrustTrack",
                "arxiv": "2507.22077",
                "measured": False,
                "reason": "No implementation repository was found (MuyangLi/TrustTrack returned 404). Comparison is from the paper only.",
            },
            {
                "tool": "Langfuse",
                "measured": False,
                "reason": "Docker is not installed, so a self-hosted Langfuse server was not started.",
            },
            {
                "tool": "Sello public log",
                "measured": False,
                "reason": "The TypeScript SDK was measured against MockTransparencyLog. The public transparency log was not used.",
            },
            {
                "tool": "cosign keyless / Rekor",
                "measured": False,
                "reason": "Local key sign-blob was measured with the transparency-log upload disabled. Fulcio and Rekor were not contacted.",
            },
        ],
        "env": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "node": subprocess.run([NODE_BIN, "--version"], text=True, capture_output=True).stdout.strip() if NODE_BIN else None,
            "packages": {name: pkg_version(name) for name in ("opentelemetry-sdk", "in-toto", "securesystemslib")},
        },
    }
    (RESULTS / "compare.json").write_text(json.dumps(report, indent=2, default=str))
    print("COMPARE_DONE")


if __name__ == "__main__":
    main()
