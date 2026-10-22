"""Build PNG plots and LaTeX tables from eval/results/*.json. No numbers are typed by hand.

Two measurement environments feed the outputs:
  latency    eval/results/env-latency.json     01-overhead, 02-chain (and pnpm bench:receipts)
  functional eval/results/env-functional.json  03-tamper, 04-replay, 05-policy, 07-v16, test counts
Each table caption and each group of macros in paper/numbers.tex names the one it comes from.
"""
import json, os, shutil
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
R = os.path.join(os.path.dirname(__file__), "..", "results")
J = lambda n: json.load(open(os.path.join(R, n)))
def J_opt(*names):
    for n in names:
        if os.path.exists(os.path.join(R, n)): return J(n)
    return None
ov, ch, ta, rp, po = J("overhead.json"), J("chain_scaling.json"), J("tamper.json"), J("replay.json"), J("policy.json")
env = J_opt("env-latency.json", "env.json")            # latency environment
fenv = J_opt("env-functional.json") or env               # functional environment

# Test counts: the raw vitest JSON (gitignored) when present, else the committed summary.
def tests(name):
    try:
        t = J(name); return [t["numPassedTests"], t["numFailedTests"], t["numTotalTests"], t["numTotalTestSuites"]]
    except Exception: return None
tl, tc = tests("tests-lattice.json"), tests("tests-lattice-cli.json")
if tl is None or tc is None:
    saved = (J_opt("tests_summary.json") or {}).get("tests", {})
    tl = tl or saved.get("lattice"); tc = tc or saved.get("cli")

def esc(s):
    s = str(s)
    for a, b in (("\\", "\x00"), ("_", r"\_"), ("&", r"\&"), ("%", r"\%"), ("#", r"\#"), ("$", r"\$"), ("{", r"\{"), ("}", r"\}"), ("~", r"\textasciitilde{}"), ("^", r"\textasciicircum{}"), ("\x00", r"\textbackslash{}")):
        s = s.replace(a, b)
    return s
short = lambda c: str(c or "")[:7]
def env_label(e, commit_key):
    return f"Node {e['node']}, {e['cpu']} x{e['cores']}, {e['platform']}, commit {short(e.get(commit_key))}"
LAT = env_label(env, "gitCommit")
FUN = env_label(fenv, "libraryCommit" if "libraryCommit" in fenv else "gitCommit")
LAT_CAP = r"Latency environment (\texttt{env-latency.json}): " + esc(LAT) + "."
FUN_CAP = r"Functional environment (\texttt{env-functional.json}): " + esc(FUN) + "."
P = lambda w, font="": r">{%s\raggedright\arraybackslash}p{%s\linewidth}" % (font, w)
PR = lambda w, font="": r">{%s\raggedleft\arraybackslash}p{%s\linewidth}" % (font, w)
SS = r"\scriptsize"
def longtable_open(cols, caption, label, head, ncols):
    """A page-breaking table (paper/main.tex loads longtable) for the two long tables.
    Cells are scriptsize through the column spec; the caption keeps the document size."""
    return [
        # Floats are single-spaced under setspace; a longtable is not, so reset the stretch.
        r"\begingroup\ifdefined\setstretch\setstretch{1}\fi\setlength{\LTcapwidth}{\textwidth}\setlength{\LTpre}{\bigskipamount}\setlength{\LTpost}{\bigskipamount}",
        r"\begin{longtable}{%s}" % cols,
        r"\caption{%s}\label{%s}\\" % (caption, label),
        head,
        r"\endfirsthead",
        r"\multicolumn{%d}{@{}l}{\scriptsize Table~\ref{%s}, continued}\\" % (ncols, label),
        head,
        r"\endhead",
        r"\bottomrule",
        r"\endfoot",
    ]

S = ov["summary"]; cfgs = [s for s in dict.fromkeys(x["config"] for x in S) if s != "micro"]
get = lambda c, m, k: next(x[k] for x in S if x["config"] == c and x["measure"] == m)

