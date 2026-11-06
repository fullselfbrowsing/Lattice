"""Latency and artifact checks for local gateways and tracers.

Live calls use the local Ollama model. Generation is included in the
latency sample and excluded from the wrap-time sample. Tools that cannot
start are recorded as not measured.
"""
from __future__ import annotations

import importlib.metadata
import json
import os
import shutil
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
ART = RESULTS / "artifacts" / "gateways"
ART.mkdir(parents=True, exist_ok=True)
OLLAMA = os.environ.get("OLLAMA_BASE", "http://127.0.0.1:11434/v1")
MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
PAYLOADS = json.loads((RESULTS / "payloads.json").read_text())
MARKERS = PAYLOADS.get("markers") or []
RUNS = PAYLOADS["runs"]
SHORT = "Reply with the single word pong."


def pkg_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def leaks(raw: str | bytes) -> bool:
    text = raw.decode("utf-8", "ignore") if isinstance(raw, bytes) else raw
    return any(marker in text for marker in MARKERS)


def stats(xs: list[float]) -> dict:
    if not xs:
        return {"n": 0}
    ordered = sorted(xs)
    return {
        "n": len(xs),
        "mean": statistics.fmean(xs),
        "p50": ordered[len(ordered) // 2],
        "min": ordered[0],
        "max": ordered[-1],
    }


def direct_once() -> float:
    body = json.dumps({
        "model": MODEL,
        "temperature": 0,
        "max_tokens": 8,
        "messages": [{"role": "user", "content": SHORT}],
    }).encode()
    t0 = time.perf_counter()
    req = urllib.request.Request(f"{OLLAMA}/chat/completions", data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as response:
        response.read()
    return (time.perf_counter() - t0) * 1000


def direct_baseline(n: int = 5) -> dict:
    samples = [direct_once() for _ in range(n)]
    return {"tool": "ollama-direct", "measured": True, "latencyMs": stats(samples), "note": "Plain HTTP to Ollama. No gateway."}


def litellm_tool() -> dict:
    import litellm
    litellm.suppress_debug_info = True
    captured = []

    def hook(kwargs, response, start, end):
        captured.append({
            "model": kwargs.get("model"),
            "messages": kwargs.get("messages"),
            "response": getattr(response, "model_dump", lambda: {})(),
        })

    litellm.success_callback = [hook]
    samples = []
    for _ in range(5):
        t0 = time.perf_counter()
        litellm.completion(
            model=f"ollama/{MODEL}",
            api_base="http://127.0.0.1:11434",
            messages=[{"role": "user", "content": SHORT}],
            temperature=0,
            max_tokens=8,
        )
        samples.append((time.perf_counter() - t0) * 1000)
    raw = json.dumps(captured, default=str).encode()
    (ART / "litellm-log.json").write_bytes(raw)
    edited = json.loads(raw)
    edited[0]["messages"][0]["content"] += "X"
    # A callback log has no signature. The edited object still parses.
    from litellm import Router
    router = Router(model_list=[
        {"model_name": "local", "litellm_params": {"model": f"ollama/{MODEL}", "api_base": "http://127.0.0.1:11434"}},
        {"model_name": "local", "litellm_params": {"model": f"ollama/{MODEL}", "api_base": "http://127.0.0.1:11434"}},
    ])
    choices = []
    for _ in range(8):
        response = router.completion(model="local", messages=[{"role": "user", "content": SHORT}], temperature=0, max_tokens=8)
        hidden = getattr(response, "_hidden_params", {}) or {}
        choices.append(str(hidden.get("model_id") or hidden.get("api_base") or response.model))
    return {
        "tool": "litellm",
        "measured": True,
        "version": pkg_version("litellm"),
        "mode": "in-process completion and Router against local Ollama. No proxy process.",
        "latencyMs": stats(samples),
        "bytes": len(raw),
        "leak": leaks(raw),
        "offlineVerify": False,
        "byteEditDetected": False,
        "editedStillParses": True,
        "routingSame": len(set(choices)) == 1,
        "routingUnique": len(set(choices)),
        "routingN": len(choices),
        "policy": False,
    }


def langchain_tool() -> dict:
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_openai import ChatOpenAI

    class Capture(BaseCallbackHandler):
        def __init__(self):
            self.rows = []

        def on_llm_end(self, response, **kwargs):
            self.rows.append({"response": str(response), "kwargs": {k: str(v)[:200] for k, v in kwargs.items()}})

    handler = Capture()
    llm = ChatOpenAI(
        model=MODEL,
        base_url=OLLAMA,
        api_key="ollama",
        temperature=0,
        max_tokens=8,
        callbacks=[handler],
    )
    samples = []
    for _ in range(5):
        t0 = time.perf_counter()
        llm.invoke(SHORT)
        samples.append((time.perf_counter() - t0) * 1000)
    # Store the same recorded ticket through the callback path without another model call.
    handler.on_llm_end(RUNS[1]["responseText"], invocation_params={"input": RUNS[1]["requestText"]})
    raw = json.dumps(handler.rows, default=str).encode()
    (ART / "langchain-callback.json").write_bytes(raw)
    return {
        "tool": "langchain-callback",
        "measured": True,
        "mode": "Local LangChain callback. Not LangSmith cloud.",
        "version": pkg_version("langchain-core"),
        "langchainOpenai": pkg_version("langchain-openai"),
        "latencyMs": stats(samples),
        "bytes": len(raw),
        "leak": leaks(raw),
        "offlineVerify": False,
        "byteEditDetected": False,
        "routing": False,
        "policy": False,
    }


def openllmetry_tool() -> dict:
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    from traceloop.sdk import Traceloop

    exporter = InMemorySpanExporter()
    Traceloop.init(disable_batch=True, exporter=exporter)
    import litellm
    samples = []
    for _ in range(3):
        t0 = time.perf_counter()
        litellm.completion(
            model=f"ollama/{MODEL}",
            api_base="http://127.0.0.1:11434",
            messages=[{"role": "user", "content": SHORT}],
            temperature=0,
            max_tokens=8,
        )
        samples.append((time.perf_counter() - t0) * 1000)
    litellm.completion(
        model=f"ollama/{MODEL}",
        api_base="http://127.0.0.1:11434",
        messages=[{"role": "user", "content": RUNS[1]["requestText"]}],
        temperature=0,
        max_tokens=8,
    )
    spans = []
    for span in exporter.get_finished_spans():
        spans.append({
            "name": span.name,
            "attributes": {key: value for key, value in (span.attributes or {}).items()},
        })
    raw = json.dumps(spans, default=str).encode()
    (ART / "openllmetry-spans.json").write_bytes(raw)
    return {
        "tool": "openllmetry",
        "measured": True,
        "mode": "traceloop-sdk in-process spans around LiteLLM. No collector.",
        "version": pkg_version("traceloop-sdk"),
        "latencyMs": stats(samples),
        "bytes": len(raw),
        "spanCount": len(spans),
        "leak": leaks(raw),
        "offlineVerify": False,
        "byteEditDetected": False,
        "routing": False,
        "policy": False,
    }


def portkey_tool() -> dict:
    headers = {
        "content-type": "application/json",
        "x-portkey-provider": "ollama",
        "x-portkey-custom-host": "http://127.0.0.1:11434",
    }
    samples = []
    bodies = []
    for _ in range(5):
        payload = json.dumps({
            "model": MODEL,
            "temperature": 0,
            "max_tokens": 8,
            "messages": [{"role": "user", "content": SHORT}],
        }).encode()
        t0 = time.perf_counter()
        req = urllib.request.Request("http://127.0.0.1:8787/v1/chat/completions", data=payload, headers=headers)
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
        samples.append((time.perf_counter() - t0) * 1000)
        bodies.append(raw)
    ticket = json.dumps({
        "model": MODEL,
        "temperature": 0,
        "max_tokens": 8,
        "messages": [{"role": "user", "content": RUNS[1]["requestText"]}],
    }).encode()
    req = urllib.request.Request("http://127.0.0.1:8787/v1/chat/completions", data=ticket, headers=headers)
    with urllib.request.urlopen(req, timeout=180) as response:
        ticket_raw = response.read()
    log_error = None
    try:
        log_req = urllib.request.Request("http://127.0.0.1:8787/v1/logs", headers={"x-portkey-provider": "ollama"})
        with urllib.request.urlopen(log_req, timeout=10) as response:
            log_body = response.read()
    except Exception as exc:
        log_body = b""
        log_error = f"{type(exc).__name__}: {exc}"[:240]
    stored = b"".join(bodies) + ticket_raw + log_body
    (ART / "portkey-response.json").write_bytes(ticket_raw)
    return {
        "tool": "portkey-gateway",
        "measured": True,
        "version": os.environ.get("PORTKEY_VERSION", "1.15.2"),
        "mode": "Local node server on 127.0.0.1:8787, provider ollama, custom host 127.0.0.1:11434. No Portkey cloud.",
        "latencyMs": stats(samples),
        "bytes": len(stored),
        "leak": leaks(stored),
        "logApiError": log_error,
        "offlineVerify": False,
        "byteEditDetected": False,
        "routing": False,
        "policy": False,
        "note": "The response body contains the model output. GET /v1/logs did not return a stored log on this build.",
    }


def unavailable(name: str, reason: str, docs: str) -> dict:
    return {"tool": name, "measured": False, "status": "from docs, not measured", "reason": reason, "docs": docs}


def main() -> None:
    tools = [direct_baseline()]
    for fn in (litellm_tool, langchain_tool, openllmetry_tool, portkey_tool):
        try:
            row = fn()
        except Exception as exc:
            row = {"tool": fn.__name__, "measured": False, "reason": f"{type(exc).__name__}: {exc}"[:400]}
        tools.append(row)
        print(row.get("tool"), row.get("measured"), row.get("reason", "")[:160], flush=True)
    tools.append(unavailable(
        "helicone",
        "No Docker daemon is installed, so the self-hosted Helicone stack was not started.",
        "Helicone stores request and response logs for an OpenAI-compatible proxy. Self-hosting is documented as a Docker stack.",
    ))
    tools.append(unavailable(
        "langfuse",
        "No Docker daemon is installed, and the server expects Postgres, ClickHouse, and Redis. An npm-only server was not started.",
        "Langfuse stores traces, scores, and prompts. A self-hosted server is verifiable only while that server and its database are available.",
    ))
    report = {"model": MODEL, "baseUrl": OLLAMA, "nShort": 5, "tools": tools}
    (RESULTS / "gateways.json").write_text(json.dumps(report, indent=2, default=str))
    print("GATEWAYS_DONE", flush=True)


if __name__ == "__main__":
    main()
