/**
 * Shared eval types (Plan 12-01).
 *
 * These types are imported by the Plan 02 runner and judge-cache wiring. The
 * stdout JSON shape is locked to the CONTEXT.md "Output Format" block and
 * MUST NOT drift without a `lattice-eval/<version>` bump.
 *
 * `tripwireOutcomes: readonly never[]` is the v1.1 forward-compat hook
 * (CONTEXT.md "Tripwires-as-Eval-Scorers (Deferred Hook)"): always empty in
 * v1.1, reserved so a v1.2 reader can populate it without an envelope bump.
 */

export type FixtureVerdict = "match" | "drift" | "regression" | "load-failed";

export type RegressionKind =
  | null
  | "output-hash-mismatch"
  | "schema-mismatch"
  | "cost-regression"
  | "quality-regression";

export type DeterminismClass = "exact" | "semantic-cheap" | "semantic-expensive";

export interface FixtureReportUsage {
  readonly costUsd: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface FixtureReport {
  readonly fixtureId: string;
  readonly verdict: FixtureVerdict;
  readonly regressionKind: RegressionKind;
  readonly usage: FixtureReportUsage | null;
  readonly qualityScore: number | null;
  readonly deltaCostPct: number | null;
  readonly deltaQuality: number | null;
}

export interface EvalRunSummary {
  readonly total: number;
  readonly passed: number;
  readonly regressed: number;
  readonly newFixtures: number;
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
  readonly keyPath: string | undefined;
  readonly costTolerance: number;
  readonly qualityTolerance: number;
  readonly judgeN: number;
  readonly initBaseline: boolean;
}
