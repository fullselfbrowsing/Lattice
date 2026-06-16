/**
 * `lattice eval [--fixtures <dir>] [--baseline <path>] [--key <keyset>]
 *               [--judge-cache <dir>] [--artifacts <dir>] [--init-baseline]
 *               [--cost-tolerance <n>] [--quality-tolerance <n>]
 *               [--judge-n <n>] [--judge-prompt <s>]`
 *
 * CI gate: walks `.lattice/receipts/`, replays each receipt offline against
 * its recorded artifacts, gates baseline-relative cost and quality regressions
 * with layered determinism classes, and prints a structured JSON report on
 * stdout for programmatic consumers (with human-readable lines on stderr).
 *
 * Exit-code matrix (CONTEXT.md "Subcommand Shape"):
 *   - 0 : session completed AND `summary.regressed === 0` (includes empty
 *         fixtures dir per CONTEXT.md — no fixtures is not an error).
 *   - 0 : `--init-baseline` ran AND writeBaseline succeeded.
 *   - 1 : session completed AND `summary.regressed > 0`.
 *   - 2 : session aborted before producing a report — keyset/baseline/receipts
 *         dir missing or malformed, OR --init-baseline write failed.
 *
 * Output streams:
 *   - stdout : ONE line, `JSON.stringify(report)`. `report.exitCode` mirrors
 *              the process exit code (set BEFORE serialization).
 *   - stderr : one human line per fixture (`<id> verdict=... regressionKind=...
 *              deltaCostPct=... deltaQuality=...`) followed by a final
 *              `SUMMARY total=<n> passed=<n> regressed=<n> newFixtures=<n>`
 *              aggregate line. On exit 2, stderr emits ONLY the
 *              `FAIL kind=<kind> reason=<msg>` line (no fixture lines, no
 *              JSON on stdout) — there is no report to render.
 *
 * Redaction discipline (CLI-05): the JSON report surfaces `usage.costUsd` as
 * a string (Plan 12-01's I-JSON decision) but NEVER emits input/output hashes
 * or model fingerprints. Drift surfaces as `regressionKind:
 * "output-hash-mismatch"` — the raw hashes stay inside the receipt.
 *
 * Tested via `runEval(args, deps)` with captured stdout/stderr/exit (mock
 * argv pattern from Phase 11's repro/verify handlers). `deps.runSession`,
 * `deps.writeBaseline`, and `deps.now` are injection points for unit tests.
 */

import { defineCommand } from "citty";

import {
  isAgentEvalLoadError,
  runAgentEvalSession,
  writeAgentEvalBaseline as defaultWriteAgentBaseline,
  type AgentEvalRunnerDeps,
} from "../eval/agent-runner.js";
import type {
  AgentEvalBaselineFile,
  AgentEvalConfig,
  AgentEvalRunReport,
} from "../eval/agent-types.js";
import {
  isBaselineLoadError,
  writeBaseline as defaultWriteBaseline,
  type Baseline,
  type BaselineEntry,
} from "../eval/baseline.js";
import {
  runEvalSession,
  type EvalRunnerDeps,
} from "../eval/runner.js";
import type { EvalConfig, EvalRunReport } from "../eval/types.js";
import { isKeysetLoadError } from "../io/keyset-loader.js";
import { isReceiptLoadError } from "../io/receipt-loader.js";

export interface EvalDeps {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
  /** Test injection: override the runner. Defaults to `runEvalSession`. */
  readonly runSession?: (
    config: EvalConfig,
    runnerDeps?: EvalRunnerDeps,
  ) => Promise<EvalRunReport>;
  /** Test injection: override the baseline writer. Defaults to `writeBaseline`. */
  readonly writeBaseline?: (path: string, baseline: Baseline) => Promise<void>;
  /** Test injection: override the agent baseline writer. */
  readonly writeAgentBaseline?: (
    path: string,
    baseline: AgentEvalBaselineFile,
  ) => Promise<void>;
  /** Test injection: lock `recordedAt` for snapshots. Defaults to `Date.now()`. */
  readonly now?: () => string;
  /** Test injection: forwarded to the runner. */
  readonly runnerDeps?: EvalRunnerDeps;
  /** Test injection: override the agent-eval runner. Defaults to `runAgentEvalSession`. */
  readonly runAgentSession?: (
    config: AgentEvalConfig,
    runnerDeps?: AgentEvalRunnerDeps,
  ) => Promise<AgentEvalRunReport>;
  /** Test injection: forwarded to the agent-eval runner. */
  readonly agentRunnerDeps?: AgentEvalRunnerDeps;
}

const defaultDeps: EvalDeps = {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
  exit: (code) => {
    process.exit(code);
  },
};

