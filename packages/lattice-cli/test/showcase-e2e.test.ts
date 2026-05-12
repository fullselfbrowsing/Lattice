/**
 * Showcase end-to-end integration test (Plan 13-02).
 *
 * Boots the full v1.1 stack from a clean state and exercises every public
 * surface the milestone audit cares about:
 *
 *   beforeAll
 *     - wipe examples/work-inbox/.lattice/                 (clean slate)
 *     - pnpm --filter lattice build                        (runtime dist)
 *     - pnpm --filter lattice-cli build                    (CLI bin dist)
 *     - node examples/work-inbox/index.mjs                 (Plan 13-01 showcase)
 *
 *   it cases
 *     1. showcase exits 0 and writes 3 receipts + content-addressed fixtures
 *        + keyset.json under .lattice/.
 *     2. `lattice verify` exits 0 for all 3 receipts with `OK kid=<kid>
 *        verdict=<verdict>` and the verdict echoes the scenario.
 *     3. `lattice repro <success>` exits with the documented v1.1 limitation
 *        — `FAIL kind=replay-failed reason=execution_unavailable...` because
 *        the receipt body does not embed the original outputs (Phase 10
 *        boundary). The test asserts this *expected* boundary so a v1.2
 *        receipt-with-outputs upgrade flips it to verdict=match.
 *     4. `lattice eval --init-baseline` exits 0, writes baseline.json, emits
 *        one JSON line on stdout.
 *     5. `lattice eval` (no --init-baseline) exits 0 against the just-written
 *        baseline. summary.regressed === 0.
 *     6. Artificially regress the baseline (lower expected cost). In v1.1 the
 *        cost-regression gate cannot fire because all receipt-only envelopes
 *        load-fail at stage 4 (no outputs to replay) — the test documents
 *        this v1.1 boundary AND asserts the alternative path: hand-write a
 *        baseline whose costUsd is a tiny negative number for the success
 *        fixture, run eval, and assert the eval surface (stdout JSON shape +
 *        exit code) remains stable. The cost-regression assertion is forward-
 *        compat: once v1.2 sidecar outputs land and the success receipt
 *        becomes replay-able, the SAME baseline mutation MUST flip exit to 1.
 *
 *   afterAll
 *     - wipe examples/work-inbox/.lattice/ to keep `git status` clean.
 *
 * Style rules: zero emoji, no console.log, every assertion error message
 * surfaces the failing spawn's stderr for fast diagnosis.
 */

import { spawn, type SpawnOptions } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runJudgeWithN, type Judge, type JudgeInput } from "../src/eval/judge.js";
import { createDiskJudgeCache } from "../src/eval/judge-cache.js";

// Resolve REPO_ROOT once. This file lives at
// packages/lattice-cli/test/showcase-e2e.test.ts so the repo root is three
// levels up from the file's directory.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SHOWCASE_DIR = join(REPO_ROOT, "examples/work-inbox");
const LATTICE_DIR = join(SHOWCASE_DIR, ".lattice");
const RECEIPTS_DIR = join(LATTICE_DIR, "receipts");
const FIXTURES_DIR = join(LATTICE_DIR, "fixtures");
const SIDECARS_DIR = join(LATTICE_DIR, "sidecars");
const KEYSET_PATH = join(LATTICE_DIR, "keyset.json");
const BASELINE_PATH = join(LATTICE_DIR, "baseline.json");
const CLI_BIN = join(REPO_ROOT, "packages/lattice-cli/dist/cli.js");

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

