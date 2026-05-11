/**
 * Baseline loader, atomic writer, and cost/quality comparators (Plan 12-01).
 *
 * The baseline file holds the last-known-good per-fixture cost and quality
 * floor. CONTEXT.md "Baseline-Relative Gating" pins the JSON shape:
 *
 *   { version: "lattice-eval/v1", recordedAt: ISO,
 *     fixtures: { [id]: { usage: { costUsd: string, ... }, qualityFloor: ... } } }
 *
 * Pitfall #2 (I-JSON / float drift): `costUsd` is string-encoded. All numeric
 * arithmetic guards against NaN/Infinity via `Number.isFinite` before use; on
 * a parse miss the comparator throws `{ kind: "malformed" }` so the runner can
 * map to exit 2.
 *
 * Atomicity: `writeBaseline` writes to `<path>.tmp` then `rename`s, so a crash
 * mid-write cannot leave a half-baked baseline.
 */

import { readFile, rename, writeFile } from "node:fs/promises";

const BASELINE_VERSION = "lattice-eval/v1" as const;

export interface BaselineEntry {
  readonly usage: {
    readonly costUsd: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  readonly qualityFloor: { readonly score: number } | null;
}

export interface Baseline {
  readonly version: "lattice-eval/v1";
  readonly recordedAt: string;
  readonly fixtures: Record<string, BaselineEntry>;
}

export interface BaselineLoadError {
  readonly kind: "missing" | "malformed";
  readonly path: string;
  readonly message: string;
}

export function isBaselineLoadError(value: unknown): value is BaselineLoadError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "missing" && v.kind !== "malformed") return false;
  if (typeof v.path !== "string") return false;
  if (typeof v.message !== "string") return false;
  return true;
}

function failLoad(
  kind: BaselineLoadError["kind"],
  path: string,
  message: string,
): BaselineLoadError {
  return { kind, path, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBaselineEntryShape(value: unknown): value is BaselineEntry {
  if (!isPlainObject(value)) return false;
  const usage = value.usage;
  if (!isPlainObject(usage)) return false;
  if (typeof usage.costUsd !== "string") return false;
  if (typeof usage.promptTokens !== "number") return false;
  if (typeof usage.completionTokens !== "number") return false;
  const qualityFloor = value.qualityFloor;
  if (qualityFloor !== null) {
    if (!isPlainObject(qualityFloor)) return false;
    if (typeof qualityFloor.score !== "number") return false;
  }
  return true;
}

function isBaselineShape(value: unknown): value is Baseline {
  if (!isPlainObject(value)) return false;
  if (value.version !== BASELINE_VERSION) return false;
  if (typeof value.recordedAt !== "string") return false;
  if (!isPlainObject(value.fixtures)) return false;
  for (const entry of Object.values(value.fixtures)) {
    if (!isBaselineEntryShape(entry)) return false;
  }
  return true;
}

export async function loadBaseline(path: string): Promise<Baseline> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw failLoad("missing", path, message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw failLoad("malformed", path, message);
  }

  if (!isBaselineShape(parsed)) {
    throw failLoad(
      "malformed",
      path,
      `Baseline file must match { version: "${BASELINE_VERSION}", recordedAt: string, fixtures: { [id]: { usage: { costUsd: string, promptTokens: number, completionTokens: number }, qualityFloor: { score: number } | null } } }`,
    );
  }
  return parsed;
}

export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  const tmpPath = `${path}.tmp`;
  const serialized = JSON.stringify(baseline, null, 2);
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, path);
}

export interface CostComparison {
  readonly regressed: boolean;
  readonly deltaPct: number;
}

function parseFiniteCost(label: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw failLoad(
      "malformed",
      "",
      `Cost value (${label}) is not a finite number: ${value}`,
    );
  }
  return parsed;
}

export function compareCost(
  replayCostUsd: string,
  baselineCostUsd: string,
  tolerance: number,
): CostComparison {
  const replay = parseFiniteCost("replay", replayCostUsd);
  const baseline = parseFiniteCost("baseline", baselineCostUsd);

  if (baseline === 0) {
    if (replay === 0) {
      return { regressed: false, deltaPct: 0 };
    }
    return { regressed: true, deltaPct: Number.POSITIVE_INFINITY };
  }

  const deltaPct = (replay - baseline) / baseline;
  const regressed = replay > baseline * (1 + tolerance);
  return { regressed, deltaPct };
}

export interface QualityComparison {
  readonly regressed: boolean;
  readonly delta: number;
}

export function compareQuality(
  replayScore: number,
  baselineScore: number,
  tolerance: number,
): QualityComparison {
  if (!Number.isFinite(replayScore) || !Number.isFinite(baselineScore)) {
    throw failLoad(
      "malformed",
      "",
      `Quality score must be finite. Got replay=${replayScore} baseline=${baselineScore}`,
    );
  }
  const delta = replayScore - baselineScore;
  const regressed = replayScore < baselineScore - tolerance;
  return { regressed, delta };
}