export interface RunEvalArgs {
  readonly agent?: boolean;
  readonly fixtures?: string;
  readonly baseline?: string;
  readonly key?: string;
  readonly judgeCache?: string;
  readonly artifacts?: string;
  /**
   * Directory holding `<receipt-id>.json` sidecars (Plan 13.1-02). Default
   * `.lattice/sidecars`. Each fixture's sidecar (when present) is applied to
   * `materializeReplayEnvelope` so the cost-regression gate is reachable;
   * fixtures without a sidecar surface as `verdict: "load-failed"` with
   * `loadFailedReason: "no-sidecar"`.
   */
  readonly sidecarDir?: string;
  readonly initBaseline?: boolean;
  readonly costTolerance?: number;
  readonly qualityTolerance?: number;
  readonly iterationsTolerance?: number;
  readonly judgeN?: number;
  readonly judgePrompt?: string;
}

/**
 * Build an `EvalConfig` from `RunEvalArgs` with all CONTEXT.md defaults
 * filled in. Exposed for tests so the default surface is asserted directly.
 */
export function buildEvalConfig(args: RunEvalArgs): EvalConfig {
  const config: EvalConfig = {
    fixturesDir: args.fixtures ?? ".lattice/receipts",
    baselinePath: args.baseline ?? ".lattice/baseline.json",
    judgeCacheDir: args.judgeCache ?? ".lattice/judge-cache",
    artifactsDir: args.artifacts ?? ".lattice/fixtures",
    sidecarsDir: args.sidecarDir ?? ".lattice/sidecars",
    keyPath: args.key,
    costTolerance: args.costTolerance ?? 0.1,
    qualityTolerance: args.qualityTolerance ?? 0.05,
    judgeN: args.judgeN ?? 3,
    initBaseline: args.initBaseline ?? false,
    judgePrompt:
      args.judgePrompt ?? "Rate the quality of this output from 0 to 1.",
  };
  return config;
}

export function buildAgentEvalConfig(args: RunEvalArgs): AgentEvalConfig {
  return {
    fixturesDir: args.fixtures ?? ".lattice/agent-eval",
    baselinePath: args.baseline ?? ".lattice/agent-baseline.json",
    iterationsToGoalRegressionLimit: args.iterationsTolerance ?? 1,
    costUsdRegressionLimit: args.costTolerance ?? 0.1,
    initBaseline: args.initBaseline ?? false,
  };
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null) {
    const v = value as { message?: unknown };
    if (typeof v.message === "string") return v.message;
  }
  return String(value);
}

/**
 * Read the `source` discriminator the runner attaches when wrapping a typed
 * KeysetLoadError / BaselineLoadError. Returns `null` for unmarked errors so
 * the fallback structural guards in the handler still fire.
 */
function readErrorSource(value: unknown): "keyset" | "baseline" | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { source?: unknown };
  if (v.source === "keyset" || v.source === "baseline") return v.source;
  return null;
}

function fail(deps: EvalDeps, kind: string, reason: string, code: 1 | 2): void {
  deps.stderr(`FAIL kind=${kind} reason=${reason}`);
  deps.exit(code);
}

function emitReport(report: EvalRunReport, deps: EvalDeps): void {
  for (const f of report.fixtures) {
    const deltaCost = f.deltaCostPct === null ? "null" : String(f.deltaCostPct);
    const deltaQual = f.deltaQuality === null ? "null" : String(f.deltaQuality);
    deps.stderr(
      `${f.fixtureId} verdict=${f.verdict} regressionKind=${
        f.regressionKind ?? "none"
      } deltaCostPct=${deltaCost} deltaQuality=${deltaQual}`,
    );
  }
  deps.stderr(
    `SUMMARY total=${report.summary.total} passed=${report.summary.passed} regressed=${report.summary.regressed} newFixtures=${report.summary.newFixtures}`,
  );
  // stdout: exactly one JSON line.
  deps.stdout(JSON.stringify(report));
}

function emitAgentReport(
  report: AgentEvalRunReport,
  deps: EvalDeps,
): void {
  for (const f of report.fixtures) {
    const deltaIterations =
      f.iterationsToGoal.delta === null
        ? "null"
        : String(f.iterationsToGoal.delta);
    const deltaCost =
      f.costUsd.deltaPct === null ? "null" : String(f.costUsd.deltaPct);
    const regressionKinds =
      f.regressions.length === 0
        ? "none"
        : f.regressions.map((r) => r.kind).join(",");
    deps.stderr(
      `${f.fixtureId} verdict=${f.verdict} regressions=${regressionKinds} deltaIterations=${deltaIterations} deltaCostPct=${deltaCost}`,
    );
  }
  deps.stderr(
    `SUMMARY total=${report.summary.total} passed=${report.summary.passed} regressed=${report.summary.regressed} newFixtures=${report.summary.newFixtures}`,
  );
  deps.stdout(JSON.stringify(report));
}

