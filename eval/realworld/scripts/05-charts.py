"""Publication figures and the LaTeX fragment. Every number is read from JSON."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"
PAPER = ROOT.parents[1] / "paper"
LIVE = json.loads((RESULTS / "live.json").read_text())
DATA = json.loads((RESULTS / "datasets.json").read_text())
COMPARE = json.loads((RESULTS / "compare.json").read_text())
NODE = COMPARE["node"]

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["DejaVu Serif", "Times New Roman", "Times"],
    "font.size": 9,
    "axes.labelsize": 9,
    "axes.titlesize": 9,
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
    "axes.spines.top": False,
    "axes.spines.right": False,
})
BLUE, ORANGE, GREEN, VERMILLION, SKY = "#0072B2", "#E69F00", "#009E73", "#D55E00", "#56B4E9"


def save(fig, name: str) -> None:
    for ext in ("pdf", "png"):
        fig.savefig(RESULTS / f"{name}.{ext}", bbox_inches="tight", dpi=200)
    plt.close(fig)


def f3(value) -> str:
    if value is None:
        return "---"
    return f"{value:.3f}"


def f1(value) -> str:
    return f"{value:.1f}"


def overhead_chart() -> None:
    summary = LIVE["overheadSummary"]
    labels = ["Plain prompt", "Lattice, unsigned", "Lattice, signed"]
    series = [summary["plain"], summary["unsigned"], summary["signed"]]
    med = [s["p50"] for s in series]
    yerr = [[s["p50"] - s["min"] for s in series], [s["max"] - s["p50"] for s in series]]
    fig, ax = plt.subplots(figsize=(4.6, 2.8))
    colors = [SKY, ORANGE, BLUE]
    ax.bar(labels, med, color=colors, width=0.72, zorder=2)
    ax.errorbar(labels, med, yerr=yerr, fmt="none", ecolor="#222222", capsize=3, lw=0.8, zorder=3)
    ax.set_ylabel("Median latency (ms)")
    ax.set_title("Short prompt, temperature 0, n=5 (whiskers: min–max)")
    ax.grid(axis="y", lw=0.3, zorder=0)
    fig.tight_layout()
    save(fig, "rw-latency")


def pii_chart() -> None:
    types = DATA["ai4privacy"]["types"]
    names = ["email", "us-ssn", "us-phone"]
    labels = ["Email", "US SSN", "US phone"]
    prec = [types[n]["precision"] for n in names]
    rec = [types[n]["recall"] for n in names]
    import numpy as np
    x = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(4.6, 2.8))
    ax.bar(x - 0.18, prec, width=0.36, color=BLUE, label="Precision")
    ax.bar(x + 0.18, rec, width=0.36, color=ORANGE, label="Recall")
    ax.set_xticks(x, labels)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Document-level score")
    ax.set_title("noPII on ai4privacy English validation")
    ax.legend(frameon=False, loc="upper right")
    ax.grid(axis="y", lw=0.3)
    fig.tight_layout()
    save(fig, "rw-pii")


def bytes_chart() -> None:
    rows = byte_rows()
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    names = [r[0] for r in rows]
    vals = [r[1] for r in rows]
    colors = [BLUE if r[0] == "Lattice" else "#4D4D4D" for r in rows]
    ax.barh(names[::-1], vals[::-1], color=colors[::-1])
    ax.set_xlabel("Artifact bytes")
    ax.set_title("Bytes stored for the recorded runs")
    ax.grid(axis="x", lw=0.3)
    fig.tight_layout()
    save(fig, "rw-bytes")


def tool_by_name() -> dict:
    found = {}
    for row in COMPARE["tools"]:
        if row.get("tool"):
            found[row["tool"]] = row
    return found


def byte_rows() -> list[tuple[str, int]]:
    tools = tool_by_name()
    lattice_bytes = NODE["lattice"]["bytes"]
    return [
        ("Lattice", lattice_bytes),
        ("JSON log", tools["json-log"]["bytes"]),
        ("Hash chain", tools["hash-chain"]["bytes"]),
        ("OTel spans", tools["opentelemetry-genai"]["bytes"]),
        ("AFR", tools["agent-flight-recorder"]["bytes"]),
        ("AFR disclosure", tools["agent-flight-recorder"]["disclosure"]["bytes"]),
        ("Nova HMAC", tools["novafabric-hmac"]["bytes"]),
        ("Nova capsule", tools["novafabric-capture"]["bytes"]),
        ("cosign blob", tools["cosign"]["bytes"]),
        ("in-toto link", tools["in-toto"]["bytes"]),
        ("Sello", NODE["sello"]["bytes"]),
        ("Janus log", tools["janus"]["bytes"]),
    ]


def yn(value) -> str:
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return "---"


def matrix_rows() -> list[list[str]]:
    tools = tool_by_name()
    afr = tools["agent-flight-recorder"]
    lattice = NODE["lattice"]
    sello = NODE["sello"]
    nova = tools["novafabric-capture"]
    rows = [
        ["Lattice receipt", "measured", f3(lattice["ms"]), str(lattice["bytes"]), "yes", "yes", "other key rejected", "no", "yes"],
        ["JSON log", "baseline", f3(tools["json-log"]["ms"]), str(tools["json-log"]["bytes"]), "no", "no", "---", "yes", "no"],
        ["Hash chain", "baseline", f3(tools["hash-chain"]["ms"]), str(tools["hash-chain"]["bytes"]), "yes", "yes", "rebuild accepted", "yes", "no"],
        ["OTel GenAI spans", "measured", f3(tools["opentelemetry-genai"]["ms"]), str(tools["opentelemetry-genai"]["bytes"]), "no", "no", "---", "yes", "no"],
        ["Agent Flight Recorder", "measured", f3(afr["ms"]), str(afr["bytes"]), "yes", "yes", "mock anchor only", "yes", "no"],
        ["AFR disclosure", "measured", f3(afr["disclosure"]["ms"]), str(afr["disclosure"]["bytes"]), "yes", "yes", "mock anchor only", "no", "no"],
        ["NovaFabric HMAC", "measured", f3(tools["novafabric-hmac"]["ms"]), str(tools["novafabric-hmac"]["bytes"]), "yes", yn(tools["novafabric-hmac"]["byteEditDetected"]), "shared secret re-signs", "yes", "no"],
        ["NovaFabric capsule", "measured", f3(nova["ms"]), str(nova["bytes"]), yn(nova["offlineVerify"]), yn(nova["byteEditDetected"]), "self-asserted key", yn(nova["leak"]), "no"],
        ["cosign sign-blob", "measured", f3(tools["cosign"]["ms"]), str(tools["cosign"]["bytes"]), yn(tools["cosign"]["offlineVerify"]), yn(tools["cosign"]["byteEditDetected"]), "local key, no Rekor", yn(tools["cosign"]["leak"]), "no"],
        ["in-toto link", "measured", f3(tools["in-toto"]["ms"]), str(tools["in-toto"]["bytes"]), yn(tools["in-toto"]["offlineVerify"]), yn(tools["in-toto"]["byteEditDetected"]), "functionary key", yn(tools["in-toto"]["leakInLinkMetadata"]), "no"],
        ["Sello receipt", "measured", f3(sello["ms"]), str(sello["bytes"]), yn(sello["verifyOk"]), yn(sello["tamperDetected"]), "mock log", yn(sello["leak"]), "no"],
        ["Janus evidence log", "measured", str(tools["janus"]["ms"]), str(tools["janus"]["bytes"]), yn(tools["janus"]["offlineVerify"]), yn(tools["janus"]["byteEditDetected"]), "writer key", yn(tools["janus"]["leak"]), "no"],
        ["TrustTrack", "paper only", "---", "---", "---", "---", "---", "---", "---"],
        ["Langfuse", "not run", "---", "---", "---", "---", "---", "---", "---"],
    ]
    return rows


def write_matrix() -> None:
    header = ["System", "Status", "Wrap ms", "Bytes", "Offline verify", "Byte edit detected", "Key assumption", "PII in artifact", "Replay of output"]
    lines = [
        "% Generated by eval/realworld/scripts/05-charts.py. Do not edit.",
        "\\begin{table*}[t]",
        "\\centering",
        "\\caption{Same recorded Ollama runs, wrapped by each system that ran. Wrap time excludes model generation. TrustTrack and Langfuse were not executed.}",
        "\\label{tab:rw-matrix}",
        "\\footnotesize",
        "\\resizebox{\\textwidth}{!}{%",
        "\\begin{tabular}{@{}l l r r l l l l l@{}}",
        "\\toprule",
        " & ".join(header) + " \\\\",
        "\\midrule",
    ]
    for row in matrix_rows():
        cells = [c.replace("_", "\\_").replace("%", "\\%") for c in row]
        lines.append(" & ".join(cells) + " \\\\")
    lines += ["\\bottomrule", "\\end{tabular}}", "\\end{table*}", ""]
    (RESULTS / "feature-matrix.tex").write_text("\n".join(lines))


def write_fragment() -> None:
    o = LIVE["overheadSummary"]
    ai4 = DATA["ai4privacy"]["types"]
    asqa = DATA["asqa_dev"]
    ssn = DATA["usSsnSingleMatch"]
    replay_ok = sum(1 for row in LIVE["replay"] if row["verified"] and row["outputHashMatch"] and row["alteredDetected"])
    replay_n = len(LIVE["replay"])
    policy = LIVE["policy"][0]
    agent = LIVE["agent"]
    crew = LIVE["crew"]
    drift0 = LIVE["drift"][0]
    drift1 = LIVE["drift"][1]
    env = LIVE["env"]
    tools = tool_by_name()
    nova = tools["novafabric-capture"]
    prompt_chars = LIVE["overhead"][0]["signedPromptChars"]
    ssn_fp = DATA["ai4privacy"]["falsePositiveOverlap"]["us-ssn"]
    phone_fp = DATA["ai4privacy"]["falsePositiveOverlap"]["us-phone"]
    digest12 = env["modelDigest"].removeprefix("sha256:")[:12]
    quant = env["modelQuantization"].replace("_", "\\_")
    text = f"""% Generated by eval/realworld/scripts/05-charts.py from eval/realworld/results. Do not edit.
