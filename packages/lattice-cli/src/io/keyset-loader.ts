/**
 * Keyset file loader for the lattice CLI.
 *
 * Reads a JSON file containing a `KeyEntry[]` from disk, validates the
 * minimum required shape (kid, state, publicKeyJwk-object), and constructs
 * an in-memory KeySet via `createMemoryKeySet` from the lattice public surface.
 *
 * Path resolution rules:
 *   - No argument             -> `${os.homedir()}/.lattice/keyset.json`
 *   - Starts with "~/"        -> expanded against `os.homedir()` (bash-style)
 *   - Bare "~"                -> the homedir itself
 *   - Anything else           -> resolved via `path.resolve()` (absolute or cwd-relative)
 *
 * Error shape mirrors `MaterializationError` in `packages/lattice/src/replay/materialize.ts`:
 * a plain object literal (no Error subclass) discriminated by `kind`. Callers
 * pattern-match on `kind`.
 *
 * The loader does NOT deep-validate the JWK — `crypto.subtle.importKey` is
 * the source of truth at verify time. The CONTEXT.md note "keep the loader
 * tiny" is honored here.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createMemoryKeySet, type KeyEntry, type KeySet } from "@full-self-browsing/lattice";

export interface KeysetLoadError {
  readonly kind: "missing" | "malformed";
  readonly path: string;
  readonly message: string;
}

const DEFAULT_RELATIVE = join(".lattice", "keyset.json");

export function defaultKeysetPath(): string {
  return join(homedir(), DEFAULT_RELATIVE);
}

export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function isKeyEntryShape(value: unknown): value is KeyEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.kid !== "string") return false;
  if (v.state !== "active" && v.state !== "retired" && v.state !== "revoked") {
    return false;
  }
  if (typeof v.publicKeyJwk !== "object" || v.publicKeyJwk === null) {
    return false;
  }
  return true;
}

function failLoad(
  kind: KeysetLoadError["kind"],
  path: string,
  message: string,
): KeysetLoadError {
  return { kind, path, message };
}

export async function loadKeySetFromPath(rawPath?: string): Promise<KeySet> {
  const requested = rawPath ?? defaultKeysetPath();
  const resolvedPath = resolve(expandTilde(requested));

  let text: string;
  try {
    text = await readFile(resolvedPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw failLoad("missing", resolvedPath, message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw failLoad("malformed", resolvedPath, message);
  }

  if (!Array.isArray(parsed) || !parsed.every(isKeyEntryShape)) {
    throw failLoad(
      "malformed",
      resolvedPath,
      "Keyset file must be a JSON array of KeyEntry { kid, state, publicKeyJwk }.",
    );
  }

  return createMemoryKeySet(parsed);
}

export function isKeysetLoadError(value: unknown): value is KeysetLoadError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "missing" && v.kind !== "malformed") return false;
  if (typeof v.path !== "string") return false;
  if (typeof v.message !== "string") return false;
  return true;
}