# Plot 1: overhead p50 / p95 (latency environment)
fig, ax = plt.subplots(figsize=(8, 3.6)); w = 0.2
for i, (m, lab) in enumerate([("plain", "provider.execute (plain)"), ("run", "ai.run, no signer"), ("runSig", "ai.run + signed receipt"), ("verify", "verifyReceipt")]):
    xs = [j + (i - 1.5) * w for j in range(len(cfgs))]
    ax.bar(xs, [get(c, m, "p50") for c in cfgs], w, yerr=[[0]*len(cfgs), [get(c, m, "p95") - get(c, m, "p50") for c in cfgs]], capsize=2, label=lab)
ax.set_xticks(range(len(cfgs))); ax.set_xticklabels(cfgs, rotation=30, ha="right", fontsize=8); ax.set_yscale("log"); ax.set_ylabel("latency ms (p50, bar to p95)")
ax.legend(fontsize=7); ax.set_title("Per-run latency with mocked provider (no network)", fontsize=9); fig.tight_layout(); fig.savefig(os.path.join(R, "overhead.png"), dpi=200)

# Plot 2: receipt size vs payload (latency environment run)
sz = ov["sizes"]; fig, ax = plt.subplots(figsize=(4.5, 3.2))
ax.scatter([s["payloadBytes"] for s in sz], [s["receiptEnvelopeBytes"] for s in sz])
for s in sz: ax.annotate(f'{s["artifacts"]} art', (s["payloadBytes"], s["receiptEnvelopeBytes"]), fontsize=6)
ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlabel("input payload bytes"); ax.set_ylabel("receipt envelope bytes"); fig.tight_layout(); fig.savefig(os.path.join(R, "receipt_size.png"), dpi=200)

# Plot 3: chain scaling (latency environment)
fig, ax1 = plt.subplots(figsize=(4.5, 3.2)); D = [c["depth"] for c in ch]
ax1.plot(D, [float(c["verifyAllP50ms"]) for c in ch], "o-", label="verify chain p50 (ms)"); ax1.plot(D, [float(c["buildP50ms"]) for c in ch], "s-", label="build chain p50 (ms)")
ax1.set_xscale("log", base=2); ax1.set_yscale("log"); ax1.set_xlabel("chain depth (receipts)"); ax1.set_ylabel("ms"); ax1.legend(fontsize=7); fig.tight_layout(); fig.savefig(os.path.join(R, "chain_scaling.png"), dpi=200)

# Plot 4: PII per label (functional environment). Hatched bars are the added label set.
bl = po["pii"]["byLabel"]; fig, ax = plt.subplots(figsize=(11, 3.9))
cols = ["tab:green" if b["isPII"] and b["inScope"] else "tab:olive" if b["isPII"] else "tab:red" for b in bl]
bars = ax.bar(range(len(bl)), [b["flaggedRate"] for b in bl], color=cols)
for bar, b in zip(bars, bl):
    if b.get("set") == "new": bar.set_hatch("//"); bar.set_edgecolor("white")
first_new = next((i for i, b in enumerate(bl) if b.get("set") == "new"), None)
if first_new is not None: ax.axvline(first_new - 0.5, color="0.4", lw=0.8, ls="--")
ax.set_xticks(range(len(bl))); ax.set_xticklabels([b["label"] for b in bl], rotation=70, ha="right", fontsize=6)
ax.set_ylabel("flagged rate"); ax.set_xlim(-0.6, len(bl) - 0.4)
ax.set_title("noPII flag rate (green: in-scope PII, olive: out-of-scope PII, red: non-PII; hatched, right of the dashed line: added labels)", fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(R, "pii_by_label.png"), dpi=200)

