import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  runDiagnosticsLmStudio,
  type DiagnosticsDeps,
} from "../src/commands/diagnostics.js";
import type { LmStudioDiagnosticsReport } from "../src/diagnostics/lm-studio.js";

interface CaptureBag {
  readonly stdout: string[];
  readonly stderr: string[];
  exitCode: number | null;
}

function captureDeps(): {
  readonly deps: DiagnosticsDeps;
  readonly bag: CaptureBag;
} {
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

function providerAttempt(
  timestamp: string,
  runId: string,
  status: "started" | "succeeded" | "failed",
  providerId = "lm-studio",
  metadata: Record<string, unknown> = {},
): {
  readonly kind: "provider.attempt";
  readonly timestamp: string;
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly metadata: Record<string, unknown>;
} {
  return {
    kind: "provider.attempt",
    timestamp,
    runId,
    providerId,
    modelId: "local-model",
    metadata: { status, ...metadata },
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("lattice diagnostics lm-studio", () => {
  let sandbox: string;
  let eventsPath: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-diagnostics-"));
    eventsPath = join(sandbox, "events.json");
  });

  it("summarizes LM Studio latency tails from local run events", async () => {
    await writeJson(eventsPath, [
      providerAttempt("2026-06-16T00:00:00.000Z", "run-1", "started"),
      providerAttempt("2026-06-16T00:00:00.100Z", "run-1", "succeeded"),
      providerAttempt("2026-06-16T00:00:01.000Z", "run-2", "started"),
      providerAttempt("2026-06-16T00:00:01.200Z", "run-2", "failed"),
      providerAttempt("2026-06-16T00:00:02.000Z", "run-3", "started"),
      providerAttempt("2026-06-16T00:00:02.300Z", "run-3", "succeeded"),
      providerAttempt("2026-06-16T00:00:03.000Z", "other", "started", "openai"),
      providerAttempt("2026-06-16T00:00:03.900Z", "other", "succeeded", "openai"),
    ]);

    const { deps, bag } = captureDeps();
    await runDiagnosticsLmStudio({ events: eventsPath }, deps);

    expect(bag.exitCode).toBe(0);
    const report = JSON.parse(bag.stdout[0]!) as LmStudioDiagnosticsReport;
    expect(report.version).toBe("lattice-diagnostics/lm-studio-latency/v1");
    expect(report.summary).toMatchObject({
      total: 3,
      succeeded: 2,
      failed: 1,
      incomplete: 0,
      minMs: 100,
      p50Ms: 200,
      p95Ms: 300,
      p99Ms: 300,
      maxMs: 300,
    });
    expect(report.slowest[0]?.runId).toBe("run-3");
  });

  it("supports object-shaped event files, explicit duration metadata, and incomplete counts", async () => {
    await writeJson(eventsPath, {
      events: [
        providerAttempt("2026-06-16T00:00:00.000Z", "run-open", "started"),
        providerAttempt(
          "2026-06-16T00:00:01.000Z",
          "run-duration",
          "succeeded",
          "lm-studio",
          { durationMs: 42 },
        ),
      ],
    });

    const { deps, bag } = captureDeps();
    await runDiagnosticsLmStudio({ events: eventsPath }, deps);

    expect(bag.exitCode).toBe(0);
    const report = JSON.parse(bag.stdout[0]!) as LmStudioDiagnosticsReport;
    expect(report.summary.total).toBe(1);
    expect(report.summary.incomplete).toBe(1);
    expect(report.summary.minMs).toBe(42);
  });

  it("returns a valid zero-count report when no LM Studio attempts exist", async () => {
    await writeJson(eventsPath, [
      providerAttempt("2026-06-16T00:00:00.000Z", "other", "started", "openai"),
    ]);

    const { deps, bag } = captureDeps();
    await runDiagnosticsLmStudio({ events: eventsPath }, deps);

    expect(bag.exitCode).toBe(0);
    const report = JSON.parse(bag.stdout[0]!) as LmStudioDiagnosticsReport;
    expect(report.summary.total).toBe(0);
    expect(report.summary.minMs).toBeNull();
  });

  it("exits 2 for malformed event files", async () => {
    await writeJson(eventsPath, [{ kind: "provider.attempt", timestamp: "x" }]);

    const { deps, bag } = captureDeps();
    await runDiagnosticsLmStudio({ events: eventsPath }, deps);

    expect(bag.exitCode).toBe(2);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr[0]).toMatch(
      /^FAIL kind=diagnostics-lm-studio-malformed reason=/,
    );
  });
});
