/**
 * `runEvalSession(config, deps)` — the Plan 12-02 orchestrator that composes
 * Wave 1 primitives (walker + materializer + verifier + replay + judge +
 * baseline comparators) into one async function returning a typed
 * `EvalRunReport`.
 *
 * Per-fixture pipeline (CONTEXT.md "Layered Determinism Classes"):
 *
 *   Stage 1 — walker yields WalkedEntry; load-failed entries short-circuit
 *             to a `load-failed` FixtureReport.
 *   Stage 2 — materializeReplayEnvelope verifies the receipt FIRST and
 *             loads input artifacts; any failure -> `load-failed`.
 *   Stage 3 — second verifyReceipt to obtain the typed body for downstream
 *             usage/qualityFloor reads (cheap; mirrors Phase 11's repro.ts).
 *   Stage 4 — replayOffline reproduces the recorded outputs; failure -> `load-failed`.
 *   Stage 5 — Exact class: sha256(JSON.stringify(replay.outputs)) vs body.outputHash.
 *             Mismatch -> verdict=drift, regressionKind=output-hash-mismatch.
 *             SHORT-CIRCUITS Stage 6 + Stage 7.
 *   Stage 6 — Semantic-cheap class: no-op in v1.1 (CONTEXT.md "no-op in v1.1
 *             unless --outputs flag"). Reserved for future Standard Schema hook.
 *   Stage 7 — Semantic-expensive class: runs ONLY when Exact passed AND the
 *             receipt body declares a `qualityFloor`. runJudgeWithN with N=3
 *             + disk cache.
 *   Stage 8 — Baseline cost gate: even a Stage-5 match can become a
 *             cost-regression here (CONTEXT.md "match vs drift vs regression").
 *   Stage 9 — Baseline quality gate: only when both replay and baseline
 *             recorded a score.
 *   Stage 10 — Missing baseline entry: newFixtures++; verdict stays match,
 *              deltas null.
 *
 * `qualityFloor` note: the v1.1 `CapabilityReceiptBody` type does NOT carry
 * a `qualityFloor` field (it lives on the contract). The runner reads it
 * defensively via a structural probe so a forward-compat receipt schema
 * adding the field starts gating quality without a code change. Tests inject
 * it via `verifyReceipt` mocks.
 *
 * `body.model.observed` is `string | null` per CapabilityReceiptBody — used
 * directly as the modelFingerprint feed for the judge cache key. When null,
 * `body.model.requested` is the fallback.
 *
 * All file I/O is path-isolated: no global state, no singleton caches. The
 * runner is reusable in the same process across configs.
 */

import {
  materializeReplayEnvelope,
  replayOffline,
  verifyReceipt,
  type ArtifactInput,
  type CapabilityReceiptBody,
  type KeySet,
  type ReceiptEnvelope,
} from "lattice";

import { createFilesystemArtifactLoader } from "../io/artifact-loader.js";
import { loadKeySetFromPath } from "../io/keyset-loader.js";
import {
  isWalkedReceiptError,
  walkReceiptsDirectory,
} from "../io/receipt-walker.js";

import {
  compareCost,
  compareQuality,
  loadBaseline,
  type Baseline,
  type BaselineEntry,
} from "./baseline.js";
import { createDiskJudgeCache } from "./judge-cache.js";
import { noopJudge, runJudgeWithN, type Judge } from "./judge.js";
import type {
  EvalConfig,
  EvalRunReport,
  FixtureReport,
  FixtureReportUsage,
  RegressionKind,
} from "./types.js";

export interface EvalRunnerDeps {
  readonly judge?: Judge;
  readonly now?: () => string;
  readonly loadKeySet?: (path: string | undefined) => Promise<KeySet>;
  readonly buildArtifactLoader?: (
    dir: string,
  ) => (hash: string) => Promise<ArtifactInput>;
}

/**
 * Receipt body extended with the v1.2-forward `qualityFloor` slot. The v1.1
 * receipt does NOT carry `qualityFloor`; tests mock `verifyReceipt` to inject
 * it so the layered judge stage can be exercised. Reading the field via
 * structural probe keeps the runner forward-compat without touching the
 * lattice package.
 */
interface ReceiptBodyMaybeQualityFloor extends CapabilityReceiptBody {
  readonly qualityFloor?: { readonly score: number } | null;
}