T = []
T.append(f"% Generated by eval/scripts/06-report.py. Do not edit.")
T.append(f"% Latency tables (tab:overhead, tab:size, tab:chain): env-latency.json -- {LAT}, {env['date']}")
T.append(f"% Functional tables (tab:tamper, tab:replay, tab:policy, tab:v16) and test counts: env-functional.json -- {FUN}, {fenv['date']}")
T.append(r"\begin{table}[t]\centering\caption{Per-run latency (ms) with a mocked OpenAI-shaped provider, %d trials after %d warm-up. Overhead = signed run $-$ unsigned run. %s}\label{tab:overhead}\scriptsize" % (ov["trials"], ov["warmup"], LAT_CAP))
T.append(r"\begin{tabular}{@{}lrrrrrr@{}}\toprule Config & plain p50 & run p50 & signed p50 & signed p95 & signed p99 & verify p50\\\midrule")
for c in cfgs: T.append(f"{esc(c)} & {get(c,'plain','p50'):.3f} & {get(c,'run','p50'):.3f} & {get(c,'runSig','p50'):.3f} & {get(c,'runSig','p95'):.3f} & {get(c,'runSig','p99'):.3f} & {get(c,'verify','p50'):.3f}\\\\")
m = {x["measure"]: x for x in S if x["config"] == "micro"}
T.append(r"\midrule \multicolumn{7}{@{}l}{Isolated: createReceipt p50 %.3f / p99 %.3f; verifyReceipt p50 %.3f / p99 %.3f; receiptCid p50 %.4f}\\" % (m["createReceipt"]["p50"], m["createReceipt"]["p99"], m["verifyReceipt"]["p50"], m["verifyReceipt"]["p99"], m["receiptCid"]["p50"]))
T.append(r"\bottomrule\end{tabular}\end{table}")
T.append(r"\begin{table}[t]\centering\caption{Receipt envelope size vs.\ input payload. %s}\label{tab:size}\scriptsize\begin{tabular}{@{}lrrr@{}}\toprule Config & payload B & artifacts & receipt B\\\midrule" % LAT_CAP)
for s in sz: T.append(f"{esc(s['config'])} & {s['payloadBytes']} & {s['artifacts']} & {s['receiptEnvelopeBytes']}\\\\")
T.append(r"\bottomrule\end{tabular}\end{table}")
T.append(r"\begin{table}[t]\centering\caption{Chained receipts (parentReceiptCid): size and verification cost by depth (30 trials). %s}\label{tab:chain}\scriptsize\begin{tabular}{@{}rrrrr@{}}\toprule Depth & total B & B/link & build p50 ms & verify-all p50 ms\\\midrule" % LAT_CAP)
for c in ch: T.append(f"{c['depth']} & {c['totalBytes']} & {c['bytesPerLink']} & {c['buildP50ms']} & {c['verifyAllP50ms']}\\\\")
T.append(r"\bottomrule\end{tabular}\end{table}")

# Tamper and chain attacks: p{} columns and short chain reasons.
def chain_reason(c):
    reasons = [x for x in str(c["chainVerifierReason"]).split(";")]
    if c["chainVerifierRejectRate"] == 0:
        advice = sorted({code for r in reasons for code in r.split("|") if code}, key=lambda x: (x != "tail-truncation-unchecked", x))
        return "accepted" + (": " + ", ".join(advice) if advice else "")
    if c["chainVerifierRejectRate"] == 1: return "rejected: " + ", ".join(r for r in reasons if r)
    return "mixed: " + "; ".join(r.replace("|", ", ") for r in reasons)
chain_n = ta["chainSummary"][0]["n"] if ta["chainSummary"] else 0
tamper_cols = "@{}%s%s%s%s@{}" % (P(0.24, SS), P(0.29, SS), PR(0.10, SS), P(0.27, SS))
tamper_head = r"\toprule Class & Mutation & Rejected & Kind\\\midrule"
LT = [r"% The two long tables follow the floats; \clearpage flushes pending floats so numbering and placement agree.", r"\clearpage"]
LT += longtable_open(tamper_cols, r"Tamper suite over %d receipts from mocked \texttt{ai.run} calls across the seven adapters: rejections per mutation and the error kind \texttt{verifyReceipt} returned. Rows in the control-accept and replay classes are expected to verify (there is no replay cache). Last block: %d linked chains of 8 receipts, rejection rate by per-receipt \texttt{verifyReceipt} / by the library's \texttt{verifyChain} with no \texttt{expectedCount} (except the expectedCount row). Accepted chains list the advisory codes \texttt{verifyChain} returned. %s" % (ta["baseReceipts"], chain_n, FUN_CAP), "tab:tamper", tamper_head, 4)
for s in ta["summary"]: LT.append(f"{esc(s['category'])} & {esc(s['mutation'])} & {s['rejected']}/{s['n']} & {esc(s['kinds'].replace(';', '; '))}\\\\")
LT.append(r"\midrule \multicolumn{4}{@{}l}{\scriptsize Chain attacks: rejection rate, per-receipt verify / verifyChain}\\")
for c in ta["chainSummary"]: LT.append(f"chain & {esc(c['mutation'])} & {c['perReceiptRejectRate']:.2f} / {c['chainVerifierRejectRate']:.2f} & {esc(chain_reason(c))}\\\\")
LT.append(r"\end{longtable}\endgroup")

