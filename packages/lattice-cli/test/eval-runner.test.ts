/**
 * Tests for `packages/lattice-cli/src/eval/runner.ts`.
 *
 * Each test exercises one verdict / regression branch of `runEvalSession`:
 *   1.  Match path                    -> verdict=match, judge NOT invoked
 *   2.  Drift (output-hash-mismatch)  -> verdict=drift, judge NOT invoked (SHORT-CIRCUIT)
 *   3.  Cost regression on a match    -> verdict=regression, regressionKind=cost-regression
 *   4.  Quality regression on a match -> verdict=regression, regressionKind=quality-regression
 *   5.  New fixture                   -> verdict=match, newFixtures++, deltas null
 *   6.  Load-failed (malformed JSON)  -> verdict=load-failed, regressed stays 0
 *   7.  Judge cache hit               -> 2nd run reuses cache; judge calls === 3 total
 *   8.  Init-baseline mode            -> baseline not loaded; every fixture verdict=match
 *   9.  Drift + qualityFloor != null  -> judge calls === 0 (Stage 7 only runs when Stage 5 passes)
 *   10. Aggregate                     -> { total, passed, regressed, newFixtures } consistent
 *   11. Empty fixtures dir            -> empty report, summary all-zero
 *
 * The drift / quality / no-outputHash / init-baseline cases mock `lattice`
 * (specifically `replayOffline` and `verifyReceipt`) via `vi.doMock`. This is
 * the same pattern `repro.test.ts` uses for the drift branch.
 */

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  artifact,
  createAI,
  createFakeProvider,
  createInMemorySigner,
  generateEd25519KeyPairJwk,
  verifyReceipt,
  type ArtifactInput,
  type KeyEntry,
  type ReceiptEnvelope,
} from "@fullselfbrowsing/lattice";

import type { Baseline, BaselineEntry } from "../src/eval/baseline.js";
import type { Judge } from "../src/eval/judge.js";
import type { EvalConfig } from "../src/eval/types.js";
import { writeBaseline } from "../src/eval/baseline.js";

interface BuiltFixture {
  readonly envelope: ReceiptEnvelope;
  readonly outputs: Record<string, unknown>;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
}

async function buildFixture(
  kid: string,
  artifacts: readonly ArtifactInput[] = [],
): Promise<BuiltFixture> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const ai = createAI({ providers: [createFakeProvider()], signer });
  const result = await ai.run({
    task: "lattice-cli-eval-runner-fixture",
    outputs: { text: "text" as const },
    artifacts,
  });
  if (!result.ok || result.receipt === undefined) {
    throw new Error("fixture build: ai.run failed");
  }
  return {
    envelope: result.receipt,
    outputs: result.outputs as Record<string, unknown>,
    publicKeyJwk,
    kid,
  };
}

