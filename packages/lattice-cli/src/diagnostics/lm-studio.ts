import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { RunEvent } from "@full-self-browsing/lattice";

export interface LmStudioDiagnosticsConfig {
  readonly eventsPath: string;
}

export interface LmStudioDiagnosticsLoadError {
  readonly kind: "missing" | "malformed";
  readonly path: string;
  readonly message: string;
}

export interface LmStudioAttemptLatency {
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string | null;
  readonly status: "succeeded" | "failed";
  readonly startedAt: string | null;
  readonly completedAt: string;
  readonly latencyMs: number;
}

export interface LmStudioLatencySummary {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly incomplete: number;
  readonly minMs: number | null;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly p99Ms: number | null;
  readonly maxMs: number | null;
  readonly averageMs: number | null;
}

export interface LmStudioDiagnosticsReport {
  readonly version: "lattice-diagnostics/lm-studio-latency/v1";
  readonly eventsPath: string;
  readonly providerId: "lm-studio";
  readonly generatedAt: string;
  readonly summary: LmStudioLatencySummary;
  readonly slowest: readonly LmStudioAttemptLatency[];
  readonly attempts: readonly LmStudioAttemptLatency[];
  readonly exitCode: 0 | 2;
}

export interface LmStudioDiagnosticsDeps {
  readonly now?: () => string;
}

interface OpenAttempt {
  readonly runId: string;
  readonly providerId: string;
  readonly modelId: string | null;
  readonly startedAt: string;
}

export function isLmStudioDiagnosticsLoadError(
  value: unknown,
): value is LmStudioDiagnosticsLoadError {
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
  kind: LmStudioDiagnosticsLoadError["kind"],
  path: string,
  message: string,
): LmStudioDiagnosticsLoadError {
  return { kind, path, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRunEventShape(value: unknown): value is RunEvent {
  if (!isObject(value)) return false;
  if (typeof value.kind !== "string") return false;
  if (typeof value.timestamp !== "string") return false;
  if (typeof value.runId !== "string") return false;
  if (
    value.providerId !== undefined &&
    typeof value.providerId !== "string"
  ) {
    return false;
  }
  if (value.modelId !== undefined && typeof value.modelId !== "string") {
    return false;
  }
  if (value.metadata !== undefined && !isObject(value.metadata)) return false;
  return true;
}

function readEvents(parsed: unknown, path: string): readonly RunEvent[] {
  const eventsValue = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed.events)
      ? parsed.events
      : null;
  if (eventsValue === null) {
    throw loadError(
      "malformed",
      path,
      "Expected an array of RunEvent objects or an object with events[].",
    );
  }
  for (const [index, event] of eventsValue.entries()) {
    if (!isRunEventShape(event)) {
      throw loadError(
        "malformed",
        path,
        `events[${index}] is not a valid RunEvent shape.`,
      );
    }
  }
  return eventsValue;
}

export async function loadRunEvents(path: string): Promise<readonly RunEvent[]> {
  const resolvedPath = resolve(path);
  let text: string;
  try {
    text = await readFile(resolvedPath, "utf8");
  } catch (err) {
    throw loadError("missing", resolvedPath, readErrorMessage(err));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw loadError("malformed", resolvedPath, readErrorMessage(err));
  }

  return readEvents(parsed, resolvedPath);
}

function normalizeProviderId(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLmStudioEvent(event: RunEvent): boolean {
  return normalizeProviderId(event.providerId) === "lmstudio";
}

function metadataStatus(event: RunEvent): string | null {
  const value = event.metadata?.status;
  return typeof value === "string" ? value : null;
}

function readDurationMs(event: RunEvent): number | null {
  const metadata = event.metadata ?? {};
  for (const key of ["durationMs", "latencyMs", "elapsedMs", "elapsedTimeMs"]) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

function toMs(timestamp: string): number | null {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function attemptKey(event: RunEvent): string {
  return [
    event.runId,
    event.providerId ?? "",
    event.modelId ?? "",
  ].join("\u0000");
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index] ?? null;
}

function summarizeAttempts(
  attempts: readonly LmStudioAttemptLatency[],
  incomplete: number,
): LmStudioLatencySummary {
  const latencies = attempts.map((a) => a.latencyMs).sort((a, b) => a - b);
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  return {
    total: attempts.length,
    succeeded: attempts.filter((a) => a.status === "succeeded").length,
    failed: attempts.filter((a) => a.status === "failed").length,
    incomplete,
    minMs: latencies[0] ?? null,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxMs: latencies[latencies.length - 1] ?? null,
    averageMs:
      latencies.length === 0 ? null : totalLatency / latencies.length,
  };
}

export function summarizeLmStudioLatency(
  events: readonly RunEvent[],
): {
  readonly attempts: readonly LmStudioAttemptLatency[];
  readonly incomplete: number;
} {
  const open = new Map<string, OpenAttempt[]>();
  const attempts: LmStudioAttemptLatency[] = [];

  for (const event of events) {
    if (event.kind !== "provider.attempt" || !isLmStudioEvent(event)) continue;
    const status = metadataStatus(event);
    const key = attemptKey(event);

    if (status === "started") {
      const queue = open.get(key) ?? [];
      queue.push({
        runId: event.runId,
        providerId: event.providerId ?? "lm-studio",
        modelId: event.modelId ?? null,
        startedAt: event.timestamp,
      });
      open.set(key, queue);
      continue;
    }

    if (status !== "succeeded" && status !== "failed") continue;

    const queue = open.get(key) ?? [];
    const started = queue.shift() ?? null;
    if (queue.length === 0) {
      open.delete(key);
    } else {
      open.set(key, queue);
    }

    const explicitDuration = readDurationMs(event);
    const startedMs = started === null ? null : toMs(started.startedAt);
    const completedMs = toMs(event.timestamp);
    const inferredDuration =
      startedMs === null || completedMs === null
        ? null
        : Math.max(0, completedMs - startedMs);
    const latencyMs = explicitDuration ?? inferredDuration;
    if (latencyMs === null) continue;

    attempts.push({
      runId: event.runId,
      providerId: event.providerId ?? "lm-studio",
      modelId: event.modelId ?? null,
      status,
      startedAt: started?.startedAt ?? null,
      completedAt: event.timestamp,
      latencyMs,
    });
  }

  const incomplete = Array.from(open.values()).reduce(
    (sum, queue) => sum + queue.length,
    0,
  );

  return { attempts, incomplete };
}

export async function runLmStudioDiagnostics(
  config: LmStudioDiagnosticsConfig,
  deps: LmStudioDiagnosticsDeps = {},
): Promise<LmStudioDiagnosticsReport> {
  const now = deps.now ?? (() => new Date().toISOString());
  const resolvedPath = resolve(config.eventsPath);
  const events = await loadRunEvents(resolvedPath);
  const { attempts, incomplete } = summarizeLmStudioLatency(events);
  const slowest = [...attempts]
    .sort((a, b) => b.latencyMs - a.latencyMs)
    .slice(0, 5);

  return {
    version: "lattice-diagnostics/lm-studio-latency/v1",
    eventsPath: resolvedPath,
    providerId: "lm-studio",
    generatedAt: now(),
    summary: summarizeAttempts(attempts, incomplete),
    slowest,
    attempts,
    exitCode: 0,
  };
}
