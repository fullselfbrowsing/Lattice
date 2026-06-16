import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  evalAgentRun,
  type AgentRunSnapshot,
  type EvalOptions,
  type Usage,
} from "@full-self-browsing/lattice";

import type {
  AgentEvalBaselineFile,
  AgentEvalConfig,
  AgentEvalCostOutcome,
  AgentEvalFixtureFile,
  AgentEvalFixtureReport,
  AgentEvalIterationOutcome,
  AgentEvalLoadError,
  AgentEvalRunReport,
} from "./agent-types.js";

export interface AgentEvalRunnerDeps {
  readonly now?: () => string;
}

const FIXTURE_VERSION = "lattice-agent-eval-fixture/v1";
const BASELINE_VERSION = "lattice-agent-eval-baseline/v1";
const JSON_SUFFIX = ".json";

export function isAgentEvalLoadError(
  value: unknown,
): value is AgentEvalLoadError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "missing" && v.kind !== "malformed") return false;
  return typeof v.path === "string" && typeof v.message === "string";
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null) {
    const v = value as { message?: unknown };
    if (typeof v.message === "string") return v.message;
  }
  return String(value);
}

function loadError(
  kind: AgentEvalLoadError["kind"],
  path: string,
  message: string,
): AgentEvalLoadError {
  return { kind, path, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isCost(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function assertUsage(value: unknown, path: string): asserts value is Usage {
  if (!isObject(value)) {
    throw loadError("malformed", path, "usage must be an object.");
  }
  if (!isNonNegativeInteger(value.promptTokens)) {
    throw loadError(
      "malformed",
      path,
      "usage.promptTokens must be a non-negative integer.",
    );
  }
  if (!isNonNegativeInteger(value.completionTokens)) {
    throw loadError(
      "malformed",
      path,
      "usage.completionTokens must be a non-negative integer.",
    );
  }
  if (!isCost(value.costUsd)) {
    throw loadError(
      "malformed",
      path,
      "usage.costUsd must be a non-negative number or null.",
    );
  }
}

function assertSnapshot(
  value: unknown,
  path: string,
): asserts value is AgentRunSnapshot {
  if (!isObject(value)) {
    throw loadError("malformed", path, "snapshot must be an object.");
  }
  if (!isNonNegativeInteger(value.iterationsToGoal)) {
    throw loadError(
      "malformed",
      path,
      "snapshot.iterationsToGoal must be a non-negative integer.",
    );
  }
  assertUsage(value.usage, path);
}

function assertFixtureFile(
  value: unknown,
  path: string,
): asserts value is AgentEvalFixtureFile {
  if (!isObject(value)) {
    throw loadError("malformed", path, "fixture must be an object.");
  }
  if (value.version !== FIXTURE_VERSION) {
    throw loadError(
      "malformed",
      path,
      `fixture.version must be ${FIXTURE_VERSION}.`,
    );
  }
  if (typeof value.fixtureId !== "string" || value.fixtureId.length === 0) {
    throw loadError(
      "malformed",
      path,
      "fixture.fixtureId must be a non-empty string.",
    );
  }
  assertSnapshot(value.snapshot, path);
}

function assertBaselineFile(
  value: unknown,
  path: string,
): asserts value is AgentEvalBaselineFile {
  if (!isObject(value)) {
    throw loadError("malformed", path, "baseline must be an object.");
  }
  if (value.version !== BASELINE_VERSION) {
    throw loadError(
      "malformed",
      path,
      `baseline.version must be ${BASELINE_VERSION}.`,
    );
  }
  if (!isObject(value.fixtures)) {
    throw loadError("malformed", path, "baseline.fixtures must be an object.");
  }
  for (const [fixtureId, snapshot] of Object.entries(value.fixtures)) {
    if (fixtureId.length === 0) {
      throw loadError(
        "malformed",
        path,
        "baseline fixture ids must be non-empty strings.",
      );
    }
    assertSnapshot(snapshot, path);
  }
}

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw loadError("missing", path, readErrorMessage(err));
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw loadError("malformed", path, readErrorMessage(err));
  }
}

export async function loadAgentEvalBaseline(
  path: string,
): Promise<AgentEvalBaselineFile> {
  const resolvedPath = resolve(path);
  const parsed = await readJson(resolvedPath);
  assertBaselineFile(parsed, resolvedPath);
  return parsed;
}

export async function writeAgentEvalBaseline(
  path: string,
  baseline: AgentEvalBaselineFile,
): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmpPath, JSON.stringify(baseline, null, 2), "utf8");
  await rename(tmpPath, path);
}

export async function loadAgentEvalFixture(
  path: string,
): Promise<AgentEvalFixtureFile> {
  const resolvedPath = resolve(path);
  const parsed = await readJson(resolvedPath);
  assertFixtureFile(parsed, resolvedPath);
  return parsed;
}

