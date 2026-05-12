/**
 * Tests for `packages/lattice-cli/src/commands/eval.ts` — the `lattice eval`
 * citty subcommand handler.
 *
 * All cases use mock-argv style: `runEval(args, deps)` is called directly with
 * captured stdout/stderr/exit. Per CONTEXT.md "Output Format" and the exit
 * code matrix:
 *
 *   - stdout: ONE line containing JSON.stringify(report); `report.exitCode`
 *     reflects the process exit code.
 *   - stderr: human-readable lines (one per fixture + final SUMMARY); FAIL
 *     lines appear ONLY on exit 2.
 *   - Exit 0: no regression; Exit 1: any regression; Exit 2: load/session fail.
 *
 * Cases:
 *   1.  Pass run                       -> exit 0, all match
 *   2.  Regression run                 -> exit 1, regressed > 0
 *   3.  Empty fixtures dir             -> exit 0, total=0
 *   4.  Baseline missing               -> exit 2, FAIL kind=baseline-missing
 *   5.  Keyset missing                 -> exit 2, FAIL kind=keyset-missing
 *   6.  Receipts dir missing           -> exit 2, FAIL kind=receipt-missing
 *   7.  --init-baseline writes new     -> exit 0, writeBaseline invoked
 *   8.  --init-baseline write fails    -> exit 2, FAIL kind=baseline-write-failed
 *   9.  Stdout discipline (no hashes)  -> JSON has costUsd, NO fingerprints/hashes
 *   10. Default config                 -> buildConfig defaults all CONTEXT.md flags
 */

import { describe, expect, it } from "vitest";

import { runEval, type EvalDeps, type RunEvalArgs } from "../src/commands/eval.js";
import type { BaselineLoadError } from "../src/eval/baseline.js";
import type { EvalRunReport, FixtureReport } from "../src/eval/types.js";
import type { KeysetLoadError } from "../src/io/keyset-loader.js";
import type { ReceiptLoadError } from "../src/io/receipt-loader.js";

interface CaptureBag {
  readonly stdout: string[];
  readonly stderr: string[];
  readonly writeBaselineCalls: Array<{ path: string; baseline: unknown }>;
  exitCode: number | null;
}

function captureDeps(
  overrides: Partial<EvalDeps> = {},
): { deps: EvalDeps; bag: CaptureBag } {
  const bag: CaptureBag = {
    stdout: [],
    stderr: [],
    writeBaselineCalls: [],
    exitCode: null,
  };
  const deps: EvalDeps = {
    stdout: (line) => bag.stdout.push(line),
    stderr: (line) => bag.stderr.push(line),
    exit: (code) => {
      bag.exitCode = code;
    },
    ...overrides,
  };
  return { deps, bag };
}

function fixtureReport(
  fixtureId: string,
  verdict: FixtureReport["verdict"],
  regressionKind: FixtureReport["regressionKind"] = null,
  overrides: Partial<FixtureReport> = {},
): FixtureReport {
  return {
    fixtureId,
    verdict,
    regressionKind,
    usage: {
      costUsd: "0.000125",
      promptTokens: 100,
      completionTokens: 50,
    },
    qualityScore: null,
    deltaCostPct: 0,
    deltaQuality: null,
    loadFailedReason: null,
    ...overrides,
  };
}

function reportFromFixtures(
  fixtures: readonly FixtureReport[],
  summary: { regressed: number; newFixtures?: number },
): EvalRunReport {
  const total = fixtures.length;
  const passed = fixtures.filter((f) => f.verdict === "match").length;
  return {
    version: "lattice-eval/v1",
    ranAt: "2026-05-11T00:00:00.000Z",
    fixturesDir: ".lattice/receipts",
    baselinePath: ".lattice/baseline.json",
    fixtures,
    summary: {
      total,
      passed,
      regressed: summary.regressed,
      newFixtures: summary.newFixtures ?? 0,
    },
    exitCode: 0,
    tripwireOutcomes: [],
  };
}