T.append(r"\begin{table}[t]\centering\caption{Offline replay over recorded fixtures, per adapter. Fixtures are verified with the public keyset written next to them. %s}\label{tab:replay}\scriptsize\begin{tabular}{@{}lrrrrr@{}}\toprule Adapter & runs & verified & hash match & live rerun match & altered detected\\\midrule" % FUN_CAP)
for a in rp: T.append(f"{esc(a['adapter'])} & {a['runs']} & {a['verified']} & {a['outputHashMatch']} & {a['liveRerunHashMatch']} & {a['alteredOutputDetected']}\\\\")
T.append(r"\bottomrule\end{tabular}\end{table}")

p = po["pii"]; ro = po["routing"]; mc = po["mustCite"]
def pget(k): return p.get(k) or {"n": 0, "precision": None, "recall": None, "fp": 0, "fn": 0}
nl = p.get("newNegatives", {"n": 0, "fp": 0, "falsePositiveRate": None})
T.append(r"\begin{table}[t]\centering\caption{Policy checks on a synthetic labeled set (100 samples per label). The original set was written alongside the detectors. The added set holds PII in support and CRM prose, tables, and CSV rows, more card networks, and uncued numbers that are not PII. Rows with only the original negatives leave the added negatives out. The mustCite cases are the original set, default-behavior cases, and opt-in prose checks. The prose-by-default row scores the original mustCite cases against labels that expect prose to be read by default; %s differ, because the default reads prose only on opt-in. The set is a regression suite, not a prevalence-weighted estimate. %s}\label{tab:policy}\scriptsize" % (esc(" and ".join(mc.get("originalCommittedLabels", {}).get("relabeled", []))) or "none", FUN_CAP))
T.append(r"\begin{tabular}{@{}%srrrrr@{}}\toprule Set & n & precision & recall & FP & FN\\\midrule" % P(0.42))
pii_rows = [
    ("inScopeOnly", "noPII, in-scope PII types, all negatives"),
    ("inScopeOnly_originalNegatives", "noPII, in-scope PII types, original negatives only"),
    ("overall_allPII", "noPII, all PII types, all negatives"),
    ("overall_originalNegatives", "noPII, all PII types, original negatives only"),
    ("outOfScopeOnly", "noPII, out-of-scope types, all negatives"),
    ("originalLabels_inScope", "noPII, original labels only (in-scope)"),
    ("newLabels_inScope", "noPII, added labels only (in-scope)"),
]
for k, lab in pii_rows:
    if k in p: T.append(f"{lab} & {p[k]['n']} & {p[k]['precision']} & {p[k]['recall']} & {p[k]['fp']} & {p[k]['fn']}\\\\")
if nl.get("n"): T.append(r"added uncued numeric negatives & %d & \multicolumn{4}{l}{%d flagged}\\" % (nl["n"], nl["fp"]))
T.append(r"\midrule mustCite agreement, all cases & %d & \multicolumn{4}{l}{%d/%d agree with label}\\" % (mc["cases"], mc["agree"], mc["cases"]))
if "byMode" in mc:
    T.append(r"mustCite, default behavior & %d & \multicolumn{4}{l}{%d/%d}\\" % (mc["byMode"]["default"]["cases"], mc["byMode"]["default"]["agree"], mc["byMode"]["default"]["cases"]))
    T.append(r"mustCite, opt-in prose checks & %d & \multicolumn{4}{l}{%d/%d}\\" % (mc["byMode"]["optIn"]["cases"], mc["byMode"]["optIn"]["agree"], mc["byMode"]["optIn"]["cases"]))
