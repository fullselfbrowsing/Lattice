"""Publication figures and the LaTeX fragment. Every number is read from JSON.

Figures and fragments are written to results/. The PDFs and the .tex files are
copied into paper/ and paper/ieee/ so each paper builds on its own; the PNGs stay
in results/.
"""
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
# No timestamps or version strings in the files, so a rerun on the same inputs
# writes the same bytes.
SAVE_METADATA = {"pdf": {"CreationDate": None}, "png": {"Software": None}}
# Records that carry a key-based signature. A bare hash chain, a shared-secret
# HMAC, and an AFR archive anchored only to MockAnchor do not count.
SIGNED = {
    "Lattice receipt": True,
    "JSON log": False,
    "Hash chain": False,
    "OTel GenAI spans": False,
    "Agent Flight Recorder": False,
    "AFR disclosure": False,
    "NovaFabric HMAC": False,
    "NovaFabric capsule": True,
    "cosign sign-blob": True,
    "in-toto link": True,
    "Sello receipt": True,
    "Janus evidence log": True,
}
# datasets.json and live.json from the recorded runs do not name the Lattice
# commit. The noPII detectors and mustCite rules they measured are the ones at
# this commit. The current detectors and mustCite default differ, so the
# fragment says so.
LEGACY_DETECTOR_COMMIT = "a8cc091"
# At that commit an inline [name] or (name) marker containing the artifact name
# counted as a citation by default. Records that list mustCiteOptions were made
# with the current library and the options named there.
LEGACY_CITE_RULE = (
    f"commit \\texttt{{{LEGACY_DETECTOR_COMMIT}}}, where an inline \\texttt{{[name]}} or \\texttt{{(name)}} marker "
    "containing the artifact name counted as a citation by default"
)


def save(fig, name: str) -> None:
    for ext in ("pdf", "png"):
        fig.savefig(RESULTS / f"{name}.{ext}", bbox_inches="tight", dpi=200, metadata=SAVE_METADATA[ext])
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
    colors = [ORANGE if r[2] else BLUE for r in rows]
    ax.barh(names[::-1], vals[::-1], color=colors[::-1])
    from matplotlib.patches import Patch
    ax.legend(
        handles=[Patch(color=ORANGE, label="keeps the plaintext transcript"), Patch(color=BLUE, label="digests or ciphertext only")],
        frameon=False, loc="lower right", fontsize=7,
    )
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


def byte_rows() -> list[tuple[str, int, bool]]:
    """Name, stored bytes, and whether the stored record contains the planted markers."""
    tools = tool_by_name()
    afr = tools["agent-flight-recorder"]
    return [
        ("Lattice", NODE["lattice"]["bytes"], NODE["lattice"]["leak"]),
        ("JSON log", tools["json-log"]["bytes"], tools["json-log"]["leak"]),
        ("Hash chain", tools["hash-chain"]["bytes"], tools["hash-chain"]["leak"]),
        ("OTel spans", tools["opentelemetry-genai"]["bytes"], tools["opentelemetry-genai"]["leak"]),
        ("AFR", afr["bytes"], afr["leak"]),
        ("AFR disclosure", afr["disclosure"]["bytes"], afr["disclosure"]["leak"]),
        ("Nova HMAC", tools["novafabric-hmac"]["bytes"], tools["novafabric-hmac"]["leak"]),
        ("Nova capsule", tools["novafabric-capture"]["bytes"], tools["novafabric-capture"]["leak"]),
        ("cosign blob", tools["cosign"]["bytes"], tools["cosign"]["leak"]),
        ("in-toto link", tools["in-toto"]["bytes"], tools["in-toto"]["leakInLinkMetadata"]),
        ("Sello", NODE["sello"]["bytes"], NODE["sello"]["leak"]),
        ("Janus log", tools["janus"]["bytes"], tools["janus"]["leak"]),
    ]


PROSE_NAMES = {
    "JSON log": "the JSON log",
    "Hash chain": "the hash chain",
    "Nova HMAC": "the NovaFabric HMAC record",
    "Nova capsule": "the NovaFabric capsule",
    "cosign blob": "cosign",
    "in-toto link": "in-toto",
    "Janus log": "Janus",
}
WORDS = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}


def series(names: list[str]) -> str:
    if len(names) <= 2:
        return " and ".join(names)
    return ", ".join(names[:-1]) + ", and " + names[-1]