async function runAgentEval(
  args: RunEvalArgs,
  deps: EvalDeps,
): Promise<void> {
  const config = buildAgentEvalConfig(args);
  const runSession = deps.runAgentSession ?? runAgentEvalSession;
  const writeAgentBaselineFn = deps.writeAgentBaseline ?? defaultWriteAgentBaseline;
  const now = deps.now ?? (() => new Date().toISOString());

  let report: AgentEvalRunReport;
  try {
    const runnerDeps: AgentEvalRunnerDeps = {
      ...(deps.agentRunnerDeps ?? {}),
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    };
    report = await runSession(config, runnerDeps);
  } catch (err) {
    if (isAgentEvalLoadError(err)) {
      return fail(
        deps,
        `agent-eval-${err.kind}`,
        `${err.path}: ${err.message}`,
        2,
      );
    }
    return fail(deps, "agent-eval-session-failed", readErrorMessage(err), 2);
  }

  if (config.initBaseline === true) {
    const baseline: AgentEvalBaselineFile = {
      version: "lattice-agent-eval-baseline/v1",
      recordedAt: now(),
      fixtures: Object.fromEntries(
        report.fixtures.map((fixture) => [fixture.fixtureId, fixture.current]),
      ),
    };

    try {
      await writeAgentBaselineFn(config.baselinePath, baseline);
    } catch (err) {
      return fail(
        deps,
        "agent-baseline-write-failed",
        readErrorMessage(err),
        2,
      );
    }

    const finalReport: AgentEvalRunReport = { ...report, exitCode: 0 };
    emitAgentReport(finalReport, deps);
    deps.exit(0);
    return;
  }

  const exitCode: 0 | 1 = report.summary.regressed > 0 ? 1 : 0;
  const finalReport: AgentEvalRunReport = { ...report, exitCode };
  emitAgentReport(finalReport, deps);
  deps.exit(exitCode);
}

/**
 * Testable handler. Pure with respect to `deps`. All output flows through
 * `deps.stdout`/`deps.stderr`/`deps.exit`; the function returns `void` after
 * `deps.exit` is invoked.
 */
export async function runEval(
  args: RunEvalArgs,
  deps: EvalDeps = defaultDeps,
): Promise<void> {
  if (args.agent === true) {
    await runAgentEval(args, deps);
    return;
  }

  const config = buildEvalConfig(args);
  const runSession = deps.runSession ?? runEvalSession;
  const writeBaselineFn = deps.writeBaseline ?? defaultWriteBaseline;
  const now = deps.now ?? (() => new Date().toISOString());

  // Run the session. Typed load errors (baseline/keyset/receipt) and any
  // unexpected throw collapse to exit 2 with a FAIL line; the citty boundary
  // never sees an uncaught exception.
  let report: EvalRunReport;
  try {
    const runnerDeps: EvalRunnerDeps = {
      ...(deps.runnerDeps ?? {}),
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    };
    report = await runSession(config, runnerDeps);
  } catch (err) {
    // KeysetLoadError and BaselineLoadError share an identical structural
    // shape (`{ kind, path, message }`). The runner wraps them with a
    // `source: "keyset" | "baseline"` discriminator before re-throwing so
    // this boundary can route correctly to FAIL kind=keyset-... vs
    // FAIL kind=baseline-... — the structural guards alone would always
    // match the FIRST checked type.
    const source = readErrorSource(err);
    if (source === "keyset" && isKeysetLoadError(err)) {
      return fail(
        deps,
        `keyset-${err.kind}`,
        `${err.path}: ${err.message}`,
        2,
      );
    }
    if (source === "baseline" && isBaselineLoadError(err)) {
      return fail(
        deps,
        `baseline-${err.kind}`,
        `${err.path}: ${err.message}`,
        2,
      );
    }
    if (isReceiptLoadError(err)) {
      return fail(
        deps,
        `receipt-${err.kind}`,
        `${err.resolvedPath}: ${err.message}`,
        2,
      );
    }
    // Unwrapped (test-direct) typed errors still resolve correctly: the
    // structural guards remain a fallback for cases where the runner is
    // bypassed in unit tests.
    if (isBaselineLoadError(err)) {
      return fail(
        deps,
        `baseline-${err.kind}`,
        `${err.path}: ${err.message}`,
        2,
      );
    }
    if (isKeysetLoadError(err)) {
      return fail(
        deps,
        `keyset-${err.kind}`,
        `${err.path}: ${err.message}`,
        2,
      );
    }
    return fail(deps, "session-failed", readErrorMessage(err), 2);
  }

  // --init-baseline: write a new baseline from the current run AND exit 0.
  // Per CONTEXT.md "Baseline-Relative Gating": this is the documented way to
  // bootstrap a baseline. The runner returned every fixture as verdict=match
  // (initBaseline mode skips baseline loading); we project per-fixture
  // usage+qualityScore into BaselineEntry shape.
  if (config.initBaseline) {
    const entries: Record<string, BaselineEntry> = {};
    for (const f of report.fixtures) {
      if (f.verdict === "load-failed" || f.usage === null) continue;
      entries[f.fixtureId] = {
        usage: f.usage,
        qualityFloor:
          f.qualityScore !== null ? { score: f.qualityScore } : null,
      };
    }
    const baseline: Baseline = {
      version: "lattice-eval/v1",
      recordedAt: now(),
      fixtures: entries,
    };
    try {
      await writeBaselineFn(config.baselinePath, baseline);
    } catch (err) {
      return fail(
        deps,
        "baseline-write-failed",
        readErrorMessage(err),
        2,
      );
    }
    const finalReport: EvalRunReport = { ...report, exitCode: 0 };
    emitReport(finalReport, deps);
    deps.exit(0);
    return;
  }

  // Standard mode: regressed > 0 -> exit 1, else exit 0.
  const exitCode: 0 | 1 = report.summary.regressed > 0 ? 1 : 0;
  const finalReport: EvalRunReport = { ...report, exitCode };
  emitReport(finalReport, deps);
  deps.exit(exitCode);
}

