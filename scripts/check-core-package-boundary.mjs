#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "check-core-package-boundary";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageDir = join(repoRoot, "packages", "lattice");
const packageJsonPath = join(packageDir, "package.json");
const distDir = join(packageDir, "dist");

const FORBIDDEN_CORE_PACKAGES = [
  "@anthropic-ai/sdk",
  "@arizeai/phoenix-otel",
  "@aws-sdk/client-kms",
  "@google-cloud/kms",
  "@google/genai",
  "@langfuse/otel",
  "@openrouter/sdk",
  "@opentelemetry/api",
  "@opentelemetry/exporter-trace-otlp-http",
  "@opentelemetry/sdk-node",
  "@opentelemetry/semantic-conventions",
  "better-sqlite3",
  "citty",
  "commander",
  "ffmpeg-static",
  "openai",
  "sharp",
  "ws",
  "yargs",
];

const SCANNED_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts"]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importPattern(packageName) {
  const escaped = escapeRegExp(packageName);
  return new RegExp(
    `(?:from\\s+["']${escaped}["']|import\\s+["']${escaped}["']|import\\s*\\(\\s*["']${escaped}["']|require\\s*\\(\\s*["']${escaped}["'])`,
  );
}

function toRepoRelative(fullPath) {
  return relative(repoRoot, fullPath).split(sep).join("/");
}

function extOf(filePath) {
  if (filePath.endsWith(".d.ts")) return ".ts";
  return extname(filePath);
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.error(
        `[${SCRIPT_NAME}] FAIL - packages/lattice/dist not found. Run \`pnpm --filter @full-self-browsing/lattice build\` first.`,
      );
      process.exit(1);
    }
    throw err;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && SCANNED_EXTENSIONS.has(extOf(entry.name))) {
      yield full;
    }
  }
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (err) {
    console.error(`[${SCRIPT_NAME}] FAIL - could not read packages/lattice/package.json: ${(err && err.message) || String(err)}`);
    process.exit(1);
  }
}

function inspectManifest(manifest) {
  const offenders = [];
  for (const blockName of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const block = manifest[blockName];
    if (!block || typeof block !== "object") continue;
    for (const packageName of FORBIDDEN_CORE_PACKAGES) {
      if (Object.prototype.hasOwnProperty.call(block, packageName)) {
        offenders.push({ surface: `packages/lattice/package.json ${blockName}`, packageName });
      }
    }
  }
  return offenders;
}

async function inspectDist() {
  const offenders = [];
  const patterns = new Map(
    FORBIDDEN_CORE_PACKAGES.map((packageName) => [packageName, importPattern(packageName)]),
  );

  for await (const file of walk(distDir)) {
    const text = await readFile(file, "utf8");
    for (const [packageName, pattern] of patterns) {
      if (pattern.test(text)) {
        offenders.push({ surface: toRepoRelative(file), packageName });
      }
    }
  }

  return offenders;
}

async function main() {
  const manifest = await readManifest();
  const offenders = [
    ...inspectManifest(manifest),
    ...(await inspectDist()),
  ];

  if (offenders.length > 0) {
    for (const offender of offenders) {
      console.error(`[${SCRIPT_NAME}] FAIL - ${offender.surface} -> ${offender.packageName}`);
    }
    process.exit(1);
  }

  console.log(`[${SCRIPT_NAME}] OK - core runtime boundary clean`);
}

main().catch((err) => {
  console.error(`[${SCRIPT_NAME}] FAIL - unexpected error: ${(err && err.stack) || String(err)}`);
  process.exit(1);
});