def yn(value) -> str:
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return "---"


def binding(name: str, edit_detected) -> str:
    """Signed output binding: the record is signed and its own verifier rejected a byte edit."""
    if edit_detected is None:
        return "---"
    return "yes" if SIGNED[name] and edit_detected else "no"


def verify_cell(row: dict) -> str:
    # A verify-blob that consulted the transparency log is not an offline check.
    if row.get("tlogUpload") and row.get("verifyOk"):
        return "online"
    return yn(row.get("offlineVerify"))


def measured_rows() -> list[tuple[str, str, str, str, str, object, str, object]]:
    """System, status, wrap ms, bytes, verify cell, byte-edit result, key assumption, leak."""
    tools = tool_by_name()
    afr = tools["agent-flight-recorder"]
    lattice = NODE["lattice"]
    sello = NODE["sello"]
    nova = tools["novafabric-capture"]
    cosign = tools["cosign"]
    return [
        ("Lattice receipt", "measured", f3(lattice["ms"]), str(lattice["bytes"]), yn(lattice["verifyOk"]), lattice["byteFlipRejected"], "other key rejected" if lattice["resignOtherKeyRejected"] else "other key accepted", lattice["leak"]),
        ("JSON log", "baseline", f3(tools["json-log"]["ms"]), str(tools["json-log"]["bytes"]), yn(tools["json-log"]["offlineVerify"]), tools["json-log"]["byteEditDetected"], "---", tools["json-log"]["leak"]),
        ("Hash chain", "baseline", f3(tools["hash-chain"]["ms"]), str(tools["hash-chain"]["bytes"]), yn(tools["hash-chain"]["offlineVerify"]), tools["hash-chain"]["byteEditDetected"], "rebuild accepted" if tools["hash-chain"]["rebuildAccepted"] else "rebuild rejected", tools["hash-chain"]["leak"]),
        ("OTel GenAI spans", "measured", f3(tools["opentelemetry-genai"]["ms"]), str(tools["opentelemetry-genai"]["bytes"]), yn(tools["opentelemetry-genai"]["offlineVerify"]), tools["opentelemetry-genai"]["byteEditDetected"], "---", tools["opentelemetry-genai"]["leak"]),
        ("Agent Flight Recorder", "measured", f3(afr["ms"]), str(afr["bytes"]), yn(afr["offlineVerify"]), afr["byteEditDetected"], "mock anchor only", afr["leak"]),
        ("AFR disclosure", "measured", f3(afr["disclosure"]["ms"]), str(afr["disclosure"]["bytes"]), yn(afr["disclosure"]["chainOk"]), afr["disclosure"]["byteFlipLoadFailed"], "mock anchor only", afr["disclosure"]["leak"]),
        ("NovaFabric HMAC", "measured", f3(tools["novafabric-hmac"]["ms"]), str(tools["novafabric-hmac"]["bytes"]), yn(tools["novafabric-hmac"]["offlineVerify"]), tools["novafabric-hmac"]["byteEditDetected"], "shared secret re-signs" if tools["novafabric-hmac"]["resignWithSharedSecretAccepted"] else "shared secret", tools["novafabric-hmac"]["leak"]),
        ("NovaFabric capsule", "measured", f3(nova["ms"]), str(nova["bytes"]), yn(nova["offlineVerify"]), nova["byteEditDetected"], "self-asserted key", nova["leak"]),
        ("cosign sign-blob", "measured", f3(cosign["ms"]), str(cosign["bytes"]), verify_cell(cosign), cosign["byteEditDetected"], "local key, Rekor upload" if cosign.get("tlogUpload") else "local key, no Rekor", cosign["leak"]),
        ("in-toto link", "measured", f3(tools["in-toto"]["ms"]), str(tools["in-toto"]["bytes"]), yn(tools["in-toto"]["offlineVerify"]), tools["in-toto"]["byteEditDetected"], "functionary key", tools["in-toto"]["leakInLinkMetadata"]),
        ("Sello receipt", "measured", f3(sello["ms"]), str(sello["bytes"]), yn(sello["verifyOk"]), sello["tamperDetected"], "mock log", sello["leak"]),
        ("Janus evidence log", "measured", str(tools["janus"]["ms"]), str(tools["janus"]["bytes"]), yn(tools["janus"]["offlineVerify"]), tools["janus"]["byteEditDetected"], "writer key", tools["janus"]["leak"]),
    ]


