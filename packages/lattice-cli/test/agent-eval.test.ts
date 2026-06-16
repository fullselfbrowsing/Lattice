import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { runEval, type EvalDeps } from "../src/commands/eval.js";
import type { AgentEvalRunReport } from "../src/eval/agent-types.js";

interface CaptureBag {
  readonly stdout: string[];
  readonly stderr: string[];
  exitCode: number | null;
}

function captureDeps(): { readonly deps: EvalDeps; readonly bag: CaptureBag } {
  const bag: CaptureBag = { stdout: [], stderr: [], exitCode: null };
  return {
    bag,
    deps: {
      stdout: (line) => bag.stdout.push(line),
      stderr: (line) => bag.stderr.push(line),
      exit: (code) => {
        bag.exitCode = code;
      },
      now: () => "2026-06-16T00:00:00.000Z",
    },
  };
}

function snapshot(
  iterationsToGoal: number,
  costUsd: number | null,
): {
  readonly iterationsToGoal: number;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly costUsd: number | null;
  };
} {
  return {
    iterationsToGoal,
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      costUsd,
    },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

async function writeFixture(
  fixturesDir: string,
  fixtureId: string,
  value: unknown,
): Promise<void> {
  await writeJson(join(fixturesDir, `${fixtureId}.json`), value);
}

describe("lattice eval --agent", () => {
  let sandbox: string;
  let fixturesDir: string;
  let baselinePath: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-agent-eval-"));
    fixturesDir = join(sandbox, "fixtures");
    baselinePath = join(sandbox, "baseline.json");
    await mkdir(fixturesDir, { recursive: true });
  });

  it("passes when current snapshot stays within iteration and cost tolerances", async () => {
    await writeJson(baselinePath, {
      version: "lattice-agent-eval-baseline/v1",
      fixtures: {
        alpha: snapshot(3, 0.1),
      },
    });
    await writeFixture(fixturesDir, "alpha", {
      version: "lattice-agent-eval-fixture/v1",
      fixtureId: "alpha",
      snapshot: snapshot(4, 0.105),
    });

    const { deps, bag } = captureDeps();
    await runEval({ agent: true, fixtures: fixturesDir, baseline: baselinePath }, deps);

    expect(bag.exitCode).toBe(0);
    expect(bag.stderr.at(-1)).toBe(
      "SUMMARY total=1 passed=1 regressed=0 newFixtures=0",
    );
    const report = JSON.parse(bag.stdout[0]!) as AgentEvalRunReport;
    expect(report.version).toBe("lattice-agent-eval/v1");
    expect(report.exitCode).toBe(0);
    expect(report.fixtures[0]?.iterationsToGoal.delta).toBe(1);
    expect(report.fixtures[0]?.costUsd.deltaPct).toBeCloseTo(0.05, 10);
  });

  it("exits 1 and reports iteration plus cost regressions", async () => {
    await writeJson(baselinePath, {
      version: "lattice-agent-eval-baseline/v1",
      fixtures: {
        beta: snapshot(2, 0.1),
      },
    });
    await writeFixture(fixturesDir, "beta", {
      version: "lattice-agent-eval-fixture/v1",
      fixtureId: "beta",
      snapshot: snapshot(5, 0.2),
    });

    const { deps, bag } = captureDeps();
    await runEval(
      {
        agent: true,
        fixtures: fixturesDir,
        baseline: baselinePath,
        iterationsTolerance: 1,
        costTolerance: 0.1,
      },
      deps,
    );

    expect(bag.exitCode).toBe(1);
    const report = JSON.parse(bag.stdout[0]!) as AgentEvalRunReport;
    expect(report.summary.regressed).toBe(1);
    expect(report.fixtures[0]?.verdict).toBe("regression");
    expect(report.fixtures[0]?.regressions.map((r) => r.kind).sort()).toEqual([
      "cost-regression",
      "iterations-to-goal",
    ]);
    expect(report.fixtures[0]?.iterationsToGoal.regressed).toBe(true);
    expect(report.fixtures[0]?.costUsd.regressed).toBe(true);
  });

  it("treats missing baseline entries as new fixtures without failing CI", async () => {
    await writeJson(baselinePath, {
      version: "lattice-agent-eval-baseline/v1",
      fixtures: {},
    });
    await writeFixture(fixturesDir, "gamma", {
      version: "lattice-agent-eval-fixture/v1",
      fixtureId: "gamma",
      snapshot: snapshot(1, null),
    });

    const { deps, bag } = captureDeps();
    await runEval({ agent: true, fixtures: fixturesDir, baseline: baselinePath }, deps);

    expect(bag.exitCode).toBe(0);
    const report = JSON.parse(bag.stdout[0]!) as AgentEvalRunReport;
    expect(report.summary.newFixtures).toBe(1);
    expect(report.fixtures[0]?.verdict).toBe("new-fixture");
  });

  it("exits 2 for malformed agent fixtures and writes no JSON report", async () => {
    await writeJson(baselinePath, {
      version: "lattice-agent-eval-baseline/v1",
      fixtures: {},
    });
    await writeFixture(fixturesDir, "bad", {
      version: "wrong",
      fixtureId: "bad",
      snapshot: snapshot(1, 0),
    });

    const { deps, bag } = captureDeps();
    await runEval({ agent: true, fixtures: fixturesDir, baseline: baselinePath }, deps);

    expect(bag.exitCode).toBe(2);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=agent-eval-malformed reason=/);
  });
});
