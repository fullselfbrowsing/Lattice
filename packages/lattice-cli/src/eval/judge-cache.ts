/**
 * Disk-backed judge cache and the cache-key hash recipe (Plan 12-01).
 *
 * Per CONTEXT.md "Judge Caching":
 *   cache key = SHA-256(fixtureId || NUL || modelFingerprint || NUL ||
 *                       judgePrompt || NUL || outputCanonical)
 *
 * The null-byte separator is unambiguous: it guarantees that
 * `("ab", "cd")` and `("a", "bcd")` produce different keys even when fields are
 * arbitrary UTF-8 strings (JSON-encoded outputs cannot legally contain raw
 * `\u0000` outside of escapes).
 *
 * Pitfall #1 (path traversal): cache keys are gated by /^[a-f0-9]{64}$/u
 * before any filesystem call — same precedent as `artifact-loader.ts`.
 *
 * Atomicity: `set` writes to `<path>.tmp` then renames; `get` is best-effort
 * (missing file -> undefined; malformed file -> undefined). Cache corruption
 * is recoverable: re-running the judge produces the canonical entry.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { JudgeCache } from "./judge.js";

const KEY_REGEX = /^[a-f0-9]{64}$/u;
const NUL = "\u0000";

export interface JudgeCacheError {
  readonly kind: "missing" | "malformed" | "invalid-key";
  readonly key: string;
  readonly path?: string;
  readonly message: string;
}

export function isJudgeCacheError(value: unknown): value is JudgeCacheError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "missing" && v.kind !== "malformed" && v.kind !== "invalid-key") {
    return false;
  }
  if (typeof v.key !== "string") return false;
  if (typeof v.message !== "string") return false;
  return true;
}

function fail(
  kind: JudgeCacheError["kind"],
  key: string,
  message: string,
  path?: string,
): JudgeCacheError {
  return path === undefined
    ? { kind, key, message }
    : { kind, key, path, message };
}

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i += 1) {
    out += (view[i]! >>> 4).toString(16);
    out += (view[i]! & 0x0f).toString(16);
  }
  return out;
}

export async function computeJudgeCacheKey(
  fixtureId: string,
  modelFingerprint: string,
  judgePrompt: string,
  outputCanonical: string,
): Promise<string> {
  const joined = [fixtureId, modelFingerprint, judgePrompt, outputCanonical].join(NUL);
  const bytes = new TextEncoder().encode(joined);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

interface CachedEntryShape {
  readonly samples: readonly number[];
  readonly score: number;
}

function isCachedEntryShape(value: unknown): value is CachedEntryShape {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.score !== "number" || !Number.isFinite(v.score)) return false;
  if (!Array.isArray(v.samples)) return false;
  for (const sample of v.samples) {
    if (typeof sample !== "number" || !Number.isFinite(sample)) return false;
  }
  return true;
}

export function createDiskJudgeCache(dir: string): JudgeCache {
  const root = resolve(dir);

  return {
    async get(key: string): Promise<CachedEntryShape | undefined> {
      if (!KEY_REGEX.test(key)) {
        throw fail(
          "invalid-key",
          key,
          "Judge cache key must be a 64-char lowercase hex SHA-256 digest. Refusing to read.",
        );
      }
      const filePath = join(root, `${key}.json`);
      let text: string;
      try {
        text = await readFile(filePath, "utf8");
      } catch {
        return undefined;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return undefined;
      }
      if (!isCachedEntryShape(parsed)) return undefined;
      return parsed;
    },

    async set(key: string, value: CachedEntryShape): Promise<void> {
      if (!KEY_REGEX.test(key)) {
        throw fail(
          "invalid-key",
          key,
          "Judge cache key must be a 64-char lowercase hex SHA-256 digest. Refusing to write.",
        );
      }
      await mkdir(root, { recursive: true });
      const filePath = join(root, `${key}.json`);
      const tmpPath = `${filePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(value), "utf8");
      await rename(tmpPath, filePath);
    },
  };
}