function keyEntry(kid: string, jwk: JsonWebKey): KeyEntry {
  return { kid, publicKeyJwk: jwk, state: "active" };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

function makeBaseline(fixtures: Record<string, BaselineEntry>): Baseline {
  return {
    version: "lattice-eval/v1",
    recordedAt: "2026-05-11T00:00:00.000Z",
    fixtures,
  };
}

function makeBaselineEntry(
  costUsd: string,
  qualityFloorScore: number | null = null,
): BaselineEntry {
  return {
    usage: { costUsd, promptTokens: 100, completionTokens: 50 },
    qualityFloor: qualityFloorScore === null ? null : { score: qualityFloorScore },
  };
}

function makeConfig(overrides: Partial<EvalConfig>, base: {
  fixturesDir: string;
  baselinePath: string;
  judgeCacheDir: string;
  artifactsDir: string;
  keyPath: string;
  sidecarsDir?: string;
}): EvalConfig {
  return {
    fixturesDir: base.fixturesDir,
    baselinePath: base.baselinePath,
    judgeCacheDir: base.judgeCacheDir,
    artifactsDir: base.artifactsDir,
    sidecarsDir: base.sidecarsDir ?? ".lattice/sidecars",
    keyPath: base.keyPath,
    costTolerance: 0.10,
    qualityTolerance: 0.05,
    judgeN: 3,
    initBaseline: false,
    judgePrompt: "default-judge-prompt",
    ...overrides,
  };
}

interface SandboxPaths {
  readonly sandbox: string;
  readonly receiptsDir: string;
  readonly fixturesDir: string;
  readonly judgeCacheDir: string;
  readonly sidecarsDir: string;
  readonly baselinePath: string;
  readonly keysetPath: string;
}

async function makeSandbox(): Promise<SandboxPaths> {
  const sandbox = await mkdtemp(join(tmpdir(), "lattice-eval-runner-"));
  const receiptsDir = join(sandbox, "receipts");
  const fixturesDir = join(sandbox, "fixtures");
  const judgeCacheDir = join(sandbox, "judge-cache");
  const sidecarsDir = join(sandbox, "sidecars");
  await mkdir(receiptsDir, { recursive: true });
  await mkdir(fixturesDir, { recursive: true });
  await mkdir(sidecarsDir, { recursive: true });
  return {
    sandbox,
    receiptsDir,
    fixturesDir,
    judgeCacheDir,
    sidecarsDir,
    baselinePath: join(sandbox, "baseline.json"),
    keysetPath: join(sandbox, "keyset.json"),
  };
}

/**
 * Plan 13.1-02: write a minimal valid sidecar so the runner's
 * `walkReceiptsWithSidecars` pairing yields a non-null sidecar and the
 * materialize call receives a usable `{ task, outputs, policy, contract }`
 * quadruple. Tests that intentionally exercise the "no-sidecar" branch must
 * skip calling this helper.
 */
async function writeSidecarForFixture(
  paths: SandboxPaths,
  fixtureId: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const body = {
    version: "lattice-sidecar/v1",
    task: "eval-runner-sidecar-test",
    outputs: { text: "text" },
    policy: { privacy: "sensitive" },
    contract: { kind: "capability-contract", invariants: [] },
    ...overrides,
  };
  await writeJson(join(paths.sidecarsDir, `${fixtureId}.json`), body);
}

async function seedFixtureOnDisk(
  paths: SandboxPaths,
  fixtureId: string,
  fixture: BuiltFixture,
  options: { skipSidecar?: boolean } = {},
): Promise<void> {
  await writeJson(join(paths.receiptsDir, `${fixtureId}.json`), fixture.envelope);
  // Side-channel verify to learn inputHashes.
  const verified = await verifyReceipt(fixture.envelope, {
    lookup: () => keyEntry(fixture.kid, fixture.publicKeyJwk),
  });
  if (!verified.ok) throw new Error("side-channel verify failed");
  for (const h of verified.body.inputHashes) {
    if (h === "") continue;
    await writeFile(join(paths.fixturesDir, `${h}.bin`), new Uint8Array([0xde, 0xad]));
  }
  if (options.skipSidecar !== true) {
    await writeSidecarForFixture(paths, fixtureId);
  }
}

async function writeKeyset(paths: SandboxPaths, entries: KeyEntry[]): Promise<void> {
  await writeJson(paths.keysetPath, entries);
}

/**
 * Mock `lattice`'s `replayOffline` so it returns the given outputs verbatim.
 * Without this, `replayOffline` returns `execution_unavailable` because the
 * materialized envelope lacks an `outputs` field (the receipt body alone has
 * no way to carry outputs; `repro.test.ts` uses the same trick).
 */
function mockReplayWithOutputs(outputs: Record<string, unknown>): void {
  vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
    const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
    return {
      ...mod,
      replayOffline: vi.fn(async () => ({
        ok: true,
        outputs,
        artifacts: [],
        usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
        plan: { kind: "execution-plan" },
        events: [],
      })),
    };
  });
}