export default defineCommand({
  meta: {
    name: "eval",
    description:
      "Gate receipt replay or agent-run regressions for CI.",
  },
  args: {
    agent: {
      type: "boolean",
      description:
        "Run agent snapshot eval instead of receipt replay eval.",
    },
    fixtures: {
      type: "string",
      description:
        "Directory of receipts or agent fixtures to evaluate.",
    },
    baseline: {
      type: "string",
      description:
        "Baseline JSON path for receipt or agent eval.",
    },
    key: {
      type: "string",
      description:
        "Keyset JSON path used to verify each receipt (default: ~/.lattice/keyset.json).",
    },
    "judge-cache": {
      type: "string",
      description: "Judge cache directory (default: .lattice/judge-cache/).",
    },
    artifacts: {
      type: "string",
      description:
        "Artifact bodies directory used for offline replay (default: .lattice/fixtures/).",
    },
    "sidecar-dir": {
      type: "string",
      description:
        "Directory holding `<receipt-id>.json` sidecars. Default: .lattice/sidecars/.",
    },
    "init-baseline": {
      type: "boolean",
      description:
        "Write this run's per-fixture entries as a new baseline and exit 0, instead of gating.",
    },
    "cost-tolerance": {
      type: "string",
      description:
        "Cost regression tolerance, fractional (default 0.10 = 10%).",
    },
    "quality-tolerance": {
      type: "string",
      description: "Quality regression tolerance (default 0.05).",
    },
    "iterations-tolerance": {
      type: "string",
      description:
        "Agent iterations-to-goal regression tolerance (default 1).",
    },
    "judge-n": {
      type: "string",
      description:
        "Judge repetitions for the N=median aggregation (default 3).",
    },
    "judge-prompt": {
      type: "string",
      description:
        "Prompt forwarded to the judge (default: a generic rating prompt).",
    },
  },
  async run({ args }) {
    // exactOptionalPropertyTypes: spread conditionally so citty's
    // `string | undefined` parsed args don't reach RunEvalArgs's `?:` slots
    // as explicit `undefined`.
    const callArgs: RunEvalArgs = {
      ...(args.agent === true ? { agent: true } : {}),
      ...(args.fixtures !== undefined ? { fixtures: args.fixtures } : {}),
      ...(args.baseline !== undefined ? { baseline: args.baseline } : {}),
      ...(args.key !== undefined ? { key: args.key } : {}),
      ...(args["judge-cache"] !== undefined
        ? { judgeCache: args["judge-cache"] }
        : {}),
      ...(args.artifacts !== undefined ? { artifacts: args.artifacts } : {}),
      ...(args["sidecar-dir"] !== undefined
        ? { sidecarDir: args["sidecar-dir"] }
        : {}),
      ...(args["init-baseline"] === true ? { initBaseline: true } : {}),
      ...(args["cost-tolerance"] !== undefined
        ? { costTolerance: Number(args["cost-tolerance"]) }
        : {}),
      ...(args["quality-tolerance"] !== undefined
        ? { qualityTolerance: Number(args["quality-tolerance"]) }
        : {}),
      ...(args["iterations-tolerance"] !== undefined
        ? { iterationsTolerance: Number(args["iterations-tolerance"]) }
        : {}),
      ...(args["judge-n"] !== undefined
        ? { judgeN: Number(args["judge-n"]) }
        : {}),
      ...(args["judge-prompt"] !== undefined
        ? { judgePrompt: args["judge-prompt"] }
        : {}),
    };
    await runEval(callArgs);
  },
});