async function listFixturePaths(dir: string): Promise<readonly string[]> {
  const root = resolve(dir);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err) {
    throw loadError("missing", root, readErrorMessage(err));
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(JSON_SUFFIX))
    .map((entry) => join(root, entry.name))
    .sort();
}

function regressionKinds(report: {
  readonly regressions: readonly { readonly kind: string }[];
}): ReadonlySet<string> {
  return new Set(report.regressions.map((r) => r.kind));
}

function iterationOutcome(
  baseline: AgentRunSnapshot | null,
  current: AgentRunSnapshot,
  options: EvalOptions,
  kinds: ReadonlySet<string>,
): AgentEvalIterationOutcome {
  const limit = options.iterationsToGoalRegressionLimit ?? 1;
  return {
    baseline: baseline?.iterationsToGoal ?? null,
    current: current.iterationsToGoal,
    delta:
      baseline === null
        ? null
        : current.iterationsToGoal - baseline.iterationsToGoal,
    limit,
    regressed: kinds.has("iterations-to-goal"),
  };
}

function costDeltaPct(
  baseline: number | null,
  current: number | null,
): number | null {
  if (baseline === null || current === null) return null;
  if (baseline === 0) return null;
  return (current - baseline) / baseline;
}

function costOutcome(
  baseline: AgentRunSnapshot | null,
  current: AgentRunSnapshot,
  options: EvalOptions,
  kinds: ReadonlySet<string>,
): AgentEvalCostOutcome {
  const baselineCost = baseline?.usage.costUsd ?? null;
  const currentCost = current.usage.costUsd;
  return {
    baseline: baselineCost,
    current: currentCost,
    deltaPct: costDeltaPct(baselineCost, currentCost),
    limit: options.costUsdRegressionLimit ?? 0.1,
    regressed: kinds.has("cost-regression"),
    mixedCostUnknown: kinds.has("mixed-cost-unknown"),
  };
}

function buildFixtureReport(
  fixture: AgentEvalFixtureFile,
  baselineSnapshot: AgentRunSnapshot | undefined,
  options: EvalOptions,
  mode: "standard" | "init-baseline" = "standard",
): AgentEvalFixtureReport {
  if (baselineSnapshot === undefined) {
    const kinds = new Set<string>();
    return {
      fixtureId: fixture.fixtureId,
      verdict: mode === "init-baseline" ? "match" : "new-fixture",
      baseline: null,
      current: fixture.snapshot,
      regressions: [],
      iterationsToGoal: iterationOutcome(null, fixture.snapshot, options, kinds),
      costUsd: costOutcome(null, fixture.snapshot, options, kinds),
    };
  }

  const result = evalAgentRun(baselineSnapshot, fixture.snapshot, options);
  const kinds = regressionKinds(result);
  return {
    fixtureId: fixture.fixtureId,
    verdict: result.ok ? "match" : "regression",
    baseline: baselineSnapshot,
    current: fixture.snapshot,
    regressions: result.regressions,
    iterationsToGoal: iterationOutcome(
      baselineSnapshot,
      fixture.snapshot,
      options,
      kinds,
    ),
    costUsd: costOutcome(baselineSnapshot, fixture.snapshot, options, kinds),
  };
}

export async function runAgentEvalSession(
  config: AgentEvalConfig,
  deps: AgentEvalRunnerDeps = {},
): Promise<AgentEvalRunReport> {
  const now = deps.now ?? (() => new Date().toISOString());
  const baseline = config.initBaseline === true
    ? undefined
    : await loadAgentEvalBaseline(config.baselinePath);
  const fixturePaths = await listFixturePaths(config.fixturesDir);
  const options: EvalOptions = {
    ...(config.iterationsToGoalRegressionLimit !== undefined
      ? {
          iterationsToGoalRegressionLimit:
            config.iterationsToGoalRegressionLimit,
        }
      : {}),
    ...(config.costUsdRegressionLimit !== undefined
      ? { costUsdRegressionLimit: config.costUsdRegressionLimit }
      : {}),
  };

  const fixtures: AgentEvalFixtureReport[] = [];
  for (const path of fixturePaths) {
    const fixture = await loadAgentEvalFixture(path);
    fixtures.push(
      buildFixtureReport(
        fixture,
        baseline?.fixtures[fixture.fixtureId],
        options,
        config.initBaseline === true ? "init-baseline" : "standard",
      ),
    );
  }

  const passed = fixtures.filter((f) => f.verdict === "match").length;
  const regressed = fixtures.filter((f) => f.verdict === "regression").length;
  const newFixtures = fixtures.filter((f) => f.verdict === "new-fixture").length;

  return {
    version: "lattice-agent-eval/v1",
    ranAt: now(),
    fixturesDir: config.fixturesDir,
    baselinePath: config.baselinePath,
    fixtures,
    summary: {
      total: fixtures.length,
      passed,
      regressed,
      newFixtures,
    },
    exitCode: 0,
  };
}