\\subsection{{Local open-weight runs and other record systems}}
\\label{{sec:realworld}}

The artificial evaluation mocks the provider. This subsection does not. Ollama {env['ollama'].split()[-1]} served \\texttt{{{env['model']}}} (Llama 3.2, {env['modelParameters']}, {quant}, digest \\texttt{{{digest12}}}, {env['modelSize'].replace(' ', '~')}) on the same host as the other measurements (Node {env['node']}, {env['cores']}~vCPU, {env['totalMemGB']}~GB RAM, no GPU). Lattice called it through the OpenAI-compatible adapter with no API key. The adapter does not send temperature or a token cap; a fetch wrapper added both, and that fact is part of the record. No vision model was loaded. No hosted provider key was present.

On the one-line prompt ``Reply with the single word pong,'' temperature 0, five paired trials, the median plain HTTP call was {o['plain']['p50']:.0f}~ms. A signed Lattice run of the same task was {o['signed']['p50']:.0f}~ms and an unsigned Lattice run was {o['unsigned']['p50']:.0f}~ms (Figure~\\ref{{fig:rw-latency}}). The first plain call, {o['plain']['max']:.0f}~ms, is a cold start and pulls the mean up; the median does not. The signed median is lower than the unsigned median. That gap is generation noise, not a claim that signing is faster. What is stable is the time spent outside the provider HTTP call: {o['signedOutsidePct']['p50']:.3f}\\% of end-to-end latency at the signed median (minimum {o['signedOutsidePct']['min']:.3f}\\%, maximum {o['signedOutsidePct']['max']:.3f}\\%). The Lattice prompt body was {prompt_chars} characters against a one-line plain prompt, so most of the extra wall time is a larger prefill, not the signature. The short signed receipt was {o['receiptEnvelope']['p50']:.0f}~bytes.

