#!/usr/bin/env node
/**
 * Phase 25 Plan 01 — D-05 source-import rename audit gate.
 *
 * Walks the workspace and fails if any source file outside the allowlist
 * still imports the unscoped name "lattice". The canonical scoped name is
 * @full-self-browsing/lattice; any bare "lattice" import is a Phase 24 rename
 * regression (PITFALLS RENAME-1) that the tarball gate would also catch but
 * this script catches earlier — at commit time, not at pack time.
 *
 * Five anti-pattern shapes are matched:
 *   - from "lattice"
 *   - import("lattice")
 *   - require("lattice")
 *   - vi.doMock("lattice")
 *   - vi.doUnmock("lattice")
 *
 * Allowlist (legitimate bare "lattice" strings that must not trigger failure):
 *   - packages/lattice-cli/package.json   (bin: { "lattice": ... } per RENAME-2)
 *   - packages/lattice/scripts/check-cli-deps.mjs (its FORBIDDEN array context)
 *
 * Skipped directories: node_modules, dist, .git, .changeset, .planning,
 * coverage. .planning is excluded because PITFALLS / CONTEXT docs cite the
 * anti-patterns as illustrative examples, not code.
 *
 * Exit codes:
 *   0 — workspace is clean
 *   1 — at least one offender found
 *
 * Dependencies: zero external npm packages. Uses node: built-ins only.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const walkRoot = join(here, "..");

const SKIP_NAMES = new Set([
  "node_modules",
  "dist",
  ".git",
  ".changeset",
  ".planning",
  "coverage",
]);

const SKIP_EXTENSIONS = new Set([".tgz", ".log", ".lock"]);

const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
]);

const ALLOWLIST_FILES = new Set([
  "packages/lattice-cli/package.json",
  "packages/lattice/scripts/check-cli-deps.mjs",
  // This script documents the anti-patterns it scans for in its own JSDoc
  // header; allowlisting it prevents a self-match false positive.
  "scripts/verify-rename.mjs",
  // The FSB dogfood runner generates a downstream smoke test that imports the
  // bare "lattice" name. That name resolves through a node_modules/lattice ->
  // @full-self-browsing/lattice symlink the runner creates on purpose to
  // emulate FSB's import convention, so the bare import is deliberate alias
  // usage in generated test code, not a rename regression.
  "scripts/dogfood-fsb-candidate.mjs",
]);

const PATTERNS = [
  { name: "from-import", re: /from\s+["']lattice["']/ },
  { name: "dynamic-import", re: /import\(\s*["']lattice["']\s*\)/ },
  { name: "require", re: /require\(\s*["']lattice["']\s*\)/ },
  { name: "vi.doMock", re: /vi\.doMock\(\s*["']lattice["']/ },
  { name: "vi.doUnmock", re: /vi\.doUnmock\(\s*["']lattice["']/ },
];

function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_NAMES.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const ext = extOf(entry.name);
      if (SKIP_EXTENSIONS.has(ext)) continue;
      yield full;
    }
  }
}

function toRepoRelative(fullPath) {
  return relative(walkRoot, fullPath).split(sep).join("/");
}

async function main() {
  const offenders = [];
  let scanned = 0;
  for await (const fullPath of walk(walkRoot)) {
    const rel = toRepoRelative(fullPath);
    if (ALLOWLIST_FILES.has(rel)) continue;
    const ext = extOf(fullPath);
    if (!SCANNED_EXTENSIONS.has(ext)) continue;
    scanned += 1;
    const text = await readFile(fullPath, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const pattern of PATTERNS) {
        if (pattern.re.test(line)) {
          offenders.push({
            file: rel,
            line: i + 1,
            pattern: pattern.name,
            match: line.trim(),
          });
        }
      }
    }
  }
  if (offenders.length > 0) {
    for (const o of offenders) {
      console.error(`[verify-rename] FAIL — ${o.file}:${o.line} matched ${o.pattern}: ${o.match}`);
    }
    process.exit(1);
  }
  console.log(`[verify-rename] OK — scanned ${scanned} files, no stale unscoped lattice imports found`);
}

main().catch((err) => {
  console.error(`[verify-rename] FAIL — unexpected error: ${(err && err.stack) || String(err)}`);
  process.exit(1);
});