if "originalCommittedLabels" in mc:
    oc = mc["originalCommittedLabels"]
    T.append(r"mustCite, original cases & %d & \multicolumn{4}{l}{%d/%d}\\" % (mc["original"]["cases"], mc["original"]["agree"], mc["original"]["cases"]))
    T.append(r"mustCite, original cases, prose-by-default labels & %d & \multicolumn{4}{l}{%d/%d (%d labels differ)}\\" % (oc["cases"], oc["agree"], oc["cases"], len(oc["relabeled"])))
T.append(r"\midrule routing determinism & %d & \multicolumn{4}{l}{identical %.4f, permuted same %.3f, violations %d}\\" % (ro["repeatedEvaluations"], ro["identicalDecisionRate"], ro["catalogPermutationSameSelectionRate"], ro["selectedViolatingPolicy"]))
T.append(r"\bottomrule\end{tabular}\end{table}")
if tl and tc: T.append(f"% Existing test suite (functional environment): lattice {tl[0]}/{tl[2]} passed ({tl[1]} failed); lattice-cli {tc[0]}/{tc[2]} passed ({tc[1]} failed)")

v16_path = os.path.join(R, "v16.json")
v16 = json.load(open(v16_path)) if os.path.exists(v16_path) else None
if v16:
    v16_head = r"\toprule Check & Result\\\midrule"
    LT += longtable_open("@{}%s%s@{}" % (P(0.55, SS), P(0.41, SS)), r"Verifier opt-ins, structured advisories, chain closure, crew receipts, and signer-failure modes: %d of %d checks pass. Result gives the error kind, advisory, or exception the check expected. The two base-1.6.0 rows run the released 1.6.0 verifier on a chain minted by the library at the functional commit. %s" % (v16["passed"], v16["checks"], FUN_CAP), "tab:v16", v16_head, 2)
    for row in v16["rows"]:
        kind = str(row.get("kind") or "")
        res = ("pass" if row["ok"] else "FAIL") + (f": {kind}" if kind else "")
        LT.append(f"{esc(row['check'])} & {esc(res)}\\\\")
    LT.append(r"\end{longtable}\endgroup")

paper = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "paper"))
os.makedirs(paper, exist_ok=True)
# One copy only: paper/eval-tables.tex.
open(os.path.join(paper, "eval-tables.tex"), "w").write("\n".join(T + LT) + "\n")
json.dump({"tests": {"lattice": tl, "cli": tc}, "format": "[passed, failed, total, suites]", "environment": "env-functional.json"}, open(os.path.join(R, "tests_summary.json"), "w"), indent=2)

def tex_cmd(name, value, new=False):
    safe = str(value).replace("\\", "\\textbackslash ").replace("%", "\\%").replace("_", "\\_").replace("#", "\\#").replace("&", "\\&")
    # Macros that paper/main.tex does not declare are provided before they are renewed.
    return ("\\providecommand{\\" + name + "}{}" if new else "") + "\\renewcommand{\\" + name + "}{" + safe + "}"
new_cmd = lambda name, value: tex_cmd(name, value, new=True)

