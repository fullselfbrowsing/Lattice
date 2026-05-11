/**
 * Tests for `packages/lattice-cli/src/eval/baseline.ts`.
 *
 * Covers loader (missing / malformed / wrong-version / wrong-shape / valid),
 * cost comparator (within / over / NaN / zero baseline), quality comparator
 * (within / below), atomic write + round-trip, idempotence.
 */

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  compareCost,
  compareQuality,
  isBaselineLoadError,
  loadBaseline,
  writeBaseline,
  type Baseline,
  type BaselineEntry,
} from "../src/eval/baseline.js";

function makeEntry(
  costUsd = "0.000125",
  qualityScore: number | null = 0.92,
): BaselineEntry {
  return {
    usage: { costUsd, promptTokens: 100, completionTokens: 50 },
    qualityFloor: qualityScore === null ? null : { score: qualityScore },
  };
}

function makeBaseline(fixtures: Record<string, BaselineEntry> = { fx1: makeEntry() }): Baseline {
  return {
    version: "lattice-eval/v1",
    recordedAt: "2026-05-11T00:00:00.000Z",
    fixtures,
  };
}

describe("baseline loader / comparators / writer", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-baseline-"));
  });

  afterEach(() => {});

  // ------------- loadBaseline -------------
  it("Test 1: loadBaseline returns typed Baseline for a valid file", async () => {
    const path = join(sandbox, "baseline.json");
    const baseline = makeBaseline();
    await writeFile(path, JSON.stringify(baseline), "utf8");
    const loaded = await loadBaseline(path);
    expect(loaded.version).toBe("lattice-eval/v1");
    expect(loaded.recordedAt).toBe(baseline.recordedAt);
    expect(loaded.fixtures.fx1!.usage.costUsd).toBe("0.000125");
  });

  it("Test 2: loadBaseline throws { kind: 'missing' } for missing file", async () => {
    const path = join(sandbox, "no-such.json");
    let thrown: unknown;
    try {
      await loadBaseline(path);
    } catch (err) {
      thrown = err;
    }
    expect(isBaselineLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("missing");
  });

  it("Test 3: loadBaseline throws { kind: 'malformed' } for invalid JSON", async () => {
    const path = join(sandbox, "broken.json");
    await writeFile(path, "{not-json", "utf8");
    let thrown: unknown;
    try {
      await loadBaseline(path);
    } catch (err) {
      thrown = err;
    }
    expect(isBaselineLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("malformed");
  });

  it("Test 4: loadBaseline throws { kind: 'malformed' } for wrong version", async () => {
    const path = join(sandbox, "wrong-version.json");
    const bad = { ...makeBaseline(), version: "lattice-eval/v2" };
    await writeFile(path, JSON.stringify(bad), "utf8");
    let thrown: unknown;
    try {
      await loadBaseline(path);
    } catch (err) {
      thrown = err;
    }
    expect(isBaselineLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("malformed");
  });

  it("Test 5: loadBaseline throws { kind: 'malformed' } when costUsd is non-string", async () => {
    const path = join(sandbox, "wrong-cost.json");
    const bad = {
      ...makeBaseline(),
      fixtures: {
        fx1: { usage: { costUsd: 0.000125, promptTokens: 100, completionTokens: 50 }, qualityFloor: null },
      },
    };
    await writeFile(path, JSON.stringify(bad), "utf8");
    let thrown: unknown;
    try {
      await loadBaseline(path);
    } catch (err) {
      thrown = err;
    }
    expect(isBaselineLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("malformed");
  });

  it("Test 5b: loadBaseline throws { kind: 'malformed' } when recordedAt missing", async () => {
    const path = join(sandbox, "wrong-recordedAt.json");
    await writeFile(
      path,
      JSON.stringify({ version: "lattice-eval/v1", fixtures: {} }),
      "utf8",
    );
    let thrown: unknown;
    try {
      await loadBaseline(path);
    } catch (err) {
      thrown = err;
    }
    expect(isBaselineLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("malformed");
  });

  // ------------- compareCost -------------
  it("Test 6: compareCost within tolerance -> regressed=false, finite deltaPct", () => {
    // replay=0.000110, baseline=0.000100, tolerance=0.10 -> within (1.10 cap)
    const r = compareCost("0.000110", "0.000100", 0.10);
    expect(r.regressed).toBe(false);
    expect(r.deltaPct).toBeCloseTo(0.10, 5);
  });

  it("Test 7: compareCost over tolerance -> regressed=true, finite deltaPct", () => {
    const r = compareCost("0.000200", "0.000100", 0.10);
    expect(r.regressed).toBe(true);
    expect(Number.isFinite(r.deltaPct)).toBe(true);
    expect(r.deltaPct).toBeCloseTo(1.0, 5);
  });

  it("Test 8: compareCost with baseline=0 and replay>0 -> regressed=true, deltaPct===Infinity", () => {
    const r = compareCost("0.000100", "0", 0.10);
    expect(r.regressed).toBe(true);
    expect(r.deltaPct).toBe(Number.POSITIVE_INFINITY);
  });

  it("Test 9: compareCost with NaN string -> throws { kind: 'malformed' }", () => {
    expect(() => compareCost("not-a-number", "0.000100", 0.10)).toThrow();
    let thrown: unknown;
    try {
      compareCost("not-a-number", "0.000100", 0.10);
    } catch (err) {
      thrown = err;
    }
    expect(isBaselineLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("malformed");
  });

  // ------------- compareQuality -------------
  it("Test 10: compareQuality within tolerance -> regressed=false", () => {
    // replay=0.90, baseline=0.92, tolerance=0.05 -> 0.90 >= 0.92-0.05=0.87 OK
    const r = compareQuality(0.90, 0.92, 0.05);
    expect(r.regressed).toBe(false);
    expect(r.delta).toBeCloseTo(-0.02, 5);
  });

  it("Test 11: compareQuality below threshold -> regressed=true with negative delta", () => {
    const r = compareQuality(0.80, 0.92, 0.05);
    expect(r.regressed).toBe(true);
    expect(r.delta).toBeLessThan(0);
  });

  // ------------- writeBaseline / round-trip -------------
  it("Test 12: writeBaseline + loadBaseline round-trips with byte-identical fixtures shape", async () => {
    const path = join(sandbox, "baseline.json");
    const baseline = makeBaseline({
      fx1: makeEntry("0.000100", 0.95),
      fx2: makeEntry("0.000200", null),
    });
    await writeBaseline(path, baseline);
    const loaded = await loadBaseline(path);
    expect(loaded).toEqual(baseline);
  });

  it("Test 13: writeBaseline is idempotent (write twice, both succeed; final file is well-formed)", async () => {
    const path = join(sandbox, "baseline.json");
    const baseline = makeBaseline();
    await writeBaseline(path, baseline);
    await writeBaseline(path, baseline);
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Baseline;
    expect(parsed.version).toBe("lattice-eval/v1");
  });
});
