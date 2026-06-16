import type {
  AgentRunSnapshot,
  EvalOptions,
  EvalRegression,
} from "@full-self-browsing/lattice";

export type AgentEvalFixtureVerdict = "match" | "regression" | "new-fixture";

export interface AgentEvalFixtureFile {
  readonly version: "lattice-agent-eval-fixture/v1";
  readonly fixtureId: string;
  readonly snapshot: AgentRunSnapshot;
}

export interface AgentEvalBaselineFile {
  readonly version: "lattice-agent-eval-baseline/v1";
  readonly recordedAt?: string;
  readonly fixtures: Record<string, AgentRunSnapshot>;
}

export interface AgentEvalConfig extends EvalOptions {
  readonly fixturesDir: string;
  readonly baselinePath: string;
}

export interface AgentEvalLoadError {
  readonly kind: "missing" | "malformed";
  readonly path: string;
  readonly message: string;
}

export interface AgentEvalIterationOutcome {
  readonly baseline: number | null;
  readonly current: number;
  readonly delta: number | null;
  readonly limit: number;
  readonly regressed: boolean;
}

export interface AgentEvalCostOutcome {
  readonly baseline: number | null;
  readonly current: number | null;
  readonly deltaPct: number | null;
  readonly limit: number;
  readonly regressed: boolean;
  readonly mixedCostUnknown: boolean;
}

export interface AgentEvalFixtureReport {
  readonly fixtureId: string;
  readonly verdict: AgentEvalFixtureVerdict;
  readonly baseline: AgentRunSnapshot | null;
  readonly current: AgentRunSnapshot;
  readonly regressions: readonly EvalRegression[];
  readonly iterationsToGoal: AgentEvalIterationOutcome;
  readonly costUsd: AgentEvalCostOutcome;
}

export interface AgentEvalRunSummary {
  readonly total: number;
  readonly passed: number;
  readonly regressed: number;
  readonly newFixtures: number;
}

export interface AgentEvalRunReport {
  readonly version: "lattice-agent-eval/v1";
  readonly ranAt: string;
  readonly fixturesDir: string;
  readonly baselinePath: string;
  readonly fixtures: readonly AgentEvalFixtureReport[];
  readonly summary: AgentEvalRunSummary;
  readonly exitCode: 0 | 1 | 2;
}