describe("runEvalSession", () => {
  let saved: string;
  beforeEach(() => {
    saved = process.cwd();
    vi.resetModules();
    vi.doUnmock("@fullselfbrowsing/lattice");
  });
  afterEach(() => {
    process.chdir(saved);
    vi.doUnmock("@fullselfbrowsing/lattice");
    vi.restoreAllMocks();
  });

  it("Test 1 (match): single fixture, in baseline, cost within tolerance, no qualityFloor -> verdict=match, judge never called", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("match-kid");
    await seedFixtureOnDisk(paths, "fx-match", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-match": makeBaselineEntry("0", null) }),
    );

    mockReplayWithOutputs(fixture.outputs);

    let judgeCalls = 0;
    const judge: Judge = {
      async score() {
        judgeCalls += 1;
        return 0.99;
      },
    };

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
      { judge, now: () => "2026-05-11T00:00:00Z" },
    );

    expect(report.version).toBe("lattice-eval/v1");
    expect(report.ranAt).toBe("2026-05-11T00:00:00Z");
    expect(report.fixtures).toHaveLength(1);
    const fxReport = report.fixtures[0]!;
    expect(fxReport.fixtureId).toBe("fx-match");
    expect(fxReport.verdict).toBe("match");
    expect(fxReport.regressionKind).toBe(null);
    expect(fxReport.qualityScore).toBe(null);
    expect(judgeCalls).toBe(0);
    expect(report.summary).toEqual({ total: 1, passed: 1, regressed: 0, newFixtures: 0 });
    expect(report.tripwireOutcomes).toEqual([]);
  });

  it("Test 2 (drift): mocked replayOffline returns different outputs -> verdict=drift, regressionKind=output-hash-mismatch, judge NOT called", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("drift-kid");
    await seedFixtureOnDisk(paths, "fx-drift", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-drift": makeBaselineEntry("0", null) }),
    );

    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      return {
        ...mod,
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: { text: "DRIFTED" },
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });

    let judgeCalls = 0;
    const judge: Judge = {
      async score() {
        judgeCalls += 1;
        return 1.0;
      },
    };

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
      { judge },
    );

    expect(report.fixtures).toHaveLength(1);
    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("drift");
    expect(fxReport.regressionKind).toBe("output-hash-mismatch");
    expect(judgeCalls).toBe(0);
    expect(report.summary.regressed).toBe(1);
    expect(report.summary.passed).toBe(0);
  });

  it("Test 3 (cost regression with Exact match): replay cost > baseline * (1+tolerance) -> verdict=regression, regressionKind=cost-regression", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("cost-kid");
    await seedFixtureOnDisk(paths, "fx-cost", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);

    // Receipt body costUsd is fake provider default. Force a "cost regression"
    // by mocking verifyReceipt to return a body with a high cost. Mock
    // replayOffline as well so the materialized envelope yields the same
    // outputs that match body.outputHash (Stage 5 must pass first).
    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      const realVerify = mod.verifyReceipt;
      return {
        ...mod,
        verifyReceipt: vi.fn(async (env, ks) => {
          const result = await realVerify(env, ks);
          if (!result.ok) return result;
          return {
            ...result,
            body: {
              ...result.body,
              usage: { ...result.body.usage, costUsd: "0.001" },
            },
          };
        }),
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });

    // Baseline cost 0.0001, tolerance 0.10 → fail at 0.00011. Replay reports 0.001 → 10x over.
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-cost": makeBaselineEntry("0.0001", null) }),
    );

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("regression");
    expect(fxReport.regressionKind).toBe("cost-regression");
    expect(fxReport.deltaCostPct).not.toBeNull();
    expect(fxReport.deltaCostPct!).toBeGreaterThan(0.10);
    expect(report.summary.regressed).toBe(1);
  });

  it("Test 4 (quality regression with Exact match): judge returns 0.5, baseline 0.95 -> verdict=regression, regressionKind=quality-regression, judge calls === 3", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("quality-kid");
    await seedFixtureOnDisk(paths, "fx-quality", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);

    // Inject a body that declares qualityFloor (so the runner enters Stage 7).
    // Mock replayOffline so Stage 5 (Exact) passes; otherwise drift would
    // short-circuit Stage 7 and the judge would never run.
    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      const realVerify = mod.verifyReceipt;
      return {
        ...mod,
        verifyReceipt: vi.fn(async (env, ks) => {
          const result = await realVerify(env, ks);
          if (!result.ok) return result;
          return {
            ...result,
            body: {
              ...result.body,
              qualityFloor: { score: 0.9 },
            },
          };
        }),
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });

    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-quality": makeBaselineEntry("0", 0.95) }),
    );

    let judgeCalls = 0;
    const judge: Judge = {
      async score() {
        judgeCalls += 1;
        return 0.5;
      },
    };

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
      { judge },
    );

    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("regression");
    expect(fxReport.regressionKind).toBe("quality-regression");
    expect(fxReport.qualityScore).toBe(0.5);
    expect(fxReport.deltaQuality).not.toBeNull();
    expect(fxReport.deltaQuality!).toBeCloseTo(-0.45, 5);
    expect(judgeCalls).toBe(3);
  });

  it("Test 5 (new fixture): baseline missing entry -> verdict=match, regressionKind=null, deltas null, newFixtures++", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("new-kid");
    await seedFixtureOnDisk(paths, "fx-new", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);
    await writeBaseline(paths.baselinePath, makeBaseline({}));

    mockReplayWithOutputs(fixture.outputs);

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("match");
    expect(fxReport.regressionKind).toBe(null);
    expect(fxReport.deltaCostPct).toBe(null);
    expect(fxReport.deltaQuality).toBe(null);
    expect(report.summary.newFixtures).toBe(1);
    expect(report.summary.regressed).toBe(0);
  });

  it("Test 6 (load-failed): malformed JSON in receipts dir -> verdict=load-failed, summary.regressed === 0", async () => {
    const paths = await makeSandbox();
    await writeFile(join(paths.receiptsDir, "bad.json"), "{ this is not json", "utf8");
    // Need a keyset file to load — but no valid fixture seeded.
    const { publicKeyJwk } = await generateEd25519KeyPairJwk();
    await writeKeyset(paths, [keyEntry("placeholder-kid", publicKeyJwk)]);
    await writeBaseline(paths.baselinePath, makeBaseline({}));

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toHaveLength(1);
    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("load-failed");
    expect(fxReport.regressionKind).toBe(null);
    expect(fxReport.usage).toBe(null);
    expect(fxReport.qualityScore).toBe(null);
    expect(report.summary.regressed).toBe(0);
    expect(report.summary.passed).toBe(0);
  });

  it("Test 7 (judge cache hit): two runs over same fixture with qualityFloor -> judge calls === 3 total (3 first, 0 second)", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("cache-kid");
    await seedFixtureOnDisk(paths, "fx-cache", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);

    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      const realVerify = mod.verifyReceipt;
      return {
        ...mod,
        verifyReceipt: vi.fn(async (env, ks) => {
          const result = await realVerify(env, ks);
          if (!result.ok) return result;
          return {
            ...result,
            body: {
              ...result.body,
              qualityFloor: { score: 0.5 },
            },
          };
        }),
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });

    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-cache": makeBaselineEntry("0", 0.5) }),
    );

    let judgeCalls = 0;
    const judge: Judge = {
      async score() {
        judgeCalls += 1;
        return 0.95;
      },
    };

    const { runEvalSession } = await import("../src/eval/runner.js");
    const cfg = makeConfig(
      {},
      {
        fixturesDir: paths.receiptsDir,
        baselinePath: paths.baselinePath,
        judgeCacheDir: paths.judgeCacheDir,
        artifactsDir: paths.fixturesDir,
        keyPath: paths.keysetPath,
        sidecarsDir: paths.sidecarsDir,
      },
    );

    await runEvalSession(cfg, { judge });
    expect(judgeCalls).toBe(3);
    await runEvalSession(cfg, { judge });
    expect(judgeCalls).toBe(3);
  });

  it("Test 8 (init-baseline): config.initBaseline=true, no baseline file -> no throw, every fixture verdict=match, deltas null", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("init-kid");
    await seedFixtureOnDisk(paths, "fx-init", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);
    // Note: no baseline file written.

    mockReplayWithOutputs(fixture.outputs);

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        { initBaseline: true },
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toHaveLength(1);
    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("match");
    expect(fxReport.regressionKind).toBe(null);
    expect(fxReport.deltaCostPct).toBe(null);
    expect(fxReport.deltaQuality).toBe(null);
  });

  it("Test 9 (layered short-circuit): drift case with qualityFloor !== null -> judge calls === 0", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("sc-kid");
    await seedFixtureOnDisk(paths, "fx-sc", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);

    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      const realVerify = mod.verifyReceipt;
      return {
        ...mod,
        verifyReceipt: vi.fn(async (env, ks) => {
          const result = await realVerify(env, ks);
          if (!result.ok) return result;
          return {
            ...result,
            body: {
              ...result.body,
              qualityFloor: { score: 0.5 },
            },
          };
        }),
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: { text: "DRIFTED" },
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });

    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-sc": makeBaselineEntry("0", 0.5) }),
    );

    let judgeCalls = 0;
    const judge: Judge = {
      async score() {
        judgeCalls += 1;
        return 1.0;
      },
    };

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
      { judge },
    );

    const fxReport = report.fixtures[0]!;
    expect(fxReport.verdict).toBe("drift");
    expect(fxReport.regressionKind).toBe("output-hash-mismatch");
    expect(judgeCalls).toBe(0);
  });

  it("Test 10 (aggregate): 1 match + 1 drift + 1 new fixture + 1 load-failed -> summary { total: 4, passed: 2, regressed: 1, newFixtures: 1 }", async () => {
    const paths = await makeSandbox();
    const fxMatch = await buildFixture("agg-match-kid");
    const fxDrift = await buildFixture("agg-drift-kid");
    const fxNew = await buildFixture("agg-new-kid");

    await seedFixtureOnDisk(paths, "a-match", fxMatch);
    await seedFixtureOnDisk(paths, "b-drift", fxDrift);
    await seedFixtureOnDisk(paths, "c-new", fxNew);
    await writeFile(join(paths.receiptsDir, "d-bad.json"), "{not valid", "utf8");
    await writeKeyset(paths, [
      keyEntry(fxMatch.kid, fxMatch.publicKeyJwk),
      keyEntry(fxDrift.kid, fxDrift.publicKeyJwk),
      keyEntry(fxNew.kid, fxNew.publicKeyJwk),
    ]);
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({
        "a-match": makeBaselineEntry("0", null),
        "b-drift": makeBaselineEntry("0", null),
        // c-new intentionally omitted
      }),
    );

    // Drift only for fixture b-drift: mock replayOffline to return drifted
    // outputs ONLY when the envelope corresponds to b-drift. For the others,
    // we return the matching outputs from their original fixture so Stage 5
    // passes. We detect which fixture via the envelope's first signature kid.
    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      const outputsByKid: Record<string, Record<string, unknown>> = {
        [fxMatch.kid]: fxMatch.outputs,
        [fxDrift.kid]: { text: "DRIFTED" },
        [fxNew.kid]: fxNew.outputs,
      };
      return {
        ...mod,
        replayOffline: vi.fn(async (envelopeReplay: any) => {
          const sig = envelopeReplay?.receipt?.signatures?.[0];
          const outputs = outputsByKid[sig?.keyid as string] ?? {};
          return {
            ok: true,
            outputs,
            artifacts: [],
            usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
            plan: { kind: "execution-plan" },
            events: [],
          };
        }),
      };
    });

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.summary).toEqual({
      total: 4,
      passed: 2,
      regressed: 1,
      newFixtures: 1,
    });
    const verdictsById: Record<string, string> = {};
    for (const fx of report.fixtures) {
      verdictsById[fx.fixtureId] = fx.verdict;
    }
    expect(verdictsById["a-match"]).toBe("match");
    expect(verdictsById["b-drift"]).toBe("drift");
    expect(verdictsById["c-new"]).toBe("match");
    expect(verdictsById["d-bad"]).toBe("load-failed");
  });

  it("Test 11 (empty fixtures dir): no .json files -> empty fixtures array, summary all zero", async () => {
    const paths = await makeSandbox();
    const { publicKeyJwk } = await generateEd25519KeyPairJwk();
    await writeKeyset(paths, [keyEntry("ph-kid", publicKeyJwk)]);
    await writeBaseline(paths.baselinePath, makeBaseline({}));

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toEqual([]);
    expect(report.summary).toEqual({ total: 0, passed: 0, regressed: 0, newFixtures: 0 });
    expect(report.tripwireOutcomes).toEqual([]);
  });

  // -----------------------------------------------------------------
  // Plan 13.1-02: sidecar walker + per-fixture sidecar apply.
  // -----------------------------------------------------------------

  it("Test 12 (sidecar present): every fixture has a sidecar -> verdict=match with loadFailedReason=null", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("sc-match-kid");
    await seedFixtureOnDisk(paths, "fx-sc-match", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-sc-match": makeBaselineEntry("0", null) }),
    );

    mockReplayWithOutputs(fixture.outputs);

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toHaveLength(1);
    const fx = report.fixtures[0]!;
    expect(fx.verdict).toBe("match");
    expect(fx.loadFailedReason).toBe(null);
  });

  it("Test 13 (sidecar missing): fixture without a sidecar -> verdict=load-failed, loadFailedReason=no-sidecar", async () => {
    const paths = await makeSandbox();
    const fixtureA = await buildFixture("nosc-a-kid");
    const fixtureB = await buildFixture("nosc-b-kid");
    // A has a sidecar, B does NOT.
    await seedFixtureOnDisk(paths, "fx-with-sc", fixtureA);
    await seedFixtureOnDisk(paths, "fx-without-sc", fixtureB, { skipSidecar: true });
    await writeKeyset(paths, [
      keyEntry(fixtureA.kid, fixtureA.publicKeyJwk),
      keyEntry(fixtureB.kid, fixtureB.publicKeyJwk),
    ]);
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({
        "fx-with-sc": makeBaselineEntry("0", null),
        "fx-without-sc": makeBaselineEntry("0", null),
      }),
    );

    mockReplayWithOutputs(fixtureA.outputs);

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toHaveLength(2);
    const byId: Record<string, (typeof report.fixtures)[number]> = {};
    for (const fx of report.fixtures) byId[fx.fixtureId] = fx;
    const withSc = byId["fx-with-sc"]!;
    const withoutSc = byId["fx-without-sc"]!;
    expect(withSc.verdict).toBe("match");
    expect(withSc.loadFailedReason).toBe(null);
    expect(withoutSc.verdict).toBe("load-failed");
    expect(withoutSc.loadFailedReason).toBe("no-sidecar");
    expect(withoutSc.usage).toBe(null);
    expect(withoutSc.qualityScore).toBe(null);
    expect(withoutSc.deltaCostPct).toBe(null);
    expect(withoutSc.deltaQuality).toBe(null);
  });

  it("Test 14 (sidecar malformed): walker yields malformed-sidecar error -> verdict=load-failed, loadFailedReason=malformed-sidecar", async () => {
    const paths = await makeSandbox();
    const fixture = await buildFixture("sc-malf-kid");
    // Seed receipt WITHOUT the auto-sidecar; write a malformed one manually.
    await seedFixtureOnDisk(paths, "fx-malf-sc", fixture, { skipSidecar: true });
    await writeFile(
      join(paths.sidecarsDir, "fx-malf-sc.json"),
      "{ this is not valid json",
      "utf8",
    );
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);
    await writeBaseline(paths.baselinePath, makeBaseline({}));

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toHaveLength(1);
    const fx = report.fixtures[0]!;
    expect(fx.verdict).toBe("load-failed");
    expect(fx.loadFailedReason).toBe("malformed-sidecar");
  });

  it("Test 15 (cost-regression with sidecar fires): closes V1.1-LIMITATION-2", async () => {
    // This is the v1.1 audit's "regression gate is unreachable" case. With a
    // sidecar present, Stage 5 (Exact) passes and Stage 8 (cost gate) runs.
    const paths = await makeSandbox();
    const fixture = await buildFixture("sc-cost-kid");
    await seedFixtureOnDisk(paths, "fx-sc-cost", fixture);
    await writeKeyset(paths, [keyEntry(fixture.kid, fixture.publicKeyJwk)]);

    vi.doMock("@fullselfbrowsing/lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("@fullselfbrowsing/lattice")>();
      const realVerify = mod.verifyReceipt;
      return {
        ...mod,
        verifyReceipt: vi.fn(async (env, ks) => {
          const result = await realVerify(env, ks);
          if (!result.ok) return result;
          return {
            ...result,
            body: {
              ...result.body,
              usage: { ...result.body.usage, costUsd: "0.002" },
            },
          };
        }),
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });

    // Baseline cost 0.0001 with tolerance 0.10 → regression fires above ~0.00011.
    await writeBaseline(
      paths.baselinePath,
      makeBaseline({ "fx-sc-cost": makeBaselineEntry("0.0001", null) }),
    );

    const { runEvalSession } = await import("../src/eval/runner.js");
    const report = await runEvalSession(
      makeConfig(
        {},
        {
          fixturesDir: paths.receiptsDir,
          baselinePath: paths.baselinePath,
          judgeCacheDir: paths.judgeCacheDir,
          artifactsDir: paths.fixturesDir,
          keyPath: paths.keysetPath,
          sidecarsDir: paths.sidecarsDir,
        },
      ),
    );

    expect(report.fixtures).toHaveLength(1);
    const fx = report.fixtures[0]!;
    expect(fx.verdict).toBe("regression");
    expect(fx.regressionKind).toBe("cost-regression");
    expect(fx.loadFailedReason).toBe(null);
    expect(report.summary.regressed).toBe(1);
  });
});
