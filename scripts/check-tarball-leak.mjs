#!/usr/bin/env node
/**
 * Phase 25 Plan 01 — D-04 tarball-leak audit gate.
 *
 * Runs `pnpm pack` against each publishable package, extracts the in-tarball
 * `package.json`, and fails if any unscoped "lattice" reference appears in:
 *   - dependencies / devDependencies / peerDependencies / optionalDependencies keys
 *   - exports map (any value containing the bare word "lattice" not preceded by "@full-self-browsing/")
 *   - types field (string)
 *   - tsd.compilerOptions.paths keys
 *
 * Phase 49 extension:
 *   - published packages must not ship install-time lifecycle scripts
 *   - the core runtime package must not depend directly on optional native/heavy integrations
 *
 * Implements PITFALLS RENAME-1 / RENAME-3 forever-guard: catches a regression
 * where the rename to @full-self-browsing/* leaves a stale bare "lattice"
 * reference that would ship to the registry tarball.
 *
 * Exit codes:
 *   0 — both publishable tarballs are clean
 *   1 — at least one offender found, or pnpm pack failed
 *
 * Dependencies: zero external npm packages. Uses node: built-ins plus the
 * `pnpm` binary (workspace package manager, present on CI per D-08) and the
 * `tar` binary (ubuntu-latest standard).
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Hard-coded publishable set. Changing this list should be a deliberate edit
// to this script, not a side-effect of adding a new workspace directory.
const PACKAGES = [
  { dir: "packages/lattice", name: "@full-self-browsing/lattice", kind: "runtime" },
  { dir: "packages/lattice-cli", name: "@full-self-browsing/lattice-cli", kind: "cli" },
];

// Matches the bare token "lattice" when it is NOT preceded by the
// @full-self-browsing/ scope. Same logic the Phase 24 tarball-inspection
// step used.
const BARE_LATTICE = /(?<!@full-self-browsing\/)\blattice\b/;

const INSTALL_LIFECYCLE_SCRIPTS = [
  "preinstall",
  "install",
  "postinstall",
  "prepare",
];

// Core package direct-dependency denylist. These integrations are useful in
// adapters/examples, but they must not become always-on runtime install cost.
const RUNTIME_DISALLOWED_DEPENDENCIES = new Set([
  "@aws-sdk/client-s3",
  "@ffmpeg-installer/ffmpeg",
  "@langfuse/tracing",
  "@opentelemetry/api",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/sdk-node",
  "better-sqlite3",
  "ffmpeg-static",
  "langfuse",
  "music-metadata",
  "pdf-parse",
  "pdfjs-dist",
  "sharp",
  "sqlite3",
]);

function runCommand(cmd, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

function inspectManifest(entry, manifest) {
  const offenders = [];
  const { name } = entry;
  const depGroups = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  for (const group of depGroups) {
    const block = manifest[group];
    if (block && typeof block === "object") {
      for (const key of Object.keys(block)) {
        if (key === "lattice") {
          offenders.push({ package: name, surface: `${group}["${key}"]`, value: block[key] });
        }
        if (entry.kind === "runtime" && RUNTIME_DISALLOWED_DEPENDENCIES.has(key)) {
          offenders.push({ package: name, surface: `${group}["${key}"]`, value: "disallowed core dependency" });
        }
      }
    }
  }
  const scripts = manifest.scripts;
  if (scripts && typeof scripts === "object") {
    for (const scriptName of INSTALL_LIFECYCLE_SCRIPTS) {
      if (typeof scripts[scriptName] === "string" && scripts[scriptName].trim().length > 0) {
        offenders.push({ package: name, surface: `scripts["${scriptName}"]`, value: scripts[scriptName] });
      }
    }
  }
  if (manifest.exports !== undefined) {
    const exportsStr = JSON.stringify(manifest.exports);
    if (BARE_LATTICE.test(exportsStr)) {
      offenders.push({ package: name, surface: "exports", value: exportsStr });
    }
  }
  if (typeof manifest.types === "string" && BARE_LATTICE.test(manifest.types)) {
    offenders.push({ package: name, surface: "types", value: manifest.types });
  }
  const tsdPaths = manifest.tsd?.compilerOptions?.paths;
  if (tsdPaths && typeof tsdPaths === "object") {
    for (const key of Object.keys(tsdPaths)) {
      if (key === "lattice") {
        offenders.push({ package: name, surface: `tsd.compilerOptions.paths["${key}"]`, value: JSON.stringify(tsdPaths[key]) });
      }
    }
  }
  return offenders;
}

async function inspectPackage(entry) {
  const tmp = await mkdtemp(join(tmpdir(), "lattice-pack-"));
  try {
    const packResult = await runCommand("pnpm", ["pack", "--pack-destination", tmp], {
      cwd: join(repoRoot, entry.dir),
    });
    if (packResult.code !== 0) {
      return {
        offenders: [],
        fatal: `[check-tarball-leak] FAIL — pnpm pack failed for ${entry.dir} (exit ${packResult.code}): ${packResult.stderr.trim()}`,
        tarball: null,
      };
    }
    const tmpFiles = await readdir(tmp);
    const tgz = tmpFiles.find((f) => f.endsWith(".tgz"));
    if (!tgz) {
      return {
        offenders: [],
        fatal: `[check-tarball-leak] FAIL — no .tgz produced by pnpm pack in ${tmp}`,
        tarball: null,
      };
    }
    const tarResult = await runCommand("tar", ["-xOf", join(tmp, tgz), "package/package.json"], {});
    if (tarResult.code !== 0) {
      return {
        offenders: [],
        fatal: `[check-tarball-leak] FAIL — tar extract failed for ${tgz} (exit ${tarResult.code}): ${tarResult.stderr.trim()}`,
        tarball: tgz,
      };
    }
    let manifest;
    try {
      manifest = JSON.parse(tarResult.stdout);
    } catch (err) {
      return {
        offenders: [],
        fatal: `[check-tarball-leak] FAIL — package/package.json in ${tgz} is not valid JSON: ${(err && err.message) || String(err)}`,
        tarball: tgz,
      };
    }
    const offenders = inspectManifest(entry, manifest);
    return { offenders, fatal: null, tarball: tgz };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const allOffenders = [];
  const inspectedTarballs = [];
  const fatals = [];
  for (const entry of PACKAGES) {
    const { offenders, fatal, tarball } = await inspectPackage(entry);
    if (fatal) fatals.push(fatal);
    if (tarball) inspectedTarballs.push(`${entry.name}@${tarball}`);
    for (const o of offenders) allOffenders.push(o);
  }
  if (fatals.length > 0) {
    for (const line of fatals) console.error(line);
    process.exit(1);
  }
  if (allOffenders.length > 0) {
    for (const o of allOffenders) {
      console.error(`[check-tarball-leak] FAIL — ${o.package} ${o.surface}: ${o.value}`);
    }
    process.exit(1);
  }
  console.log(`[check-tarball-leak] OK — inspected ${inspectedTarballs.length} tarballs (${inspectedTarballs.join(", ")})`);
}

main().catch((err) => {
  console.error(`[check-tarball-leak] FAIL — unexpected error: ${(err && err.stack) || String(err)}`);
  process.exit(1);
});
