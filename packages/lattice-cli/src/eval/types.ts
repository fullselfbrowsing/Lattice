/**
 * Shared eval types.
 *
 * These types are imported by the runner and judge-cache wiring. The versioned
 * stdout JSON shape MUST NOT drift without a `lattice-eval/<version>` bump.
 *
 * `tripwireOutcomes: readonly never[]` is the v1.1 forward-compat hook. It is
 * always empty in v1.1 so a newer reader can populate it without an envelope bump.
 */

export type FixtureVerdict = "match" | "drift" | "regression" | "load-failed";

export type RegressionKind =
  | null
  | "output-hash-mismatch"
  | "schema-mismatch"
  | "cost-regression"
  | "quality-regression";

export type DeterminismClass = "exact" | "semantic-cheap" | "semantic-expensive";

export type LoadFailedStage =
  | "load"
  | "verification"
  | "materialization"
  | "replay"
  | "unevaluable-output"
  | null;

export interface FixtureReportUsage {
  readonly costUsd: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/**
 * Discriminator for `verdict: "load-failed"` entries. The
 * field is additive to `lattice-eval/v1` — older readers MUST ignore it; no
 * version bump is required. For every non-load-failed fixture
 * (match / drift / regression) the value is `null`.
 *
 * Taxonomy:
 *   - "no-sidecar": walker yielded the receipt but no sidecar pair
 *   - "verify-failed": materialize/verifyReceipt rejected the envelope
 *   - "replay-failed": replayOffline returned ok:false
 *   - "malformed-sidecar": walker surfaced a sidecar-side load error
 *                              (malformed / version-mismatch /
 *                              unsupported-output-shape)
 *   - "outputhash-missing": verified body.outputHash === null (failure
 *                              receipts have no diff target)
 */
export type LoadFailedReason =
  | "no-sidecar"
  | "receipt-load-failed"
  | "verify-failed"
  | "artifact-load-failed"
  | "envelope-malformed"
  | "replay-failed"
  | "malformed-sidecar"
  | "outputhash-missing"
  | null;

export interface FixtureReport {
  readonly fixtureId: string;
  readonly verdict: FixtureVerdict;
  readonly regressionKind: RegressionKind;
  readonly usage: FixtureReportUsage | null;
  readonly qualityScore: number | null;
  readonly deltaCostPct: number | null;
  readonly deltaQuality: number | null;
  readonly loadFailedStage: LoadFailedStage;
  /**
   * Sub-discriminator for `verdict: "load-failed"`. `null` for
   * every other verdict. Existing consumers may ignore this additive field
   * without a version bump.
   */
  readonly loadFailedReason: LoadFailedReason;
}

export interface EvalRunSummary {
  readonly total: number;
  readonly passed: number;
  readonly regressed: number;
  readonly newFixtures: number;
  readonly loadFailed: number;
}

export interface EvalRunReport {
  readonly version: "lattice-eval/v1";
  readonly ranAt: string;
  readonly fixturesDir: string;
  readonly baselinePath: string;
  readonly fixtures: readonly FixtureReport[];
  readonly summary: EvalRunSummary;
  readonly exitCode: 0 | 1 | 2;
  readonly tripwireOutcomes: readonly never[];
}

export interface EvalConfig {
  readonly fixturesDir: string;
  readonly baselinePath: string;
  readonly judgeCacheDir: string;
  /**
   * Directory containing on-disk artifact bytes keyed by `<sha256-hex>.bin`.
   * The filesystem ArtifactLoader (`createFilesystemArtifactLoader`)
   * is rooted here.
   */
  readonly artifactsDir: string;
  /**
   * Directory holding `<receipt-id>.json` sidecars. Default
   * `.lattice/sidecars`. Paired with each receipt by `walkReceiptsWithSidecars`
   * so per-fixture `{ task, outputs, policy, contract }` quadruples flow into
   * `materializeReplayEnvelope`. Fixtures without a sidecar surface as
   * `verdict: "load-failed"` with `loadFailedReason: "no-sidecar"` so the
   * audit and JSON projection can distinguish them from verify/replay failures.
   */
  readonly sidecarsDir: string;
  readonly keyPath: string | undefined;
  readonly costTolerance: number;
  readonly qualityTolerance: number;
  readonly judgeN: number;
  readonly initBaseline: boolean;
  /**
   * Prompt forwarded to `runJudgeWithN` (and through to `Judge.score`). Held
   * here so the judge-cache key recipe (which mixes in `judgePrompt`) is
   * stable across runs that share a baseline.
   */
  readonly judgePrompt: string;
}