describe("lattice eval handler (commands/eval.ts)", () => {
  it("Test 1: pass run -> exit 0, SUMMARY total=2 passed=2 regressed=0", async () => {
    const report = reportFromFixtures(
      [fixtureReport("a", "match"), fixtureReport("b", "match")],
      { regressed: 0 },
    );
    const { deps, bag } = captureDeps({
      runSession: async () => report,
      now: () => "2026-05-11T00:00:00.000Z",
    });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(0);
    expect(bag.stdout).toHaveLength(1);
    const parsed = JSON.parse(bag.stdout[0]!) as EvalRunReport;
    expect(parsed.exitCode).toBe(0);
    expect(parsed.summary).toEqual({
      total: 2,
      passed: 2,
      regressed: 0,
      newFixtures: 0,
    });
    expect(
      bag.stderr.some((l) =>
        l.startsWith("SUMMARY total=2 passed=2 regressed=0 newFixtures=0"),
      ),
    ).toBe(true);
  });

  it("Test 2: regression run -> exit 1, JSON exitCode=1, SUMMARY regressed=1", async () => {
    const report = reportFromFixtures(
      [
        fixtureReport("a", "match"),
        fixtureReport("b", "regression", "cost-regression", {
          deltaCostPct: 0.5,
        }),
      ],
      { regressed: 1 },
    );
    const { deps, bag } = captureDeps({ runSession: async () => report });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(1);
    const parsed = JSON.parse(bag.stdout[0]!) as EvalRunReport;
    expect(parsed.exitCode).toBe(1);
    expect(parsed.summary.regressed).toBe(1);
    expect(
      bag.stderr.some((l) =>
        l.startsWith("SUMMARY total=2 passed=1 regressed=1 newFixtures=0"),
      ),
    ).toBe(true);
  });

  it("Test 3: empty fixtures dir -> exit 0, total=0 newFixtures=0", async () => {
    const report = reportFromFixtures([], { regressed: 0 });
    const { deps, bag } = captureDeps({ runSession: async () => report });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(0);
    const parsed = JSON.parse(bag.stdout[0]!) as EvalRunReport;
    expect(parsed.exitCode).toBe(0);
    expect(parsed.summary).toEqual({
      total: 0,
      passed: 0,
      regressed: 0,
      newFixtures: 0,
    });
    expect(
      bag.stderr.some((l) => l.startsWith("SUMMARY total=0 passed=0 regressed=0 newFixtures=0")),
    ).toBe(true);
  });

  it("Test 4: baseline missing -> exit 2, FAIL kind=baseline-missing reason=...", async () => {
    // The runner wraps BaselineLoadError with `source: "baseline"` so the
    // handler can disambiguate it from a structurally-identical KeysetLoadError.
    const err: BaselineLoadError & { source: "baseline" } = {
      kind: "missing",
      path: "/tmp/baseline.json",
      message: "ENOENT",
      source: "baseline",
    };
    const { deps, bag } = captureDeps({
      runSession: async () => {
        throw err;
      },
    });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(2);
    expect(bag.stderr.some((l) => l.startsWith("FAIL kind=baseline-missing reason="))).toBe(true);
    expect(bag.stdout).toHaveLength(0);
  });

  it("Test 5: keyset missing -> exit 2, FAIL kind=keyset-missing reason=...", async () => {
    // The runner wraps KeysetLoadError with `source: "keyset"` so the handler
    // can disambiguate it from a structurally-identical BaselineLoadError.
    const err: KeysetLoadError & { source: "keyset" } = {
      kind: "missing",
      path: "/tmp/keyset.json",
      message: "ENOENT",
      source: "keyset",
    };
    const { deps, bag } = captureDeps({
      runSession: async () => {
        throw err;
      },
    });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(2);
    expect(bag.stderr.some((l) => l.startsWith("FAIL kind=keyset-missing reason="))).toBe(true);
  });

  it("Test 6: receipts dir missing -> exit 2, FAIL kind=receipt-missing", async () => {
    const err: ReceiptLoadError = {
      kind: "missing",
      resolvedPath: "/tmp/receipts",
      message: "ENOENT",
    };
    const { deps, bag } = captureDeps({
      runSession: async () => {
        throw err;
      },
    });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(2);
    expect(bag.stderr.some((l) => l.startsWith("FAIL kind=receipt-missing reason="))).toBe(true);
  });

  it("Test 7: --init-baseline writes new baseline, exits 0, captures Baseline", async () => {
    const report = reportFromFixtures(
      [
        fixtureReport("alpha", "match", null, {
          qualityScore: 0.95,
          usage: { costUsd: "0.0005", promptTokens: 10, completionTokens: 5 },
        }),
      ],
      { regressed: 0 },
    );
    const bag: CaptureBag = {
      stdout: [],
      stderr: [],
      writeBaselineCalls: [],
      exitCode: null,
    };
    const deps: EvalDeps = {
      stdout: (line) => bag.stdout.push(line),
      stderr: (line) => bag.stderr.push(line),
      exit: (code) => {
        bag.exitCode = code;
      },
      runSession: async () => report,
      writeBaseline: async (path, baseline) => {
        bag.writeBaselineCalls.push({ path, baseline });
      },
      now: () => "2026-05-11T00:00:00.000Z",
    };
    await runEval({ initBaseline: true }, deps);
    expect(bag.exitCode).toBe(0);
    expect(bag.writeBaselineCalls).toHaveLength(1);
    const call = bag.writeBaselineCalls[0]!;
    expect(call.path).toBe(".lattice/baseline.json");
    const written = call.baseline as {
      version: string;
      recordedAt: string;
      fixtures: Record<string, unknown>;
    };
    expect(written.version).toBe("lattice-eval/v1");
    expect(written.recordedAt).toBe("2026-05-11T00:00:00.000Z");
    expect(written.fixtures).toHaveProperty("alpha");
    const parsed = JSON.parse(bag.stdout[0]!) as EvalRunReport;
    expect(parsed.exitCode).toBe(0);
  });

  it("Test 8: --init-baseline write failure -> exit 2, FAIL kind=baseline-write-failed", async () => {
    const report = reportFromFixtures([fixtureReport("a", "match")], { regressed: 0 });
    const { deps, bag } = captureDeps({
      runSession: async () => report,
      writeBaseline: async () => {
        throw new Error("EACCES: permission denied");
      },
      now: () => "2026-05-11T00:00:00.000Z",
    });
    await runEval({ initBaseline: true }, deps);
    expect(bag.exitCode).toBe(2);
    expect(
      bag.stderr.some((l) => l.startsWith("FAIL kind=baseline-write-failed reason=")),
    ).toBe(true);
  });

  it("Test 9: stdout discipline -> JSON contains usage.costUsd, no fingerprints/hashes", async () => {
    const report = reportFromFixtures(
      [
        fixtureReport("a", "regression", "cost-regression", {
          deltaCostPct: 1.5,
          usage: {
            costUsd: "0.001234",
            promptTokens: 100,
            completionTokens: 50,
          },
        }),
      ],
      { regressed: 1 },
    );
    const { deps, bag } = captureDeps({ runSession: async () => report });
    await runEval({}, deps);
    expect(bag.exitCode).toBe(1);
    expect(bag.stdout).toHaveLength(1);
    const stdoutLine = bag.stdout[0]!;
    expect(stdoutLine).toContain("\"costUsd\":\"0.001234\"");
    // Stdout JSON should NOT contain model fingerprints / raw output hashes
    expect(stdoutLine).not.toContain("fingerprint");
    expect(stdoutLine).not.toContain("outputHash");
    // Stderr lines should not leak fingerprint either
    for (const line of bag.stderr) {
      expect(line).not.toContain("fingerprint");
      expect(line).not.toContain("outputHash");
    }
  });

  it("Test 10: defaults — all CONTEXT.md flags fall to documented defaults", async () => {
    let capturedConfig: unknown;
    const report = reportFromFixtures([], { regressed: 0 });
    const { deps, bag } = captureDeps({
      runSession: async (config) => {
        capturedConfig = config;
        return report;
      },
    });
    const args: RunEvalArgs = {};
    await runEval(args, deps);
    expect(bag.exitCode).toBe(0);
    const cfg = capturedConfig as {
      fixturesDir: string;
      baselinePath: string;
      judgeCacheDir: string;
      artifactsDir: string;
      sidecarsDir: string;
      costTolerance: number;
      qualityTolerance: number;
      judgeN: number;
      initBaseline: boolean;
    };
    expect(cfg.fixturesDir).toBe(".lattice/receipts");
    expect(cfg.baselinePath).toBe(".lattice/baseline.json");
    expect(cfg.judgeCacheDir).toBe(".lattice/judge-cache");
    expect(cfg.artifactsDir).toBe(".lattice/fixtures");
    expect(cfg.sidecarsDir).toBe(".lattice/sidecars");
    expect(cfg.costTolerance).toBeCloseTo(0.1, 10);
    expect(cfg.qualityTolerance).toBeCloseTo(0.05, 10);
    expect(cfg.judgeN).toBe(3);
    expect(cfg.initBaseline).toBe(false);
  });

  it("Test 11 (Plan 13.1-02): --sidecar-dir flag overrides the default", async () => {
    let capturedConfig: unknown;
    const report = reportFromFixtures([], { regressed: 0 });
    const { deps, bag } = captureDeps({
      runSession: async (config) => {
        capturedConfig = config;
        return report;
      },
    });
    await runEval({ sidecarDir: "/custom/sidecars" }, deps);
    expect(bag.exitCode).toBe(0);
    const cfg = capturedConfig as { sidecarsDir: string };
    expect(cfg.sidecarsDir).toBe("/custom/sidecars");
  });
});
