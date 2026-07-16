#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "check-lattice-node20-modular";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageJsonPath = join(repoRoot, "packages", "lattice", "package.json");

const REPRESENTATIVE_EXPORTS = {
  "./audit": [
    "createExternalExecutionAudit",
    "createMemoryKeySet",
    "createReceipt",
    "verifyReceipt",
  ],
  "./context": ["buildContextPack", "estimateTokens"],
  "./artifacts": ["artifact", "toArtifactRef"],
  "./routing": ["routeDeterministically", "createCapabilityCatalog"],
  "./tools": [
    "defineTool",
    "mcpResourceArtifact",
    "parseToolUseEnvelope",
    "validateToolCallRequests",
  ],
  "./eval": ["evalAgentRun"],
  "./core": ["artifact", "prepareCoreRun", "routeDeterministically"],
};

function runCommand(cmd, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      resolvePromise({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

function fail(message) {
  console.error(`[${SCRIPT_NAME}] FAIL - ${message}`);
  process.exit(1);
}

async function readManifest() {
  return JSON.parse(await readFile(packageJsonPath, "utf8"));
}

async function nvmNode20Candidates() {
  const versionsDir = join(homedir(), ".nvm", "versions", "node");
  if (!existsSync(versionsDir)) {
    return [];
  }

  const versions = await readdir(versionsDir);
  return versions
    .filter((version) => /^v20\./u.test(version))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((version) => join(versionsDir, version, "bin", "node"));
}

async function candidateNode20Bins() {
  return [
    process.env.NODE20_BIN,
    process.versions.node.startsWith("20.") ? process.execPath : undefined,
    "node20",
    ...(await nvmNode20Candidates()),
  ].filter((candidate) => candidate !== undefined && candidate.length > 0);
}

async function resolveNode20Bin() {
  for (const candidate of await candidateNode20Bins()) {
    const result = await runCommand(candidate, ["-p", "process.versions.node"]);
    if (result.code === 0 && result.stdout.trim().startsWith("20.")) {
      return { bin: candidate, version: result.stdout.trim() };
    }
  }

  fail(
    "could not find Node 20. Set NODE20_BIN=/path/to/node20 or install Node 20 under nvm.",
  );
}

function inspectMetadata(manifest) {
  if (manifest.engines?.node !== ">=24") {
    fail(`root package engines.node must remain >=24, got ${manifest.engines?.node}`);
  }

  const modules = manifest.lattice?.modules;
  if (modules === undefined || typeof modules !== "object" || modules === null) {
    fail("packages/lattice/package.json must define lattice.modules");
  }

  if (modules["./agents"]?.compatibility !== "node24-runtime") {
    fail("./agents must remain labelled node24-runtime");
  }

  const node20Modules = Object.entries(modules)
    .filter(([, metadata]) => metadata?.compatibility === "node20-compatible")
    .map(([modulePath]) => modulePath)
    .sort();
  const expected = Object.keys(REPRESENTATIVE_EXPORTS).sort();
  if (JSON.stringify(node20Modules) !== JSON.stringify(expected)) {
    fail(`node20-compatible module set changed: expected ${expected.join(", ")}, got ${node20Modules.join(", ")}`);
  }

  return Object.fromEntries(
    node20Modules.map((modulePath) => [
      modulePath,
      REPRESENTATIVE_EXPORTS[modulePath],
    ]),
  );
}

async function runNode20ImportSmoke(node20, exportChecks) {
  const childSource = `
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = ${JSON.stringify(repoRoot)};
const checks = ${JSON.stringify(exportChecks)};

assert.equal(process.versions.node.split(".")[0], "20", "smoke must run under Node 20");

for (const [modulePath, names] of Object.entries(checks)) {
  const fileName = modulePath.slice(2) + ".js";
  const mod = await import(pathToFileURL(join(repoRoot, "packages", "lattice", "dist", fileName)).href);
  for (const name of names) {
    assert.notEqual(mod[name], undefined, modulePath + " export " + name + " is present");
  }
}

console.log("node20 modular import smoke passed", process.versions.node);
`;

  const result = await runCommand(node20.bin, ["--input-type=module", "-e", childSource]);
  if (result.code !== 0) {
    fail(`Node 20 import smoke failed with ${node20.bin}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return result.stdout.trim();
}

const manifest = await readManifest();
const exportChecks = inspectMetadata(manifest);
const node20 = await resolveNode20Bin();
const childOutput = await runNode20ImportSmoke(node20, exportChecks);

console.log(`[${SCRIPT_NAME}] OK - node=${node20.version} modules=${Object.keys(exportChecks).join(", ")}`);
console.log(`[${SCRIPT_NAME}] ${childOutput}`);
