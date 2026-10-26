"""Figures for the broadened real-world comparison. Numbers come from JSON.

Hosted end-to-end time is recomputed from the per-trial phase times in
openrouter.json as Lattice processing plus the provider time of the attempt that
returned. Retried attempts, backoff, pacing, and slack are excluded. The PDFs and
realworld-broad.tex are copied into paper/ and paper/ieee/; the PNGs stay in
results/.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
PAPER = ROOT.parents[1] / "paper"
LIVE = json.loads((RESULTS / "live.json").read_text())
COMPARE = json.loads((RESULTS / "compare.json").read_text())
PII = json.loads((RESULTS / "pii-tools.json").read_text()) if (RESULTS / "pii-tools.json").exists() else None
OPEN = json.loads((RESULTS / "openrouter.json").read_text()) if (RESULTS / "openrouter.json").exists() else None
GATE = json.loads((RESULTS / "gateways.json").read_text()) if (RESULTS / "gateways.json").exists() else None
TAMPER = json.loads((RESULTS / "tamper-classes.json").read_text()) if (RESULTS / "tamper-classes.json").exists() else None
CITE = json.loads((RESULTS / "citations.json").read_text()) if (RESULTS / "citations.json").exists() else None

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["DejaVu Serif", "Times New Roman", "Times"],
    "font.size": 8,
    "axes.labelsize": 8,
    "axes.titlesize": 9,
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
    "axes.spines.top": False,
    "axes.spines.right": False,
})
COLORS = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000"]
# No timestamps or version strings in the files, so a rerun on the same inputs
# writes the same bytes.
SAVE_METADATA = {"pdf": {"CreationDate": None}, "png": {"Software": None}}
# pii-tools.json, openrouter.json, and citations.json from the recorded runs do
# not name the Lattice commit. The noPII detectors and mustCite rules they
# measured are the ones at this commit.
LEGACY_DETECTOR_COMMIT = "a8cc091"
# At that commit an inline [name] or (name) marker containing the artifact name
# counted as a citation by default. Records that list mustCiteOptions were made
# with the current library and the options named there.
LEGACY_CITE_RULE = (
    f"commit \\texttt{{{LEGACY_DETECTOR_COMMIT}}}, where an inline \\texttt{{[name]}} or \\texttt{{(name)}} marker "
    "containing the artifact name counted as a citation by default"
)
FIGURES = (
    "rw-overhead-pct", "rw-latency-dist", "rw-replay", "rw-drift",
    "rw-pii-f1", "rw-pii-latency", "rw-tamper-heat", "rw-capability", "rw-gateway-latency",
)


def save(fig, name: str) -> None:
    fig.tight_layout()
    for ext in ("pdf", "png"):
        fig.savefig(RESULTS / f"{name}.{ext}", bbox_inches="tight", dpi=200, metadata=SAVE_METADATA[ext])
    plt.close(fig)


def short_model(model: str) -> str:
    name = model.split("/")[-1].replace(":free", "")
    return name.replace("nemotron-3.5-", "nemotron-")


def finished_models() -> list[dict]:
    if not OPEN:
        return []
    return [row for row in OPEN["models"] if row.get("overhead") or row.get("unavailable")]


def quantile(vals: list[float], p: float):
    ordered = sorted(v for v in vals if v is not None)
    if not ordered:
        return None
    return ordered[min(len(ordered) - 1, int(p * len(ordered)))]


def lattice_samples(row: dict) -> list[dict]:
    return [item for item in row.get("overhead") or [] if item.get("signedOk") and item.get("signedLatticeMs") is not None]


def hosted_e2e(item: dict) -> float:
    """Lattice processing plus the provider time of the attempt that returned."""
    return item["signedLatticeMs"] + item["signedProviderMs"]


def hosted_pct(item: dict) -> float | None:
    total = hosted_e2e(item)
    return 100.0 * item["signedLatticeMs"] / total if total > 0 else None


def local_lattice_ms() -> list[float]:
    return [
        max(0.0, item["signedMs"] - item["signedHttpMs"])
        for item in LIVE["overhead"]
        if item.get("signedMs") is not None and item.get("signedHttpMs") is not None
    ]


def overhead_pct() -> None:
    labels = ["ollama\nllama3.2:3b"]
    med, low, high = [], [], []
    local = local_lattice_ms()
    local_e2e = [item["signedMs"] for item in LIVE["overhead"] if item.get("signedMs")]
    local_pct = [100.0 * gap / e2e for gap, e2e in zip(local, local_e2e) if e2e]
    ordered = sorted(local_pct)
    mid = ordered[len(ordered) // 2]
    med.append(mid)
    low.append(mid - ordered[0])
    high.append(ordered[-1] - mid)
    for row in finished_models():
        vals = [hosted_pct(item) for item in lattice_samples(row)]
        vals = [value for value in vals if value is not None]
        if not vals:
            continue
        ordered = sorted(vals)
        mid = ordered[len(ordered) // 2]
        labels.append(short_model(row["model"]))
        med.append(mid)
        low.append(mid - ordered[0])
        high.append(ordered[-1] - mid)
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    x = np.arange(len(labels))
    ax.bar(x, med, color=COLORS[0], width=0.72)
    ax.errorbar(x, med, yerr=[low, high], fmt="none", ecolor="#222", capsize=3, lw=0.8)
    ax.set_xticks(x, labels, rotation=25, ha="right")
    ax.set_ylabel("Lattice processing (% of end-to-end)")
    ax.set_title("Signed Lattice processing, short prompt (median, whiskers min–max)")
    ax.grid(axis="y", lw=0.3)
    save(fig, "rw-overhead-pct")


def latency_dist() -> None:
    series = [("ollama", [item["signedMs"] for item in LIVE["overhead"]])]
    for row in finished_models():
        vals = [hosted_e2e(item) for item in lattice_samples(row)]
        if vals:
            series.append((short_model(row["model"]), vals))
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    ax.boxplot([vals for _, vals in series], tick_labels=[name for name, _ in series], showfliers=True)
    ax.set_ylabel("Signed end-to-end latency (ms)")
    ax.set_title("Short prompt, temperature 0")
    ax.tick_params(axis="x", rotation=25)
    ax.grid(axis="y", lw=0.3)
    save(fig, "rw-latency-dist")


def replay_counts(row: dict) -> tuple[int, int]:
    rag = row.get("rag") or []
    replay = row.get("replay") or []
    if rag and len(rag) == len(replay):
        chosen = [item for src, item in zip(rag, replay) if src.get("ok")]
    else:
        chosen = replay
    good = sum(1 for item in chosen if item.get("verified") and item.get("outputHashMatch") and item.get("alteredDetected"))
    return good, len(chosen)


def replay_chart() -> None:
    labels = ["ollama"]
    ok = [sum(1 for row in LIVE["replay"] if row["verified"] and row["outputHashMatch"] and row["alteredDetected"])]
    n = [len(LIVE["replay"])]
    for row in finished_models():
        if not row.get("replay"):
            continue
        good, total = replay_counts(row)
        if total == 0:
            continue
        labels.append(short_model(row["model"]))
        ok.append(good)
        n.append(total)
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    x = np.arange(len(labels))
    ax.bar(x, [a / b if b else 0 for a, b in zip(ok, n)], color=COLORS[2])
    for i, (a, b) in enumerate(zip(ok, n)):
        ax.text(i, (a / b if b else 0) + 0.02, f"{a}/{b}", ha="center", fontsize=7)
    ax.set_ylim(0, 1.15)
    ax.set_xticks(x, labels, rotation=25, ha="right")
    ax.set_ylabel("Verified, hash bound, edit detected")
    ax.set_title("Signed output binding of RAG receipts")
    ax.grid(axis="y", lw=0.3)
    save(fig, "rw-replay")


def successful_drift(row: dict, temperature: float) -> tuple[int, int] | None:
    samples = [item for item in row.get("rag") or [] if item.get("temperature") == temperature]
    if samples:
        good = [item.get("answer") or "" for item in samples if item.get("ok")]
        if not good:
            return None
        return len(set(good)), len(good)
    block = next((item for item in row.get("drift") or [] if item.get("temperature") == temperature), None)
    if not block or not block.get("n") or not block.get("ok", block["n"]):
        return None
    ok = block.get("ok", block["n"])
    return block["uniqueExact"], ok


def drift_chart() -> None:
    labels = []
    cold, hot = [], []
    by_temp = {block["temperature"]: block for block in LIVE["drift"]}
    labels.append("ollama")
    cold.append(by_temp[0]["uniqueExact"] / by_temp[0]["n"])
    hot.append(by_temp[0.7]["uniqueExact"] / by_temp[0.7]["n"])
    for row in finished_models():
        pair = [successful_drift(row, temperature) for temperature in (0, 0.7)]
        if any(item is None for item in pair):
            continue
        labels.append(short_model(row["model"]))
        cold.append(pair[0][0] / pair[0][1])
        hot.append(pair[1][0] / pair[1][1])
    fig, ax = plt.subplots(figsize=(6.8, 3.1))
    x = np.arange(len(labels))
    ax.bar(x - 0.18, cold, width=0.36, color=COLORS[0], label="temperature 0")
    ax.bar(x + 0.18, hot, width=0.36, color=COLORS[1], label="temperature 0.7")
    ax.set_xticks(x, labels, rotation=25, ha="right")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Unique successful answers / successes")
    ax.set_title("RAG answer drift among calls that returned")
    ax.legend(frameon=False)
    ax.grid(axis="y", lw=0.3)
    save(fig, "rw-drift")


def pii_f1() -> None:
    if not PII:
        return
    tools = [tool for tool in PII["tools"] if tool.get("measured") and "ai4privacy" in tool.get("datasets", {})]
    names = [tool["tool"].replace("lattice-noPII", "Lattice").replace("spacy-en_core_web_sm", "spaCy sm").replace("gliner-small", "GLiNER").replace("llm-guard-anonymize", "LLM Guard") for tool in tools]
    entities = ["email", "us-ssn", "us-phone", "credit-card"]
    entity_labels = ["Email", "US SSN", "US phone", "Card"]
    fig, axes = plt.subplots(1, 2, figsize=(7.4, 3.3), sharey=True)
    for ax, dataset, title in zip(axes, ("ai4privacy", "gretel"), ("ai4privacy validation", "Gretel English test")):
        x = np.arange(len(entities))
        width = 0.8 / max(1, len(tools))
        for i, tool in enumerate(tools):
            vals = []
            for entity in entities:
                f1 = tool["datasets"][dataset]["document"][entity]["f1"]
                vals.append(np.nan if f1 is None else f1)
            ax.bar(x + (i - (len(tools) - 1) / 2) * width, vals, width=width, color=COLORS[i % len(COLORS)], label=names[i])
        ax.set_xticks(x, entity_labels)
        ax.set_ylim(0, 1.05)
        ax.set_title(title)
        ax.grid(axis="y", lw=0.3)
    axes[0].set_ylabel("Document-level F1")
    axes[1].legend(frameon=False, fontsize=7, loc="upper right")
    fig.suptitle("In-scope PII detectors", y=1.02)
    save(fig, "rw-pii-f1")


def pii_latency() -> None:
    if not PII:
        return
    tools = [tool for tool in PII["tools"] if tool.get("measured")]
    labels = [tool["tool"].replace("lattice-noPII", "Lattice").replace("spacy-en_core_web_sm", "spaCy sm").replace("gliner-small", "GLiNER").replace("llm-guard-anonymize", "LLM Guard") for tool in tools]
    vals = []
    kept = []
    for tool, label in zip(tools, labels):
        p50 = (tool["datasets"].get("ai4privacy") or {}).get("latencyMs", {}).get("p50")
        if p50 is None:
            continue
        kept.append(label)
        vals.append(p50)
    labels = kept
    fig, ax = plt.subplots(figsize=(6.2, 3.0))
    ax.barh(labels[::-1], vals[::-1], color=COLORS[0])
    ax.set_xscale("log")
    ax.set_xlabel("Median milliseconds per document (ai4privacy)")
    ax.set_title("Detector latency")
    ax.grid(axis="x", lw=0.3)
    save(fig, "rw-pii-latency")


def tamper_heatmap() -> None:
    if not TAMPER:
        return
    classes = TAMPER["classes"]
    rows = []
    matrix = []
    for tool in TAMPER["tools"]:
        if not tool.get("measured"):
            continue
        rows.append(tool["tool"])
        matrix.append([tool["mutations"].get(name) for name in classes])
    data = np.array([[np.nan if value is None else (1 if value else 0) for value in row] for row in matrix], dtype=float)
    fig, ax = plt.subplots(figsize=(6.2, 3.2))
    cmap = plt.matplotlib.colors.ListedColormap(["#D55E00", "#009E73"])
    cmap.set_bad("#DDDDDD")
    ax.imshow(data, cmap=cmap, vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(range(len(classes)), classes, rotation=20, ha="right")
    ax.set_yticks(range(len(rows)), rows)
    for i in range(data.shape[0]):
        for j in range(data.shape[1]):
            value = data[i, j]
            label = "n/a" if np.isnan(value) else ("yes" if value == 1 else "no")
            ax.text(j, i, label, ha="center", va="center", color="black", fontsize=7)
    ax.set_title("Tamper check rejected the mutation")
    save(fig, "rw-tamper-heat")


def compare_tool(name: str) -> dict:
    return next((row for row in COMPARE["tools"] if row.get("tool") == name), {})


def gate_tool(name: str) -> dict:
    return next((row for row in (GATE or {}).get("tools") or [] if row.get("tool") == name), {})


def all_of(*values):
    """True or False when every value is known, else None."""
    if any(value is None for value in values):
        return None
    return all(values)


def flag(value) -> float:
    return np.nan if value is None else (1.0 if value else 0.0)


def capability_systems() -> dict[str, list[float]]:
    """Rows of the capability heatmap: 1 yes, 0 no, nan not measured here.

    Sign, Policy, No PII, Multi-agent receipts, and Routing follow the recorded
    wraps, not vendor documentation. Routing for LiteLLM is the identical-backend
    check in gateways.json. Offline verify and Signed output binding are read
    from compare.json and gateways.json. Binding is yes when the record is signed
    and the system's own verifier rejected a byte edit of the stored record.
    """
    lattice = COMPARE["node"]["lattice"]
    sello = COMPARE["node"]["sello"]
    afr = compare_tool("agent-flight-recorder")
    cosign = compare_tool("cosign")
    measured = {
        # name: (sign, offline verify, byte edit rejected, policy, no PII, multi-agent receipts, routing)
        "Lattice": (1, lattice.get("verifyOk"), lattice.get("byteFlipRejected"), 1, 1, 1, np.nan),
        "JSON log": (0, compare_tool("json-log").get("offlineVerify"), compare_tool("json-log").get("byteEditDetected"), 0, 0, 0, np.nan),
        "Hash chain": (0, compare_tool("hash-chain").get("offlineVerify"), compare_tool("hash-chain").get("byteEditDetected"), 0, 0, 0, np.nan),
        "OTel / OpenLLMetry": (
            0,
            all_of(compare_tool("opentelemetry-genai").get("offlineVerify"), gate_tool("openllmetry").get("offlineVerify")),
            all_of(compare_tool("opentelemetry-genai").get("byteEditDetected"), gate_tool("openllmetry").get("byteEditDetected")),
            0, 0, 0, np.nan,
        ),
        "AFR plain": (0, afr.get("offlineVerify"), afr.get("byteEditDetected"), 0, 0, 0, np.nan),
        "AFR disclosure": (0, (afr.get("disclosure") or {}).get("chainOk"), (afr.get("disclosure") or {}).get("byteFlipLoadFailed"), 0, 1, 0, np.nan),
        "Sello": (1, sello.get("verifyOk"), sello.get("tamperDetected"), 0, 1, 0, np.nan),
        # A verify-blob that consulted the Rekor log is not an offline check.
        "cosign": (1, None if cosign.get("tlogUpload") else cosign.get("offlineVerify"), cosign.get("byteEditDetected"), 0, 0, 0, np.nan),
        "in-toto": (1, compare_tool("in-toto").get("offlineVerify"), compare_tool("in-toto").get("byteEditDetected"), 0, 1, 0, np.nan),
        "Nova HMAC": (0, compare_tool("novafabric-hmac").get("offlineVerify"), compare_tool("novafabric-hmac").get("byteEditDetected"), 0, 0, 0, np.nan),
        "LiteLLM log": (0, gate_tool("litellm").get("offlineVerify"), gate_tool("litellm").get("byteEditDetected"), 0, 0, 0, 1),
        "LangChain callback": (0, gate_tool("langchain-callback").get("offlineVerify"), gate_tool("langchain-callback").get("byteEditDetected"), 0, 0, 0, np.nan),
        "Portkey local": (0, gate_tool("portkey-gateway").get("offlineVerify"), gate_tool("portkey-gateway").get("byteEditDetected"), 0, np.nan, 0, np.nan),
    }
    systems = {}
    for name, (sign, offline, edit, policy, no_pii, multi, routing) in measured.items():
        bound = None if edit is None else bool(sign and edit)
        systems[name] = [sign, flag(offline), flag(bound), policy, no_pii, multi, routing]
    return systems


def capability_heatmap() -> None:
    labels = ["Sign", "Offline\nverify", "Signed\noutput\nbinding", "Policy", "No PII\nin artifact", "Multi-agent\nreceipts", "Routing"]
    systems = capability_systems()
    data = np.array(list(systems.values()), dtype=float)
    fig, ax = plt.subplots(figsize=(7.4, 4.6))
    cmap = plt.matplotlib.colors.ListedColormap(["#D55E00", "#009E73"])
    cmap.set_bad("#DDDDDD")
    ax.imshow(data, cmap=cmap, vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(range(len(labels)), labels)
    ax.set_yticks(range(len(systems)), list(systems))
    for i in range(data.shape[0]):
        for j in range(data.shape[1]):
            value = data[i, j]
            label = "n/a" if np.isnan(value) else ("yes" if value == 1 else "no")
            ax.text(j, i, label, ha="center", va="center", fontsize=6.5)
    ax.set_title("Capabilities observed on the recorded workloads")
    save(fig, "rw-capability")


def gateway_latency() -> None:
    if not GATE:
        return
    rows = []
    for tool in GATE["tools"]:
        lat = tool.get("latencyMs") or {}
        if lat.get("p50") is None:
            continue
        rows.append((tool["tool"], lat["p50"], lat.get("min", lat["p50"]), lat.get("max", lat["p50"])))
    rows = rows[::-1]
    fig, ax = plt.subplots(figsize=(6.4, 3.0))
    y = np.arange(len(rows))
    ax.barh(y, [row[1] for row in rows], color=COLORS[0])
    ax.errorbar(
        [row[1] for row in rows], y,
        xerr=[[row[1] - row[2] for row in rows], [row[3] - row[1] for row in rows]],
        fmt="none", ecolor="#222", capsize=3, lw=0.8,
    )
    ax.set_yticks(y, [row[0] for row in rows])
    ax.set_xlabel("Short-prompt latency (ms): median, whiskers min-max; n=5 except OpenLLMetry n=3")
    ax.set_title("Local Ollama through each wrapper")
    ax.grid(axis="x", lw=0.3)
    save(fig, "rw-gateway-latency")


def fmt(value, digits=3) -> str:
    if value is None:
        return "---"
    if isinstance(value, (int, float)):
        return f"{value:.{digits}f}"
    return tex(value)


def ident(value) -> str:
    safe = str(value).replace("\\", "").replace("{", "").replace("}", "").replace("%", "")
    return "\\path{" + safe + "}"


def tex(value) -> str:
    escaped = (
        str(value)
        .replace("\\", "\\textbackslash{}")
        .replace("&", "\\&")
        .replace("%", "\\%")
        .replace("_", "\\_")
        .replace("#", "\\#")
    )
    return escaped


def yn(value) -> str:
    if value is None:
        return "---"
    return "yes" if value else "no"


def median(values: list[float]) -> float | None:
    ordered = sorted(value for value in values if value is not None)
    if not ordered:
        return None
    return ordered[len(ordered) // 2]


def most_common(values: list[str]) -> str | None:
    counts: dict[str, int] = {}
    for value in values:
        if value:
            counts[value] = counts.get(value, 0) + 1
    if not counts:
        return None
    return max(counts, key=counts.get)


def table(caption: str, label: str, header: str, rows: list[str]) -> list[str]:
    return [
        "\\begin{table*}[t]",
        "\\centering",
        f"\\caption{{{caption}}}",
        f"\\label{{{label}}}",
        "\\footnotesize",
        "\\resizebox{\\textwidth}{!}{%",
        "\\begin{tabular}{" + header + "}",
        "\\toprule",
        *rows,
        "\\bottomrule",
        "\\end{tabular}}",
        "\\end{table*}",
        "",
    ]


def drift_cell(row: dict, temperature: float) -> str:
    samples = [item for item in row.get("rag") or [] if item.get("temperature") == temperature]
    if not samples:
        return "---"
    good = [item.get("answer") or "" for item in samples if item.get("ok")]
    if not good:
        return f"0/0/{len(samples)}"
    return f"{len(set(good))}/{len(good)}/{len(samples)}"


def cited_cell(row: dict) -> str:
    parts = []
    for temperature in (0, 0.7):
        samples = [item for item in row.get("rag") or [] if item.get("temperature") == temperature and item.get("ok")]
        if not samples:
            parts.append("---")
        else:
            parts.append(f"{sum(1 for item in samples if item.get('cited'))}/{len(samples)}")
    return ", ".join(parts)


def openrouter_rows() -> list[str]:
    summary = LIVE["overheadSummary"]
    by_temp = {block["temperature"]: block for block in LIVE["drift"]}
    replay_ok = sum(1 for row in LIVE["replay"] if row["verified"] and row["outputHashMatch"] and row["alteredDetected"])
    ticket = LIVE["policy"][0]
    lines = [
        " & ".join([
            "llama3.2:3b local",
            "Ollama",
            f"{summary['plain']['p50']:.0f}",
            f"{summary['signed']['p50']:.0f}",
            f"{quantile(local_lattice_ms(), 0.5):.2f}",
            f"{by_temp[0]['uniqueExact']}/{by_temp[0]['n']}/{by_temp[0]['n']}",
            f"{by_temp[0.7]['uniqueExact']}/{by_temp[0.7]['n']}/{by_temp[0.7]['n']}",
            f"{by_temp[0]['cited']}/{by_temp[0]['n']}, {by_temp[0.7]['cited']}/{by_temp[0.7]['n']}",
            f"{replay_ok}/{len(LIVE['replay'])}",
            yn(ticket["signedMarkerLeak"]),
            str(LIVE["agent"]["receiptCount"]),
            str(LIVE["crew"]["receiptCount"]),
        ]) + r" \\",
    ]
    for row in finished_models():
        signed = [item for item in row["overhead"] if item.get("signedOk")]
        plain = [item["plainMs"] for item in row["overhead"] if item.get("plainOk")]
        replay = row.get("replay") or []
        lines.append(" & ".join([
            f"\\texttt{{{tex(row['model'])}}}",
            tex(most_common([item.get("signedProvider") for item in signed]) or "---"),
            "---" if not plain else f"{median(plain):.0f}",
            "---" if not lattice_samples(row) else f"{median([hosted_e2e(item) for item in lattice_samples(row)]):.0f}",
            "---" if not lattice_samples(row) else f"{median([item['signedLatticeMs'] for item in lattice_samples(row)]):.2f}",
            drift_cell(row, 0),
            drift_cell(row, 0.7),
            cited_cell(row),
            "---" if not replay else f"{replay_counts(row)[0]}/{replay_counts(row)[1]}",
            "---" if not row.get("ticket") else ("call failed" if not row["ticket"].get("ok") else yn(row["ticket"].get("signedMarkerLeak"))),
            "---" if not row.get("agent") else (str(row["agent"].get("receiptCount")) if row["agent"].get("ok") else "fail"),
            "---" if not row.get("crew") else (str(row["crew"].get("receiptCount")) if row["crew"].get("ok") and row["crew"].get("parentKind") == "success" else "fail"),
        ]) + r" \\")
    return lines


def pii_rows(dataset: str) -> list[str]:
    rows = []
    for tool in PII["tools"]:
        if not tool.get("measured") or dataset not in tool.get("datasets", {}):
            continue
        block = tool["datasets"][dataset]
        cells = [tex(tool["tool"].replace("lattice-noPII", "Lattice").replace("spacy-en_core_web_sm", "spaCy sm"))]
        for entity in ("email", "us-ssn", "us-phone", "credit-card"):
            cells.append(fmt(block["document"][entity]["precision"]))
            cells.append(fmt(block["document"][entity]["recall"]))
            cells.append(fmt(block["document"][entity]["f1"]))
        cells.append(fmt(block["latencyMs"].get("p50"), 3))
        rows.append(" & ".join(cells) + r" \\")
    return rows


def lattice_prose() -> str:
    local = local_lattice_ms()
    local_e2e = [item["signedMs"] for item in LIVE["overhead"] if item.get("signedMs")]
    local_pct = [100.0 * gap / e2e for gap, e2e in zip(local, local_e2e) if e2e]
    hosted = []
    hosted_pcts = []
    token_meds = []
    delta_meds = []
    for row in finished_models():
        samples = lattice_samples(row)
        if not samples:
            continue
        hosted.append(median([item["signedLatticeMs"] for item in samples]))
        hosted_pcts.append(median([hosted_pct(item) for item in samples]))
        tokens = [item.get("extraPromptTokens") for item in samples if item.get("extraPromptTokens") is not None]
        deltas = [item.get("packingProviderDeltaMs") for item in samples if item.get("packingProviderDeltaMs") is not None]
        if tokens:
            token_meds.append(median(tokens))
        if deltas:
            delta_meds.append(median(deltas))
    parts = []
    if local:
        parts.append(
            f"On the local Ollama run, the median time outside the HTTP call was {quantile(local, 0.5):.1f}~ms "
            f"(p95 {quantile(local, 0.95):.1f}~ms, {quantile(local_pct, 0.5):.3f}\\% of that run's signed wall time). "
            "That localhost call returns the body with the headers, so the gap is processing time."
        )
    if hosted:
        parts.append(
            f"Across hosted models with a successful signed short prompt, the median Lattice processing time was {min(hosted):.2f}--{max(hosted):.2f}~ms, "
            f"or {min(hosted_pcts):.3f}--{max(hosted_pcts):.3f}\\% of end-to-end time. "
            "Table~\\ref{tab:rw-lattice} gives the median and p95 in milliseconds and as a percentage. "
            "The percentages are recomputed from the per-trial phase times; the \\texttt{signedLatticePct} field stored in \\texttt{openrouter.json} also counts the HTTP time of retried attempts. "
            "Lattice time includes \\texttt{createAI()} construction and the fetch wrapper's JSON handling, so it is an upper bound."
        )
    if token_meds:
        parts.append(
            f"The packed Lattice prompt added {min(token_meds):.0f}--{max(token_meds):.0f} prompt tokens at the median versus the one-line direct prompt. "
            f"The paired provider-time difference on that longer prompt had medians from {min(delta_meds):.0f} to {max(delta_meds):.0f}~ms. "
            "A negative value means the packed call returned sooner. The difference changes sign and is often larger than a short extra prefill can explain, because completion length, including reasoning tokens, moves the provider time by seconds. It is reported separately and is not added to Lattice processing time."
        )
    return " ".join(parts)


def lattice_rows() -> list[str]:
    local = local_lattice_ms()
    local_e2e = [item["signedMs"] for item in LIVE["overhead"] if item.get("signedMs")]
    local_pct = [100.0 * gap / e2e for gap, e2e in zip(local, local_e2e) if e2e]
    rows = [
        " & ".join([
            "llama3.2:3b local",
            f"{quantile(local, 0.5):.2f}",
            f"{quantile(local, 0.95):.2f}",
            f"{quantile(local_pct, 0.5):.3f}",
            f"{quantile(local_pct, 0.95):.3f}",
            "---",
            "---",
        ]) + r" \\",
    ]
    for row in finished_models():
        samples = lattice_samples(row)
        if not samples and not row.get("unavailable"):
            continue
        if not samples:
            rows.append(f"\\texttt{{{tex(row['model'])}}} & --- & --- & --- & --- & --- & --- \\\\")
            continue
        ms = [item["signedLatticeMs"] for item in samples]
        pct = [value for value in (hosted_pct(item) for item in samples) if value is not None]
        tokens = [item["extraPromptTokens"] for item in samples if item.get("extraPromptTokens") is not None]
        deltas = [item["packingProviderDeltaMs"] for item in samples if item.get("packingProviderDeltaMs") is not None]
        rows.append(" & ".join([
            f"\\texttt{{{tex(row['model'])}}}",
            f"{quantile(ms, 0.5):.2f}",
            f"{quantile(ms, 0.95):.2f}",
            "---" if not pct else f"{quantile(pct, 0.5):.3f}",
            "---" if not pct else f"{quantile(pct, 0.95):.3f}",
            "---" if not tokens else f"{quantile(tokens, 0.5):.0f}",
            "---" if not deltas else f"{quantile(deltas, 0.5):.0f}",
        ]) + r" \\")
    return rows


def detector_commit() -> str:
    lattice = next((tool for tool in (PII or {}).get("tools") or [] if tool.get("tool") == "lattice-noPII"), {})
    commit = (lattice.get("meta") or {}).get("commit")
    return (commit or LEGACY_DETECTOR_COMMIT)[:7]


def pii_tool(name: str) -> dict:
    return next((tool for tool in (PII or {}).get("tools") or [] if tool.get("tool") == name and tool.get("measured")), {})


def pii_caveats() -> str:
    gliner = (pii_tool("gliner-small").get("meta") or {})
    guard = (pii_tool("llm-guard-anonymize").get("meta") or {})
    presidio = (pii_tool("presidio").get("meta") or {})
    parts = [
        "The rule is not symmetric across tools. For each type, Lattice contributes every occurrence of the one substring \\texttt{detect()} returns, while the other tools contribute every span they emit. "
        "When Lattice's one match falls on a different number, the document is a false positive and a false negative for Lattice, while a multi-span tool can still score it from another span.",
    ]
    if gliner:
        parts.append(
            f"GLiNER \\citep{{gliner}} is the general {ident(gliner.get('model'))} model, not a PII fine-tune, and its processor truncated each document to 384 tokens"
            + (
                f", while LLM Guard \\citep{{llmguard}} scanned {guard['windowChars']:,}-character windows with {guard['overlapChars']} characters of overlap."
                if guard.get("windowChars") else "."
            )
        )
    if guard:
        parts.append(
            f"LLM Guard ran its default Anonymize scanner with recognizer {ident(guard.get('recognizer'))}, which was fine-tuned on ai4privacy, so its ai4privacy scores can be optimistic."
            + (
                f" A single process was OOM-killed on long inputs, so each batch of {guard['batch']} documents ran in its own process with a fresh Vault."
                if guard.get("batch") else ""
            )
            + " Raw SSN labels are mapped when the NER map returns them unchanged."
        )
    if presidio:
        model = tex(presidio.get("spacyModel") or "en_core_web_sm")
        parts.append(
            f"Presidio \\citep{{presidio}} used its pattern and spaCy \\citep{{spacy}} recognizers for its four in-scope entities, with \\texttt{{{model}}} rather than its default \\texttt{{en\\_core\\_web\\_lg}}."
        )
    parts.append(
        "Lattice is an in-process JavaScript regex and the other detectors are Python pipelines, so Figure~\\ref{fig:rw-pii-latency} compares runtimes as well as detectors."
    )
    parts.append(
        f"The Lattice rows were measured with the detectors at commit \\texttt{{{detector_commit()}}}"
        + ("; Section~\\ref{sec:realworld} describes how the current detectors differ." if detector_commit() == LEGACY_DETECTOR_COMMIT else ".")
    )
    return " ".join(parts)


def write_fragment() -> None:
    lines = [
        "% Generated by eval/realworld/scripts/12-charts.py. Do not edit.",
        "\\providecommand{\\citep}[1]{\\cite{#1}}",
        "\\subsection{Broader comparison}",
        "\\label{sec:realworld-broad}",
        "\\emergencystretch=8em",
        "",
        "This subsection adds the detector, citation, gateway, and hosted-model measurements from the same machine.",
        "",
    ]
    if OPEN:
        catalog = [row for row in OPEN.get("catalog", {}).values() if row.get("found")]
        prices = {(str(row.get("promptPrice")), str(row.get("completionPrice"))) for row in catalog}
        price_text = "0" if prices and prices <= {("0", "0"), ("0.0", "0.0")} else tex(sorted(prices))
        stopped = OPEN.get("stopped") or {}
        max_tokens = (OPEN.get("env") or {}).get("maxTokens", {}).get("overhead")
        lines.append(
            f"Lattice's OpenAI-compatible adapter called {ident('https://openrouter.ai/api/v1')}. "
            f"The catalog check found {len(catalog)} of the requested \\texttt{{:free}} ids, and the listed prompt and completion prices were {price_text}. "
            f"Completed model rows: {len(finished_models())}. "
            + (f"The run stopped for {tex(stopped.get('reason'))}. " if stopped.get("reason") else "")
            + "Upstream HTTP 429 responses were retried. Pacing sleeps, that backoff, and the HTTP time of a failed attempt are excluded from Lattice time and from end-to-end time, so end-to-end time is Lattice processing plus the provider time of the attempt that returned. "
            "Provider time includes waiting for the response headers and reading the body. "
            + (f"Completion tokens are capped at {max_tokens}. " if max_tokens else "")
            + "The adapter sends no temperature, \\texttt{max\\_tokens}, or reasoning field. "
            "A fetch wrapper adds temperature and the token cap to every request, and adds \\texttt{reasoning.effort=low} for models whose catalog lists a reasoning parameter. "
            "A 400 that rejects that field is retried once without it. "
            "The Lattice rows therefore describe requests the adapter does not build on its own. "
            "Table~\\ref{tab:rw-models} uses the provider string returned on the chat response. "
            "A drift cell is distinct successful answers, successful calls, and attempts. "
            + (
                "A RAG call succeeds when the run returns an answer that passes \\texttt{mustCite}, which was called with \\texttt{inline:~true} because the answers cite the clause inline. "
                if ((OPEN.get("env") or {}).get("mustCiteOptions") or {}).get("inline")
                else f"A RAG call succeeds when the run returns an answer that passes \\texttt{{mustCite}}. The recorded verdicts come from the rules at {LEGACY_CITE_RULE}. "
                "The current default reads only a structured citation list and would fail every recorded RAG answer unless \\texttt{inline:~true} is passed. "
            )
            +             "Output binding uses only calls that returned a receipt. "
            "The local row is the Ollama run in Section~\\ref{sec:realworld} (drift n=3, overhead n=5). Hosted drift used n=10 when the call returned."
            + (
                ""
                if (OPEN.get("env") or {}).get("latticeCommit")
                else " These hosted rows do not name a library commit. They were recorded before crew receipts gained a closing member list and were not rerun for this revision, because no OpenRouter key was available. The receipt counts in the table are from that recording. Chain closure for the current library is the offline verifier check, not these hosted counts."
            )
        )
        lines.append(" " + lattice_prose())
        lines.append("")
        lines += table(
            "Short-prompt latency and the RAG, output-binding, ticket, and crew checks. Signed ms is the median of Lattice processing plus the provider time of the attempt that returned. Lattice ms is the median signed processing time, excluding provider time, retries, and backoff. Drift cells are unique successes / successes / attempts. Output binding counts receipts that verified and whose signed output hash matched the kept answer and changed after a one-character edit, among calls that returned a receipt. Receipt columns are the single-agent return and the crew return.",
            "tab:rw-models",
            "@{}l l r r r r r l r l r r@{}",
            [
                "Model & Provider & Plain ms & Signed ms & Lattice ms & Drift 0 & Drift 0.7 & Cited & Output binding & Ticket leak & Agent rcpt & Crew rcpt \\\\",
                "\\midrule",
                *openrouter_rows(),
            ],
        )
        lines += table(
            "Pure Lattice processing on the signed short prompt. The percentage is Lattice ms over Lattice ms plus the provider time of the attempt that returned; retried attempts, backoff, and pacing are excluded. Extra tokens are Lattice prompt tokens minus the direct prompt tokens. Provider delta is the signed provider time minus the direct provider time, in milliseconds, and is the latency of the longer packed prompt.",
            "tab:rw-lattice",
            "@{}l r r r r r r@{}",
            [
                "Model & ms p50 & ms p95 & \\% p50 & \\% p95 & Extra tokens & Provider delta \\\\",
                "\\midrule",
                *lattice_rows(),
            ],
        )
        for row in finished_models():
            message = row.get("error") or ""
            if row.get("unavailable") or "403" in message or any("agentic harnesses" in (item.get("error") or "") for item in row.get("overhead") or []):
                lines.append(
                    f"{ident(row['model'])} is in the public catalog at price 0. Every measured call was rejected with HTTP 403 and the message that the model is only available on agentic harnesses, so this row has no latency sample."
                )
        for row in finished_models():
            for label, block in (("single-agent", row.get("agent")), ("crew", row.get("crew"))):
                if not block or block.get("ok"):
                    continue
                status = block.get("status")
                if status is None or int(status) < 500:
                    continue
                lines.append(
                    f"{ident(row['model'])} returned HTTP {int(status)} on the {label} call"
                    + (f" ({tex(block.get('errorMessage'))})" if block.get("errorMessage") else "")
                    + ". That call is a provider failure, not a receipt or citation result."
                )
        for row in finished_models():
            samples = row.get("rag") or []
            stopped = [item for item in samples if item.get("finishReason") == "length"]
            succeeded = sum(1 for item in samples if item.get("ok"))
            if len(stopped) >= max(3, len(samples) // 2) and succeeded <= len(samples) // 2:
                reasoned = sum(1 for item in stopped if (item.get("usage") or {}).get("reasoningTokens"))
                lines.append(
                    f"{ident(row['model'])}: {len(stopped)} of {len(samples)} RAG calls stopped because the completion cap was reached"
                    + (f", and {reasoned} of those responses reported reasoning tokens." if reasoned else ".")
                    + " An empty answer then fails \\texttt{mustCite}. That is the cap, not a separate citation model."
                )
        if any(row.get("rag") for row in finished_models()):
            lines.append("")
        for row in finished_models():
            multi = row.get("multimodal") or {}
            if not multi.get("ran"):
                continue
            direct = multi.get("direct") or {}
            lattice = multi.get("lattice") or {}
            usage = lattice.get("usage") or {}
            reasoning = usage.get("reasoningTokens")
            completion = usage.get("completionTokens")
            capped = reasoning is not None and completion is not None and reasoning >= completion and lattice.get("finishReason") == "length"
            lattice_answer = (multi.get("latticeAnswer") or "").strip()
            direct_answer = (multi.get("directAnswer") or "").strip()
            effort = multi.get("reasoningEffort")
            lines.append(
                f"On a 16$\\times$16 solid red PNG, {ident(row['model'])} "
                f"answered red from a direct \\texttt{{image\\_url}} part: {yn(multi.get('directNamesRed'))}"
                + (f" (answer {tex(direct_answer)})" if direct_answer else "")
                + f". The Lattice image artifact answered red: {yn(multi.get('latticeNamesRed'))}"
                + (f" (answer {tex(lattice_answer)})" if lattice_answer else "")
                + ". "
                f"The PNG bytes were present in the Lattice request body: {yn(multi.get('imageMarkerInRequest'))}. "
                f"The direct response provider was {tex(direct.get('provider') or '---')}."
                + (f" This vision call set \\texttt{{reasoning.effort={tex(effort)}}}." if effort else "")
                + (
                    f" The Lattice call stopped for length with {reasoning} reasoning tokens out of {completion} completion tokens, and both answers were empty, so this row is not a color-identification score."
                    if capped else ""
                )
            )
            if multi.get("note"):
                lines.append(tex(multi["note"]))
            lines.append(
                "Lattice's OpenAI-compatible request builder, which the openai, xai, openrouter, and lm-studio adapters share, sends each artifact as a text part holding JSON and never emits an image part. "
                "A data-URL string is inlined as text and binary bytes are dropped, so the model received no image part"
                + (f", and the Lattice arm answered {tex(lattice_answer)} for a red PNG." if lattice_answer and not multi.get("latticeNamesRed") else ".")
            )
            lines.append("")
    if PII:
        lines.append(
            "Document-level precision, recall, and F1 use the harness overlap rule: a document is a true positive when any predicted span of that type overlaps a gold span. "
            "An undefined F1 means there were no positive predictions, or no gold documents and no false positives. "
            "spaCy \\texttt{en\\_core\\_web\\_sm} emits none of the four labels, so its precision and F1 are undefined and its recall is zero wherever a gold span exists. "
            "Figure~\\ref{fig:rw-pii-f1} omits those undefined bars."
        )
        lines.append("")
        lines.append(pii_caveats())
        lines.append("")
        lines += table(
            f"ai4privacy English validation \\citep{{ai4privacy}}, document level. Latency is the median milliseconds per document. Lattice rows use the detectors at commit \\texttt{{{detector_commit()}}}.",
            "tab:rw-pii-ai4",
            "@{}l rrr rrr rrr rrr r@{}",
            [
                "Tool & \\multicolumn{3}{c}{Email} & \\multicolumn{3}{c}{US SSN} & \\multicolumn{3}{c}{US phone} & \\multicolumn{3}{c}{Card} & ms \\\\",
                "& P & R & F1 & P & R & F1 & P & R & F1 & P & R & F1 & \\\\",
                "\\midrule",
                *pii_rows("ai4privacy"),
            ],
        )
        lines += table(
            f"Gretel English finance test \\citep{{gretelfinance}}, same document-level rule. Gold credit-card spans in this file use the label \\texttt{{credit\\_card\\_number}}. Lattice rows use the detectors at commit \\texttt{{{detector_commit()}}}.",
            "tab:rw-pii-gretel",
            "@{}l rrr rrr rrr rrr r@{}",
            [
                "Tool & \\multicolumn{3}{c}{Email} & \\multicolumn{3}{c}{US SSN} & \\multicolumn{3}{c}{US phone} & \\multicolumn{3}{c}{Card} & ms \\\\",
                "& P & R & F1 & P & R & F1 & P & R & F1 & P & R & F1 & \\\\",
                "\\midrule",
                *pii_rows("gretel"),
            ],
        )
        # Notes for presidio, spaCy, GLiNER, and LLM Guard are in pii_caveats().
        covered = {"presidio", "spacy-en_core_web_sm", "gliner-small", "llm-guard-anonymize"}
        for tool in PII["tools"]:
            meta = tool.get("meta") or {}
            if meta.get("note") and tool.get("tool") not in covered:
                lines.append(f"{tex(tool['tool'])}: {tex(meta['note'])}")
        for item in PII.get("not_measured") or []:
            reason = item.get("reason") or ""
            reason = reason.split(" (/", 1)[0]
            lines.append(
                f"{tex(item.get('tool') or 'unmeasured')} is {tex(item.get('status') or 'not measured')}: {tex(reason)}"
            )
        if PII.get("not_measured"):
            lines.append("")
        lines += [
            "\\begin{figure}[t]",
            "\\centering",
            "\\includegraphics[width=\\linewidth]{rw-pii-f1.pdf}",
            "\\caption{Document-level F1. A missing bar is an undefined F1.}",
            "\\label{fig:rw-pii-f1}",
            "\\end{figure}",
            "",
            "\\begin{figure}[t]",
            "\\centering",
            "\\includegraphics[width=0.86\\linewidth]{rw-pii-latency.pdf}",
            "\\caption{Median detector time per ai4privacy document. The axis is logarithmic. Lattice runs in-process in JavaScript; the other detectors are Python pipelines.}",
            "\\label{fig:rw-pii-latency}",
            "\\end{figure}",
            "",
        ]
    if CITE:
        lines.append(
            f"On ASQA dev \\citep{{asqa}} (n={CITE['n']}), a case-sensitive Wikipedia title substring matches {CITE['titleSubstringCaseSensitive']} long answers and a case-insensitive substring matches {CITE['titleSubstringCaseInsensitive']}. "
            f"Square-bracket citations appear in {CITE['answersWithSquareBracket']} answers and overlap a gold title in {CITE['bracketOverlapsGoldTitle']}. "
            + (
                f"With \\texttt{{inline:~true}}, \\texttt{{mustCite}} accepts a gold title in {CITE['mustCiteAnyGold']}. "
                f"The structured default accepts a gold title in {CITE.get('mustCiteStructuredDefault')}. "
                "These checks are different predicates. The structured default never reads the answer text."
                if CITE.get("mustCiteStructuredDefault") is not None and (CITE.get("mustCiteOptions") or {}).get("inline")
                else
                f"\\texttt{{mustCite}} accepts a gold title in {CITE['mustCiteAnyGold']}. These three checks are different predicates. "
                + (
                    "\\texttt{mustCite} was called with \\texttt{inline:~true}, because the default reads only a structured citation list and these answers have none."
                    if (CITE.get("mustCiteOptions") or {}).get("inline")
                    else f"The \\texttt{{mustCite}} count was measured at {LEGACY_CITE_RULE.replace('the artifact name', 'the title')}. "
                    "The current default never reads the answer text, so it accepts a gold title in none of these answers unless \\texttt{inline:~true} is passed."
                )
            )
        )
        nli = CITE.get("nli") or {}
        if nli.get("measured"):
            p50 = nli.get("latencyMsP50")
            labels = nli.get("labels") or {}
            label_text = ", ".join(f"{tex(name)} {count}" for name, count in labels.items())
            lines.append(
                f" A local cross-encoder, {ident(nli['model'])}, scored {nli['scored']} of {nli['n']} pairs and labeled {nli['entailed']} entailed"
                + (f" ({label_text})" if label_text else "")
                + f". Median classification time was {p50:.1f}~ms. The premise is the gold knowledge text truncated to 1,800 characters and the hypothesis is the long answer. Pairs with an empty premise or answer were not scored. This is a support label, not a citation-string check."
            )
        elif nli.get("reason"):
            lines.append(f" The NLI stage was not measured: {tex(nli['reason'])}.")
        lines.append("")
    lines += [
        "\\begin{figure}[t]",
        "\\centering",
        "\\includegraphics[width=\\linewidth]{rw-overhead-pct.pdf}",
        "\\caption{Signed Lattice processing time as a percentage of end-to-end time, where end-to-end time is Lattice processing plus the provider time of the attempt that returned. Retried attempts, backoff, and pacing are excluded. The bar is the median and the whiskers run from the minimum to the maximum. The local bar is wall time minus the localhost HTTP call in the Ollama run of Section~\\ref{sec:realworld}.}",
        "\\label{fig:rw-overhead-pct}",
        "\\end{figure}",
        "",
        "\\begin{figure}[t]",
        "\\centering",
        "\\includegraphics[width=\\linewidth]{rw-latency-dist.pdf}",
        "\\caption{Signed short-prompt latency. Ollama is five trials. Each hosted row is the successful signed trials, as Lattice processing plus the provider time of the attempt that returned.}",
        "\\label{fig:rw-latency-dist}",
        "\\end{figure}",
        "",
        "\\begin{figure}[t]",
        "\\centering",
        "\\includegraphics[width=\\linewidth]{rw-drift.pdf}",
        "\\caption{Distinct successful RAG answers divided by the number of successful calls. Ollama used n=3. Hosted rows use the successes recorded for that model.}",
        "\\label{fig:rw-drift}",
        "\\end{figure}",
        "",
        "\\begin{figure}[t]",
        "\\centering",
        "\\includegraphics[width=0.9\\linewidth]{rw-replay.pdf}",
        "\\caption{Signed output binding on receipts from calls that returned. A receipt counts when it verified, its signed output hash matched the kept answer, and a one-character edit of that answer changed the hash. \\texttt{replayOffline} returns the outputs the caller supplies, so this is a hash-binding check, not a re-run of the model. Rate-limited calls with no receipt are left out of the denominator.}",
        "\\label{fig:rw-replay}",
        "\\end{figure}",
        "",
    ]
    if TAMPER:
        lines += [
            "\\begin{figure}[t]",
            "\\centering",
            "\\includegraphics[width=\\linewidth]{rw-tamper-heat.pdf}",
            "\\caption{Whether the system's own check rejects the mutation. Gray means that class was not applied. Truncating a hash chain leaves a valid prefix. A byte flip inside a JSON string, a dropped tail record, and a swapped response all remain valid JSON, so a parser does not catch them.}",
            "\\label{fig:rw-tamper-heat}",
            "\\end{figure}",
            "",
        ]
    cosign = compare_tool("cosign")
    lines += [
        "\\begin{figure}[t]",
        "\\centering",
        "\\includegraphics[width=\\linewidth]{rw-capability.pdf}",
        "\\caption{Capabilities observed on these workloads. Gray is not measured here. "
        "Signed output binding is yes when the system signs the record and its own verifier rejected a byte edit of the stored record; for Lattice the signed output hash is checked by re-hashing the kept answer. "
        + ("cosign's offline-verify cell is gray because the measured \\texttt{verify-blob} checked the Rekor log online. " if cosign.get("tlogUpload") else "")
        + "LiteLLM routing is eight calls across two identical local deployments, which returned one route. Lattice routing is gray because each live call used one configured provider. Portkey's stored-log endpoint returned HTTP 500, so the PII cell is gray. LiteLLM's callback log stored the prompt text. The single-agent Lattice return carried no receipt; the crew return did.}",
        "\\label{fig:rw-capability}",
        "\\end{figure}",
        "",
    ]
    if GATE:
        header = "System & Status & n & p50 ms & min--max ms & Bytes & Markers in capture & Offline verify & Signed output binding \\\\"
        body = ["\\midrule"]
        measured_n = []
        for tool in GATE["tools"]:
            lat = tool.get("latencyMs") or {}
            if tool.get("measured"):
                if lat.get("n") is not None:
                    measured_n.append(lat["n"])
                markers = yn(tool.get("leak"))
                if tool.get("requestTextStored"):
                    markers = "prompt stored"
                elif tool.get("logApiError"):
                    markers = "log unread"
                edit = tool.get("byteEditDetected")
                body.append(" & ".join([
                    tex(tool["tool"]),
                    "measured",
                    str(lat.get("n") if lat.get("n") is not None else "---"),
                    fmt(lat.get("p50"), 1),
                    "---" if lat.get("min") is None else f"{lat['min']:.0f}--{lat['max']:.0f}",
                    "---" if tool.get("bytes") is None else str(tool.get("bytes")),
                    markers,
                    yn(tool.get("offlineVerify")),
                    # None of these logs is signed, so a detected edit would still not be a signed binding.
                    "---" if edit is None else "no",
                ]) + r" \\")
            else:
                body.append(" & ".join([
                    tex(tool["tool"]),
                    tex(tool.get("status") or "not measured"),
                    "---", "---", "---", "---", "---", "---", "---",
                ]) + r" \\")
        litellm = gate_tool("litellm")
        lines.append(
            "LiteLLM \\citep{litellm} here is an in-process client, not a proxy process. Its router sent eight short prompts to two identical Ollama deployments and returned "
            + (
                f"{litellm.get('routingUnique')} distinct route across {litellm.get('routingN')} calls. "
                if litellm else "the route recorded in \\texttt{gateways.json}. "
            )
            + "That is a weak determinism check. "
            "The other wrappers are a LangChain callback handler \\citep{langchain}, OpenLLMetry's in-process spans \\citep{openllmetry}, and a local Portkey gateway \\citep{portkey}. "
            "Helicone and Langfuse were not started."
        )
        lines.append(
            f" The latency rows are small samples (n={min(measured_n)}--{max(measured_n)} per arm). Each wrapper ran its calls in its own block, not interleaved with the direct arm, against \\texttt{{{tex(GATE.get('model') or 'the local model')}}} on a CPU-only host. "
            "The min--max ranges overlap, so the p50 order reflects generation noise, not wrapper overhead."
            if measured_n else ""
        )
        lines.append("")
        lines += table(
            "Local wrappers around Ollama. Marker detection scans the captured log or span. Portkey's log route failed, so that row does not show what a stored log would contain. None of these logs is signed.",
            "tab:rw-gateways",
            "@{}l l r r r r l l l@{}",
            [header, *body],
        )
        lines += [
            "\\begin{figure}[t]",
            "\\centering",
            "\\includegraphics[width=0.86\\linewidth]{rw-gateway-latency.pdf}",
            "\\caption{Short-prompt latency through each local wrapper: median, with whiskers from the minimum to the maximum. OpenLLMetry used n=3. The other measured rows used n=5. The arms ran one after another on a CPU-only host, so the order is not a ranking of wrapper overhead.}",
            "\\label{fig:rw-gateway-latency}",
            "\\end{figure}",
            "",
        ]
    text = "\n".join(lines) + "\n"
    (RESULTS / "realworld-broad.tex").write_text(text)
    # PDFs and the fragment only. The papers do not include the PNGs.
    for dest in (PAPER, PAPER / "ieee"):
        for name in FIGURES:
            src = RESULTS / f"{name}.pdf"
            if src.exists():
                shutil.copy(src, dest / src.name)
        shutil.copy(RESULTS / "realworld-broad.tex", dest / "realworld-broad.tex")


def main() -> None:
    overhead_pct()
    latency_dist()
    replay_chart()
    drift_chart()
    pii_f1()
    pii_latency()
    tamper_heatmap()
    capability_heatmap()
    gateway_latency()
    write_fragment()
    print("CHARTS_DONE")


if __name__ == "__main__":
    main()