def matrix_rows() -> list[list[str]]:
    rows = [
        [name, status, ms, size, verify, yn(edit), key, yn(leak), binding(name, edit)]
        for name, status, ms, size, verify, edit, key, leak in measured_rows()
    ]
    rows += [
        ["TrustTrack", "paper only", "---", "---", "---", "---", "---", "---", "---"],
        ["Langfuse", "not run", "---", "---", "---", "---", "---", "---", "---"],
    ]
    return rows


BYTE_NAMES = {
    "Lattice receipt": "Lattice",
    "Agent Flight Recorder": "AFR",
    "NovaFabric capsule": "the NovaFabric capsule",
    "cosign sign-blob": "cosign",
    "in-toto link": "in-toto",
    "Sello receipt": "Sello",
    "Janus evidence log": "Janus",
}


def bound_systems() -> list[str]:
    return [BYTE_NAMES.get(row[0], row[0]) for row in measured_rows() if binding(row[0], row[5]) == "yes"]


def write_matrix() -> None:
    header = ["System", "Status", "Wrap ms", "Bytes", "Offline verify", "Byte edit detected", "Key assumption", "PII in artifact", "Signed output binding"]
    caption = (
        "Same recorded Ollama runs, wrapped by each system that ran. Wrap time excludes model generation. "
        "Wrap ms is one cold run per system, not a warmed median, and the scopes differ: Lattice and Sello are in-process JavaScript calls summed over three records, "
        "cosign and the NovaFabric capsule are one CLI invocation each, including process start and key loading, "
        "Janus reports whole milliseconds from its own timer, and the JSON log time is serialization only. "
        "PII in artifact reflects what the harness gave each system; where it is yes, the byte count includes the plaintext transcript. "
        "Signed output binding is yes when the record is signed and the system's own verifier rejected a byte edit. "
        "TrustTrack and Langfuse were not executed."
    )
    if tool_by_name()["cosign"].get("tlogUpload"):
        caption += " The cosign run uploaded to the public Rekor log and verified online."
    lines = [
        "% Generated by eval/realworld/scripts/05-charts.py. Do not edit.",
        "\\begin{table*}[t]",
        "\\centering",
        f"\\caption{{{caption}}}",
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
    revs = {name: DATA["datasets"][name]["revision"][:12] for name in ("ai4privacy", "gretel", "asqa")}
    cosign = tools["cosign"]
    lattice_rows = NODE["lattice"]["rows"]
    sello_rows = NODE["sello"]["rows"]
    plain_kept = [PROSE_NAMES.get(name, name) for name, _size, leak in byte_rows() if leak]
    digest_only = [PROSE_NAMES.get(name, name) for name, _size, leak in byte_rows() if not leak]
    detector_commit = (DATA.get("lattice") or {}).get("commit")
    if detector_commit:
        detector_note = f"These dataset rows were measured with the \\texttt{{noPII}} detectors at commit \\texttt{{{detector_commit[:7]}}}."
    else:
        detector_note = (
            f"These dataset rows were measured with the \\texttt{{noPII}} detectors at commit \\texttt{{{LEGACY_DETECTOR_COMMIT}}}. "
            "The current detectors differ: an identifier label suppresses a match only when it is the nearest token, and bare 9-digit, spaced, and 10-digit numbers need a type-specific cue such as SSN or phone. "
            "The artificial evaluation covers the current detectors and the current \\texttt{mustCite} rules."
        )
    if (env.get("mustCiteOptions") or {}).get("inline"):
        rag_cite_note = "The invariant was called with \\texttt{inline:~true}, because the answers cite the clause inline and carry no citation list."
    else:
        rag_cite_note = (
            f"These verdicts come from the \\texttt{{mustCite}} rules at {LEGACY_CITE_RULE}. "
            "The current default reads only a structured citation list, so these answers, which cite the clause only inline, would fail it unless \\texttt{inline:~true} is passed."
        )
    if asqa.get("mustCiteStructuredDefault") is not None and (asqa.get("mustCiteOptions") or {}).get("inline"):
        asqa_cite_note = (
            f"With \\texttt{{inline:~true}}, the invariant accepts at least one gold title in {asqa['mustCiteAnyGold']} of {asqa['n']}. "
            f"The structured default, which never reads the answer text, accepts a gold title in {asqa['mustCiteStructuredDefault']}. "
            "A bracket or parenthesis counts only when its content, or one comma- or semicolon-separated part of it, equals the title."
        )
    elif (asqa.get("mustCiteOptions") or {}).get("inline"):
        asqa_cite_note = "The invariant was called with \\texttt{inline:~true}: a bracket or parenthesis whose content, or one comma- or semicolon-separated part of it, equals the title counts, because the default reads only a structured citation list and these answers have none."
    else:
        asqa_cite_note = (
            f"The \\texttt{{mustCite}} count was measured at {LEGACY_CITE_RULE.replace('the artifact name', 'the title')}. "
            "The current default never reads the answer text, and these answers carry no citation list, so it accepts a gold title in none of them. "
            "The opt-in \\texttt{inline:~true} counts only a bracket or parenthesis whose content, or one comma- or semicolon-separated part of it, equals the title."
        )
    if cosign.get("tlogUpload"):
        cosign_text = (
            f"cosign \\texttt{{sign-blob}} \\citep{{cosign}} with a local key and no Fulcio certificate detects a byte edit and signs the plaintext log. "
            f"That run kept cosign's default transparency-log upload, so it wrote an entry to the public Rekor log. Its {cosign['ms']:,.0f}~ms wrap time includes that round trip, and \\texttt{{verify-blob}} checked the log online."
        )
    else:
        cosign_text = (
            f"cosign \\texttt{{sign-blob}} \\citep{{cosign}} with a local key, the transparency-log upload disabled, and no Fulcio certificate detects a byte edit and signs the plaintext log."
        )
    if env.get("latticeCommit"):
        chain = crew.get("chainClosure") or {}
        local_stamp = (
            f" This local run names library commit \\texttt{{{str(env['latticeCommit'])[:7]}}}."
            + (
                f" \\texttt{{verifyChain}} with \\texttt{{requireClosure}} on the crew receipts returned ok={str(chain.get('ok')).lower()}"
                + (f", count {chain.get('count')}" if chain.get("count") is not None else "")
                + (f", error {chain.get('errorKind')}" if chain.get("errorKind") else "")
                + "."
                if chain
                else ""
            )
        )
    else:
        local_stamp = (
            " These local-model rows do not name a library commit. They were recorded before the crew-receipt and chain-closure changes and were not rerun on this revision."
        )
    def f1_of(row):
        precision, recall = row.get("precision"), row.get("recall")
        if precision is None or recall is None or precision + recall == 0:
            return None
        return 2 * precision * recall / (precision + recall)
    def f1_text(row):
        value = f1_of(row)
        return "undefined" if value is None else f"{value:.3f}"
    gretel = DATA["gretel_english_test"]["types"]
    ssn_passport = ssn_fp.get("PASSPORT", 0)
    if ssn_passport:
        ssn_fp_sentence = (
            f"Of the SSN false positives, {ssn_passport:,} overlap a passport span: a 9-digit passport is the same shape as an SSN, and the detector cannot tell them apart."
        )
    else:
        ssn_fp_sentence = (
            f"Of the {ai4['us-ssn']['fp']} SSN false positives, none overlap a passport span. "
            "The cue rule keeps a 9-digit passport from matching when no SSN cue is the nearest token."
        )
    text = f"""% Generated by eval/realworld/scripts/05-charts.py from eval/realworld/results. Do not edit.
\\providecommand{{\\citep}}[1]{{\\cite{{#1}}}}
\\subsection{{Local open-weight runs and other record systems}}
\\label{{sec:realworld}}

The artificial evaluation mocks the provider. This subsection does not. Ollama {env['ollama'].split()[-1]} served \\texttt{{{env['model']}}} (Llama 3.2, {env['modelParameters']}, {quant}, digest \\texttt{{{digest12}}}, {env['modelSize'].replace(' ', '~')}) on the same host as the other measurements (Node {env['node']}, {env['cores']}~vCPU, {env['totalMemGB']}~GB RAM, no GPU). Lattice called it through the OpenAI-compatible adapter with no API key and an explicit base URL ending in \\texttt{{/v1}}. \\texttt{{createOpenAIProvider}}, whose default base URL builds a chat URL without \\texttt{{/v1}}, was not exercised. The adapter does not send temperature or a token cap, so a fetch wrapper added both to every request. The Lattice numbers are therefore for a request the adapter does not build on its own. No vision model was loaded. No hosted provider key was present.

On the one-line prompt ``Reply with the single word pong,'' temperature 0, five paired trials, the median plain HTTP call was {o['plain']['p50']:.0f}~ms. A signed Lattice run of the same task was {o['signed']['p50']:.0f}~ms and an unsigned Lattice run was {o['unsigned']['p50']:.0f}~ms (Figure~\\ref{{fig:rw-latency}}). The first plain call, {o['plain']['max']:.0f}~ms, is a cold start and pulls the mean up; the median does not. The signed median is lower than the unsigned median. That gap is generation noise, not a claim that signing is faster. What is stable is the time spent outside the provider HTTP call: {o['signedOutsidePct']['p50']:.3f}\\% of end-to-end latency at the signed median (minimum {o['signedOutsidePct']['min']:.3f}\\%, maximum {o['signedOutsidePct']['max']:.3f}\\%). The Lattice prompt body was {prompt_chars} characters against a one-line plain prompt, so most of the extra wall time is a larger prefill, not the signature. The short signed receipt was {o['receiptEnvelope']['p50']:.0f}~bytes.

A refund-policy question with a \\texttt{{mustCite}} invariant passed on all three temperature-0 runs and all three temperature-0.7 runs. {rag_cite_note} Each temperature produced one identical answer across its three trials (n=3). The two temperatures did not produce the same sentence. All {replay_n} signed receipts verified. For each, the signed output hash matched the kept answer and changed after a one-character edit ({replay_ok}/{replay_n}). This checks the output binding, not a re-run: \\texttt{{replayOffline}} returns the outputs the caller supplies. A synthetic support ticket containing an email, a US phone number, and a dashed SSN was flagged by those three detectors. The model's answer contained none of them, the \\texttt{{noPII}} invariant passed, and the signed receipt did not contain the planted strings. A two-step agent called \\texttt{{lookup\\_policy}} once and answered; the returned agent object carried no receipt. A two-agent crew completed in {crew['totalIterations']} iterations with {crew['receiptCount']} receipts.{local_stamp}

The public sets are harder than the synthetic harness, and the gap is the result (Figure~\\ref{{fig:rw-pii}}). ai4privacy/pii-masking-300k \\citep{{ai4privacy}} English validation (revision \\texttt{{{revs['ai4privacy']}}}, {DATA['ai4privacy']['docs']:,} documents; academic, non-commercial, no redistribution) gives email precision {ai4['email']['precision']:.3f}, recall {ai4['email']['recall']:.3f}, and F1 {f1_text(ai4['email'])} ({ai4['email']['goldDocs']} documents with a gold email). US SSN precision is {ai4['us-ssn']['precision']:.3f}, recall {ai4['us-ssn']['recall']:.3f}, and F1 {f1_text(ai4['us-ssn'])}. US phone precision is {ai4['us-phone']['precision']:.3f}, recall {ai4['us-phone']['recall']:.3f}, and F1 {f1_text(ai4['us-phone'])}. {ssn_fp_sentence} Of the phone false positives, {phone_fp.get('SOCIALNUMBER', 0):,} overlap a social-security span. There is no gold credit-card span in this file; the card detector fired on {ai4['credit-card']['fp']} documents anyway. Among {ssn['goldUsShaped']:,} US-shaped SSN spans, the single match the API returns overlaps {ssn['overlappedByTheOneMatch']:,}. It misses {ssn['missedBecauseMatchWasElsewhere']:,} because that one match fell on a different number earlier in the document, and {ssn['noMatch']:,} because it matched nothing. Gretel English finance test \\citep{{gretelfinance}} (Apache-2.0, revision \\texttt{{{revs['gretel']}}}, {DATA['datasets']['gretel']['rows']:,} rows) is the same pattern at smaller n: email precision {gretel['email']['precision']:.3f}, recall {gretel['email']['recall']:.3f}, F1 {f1_text(gretel['email'])}; US SSN precision {gretel['us-ssn']['precision']:.3f}, recall {gretel['us-ssn']['recall']:.3f}, F1 {f1_text(gretel['us-ssn'])}; US phone precision {gretel['us-phone']['precision']:.3f}, recall {gretel['us-phone']['recall']:.3f}, F1 {f1_text(gretel['us-phone'])}. ASQA dev \\citep{{asqa}} (Apache-2.0, revision \\texttt{{{revs['asqa']}}}, {asqa['n']} answers) is a loss for \\texttt{{mustCite}}. A gold Wikipedia title occurs as a substring in {asqa['titleSubstring']} answers. Only {asqa['withBracket']} answers use a square-bracket citation. {asqa_cite_note} The check is syntactic. It does not score whether a citation supports the claim. {detector_note}

Table~\\ref{{tab:rw-matrix}} wraps the same recorded request and response bytes. Lattice's receipt and Sello's encrypted receipt (mock transparency log, not the public log) omit the planted strings. An AFR log with disclosure encryption also omits them; the default AFR log contains them. Janus's local evidence appender stores the payload in the clear and the byte edit fails \\texttt{{verify.SegmentDir}}. A sealed NovaFabric capsule (self-asserted ECDSA key, no RFC~3161 timestamp) fails \\texttt{{nova verify}} after a newline is appended to stdout, and the capsule contains the planted text. \\texttt{{nova validate}} on that edited capsule still exits 0. {cosign_text} in-toto's DSSE link \\citep{{intoto}} detects a byte edit and does not embed the plaintext. A hash chain detects an edit that leaves the stored hashes untouched and accepts a rebuilt chain, because nothing outside the file anchors the head. NovaFabric's HMAC record has the same shape with a shared secret: an edit fails, and a re-sign with that secret passes. OpenTelemetry GenAI spans and a plain JSON log have no integrity check; both store the transcript. TrustTrack has no implementation we could run. Langfuse was not started: this host has no Docker daemon. {series(bound_systems())} sign the record and reject a byte edit; Table~\\ref{{tab:rw-matrix}} lists that as signed output binding.

The wrap times are single cold samples with different scopes, so they order the systems only roughly. The Lattice total of {NODE['lattice']['ms']:.3f}~ms is {WORDS.get(len(lattice_rows), len(lattice_rows))} \\texttt{{createReceipt}} calls, and the first call is {lattice_rows[0]['ms']:.3f}~ms of it; Sello's first call is {sello_rows[0]['ms']:.3f} of its {NODE['sello']['ms']:.3f}~ms. The byte column mixes scopes too (Figure~\\ref{{fig:rw-bytes}}): {series(plain_kept)} keep the plaintext transcript, while {series(digest_only)} keep only digests or ciphertext.

\\begin{{figure}}[t]
\\centering
\\includegraphics[width=\\linewidth]{{rw-latency.pdf}}
\\caption{{Median latency of a one-line completion. Whiskers run from the minimum to the maximum of five trials. The plain arm sends only that line. The Lattice arms send the adapter's packed prompt.}}
\\label{{fig:rw-latency}}
\\end{{figure}}

\\begin{{figure}}[t]
\\centering
\\includegraphics[width=\\linewidth]{{rw-pii.pdf}}
\\caption{{Document-level precision and recall of the default \\texttt{{noPII}} detectors at commit \\texttt{{{(detector_commit or LEGACY_DETECTOR_COMMIT)[:7]}}} on ai4privacy English validation. US phone false positives still overlap social-security spans. US SSN false positives no longer overlap passport spans; recall is the remaining loss.}}
\\label{{fig:rw-pii}}
\\end{{figure}}

\\begin{{figure}}[t]
\\centering
\\includegraphics[width=0.92\\linewidth]{{rw-bytes.pdf}}
\\caption{{Bytes retained for the recorded runs. Orange records keep the plaintext transcript; blue records keep only digests or ciphertext. The NovaFabric bar is one sealed capsule, not three hash receipts. AFR disclosure is the encrypted archive. The cosign bar is the blob, the signature, and the public key.}}
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
    # PDFs and fragments only. The papers do not include the PNGs.
    for dest in (PAPER, PAPER / "ieee"):
        for name in ("rw-latency.pdf", "rw-pii.pdf", "rw-bytes.pdf"):
            shutil.copy(RESULTS / name, dest / name)
        shutil.copy(RESULTS / "realworld.tex", dest / "realworld.tex")
        shutil.copy(RESULTS / "feature-matrix.tex", dest / "realworld-matrix.tex")
    print("charts", sorted(path.name for path in RESULTS.glob("rw-*")))


if __name__ == "__main__":
    main()