runs = sum(a["runs"] for a in rp)
verified = sum(a["verified"] for a in rp)
matched = sum(a["outputHashMatch"] for a in rp)
live = sum(a["liveRerunHashMatch"] for a in rp)
altered = sum(a["alteredOutputDetected"] for a in rp)
leaked = [row for row in po["leakage"] if row.get("leakedFields") not in ("none", "", None)]
pii_in = p["inScopeOnly"]
pii_all = p["overall_allPII"]
lat_defs = [
    "% Latency environment (eval/results/env-latency.json): " + LAT + ", " + env["date"],
    tex_cmd("EvalNode", env["node"]),
    tex_cmd("EvalCpu", env["cpu"]),
    tex_cmd("EvalCores", env["cores"]),
    tex_cmd("EvalMem", env["totalMemGB"]),
    tex_cmd("EvalDate", env["date"]),
    tex_cmd("EvalLatticeVersion", env["latticeVersion"]),
    tex_cmd("EvalCommit", env.get("gitCommit", "")),
    tex_cmd("EvalPlatform", env["platform"]),
    tex_cmd("OverheadTrials", ov["trials"]),
]
# Signing delta on the smallest text config and the 1 MB image, from measured p50.
def delta(cfg):
    return get(cfg, "runSig", "p50") - get(cfg, "run", "p50")
small = "text-1KB" if any(c == "text-1KB" for c in cfgs) else cfgs[0]
image = "image-1000KB" if "image-1000KB" in cfgs else cfgs[0]
lat_defs.append(tex_cmd("SignDeltaSmallMs", f"{delta(small):.3f}"))
lat_defs.append(tex_cmd("SignDeltaImageMs", f"{delta(image):.3f}"))
lat_defs.append(tex_cmd("VerifySmallMs", f"{get(small, 'verify', 'p50'):.3f}"))

fun_defs = [
    "% Functional environment (eval/results/env-functional.json): " + FUN + ", " + fenv["date"],
    new_cmd("EvalFuncNode", fenv["node"]),
    new_cmd("EvalFuncCpu", fenv["cpu"]),
    new_cmd("EvalFuncCores", fenv["cores"]),
    new_cmd("EvalFuncMem", fenv["totalMemGB"]),
    new_cmd("EvalFuncDate", fenv["date"]),
    new_cmd("EvalFuncLatticeVersion", fenv["latticeVersion"]),
    new_cmd("EvalFuncCommit", fenv.get("libraryCommit", fenv.get("gitCommit", ""))),
    new_cmd("EvalFuncPlatform", fenv["platform"]),
    tex_cmd("TestsLatticePassed", tl[0] if tl else 0),
    tex_cmd("TestsLatticeTotal", tl[2] if tl else 0),
    tex_cmd("TestsLatticeFailed", tl[1] if tl else 0),
    tex_cmd("TestsCliPassed", tc[0] if tc else 0),
    tex_cmd("TestsCliTotal", tc[2] if tc else 0),
    tex_cmd("TestsCliFailed", tc[1] if tc else 0),
    tex_cmd("PiiInPrecision", pii_in["precision"]),
    tex_cmd("PiiInRecall", pii_in["recall"]),
    tex_cmd("PiiInN", pii_in["n"]),
    tex_cmd("PiiInFp", pii_in["fp"]),
    tex_cmd("PiiInFn", pii_in["fn"]),
    tex_cmd("PiiAllPrecision", pii_all["precision"]),
    tex_cmd("PiiAllRecall", pii_all["recall"]),
    new_cmd("PiiAllN", pii_all["n"]),
    new_cmd("PiiAllFp", pii_all["fp"]),
    new_cmd("PiiAllFn", pii_all["fn"]),
    new_cmd("PiiInOrigNegPrecision", pget("inScopeOnly_originalNegatives")["precision"]),
    new_cmd("PiiInOrigNegRecall", pget("inScopeOnly_originalNegatives")["recall"]),
    new_cmd("PiiInOrigNegN", pget("inScopeOnly_originalNegatives")["n"]),
    new_cmd("PiiAllOrigNegPrecision", pget("overall_originalNegatives")["precision"]),
    new_cmd("PiiAllOrigNegRecall", pget("overall_originalNegatives")["recall"]),
    new_cmd("PiiOrigPrecision", pget("originalLabels_inScope")["precision"]),
    new_cmd("PiiOrigRecall", pget("originalLabels_inScope")["recall"]),
    new_cmd("PiiOrigN", pget("originalLabels_inScope")["n"]),
    new_cmd("PiiOrigFn", pget("originalLabels_inScope")["fn"]),
    new_cmd("PiiNewPrecision", pget("newLabels_inScope")["precision"]),
    new_cmd("PiiNewRecall", pget("newLabels_inScope")["recall"]),
    new_cmd("PiiNewN", pget("newLabels_inScope")["n"]),
    new_cmd("PiiNewFp", pget("newLabels_inScope")["fp"]),
    new_cmd("PiiNewFn", pget("newLabels_inScope")["fn"]),
    new_cmd("PiiNewNegN", nl.get("n", 0)),
    new_cmd("PiiNewNegFp", nl.get("fp", 0)),
    tex_cmd("MustCiteAgree", mc["agree"]),
    tex_cmd("MustCiteCases", mc["cases"]),
    new_cmd("MustCiteDefaultAgree", mc.get("byMode", {}).get("default", {}).get("agree", "")),
    new_cmd("MustCiteDefaultCases", mc.get("byMode", {}).get("default", {}).get("cases", "")),
    new_cmd("MustCiteOptInAgree", mc.get("byMode", {}).get("optIn", {}).get("agree", "")),
    new_cmd("MustCiteOptInCases", mc.get("byMode", {}).get("optIn", {}).get("cases", "")),
    new_cmd("MustCiteOrigAgree", mc.get("original", {}).get("agree", "")),
    new_cmd("MustCiteOrigCases", mc.get("original", {}).get("cases", "")),
    new_cmd("MustCiteOrigCommittedAgree", mc.get("originalCommittedLabels", {}).get("agree", "")),
    tex_cmd("RouteIdentical", f"{ro['identicalDecisionRate']:.4f}"),
    tex_cmd("RoutePermSame", f"{ro['catalogPermutationSameSelectionRate']:.4f}"),
    tex_cmd("RouteViolations", ro["selectedViolatingPolicy"]),
    tex_cmd("RouteFalseNo", ro["noRouteDespiteFeasibleCandidate"]),
    tex_cmd("RouteRequests", ro["requests"]),
    tex_cmd("TamperBase", ta["baseReceipts"]),
    tex_cmd("TamperAttacks", ta["attackCases"]),
    tex_cmd("TamperRejected", ta["attackRejected"]),
    tex_cmd("ReplayRuns", runs),
    tex_cmd("ReplayVerified", verified),
    tex_cmd("ReplayHash", matched),
    tex_cmd("ReplayLive", live),
    tex_cmd("ReplayAltered", altered),
    tex_cmd("LeakRows", len(po["leakage"])),
    tex_cmd("LeakHits", len(leaked)),
]
if v16:
    fun_defs += [new_cmd("VerifierChecks", v16["checks"]), new_cmd("VerifierChecksPassed", v16["passed"])]