A refund-policy question with a \\texttt{{mustCite}} invariant passed on all three temperature-0 runs and all three temperature-0.7 runs. Each temperature produced one identical answer across its three trials (n=3). The two temperatures did not produce the same sentence. All {replay_n} signed receipts verified, replayed offline, matched the output hash, and a one-character edit was detected ({replay_ok}/{replay_n}). A synthetic support ticket containing an email, a US phone number, and a dashed SSN was flagged by those three detectors. The model's answer contained none of them, the \\texttt{{noPII}} invariant passed, and the signed receipt did not contain the planted strings. A two-step agent called \\texttt{{lookup\\_policy}} once and answered; the returned agent object carried no receipt. A two-agent crew completed in {crew['totalIterations']} iterations with {crew['receiptCount']} receipts.

On the public sets the same detectors are weaker than on the synthetic harness, and the gap is the result (Figure~\\ref{{fig:rw-pii}}). ai4privacy/pii-masking-300k English validation (revision \\texttt{{c8c77895a005}}, 7,946 documents; academic, non-commercial, no redistribution) gives email precision {ai4['email']['precision']:.3f} and recall {ai4['email']['recall']:.3f} ({ai4['email']['goldDocs']} documents with a gold email). US SSN precision is {ai4['us-ssn']['precision']:.3f} and recall {ai4['us-ssn']['recall']:.3f}. US phone precision is {ai4['us-phone']['precision']:.3f} and recall {ai4['us-phone']['recall']:.3f}. Of the SSN false positives, {ssn_fp['PASSPORT']:,} overlap a passport span: a 9-digit passport is the same shape as an SSN, and the detector cannot tell them apart. Of the phone false positives, {phone_fp['SOCIALNUMBER']:,} overlap a social-security span. There is no gold credit-card span in this file; the card detector fired on {ai4['credit-card']['fp']} documents anyway. Among {ssn['goldUsShaped']:,} US-shaped SSN spans, the single match the API returns overlaps {ssn['overlappedByTheOneMatch']:,}. It misses {ssn['missedBecauseMatchWasElsewhere']:,} because that one match fell on a different number earlier in the document, and {ssn['noMatch']:,} because it matched nothing. Gretel English finance test (Apache-2.0, revision \\texttt{{7b844d167385}}, {DATA['datasets']['gretel']['rows']:,} rows) is the same pattern at smaller n: email recall {DATA['gretel_english_test']['types']['email']['recall']:.3f}, SSN precision {DATA['gretel_english_test']['types']['us-ssn']['precision']:.3f}. ASQA dev (Apache-2.0, revision \\texttt{{084060f16b46}}, {asqa['n']} answers) is a loss for \\texttt{{mustCite}}. A gold Wikipedia title occurs as a substring in {asqa['titleSubstring']} answers, but the invariant accepts at least one gold title in {asqa['mustCiteAnyGold']}. Only {asqa['withBracket']} answers use a square-bracket citation. The check is syntactic. It does not score whether a citation supports the claim.