function readQualityFloor(
  body: CapabilityReceiptBody,
): { readonly score: number } | null {
  const probe = (body as ReceiptBodyMaybeQualityFloor).qualityFloor;
  if (probe === undefined || probe === null) return null;
  return probe;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildLoadFailedReport(fixtureId: string): FixtureReport {
  return {
    fixtureId,
    verdict: "load-failed",
    regressionKind: null,
    usage: null,
    qualityScore: null,
    deltaCostPct: null,
    deltaQuality: null,
  };
}

function usageFromBody(body: CapabilityReceiptBody): FixtureReportUsage {
  return {
    costUsd: body.usage.costUsd ?? "0",
    promptTokens: body.usage.promptTokens,
    completionTokens: body.usage.completionTokens,
  };
}

export async function runEvalSession(
  config: EvalConfig,
  deps: EvalRunnerDeps = {},
): Promise<EvalRunReport> {
  const judge = deps.judge ?? noopJudge;
  const now = deps.now ?? (() => new Date().toISOString());
  const loadKeySet = deps.loadKeySet ?? loadKeySetFromPath;
  const buildArtifactLoader =
    deps.buildArtifactLoader ?? createFilesystemArtifactLoader;

  // Load keyset once; failure propagates so the caller (Plan 03) maps to exit 2.
  const keySet = await loadKeySet(config.keyPath);

  // Load baseline (skipped in init-baseline mode).
  let baseline: Baseline | undefined;
  if (!config.initBaseline) {
    baseline = await loadBaseline(config.baselinePath);
  }

  const judgeCache = createDiskJudgeCache(config.judgeCacheDir);
  const artifactLoader = buildArtifactLoader(config.artifactsDir);

  const fixtures: FixtureReport[] = [];
  let newFixtures = 0;

  for await (const entry of walkReceiptsDirectory(config.fixturesDir)) {
    if (isWalkedReceiptError(entry)) {
      fixtures.push(buildLoadFailedReport(entry.id));
      continue;
    }

    const fixtureId = entry.id;
    const envelope: ReceiptEnvelope = entry.envelope;

    // Stage 2: materialize (verifies FIRST internally; loader is touched only
    // after verify succeeds).
    let envelopeReplay;
    try {
      envelopeReplay = await materializeReplayEnvelope(envelope, {
        artifactLoader,
        keySet,
      });
    } catch {
      fixtures.push(buildLoadFailedReport(fixtureId));
      continue;
    }

    // Stage 3: re-run verifyReceipt to obtain the typed body. Materialize
    // verifies internally but does not expose the body. Ed25519 verify is
    // microsecond-level; same pattern as `repro.ts`.
    const verifyResult = await verifyReceipt(envelope, keySet);
    if (!verifyResult.ok) {
      fixtures.push(buildLoadFailedReport(fixtureId));
      continue;
    }
    const body = verifyResult.body;

    // Stage 4: replay.
    const replay = await replayOffline(envelopeReplay);
    if (!replay.ok) {
      fixtures.push(buildLoadFailedReport(fixtureId));
      continue;
    }

    // Stage 5: Exact class.
    if (body.outputHash === null) {
      // Failure receipts have no diff target — treat as load-failed.
      fixtures.push(buildLoadFailedReport(fixtureId));
      continue;
    }
    const actualHash = await sha256Hex(JSON.stringify(replay.outputs));

    let regressionKind: RegressionKind = null;
    let verdict: FixtureReport["verdict"] = "match";

    if (actualHash !== body.outputHash) {
      verdict = "drift";
      regressionKind = "output-hash-mismatch";
      // SHORT-CIRCUIT: skip Semantic-cheap and Semantic-expensive classes.
      fixtures.push({
        fixtureId,
        verdict,
        regressionKind,
        usage: usageFromBody(body),
        qualityScore: null,
        deltaCostPct: null,
        deltaQuality: null,
      });
      continue;
    }

    // Stage 6: Semantic-cheap class — no-op in v1.1 (forward-compat hook).

    // Stage 7: Semantic-expensive (judge) class. Runs only when the receipt
    // body declares a qualityFloor. v1.1 receipts don't carry it; tests inject
    // via verifyReceipt mocks.
    const qualityFloor = readQualityFloor(body);
    let qualityScore: number | null = null;
    if (qualityFloor !== null) {
      const judgeResult = await runJudgeWithN(
        judge,
        {
          fixtureId,
          output: replay.outputs,
          modelFingerprint: body.model.observed ?? body.model.requested,
          prompt: config.judgePrompt,
        },
        config.judgeN,
        judgeCache,
      );
      qualityScore = judgeResult.score;
    }

    // Stage 8 + 9 + 10: baseline-relative gating.
    let deltaCostPct: number | null = null;
    let deltaQuality: number | null = null;
    const baselineEntry: BaselineEntry | undefined =
      baseline?.fixtures[fixtureId];

    if (baseline !== undefined && baselineEntry !== undefined) {
      // Cost gate (independent of Exact verdict).
      const costCmp = compareCost(
        body.usage.costUsd ?? "0",
        baselineEntry.usage.costUsd,
        config.costTolerance,
      );
      deltaCostPct = costCmp.deltaPct;
      if (costCmp.regressed && verdict === "match") {
        verdict = "regression";
        regressionKind = "cost-regression";
      }

      // Quality gate (only when both sides have a score).
      if (qualityScore !== null && baselineEntry.qualityFloor !== null) {
        const qualCmp = compareQuality(
          qualityScore,
          baselineEntry.qualityFloor.score,
          config.qualityTolerance,
        );
        deltaQuality = qualCmp.delta;
        if (qualCmp.regressed && verdict === "match") {
          verdict = "regression";
          regressionKind = "quality-regression";
        }
      }
    } else if (baseline !== undefined && baselineEntry === undefined) {
      // Stage 10: new fixture. Record but do not flag.
      newFixtures += 1;
    }
    // initBaseline mode (baseline === undefined): every fixture is treated as
    // a match with null deltas. We do NOT increment newFixtures because the
    // caller is writing a fresh baseline.

    fixtures.push({
      fixtureId,
      verdict,
      regressionKind,
      usage: usageFromBody(body),
      qualityScore,
      deltaCostPct,
      deltaQuality,
    });
  }

  const passed = fixtures.filter((f) => f.verdict === "match").length;
  const regressed = fixtures.filter(
    (f) => f.verdict === "drift" || f.verdict === "regression",
  ).length;

  return {
    version: "lattice-eval/v1",
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
    tripwireOutcomes: [],
  };
}