header = [
    "% Generated by eval/scripts/06-report.py. Do not edit.",
    "% Two environments. Latency macros (Eval* without Func, OverheadTrials, SignDelta*, VerifySmallMs)",
    "% come from env-latency.json (01-overhead, 02-chain). Every other macro comes from",
    "% env-functional.json (03-tamper, 04-replay, 05-policy, 07-v16, vitest counts).",
]
open(os.path.join(paper, "numbers.tex"), "w").write("\n".join(header + lat_defs + fun_defs) + "\n")
for src, dst in (("overhead.png", "Fig2.png"), ("chain_scaling.png", "Fig3.png"), ("pii_by_label.png", "Fig4.png")):
    shutil.copy(os.path.join(R, src), os.path.join(paper, dst))

oc = mc.get("originalCommittedLabels")
summary = [
    "# Evaluation summary",
    "",
    "Generated by eval/scripts/06-report.py from the JSON in this directory. Do not edit.",
    "",
    "## Environments",
    "",
    f"- Latency (env-latency.json; 01-overhead, 02-chain, overhead/size/chain tables, Fig2-3): Node {env['node']}, {env['cpu']} x{env['cores']}, {env['totalMemGB']} GB, {env['platform']}, Lattice {env['latticeVersion']}, commit {env.get('gitCommit','')}, {env['date']}",
    f"- Functional (env-functional.json; 03-tamper, 04-replay, 05-policy, 07-v16, test counts, Fig4): Node {fenv['node']}, {fenv['cpu']} x{fenv['cores']}, {fenv['totalMemGB']} GB, {fenv['platform']}, Lattice {fenv['latticeVersion']}, library commit {fenv.get('libraryCommit', fenv.get('gitCommit',''))}, {fenv['date']}",
    "- The functional scripts ran against the library at the functional commit. The latency numbers come from the latency run.",
    "",
    "## Latency (latency environment)",
    "",
    f"- Signing p50 delta {small}: {delta(small):.3f} ms; {image}: {delta(image):.3f} ms; verify p50 {small}: {get(small, 'verify', 'p50'):.3f} ms ({ov['trials']} trials)",
    "",
    "## Functional (functional environment)",
    "",
    f"- Tests: lattice {tl}, cli {tc} as (passed, failed, total, suites)",
    f"- Tamper attacks rejected: {ta['attackRejected']}/{ta['attackCases']} on {ta['baseReceipts']} receipts",
    f"- Replay runs/verified/hash/live/altered: {runs}/{verified}/{matched}/{live}/{altered} (verified with fixtures/keyset.json)",
    f"- PII in-scope, all negatives: precision {pii_in['precision']} recall {pii_in['recall']} fp {pii_in['fp']} fn {pii_in['fn']} n {pii_in['n']}",
    f"- PII in-scope, original negatives only: precision {pget('inScopeOnly_originalNegatives')['precision']} recall {pget('inScopeOnly_originalNegatives')['recall']} n {pget('inScopeOnly_originalNegatives')['n']}",
    f"- PII all types, all negatives: precision {pii_all['precision']} recall {pii_all['recall']} n {pii_all['n']}",
    f"- PII all types, original negatives only: precision {pget('overall_originalNegatives')['precision']} recall {pget('overall_originalNegatives')['recall']}",
    f"- PII original labels only (in-scope): precision {pget('originalLabels_inScope')['precision']} recall {pget('originalLabels_inScope')['recall']} fn {pget('originalLabels_inScope')['fn']} n {pget('originalLabels_inScope')['n']}",
    f"- PII added labels only (in-scope): precision {pget('newLabels_inScope')['precision']} recall {pget('newLabels_inScope')['recall']} fp {pget('newLabels_inScope')['fp']} fn {pget('newLabels_inScope')['fn']} n {pget('newLabels_inScope')['n']}",
    f"- Added uncued numeric negatives: {nl.get('fp', 0)}/{nl.get('n', 0)} flagged",
    f"- mustCite agree {mc['agree']}/{mc['cases']}" + (f"; default {mc['byMode']['default']['agree']}/{mc['byMode']['default']['cases']}, opt-in {mc['byMode']['optIn']['agree']}/{mc['byMode']['optIn']['cases']}" if "byMode" in mc else "") + (f"; original cases {mc['original']['agree']}/{mc['original']['cases']}; original cases against prose-by-default labels {oc['agree']}/{oc['cases']} (labels differ for {', '.join(oc['relabeled'])})" if oc else ""),
    f"- Verifier/closure/crew checks (07-v16): {v16['passed']}/{v16['checks']} pass" if v16 else "- Verifier checks: v16.json missing",
    f"- Routing identical {ro['identicalDecisionRate']} permutation-same {ro['catalogPermutationSameSelectionRate']} violations {ro['selectedViolatingPolicy']} false-no-route {ro['noRouteDespiteFeasibleCandidate']}",
    f"- Signed-byte marker leaks: {len(leaked)}/{len(po['leakage'])}",
    "",
    "## Not committed (regenerate locally)",
    "",
    "- `*_raw.csv` (per-sample rows; pii_raw.csv holds synthetic card and SSN strings), `fixtures/` (04-replay, with keyset.json), `tests-lattice*.json` and `tests-lattice*.log` (vitest). See eval/README.md.",
    "",
]
open(os.path.join(R, "SUMMARY.md"), "w").write("\n".join(summary))
print("ok", tl, tc)