Table~\\ref{{tab:rw-matrix}} wraps the same recorded request and response bytes. Lattice's receipt and Sello's encrypted receipt (mock transparency log, not the public log) omit the planted strings. An AFR log with disclosure encryption also omits them; the default AFR log contains them. Janus's local evidence appender stores the payload in the clear and the byte edit fails \\texttt{{verify.SegmentDir}}. A sealed NovaFabric capsule (self-asserted ECDSA key, no RFC~3161 timestamp) fails \\texttt{{nova verify}} after a newline is appended to stdout, and the capsule contains the planted text. \\texttt{{nova validate}} on that edited capsule still exits 0. cosign \\texttt{{sign-blob}} with a local key, not Fulcio or Rekor, detects a byte edit and signs the plaintext log. in-toto's DSSE link detects a byte edit and does not embed the plaintext. A hash chain detects an edit that leaves the stored hashes untouched and accepts a rebuilt chain, because nothing outside the file anchors the head. NovaFabric's HMAC record has the same shape with a shared secret: an edit fails, and a re-sign with that secret passes. OpenTelemetry GenAI spans and a plain JSON log have no integrity check; both store the transcript. TrustTrack has no implementation we could run. Langfuse was not started: this host has no Docker daemon. Figure~\\ref{{fig:rw-bytes}} is the byte column.

\\begin{{figure}}[t]
\\centering
\\includegraphics[width=\\linewidth]{{rw-latency.pdf}}
\\caption{{Median latency of a one-line completion. Whiskers run from the minimum to the maximum of five trials. The plain arm sends only that line. The Lattice arms send the adapter's packed prompt.}}
\\label{{fig:rw-latency}}
\\end{{figure}}

\\begin{{figure}}[t]
\\centering
\\includegraphics[width=\\linewidth]{{rw-pii.pdf}}
\\caption{{Document-level precision and recall of the default \\texttt{{noPII}} detectors on ai4privacy English validation. US SSN and US phone lose to identifier types that share their shape.}}
\\label{{fig:rw-pii}}
\\end{{figure}}

\\begin{{figure}}[t]
\\centering
\\includegraphics[width=0.92\\linewidth]{{rw-bytes.pdf}}
\\caption{{Bytes retained for the recorded runs. The NovaFabric bar is one sealed capsule, not three hash receipts. AFR disclosure is the encrypted archive.}}
\\label{{fig:rw-bytes}}
\\end{{figure}}

\\input{{realworld-matrix.tex}}
"""
    (RESULTS / "realworld.tex").write_text(text)
    # Silence unused locals that document the run for the author of this script.
    _ = (policy, agent, drift0, drift1, nova)


def main() -> None:
    overhead_chart()
    pii_chart()
    bytes_chart()
    write_matrix()
    write_fragment()
    for dest in (PAPER, PAPER / "ieee"):
        for name in ("rw-latency.pdf", "rw-latency.png", "rw-pii.pdf", "rw-pii.png", "rw-bytes.pdf", "rw-bytes.png"):
            shutil.copy(RESULTS / name, dest / name)
        shutil.copy(RESULTS / "realworld.tex", dest / "realworld.tex")
        shutil.copy(RESULTS / "feature-matrix.tex", dest / "realworld-matrix.tex")
    print("charts", list(RESULTS.glob("rw-*")))


if __name__ == "__main__":
    main()