async function runProc(
  cmd: string,
  args: readonly string[],
  opts: SpawnOptions = {},
): Promise<SpawnResult> {
  return await new Promise<SpawnResult>((resolveProc) => {
    const child = spawn(cmd, [...args], {
      cwd: REPO_ROOT,
      env: process.env,
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("close", (code) => {
      resolveProc({ stdout, stderr, code: code ?? -1 });
    });
    child.on("error", (err) => {
      resolveProc({ stdout, stderr: `${stderr}${err.message}`, code: -1 });
    });
  });
}

type ScenarioName =
  | "success"
  | "tripwire"
  | "no-contract-match"
  | "quality-floor";

interface ScenarioRow {
  readonly scenario: ScenarioName;
  readonly receiptId: string;
  readonly verdict: string;
  readonly contractHash?: string;
}

function parseScenarioLines(stdout: string): ScenarioRow[] {
  const rows: ScenarioRow[] = [];
  for (const line of stdout.split("\n")) {
    const m =
      /^scenario=(success|tripwire|no-contract-match|quality-floor) receiptId=(\S+) verdict=(\S+)(?:\s+contractHash=([0-9a-f]{64}))?/.exec(
        line,
      );
    if (m !== null) {
      const row: ScenarioRow = {
        scenario: m[1] as ScenarioName,
        receiptId: m[2] as string,
        verdict: m[3] as string,
        ...(m[4] !== undefined ? { contractHash: m[4] } : {}),
      };
      rows.push(row);
    }
  }
  return rows;
}

interface EvalReport {
  readonly version: string;
  readonly ranAt: string;
  readonly fixturesDir: string;
  readonly baselinePath: string;
  readonly fixtures: ReadonlyArray<{
    readonly fixtureId: string;
    readonly verdict: "match" | "drift" | "regression" | "load-failed";
    readonly regressionKind: string | null;
    readonly usage: {
      readonly costUsd: string;
      readonly promptTokens: number;
      readonly completionTokens: number;
    } | null;
    readonly qualityScore: number | null;
    readonly deltaCostPct: number | null;
    readonly deltaQuality: number | null;
    /** Phase 13.1-02 additive field. `null` on every non-load-failed verdict. */
    readonly loadFailedReason: string | null;
  }>;
  readonly summary: {
    readonly total: number;
    readonly passed: number;
    readonly regressed: number;
    readonly newFixtures: number;
  };
  readonly exitCode: 0 | 1 | 2;
}

function parseEvalReport(stdout: string): EvalReport {
  // stdout has one JSON line at the end (per Plan 12-03's eval handler).
  // Per-fixture human lines go to stderr; stdout is JSON only.
  const trimmed = stdout.trim();
  const lastLine = trimmed.split("\n").at(-1);
  if (lastLine === undefined) {
    throw new Error("eval stdout was empty — expected a JSON report line");
  }
  return JSON.parse(lastLine) as EvalReport;
}

// Module-level state shared across `it` cases. `beforeAll` populates these
// before any test runs; the test cases read them directly so we do not
// re-run the showcase per case.
let scenarios: ScenarioRow[] = [];
let showcaseRun: SpawnResult = { stdout: "", stderr: "", code: -1 };

// Module-level state for EVAL-03 / EVAL-04 (cases 7 + 8). Case 7 populates
// these; case 8 reads them and asserts the cache short-circuited the
// second runJudgeWithN invocation. Vitest runs `it` blocks in declaration
// order within a single `describe`, so this binding is safe.
interface StubScoringJudge {
  readonly judge: Judge;
  readonly callCount: number;
}
let case7Stub: StubScoringJudge | undefined;
let case7Input: JudgeInput | undefined;
let case7Cache: ReturnType<typeof createDiskJudgeCache> | undefined;
let case7CacheDir = "";

describe("showcase v1.1 end-to-end", () => {
  beforeAll(async () => {
    // Clean slate: any leftover .lattice/ from a previous run is removed so
    // the showcase emits fresh receipt ids and a fresh keypair.
    await rm(LATTICE_DIR, { recursive: true, force: true });

    // Build the runtime first — the showcase imports the lattice dist.
    // `pnpm --filter lattice-cli test` only triggers the CLI build via the
    // package.json `test` script; it does NOT transitively build the
    // runtime, so we do it explicitly here.
    const latticeBuild = await runProc("pnpm", [
      "--filter",
      "lattice",
      "build",
    ]);
    if (latticeBuild.code !== 0) {
      throw new Error(
        `pnpm --filter lattice build failed (code=${latticeBuild.code}): ${latticeBuild.stderr}`,
      );
    }

    // Build the CLI bin so CLI_BIN resolves to a real file.
    const cliBuild = await runProc("pnpm", [
      "--filter",
      "lattice-cli",
      "build",
    ]);
    if (cliBuild.code !== 0) {
      throw new Error(
        `pnpm --filter lattice-cli build failed (code=${cliBuild.code}): ${cliBuild.stderr}`,
      );
    }

    // Run the showcase once. Parse the scenario lines so each `it` knows
    // the receipt ids without re-running.
    showcaseRun = await runProc("node", ["examples/work-inbox/index.mjs"]);
    scenarios = parseScenarioLines(showcaseRun.stdout);
  });

  afterAll(async () => {
    // Leave the repo in the same shape we found it. `git status` should be
    // clean after the suite runs.
    await rm(LATTICE_DIR, { recursive: true, force: true });
  });

  it("showcase exits 0 and writes 4 receipts + content-addressed fixtures + keyset", async () => {
    expect(
      showcaseRun.code,
      `showcase stderr: ${showcaseRun.stderr}`,
    ).toBe(0);
    expect(showcaseRun.stdout).toContain("Next steps (run from repo root):");
    expect(showcaseRun.stdout).toContain("Wrote 4 receipts to");

    expect(scenarios).toHaveLength(4);
    const names = scenarios.map((s) => s.scenario).sort();
    expect(names).toEqual([
      "no-contract-match",
      "quality-floor",
      "success",
      "tripwire",
    ]);

    const successRow = scenarios.find((s) => s.scenario === "success");
    const tripwireRow = scenarios.find((s) => s.scenario === "tripwire");
    const refusalRow = scenarios.find((s) => s.scenario === "no-contract-match");
    const qualityFloorRow = scenarios.find(
      (s) => s.scenario === "quality-floor",
    );

    // Per Plan 13-01 SUMMARY Deviation #1: the runtime emits the literal
    // "success" (not "pass") as the success ContractVerdict. The plan body
    // used "pass" but the public type union uses "success".
    expect(successRow?.verdict).toBe("success");
    expect(tripwireRow?.verdict).toBe("tripwire-violated");
    expect(refusalRow?.verdict).toBe("no-contract-match");

    // Plan 13.2-01: the quality-floor scenario declares a contract carrying
    // `qualityFloor` and reaches contractVerdict=success at run time
    // (enforcement is deferred to `lattice eval`). The stdout grammar
    // additionally surfaces the 64-hex `contractHash` so Plan 13.2-02 can
    // cross-check the receipt body.
    expect(qualityFloorRow?.verdict).toBe("success");
    expect(qualityFloorRow?.contractHash).toMatch(/^[0-9a-f]{64}$/);

    // 4 receipt JSON files on disk.
    const receiptFiles = (await readdir(RECEIPTS_DIR)).filter((f) =>
      f.endsWith(".json"),
    );
    expect(receiptFiles).toHaveLength(4);

    // Keyset is present and is a JSON array per the CLI loader contract.
    expect((await stat(KEYSET_PATH)).isFile()).toBe(true);
    const keysetText = await readFile(KEYSET_PATH, "utf8");
    const keysetParsed = JSON.parse(keysetText) as unknown;
    expect(Array.isArray(keysetParsed)).toBe(true);

    // Content-addressed fixtures: every file matches `<sha256-hex>.bin`.
    const fixtureFiles = await readdir(FIXTURES_DIR);
    expect(fixtureFiles.length).toBeGreaterThan(0);
    for (const f of fixtureFiles) {
      expect(f).toMatch(/^[0-9a-f]{64}\.bin$/);
    }

    // Phase 13.1: every scenario writes a v1.1 sidecar JSON alongside its
    // receipt. The sidecars carry the `{ task, outputs, policy, contract }`
    // quadruple `lattice repro` / `lattice eval` need to materialize the
    // replay envelope and reach verdict=match for sidecared fixtures.
    const sidecarFiles = (await readdir(SIDECARS_DIR)).filter((f) =>
      f.endsWith(".json"),
    );
    expect(sidecarFiles).toHaveLength(4);
    for (const f of sidecarFiles) {
      const text = await readFile(join(SIDECARS_DIR, f), "utf8");
      const parsed = JSON.parse(text) as { version: string };
      expect(parsed.version).toBe("lattice-sidecar/v1");
    }
  });

  it("quality-floor receipt body contractHash matches the showcase-emitted hash (CONTRACT-03 canonicalization)", async () => {
    // CONTRACT-03 observable proof: the showcase emits the contract hash on
    // stdout AND serializes it into the signed receipt body. If qualityFloor
    // were stripped during canonicalization, the two would diverge. Reading
    // the receipt from disk and re-comparing against the stdout-emitted hash
    // is an independent observation point — the showcase's own internal
    // assertion (scenarios/quality-floor.mjs:155-160) catches mismatch at
    // emit time; this test catches mismatch at read time.
    const qualityFloorRow = scenarios.find(
      (s) => s.scenario === "quality-floor",
    );
    expect(qualityFloorRow, "quality-floor scenario row").toBeDefined();
    expect(qualityFloorRow?.contractHash).toMatch(/^[0-9a-f]{64}$/);

    const receiptPath = join(
      RECEIPTS_DIR,
      `${qualityFloorRow?.receiptId}.json`,
    );
    const env = JSON.parse(await readFile(receiptPath, "utf8")) as {
      readonly payload: string;
    };
    const body = JSON.parse(
      Buffer.from(env.payload, "base64url").toString("utf8"),
    ) as {
      readonly contractHash: string | null;
      readonly contractVerdict: string;
    };
    expect(body.contractHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.contractHash).toBe(qualityFloorRow?.contractHash);
    expect(body.contractVerdict).toBe("success");
  });

  it("lattice verify exits 0 for all 4 receipts with OK kid=... verdict=...", async () => {
    expect(scenarios.length, "scenarios not populated").toBe(4);
    for (const row of scenarios) {
      const receiptPath = join(RECEIPTS_DIR, `${row.receiptId}.json`);
      const r = await runProc("node", [
        CLI_BIN,
        "verify",
        receiptPath,
        "--key",
        KEYSET_PATH,
      ]);
      expect(
        r.code,
        `${row.scenario} verify exit=${r.code} stderr=${r.stderr}`,
      ).toBe(0);
      expect(r.stdout).toMatch(/^OK kid=\S+ verdict=\S+/m);
      // The verdict echoed back must match the scenario's recorded verdict.
      expect(r.stdout).toContain(`verdict=${row.verdict}`);
    }
  });

  it("lattice repro on the success receipt with sidecar exits 0 with verdict=match", async () => {
    // Phase 13.1 closes the v1.1 boundary. The showcase now writes a
    // sidecar alongside each receipt; `lattice repro` resolves the sidecar
    // via `--sidecar-dir`, spreads its `{ task, outputs (raw), policy,
    // contract }` quadruple into `materializeReplayEnvelope`, and the
    // replay's recomputed outputHash matches the receipt's recorded
    // outputHash → `verdict=match` + exit 0. This is the hard assertion
    // that closes V1.1-LIMITATION-1 from 13-02-SUMMARY.md.
    const successRow = scenarios.find((s) => s.scenario === "success");
    expect(successRow, "success scenario not found").toBeDefined();
    const receiptPath = join(RECEIPTS_DIR, `${successRow?.receiptId}.json`);

    const r = await runProc("node", [
      CLI_BIN,
      "repro",
      receiptPath,
      "--key",
      KEYSET_PATH,
      "--fixtures",
      FIXTURES_DIR,
      "--sidecar-dir",
      SIDECARS_DIR,
    ]);
    expect(
      r.code,
      `repro stderr: ${r.stderr} stdout: ${r.stdout}`,
    ).toBe(0);
    expect(r.stdout).toContain("verdict=match");

    // Redaction discipline (CLI-05): no PII in either stream. The success
    // receipt's body is clean; the tripwire fixture's `j.doe@example.com`
    // must NOT appear anywhere in success repro output.
    expect(r.stdout).not.toMatch(/j\.doe@example\.com/);
    expect(r.stderr).not.toMatch(/j\.doe@example\.com/);
  });

  it("lattice eval --init-baseline writes baseline.json and exits 0", async () => {
    const r = await runProc("node", [
      CLI_BIN,
      "eval",
      "--fixtures",
      RECEIPTS_DIR,
      "--key",
      KEYSET_PATH,
      "--artifacts",
      FIXTURES_DIR,
      "--sidecar-dir",
      SIDECARS_DIR,
      "--baseline",
      BASELINE_PATH,
      "--init-baseline",
    ]);
    expect(
      r.code,
      `eval --init-baseline stderr: ${r.stderr} stdout: ${r.stdout}`,
    ).toBe(0);
    expect((await stat(BASELINE_PATH)).isFile()).toBe(true);

    const report = parseEvalReport(r.stdout);
    expect(report.exitCode).toBe(0);
    // The walker visits every receipt in the dir; Plan 13.2-01 added the
    // quality-floor scenario for a 4th receipt, so total === 4.
    expect(report.summary.total).toBe(4);
    expect(report.version).toBe("lattice-eval/v1");

    // Phase 13.1 closes V1.1-LIMITATION-1: the success fixture now has a
    // sidecar, replays cleanly, and is verdict=match with
    // loadFailedReason=null. The tripwire + refusal fixtures keep
    // outputHash=null (failure receipts cannot commit to outputs) and
    // surface as load-failed with loadFailedReason="outputhash-missing"
    // — this is the documented expected outcome for failure-class receipts.
    // Phase 13.2-01: the quality-floor scenario also writes a sidecar whose
    // rawOutputs match the receipt's outputHash, so it likewise reaches
    // verdict=match with loadFailedReason=null.
    const successRow = scenarios.find((s) => s.scenario === "success");
    const tripwireRow = scenarios.find((s) => s.scenario === "tripwire");
    const refusalRow = scenarios.find(
      (s) => s.scenario === "no-contract-match",
    );
    const qualityFloorRow = scenarios.find(
      (s) => s.scenario === "quality-floor",
    );
    const successFixture = report.fixtures.find(
      (f) => f.fixtureId === successRow?.receiptId,
    );
    const tripwireFixture = report.fixtures.find(
      (f) => f.fixtureId === tripwireRow?.receiptId,
    );
    const refusalFixture = report.fixtures.find(
      (f) => f.fixtureId === refusalRow?.receiptId,
    );
    const qualityFloorFixture = report.fixtures.find(
      (f) => f.fixtureId === qualityFloorRow?.receiptId,
    );
    expect(successFixture?.verdict).toBe("match");
    expect(successFixture?.loadFailedReason).toBe(null);
    expect(tripwireFixture?.verdict).toBe("load-failed");
    expect(tripwireFixture?.loadFailedReason).toBe("outputhash-missing");
    expect(refusalFixture?.verdict).toBe("load-failed");
    expect(refusalFixture?.loadFailedReason).toBe("outputhash-missing");
    expect(qualityFloorFixture?.verdict).toBe("match");
    expect(qualityFloorFixture?.loadFailedReason).toBe(null);

    // CLI-05 redaction discipline on the JSON projection: the report MUST
    // NOT carry raw inputHashes, raw outputHash strings, or model
    // fingerprints. Only fixtureId / verdict / regressionKind / usage /
    // qualityScore / deltaCostPct / deltaQuality / loadFailedReason
    // leak through.
    expect(r.stdout).not.toMatch(/inputHashes/);
    expect(r.stdout).not.toMatch(/"outputHash":/);
    expect(r.stdout).not.toMatch(/model\.observed/);
  });

  it("lattice eval (clean run against baseline) exits 0 with regressed=0", async () => {
    const r = await runProc("node", [
      CLI_BIN,
      "eval",
      "--fixtures",
      RECEIPTS_DIR,
      "--key",
      KEYSET_PATH,
      "--artifacts",
      FIXTURES_DIR,
      "--sidecar-dir",
      SIDECARS_DIR,
      "--baseline",
      BASELINE_PATH,
    ]);
    expect(
      r.code,
      `eval stderr: ${r.stderr} stdout: ${r.stdout}`,
    ).toBe(0);

    const report = parseEvalReport(r.stdout);
    expect(report.exitCode).toBe(0);
    expect(report.summary.regressed).toBe(0);

    // The stderr SUMMARY line is the human-readable surface (CLI-05 says the
    // stdout JSON is the programmatic projection; stderr carries
    // human-readable lines per fixture).
    expect(r.stderr).toMatch(
      /^SUMMARY total=\d+ passed=\d+ regressed=\d+ newFixtures=\d+/m,
    );
  });

  it("lattice eval with an artificially regressed baseline exits 1 with cost-regression on the success fixture", async () => {
    // Phase 13.1 closes V1.1-LIMITATION-2 from 13-02-SUMMARY.md. The
    // success fixture's sidecar makes the receipt replay-able with
    // costUsd=0 (the fake provider records null/0 cost). A baseline whose
    // success-fixture costUsd is a tiny negative value triggers
    // `compareCost(replay=0, baseline=-0.0001, tol=0.1) === regressed`,
    // the runner flips verdict to "regression" with regressionKind
    // "cost-regression", and the eval handler exits 1. This is the hard
    // assertion that closes the cost-regression gate's forward-compat
    // hook.
    const successRow = scenarios.find((s) => s.scenario === "success");
    expect(successRow, "success scenario not found").toBeDefined();
    const successId = successRow?.receiptId as string;

    const mutatedBaseline = {
      version: "lattice-eval/v1",
      recordedAt: new Date().toISOString(),
      fixtures: {
        [successId]: {
          usage: {
            costUsd: "-0.0001",
            promptTokens: 0,
            completionTokens: 0,
          },
          qualityFloor: null,
        },
      },
    };
    await writeFile(BASELINE_PATH, JSON.stringify(mutatedBaseline, null, 2));

    const r = await runProc("node", [
      CLI_BIN,
      "eval",
      "--fixtures",
      RECEIPTS_DIR,
      "--key",
      KEYSET_PATH,
      "--artifacts",
      FIXTURES_DIR,
      "--sidecar-dir",
      SIDECARS_DIR,
      "--baseline",
      BASELINE_PATH,
    ]);
    expect(
      r.code,
      `eval stderr: ${r.stderr} stdout: ${r.stdout}`,
    ).toBe(1);

    const report = parseEvalReport(r.stdout);
    expect(report.version).toBe("lattice-eval/v1");
    expect(report.summary.total).toBe(4);
    // The mutated baseline only carries the success fixture; the
    // quality-floor fixture is absent from the baseline → counted as a new
    // fixture (newFixtures >= 1), NOT regressed. The success fixture's cost
    // regression keeps `regressed >= 1` so exit code is still 1.
    expect(report.summary.regressed).toBeGreaterThanOrEqual(1);
    expect(report.summary.newFixtures).toBeGreaterThanOrEqual(1);

    const successFixture = report.fixtures.find(
      (f) => f.fixtureId === successId,
    );
    expect(successFixture?.verdict).toBe("regression");
    expect(successFixture?.regressionKind).toBe("cost-regression");

    // Restore the baseline so subsequent runs in the same suite (none
    // today, but defensive) start clean.
    await runProc("node", [
      CLI_BIN,
      "eval",
      "--fixtures",
      RECEIPTS_DIR,
      "--key",
      KEYSET_PATH,
      "--artifacts",
      FIXTURES_DIR,
      "--sidecar-dir",
      SIDECARS_DIR,
      "--baseline",
      BASELINE_PATH,
      "--init-baseline",
    ]);
  });

  it("EVAL-03: runJudgeWithN with stub scores [0.6, 0.8, 0.7] returns median 0.7 with 3 sample calls", async () => {
    // Dynamic-import the stub judge factory from examples/work-inbox so the
    // showcase + this test share the same cyclic scoring schedule and
    // STUB_JUDGE_PROMPT (the cache-key prompt). Using pathToFileURL guards
    // against Windows path-as-URL pitfalls.
    const judgesMod = (await import(
      pathToFileURL(join(REPO_ROOT, "examples/work-inbox/judges.mjs")).href
    )) as {
      readonly stubScoringJudge: (scores: readonly number[]) => StubScoringJudge;
      readonly STUB_JUDGE_PROMPT: string;
    };

    case7Stub = judgesMod.stubScoringJudge([0.6, 0.8, 0.7]);
    expect(case7Stub.callCount).toBe(0);

    case7CacheDir = join(LATTICE_DIR, "judge-cache-case7");
    await mkdir(case7CacheDir, { recursive: true });
    case7Cache = createDiskJudgeCache(case7CacheDir);

    case7Input = {
      fixtureId: "stub-fixture-quality-floor",
      output: { answer: "stub-completion" },
      modelFingerprint: "stub-model-fp",
      prompt: judgesMod.STUB_JUDGE_PROMPT,
    };

    const result = await runJudgeWithN(
      case7Stub.judge,
      case7Input,
      3,
      case7Cache,
    );
    expect(result.score).toBe(0.7);
    expect(result.cached).toBe(false);
    expect(result.samples).toHaveLength(3);
    expect([...result.samples].sort((a, b) => a - b)).toEqual([0.6, 0.7, 0.8]);
    expect(case7Stub.callCount).toBe(3);
  });

  it("EVAL-04: second runJudgeWithN call with same input hits the disk cache without advancing the stub judge counter", async () => {
    // Case 7 must have run first to populate the module-scoped state.
    expect(case7Stub, "case 7 must run first to populate stub").toBeDefined();
    expect(case7Cache, "case 7 must run first to populate cache").toBeDefined();
    expect(case7Input, "case 7 must run first to populate input").toBeDefined();
    expect(case7Stub?.callCount).toBe(3);

    const stub = case7Stub as StubScoringJudge;
    const cache = case7Cache as ReturnType<typeof createDiskJudgeCache>;
    const input = case7Input as JudgeInput;

    const result = await runJudgeWithN(stub.judge, input, 3, cache);
    expect(result.score).toBe(0.7);
    expect(result.cached).toBe(true);
    // Samples are preserved as recorded (NOT re-sorted) per judge-cache.ts.
    expect(result.samples).toEqual([0.6, 0.8, 0.7]);

    // CRITICAL EVAL-04 assertion: the cache hit short-circuited every judge
    // call on the second invocation. callCount is STILL 3, not 6.
    expect(stub.callCount).toBe(3);

    // The cache directory contains exactly one entry whose filename matches
    // the canonical SHA-256-hex shape enforced by judge-cache.ts:KEY_REGEX.
    const entries = await readdir(case7CacheDir);
    const jsonEntries = entries.filter((f) => f.endsWith(".json"));
    expect(jsonEntries).toHaveLength(1);
    for (const f of jsonEntries) {
      expect(f).toMatch(/^[a-f0-9]{64}\.json$/);
    }
  });
});
