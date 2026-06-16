#!/usr/bin/env node
/**
 * Validate the packed Lattice runtime package as an FSB downstream consumer.
 *
 * The original FSB checkout is read-only input. This script copies the checkout
 * to a temp directory, installs the packed candidate in an isolated temp
 * consumer project, links that node_modules into the FSB temp copy, and runs
 * FSB-side smoke tests there.
 */

import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "dogfood-fsb-candidate";
const DEFAULT_FSB_DIR = "/Users/lakshmanturlapati/Desktop/FSB/automation";
const DEFAULT_LEGACY_TESTS = ["tests/lattice-providers-smoke.test.js"];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

function parseArgs(argv) {
  const parsed = {
    fsbDir: DEFAULT_FSB_DIR,
    keepTemp: false,
    legacyTests: DEFAULT_LEGACY_TESTS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--fsb-dir") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--fsb-dir requires a value");
      parsed.fsbDir = resolve(value);
      i += 1;
    } else if (arg === "--keep-temp") {
      parsed.keepTemp = true;
    } else if (arg === "--legacy-tests") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--legacy-tests requires a comma-separated value");
      parsed.legacyTests = value === "none"
        ? []
        : value.split(",").map((test) => test.trim()).filter(Boolean);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function runCommand(cmd, args, options = {}) {
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

async function mustRun(cmd, args, options, label) {
  const result = await runCommand(cmd, args, options);
  if (result.code !== 0) {
    throw new Error(`${label} failed (exit ${result.code})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

async function gitStatusShort(dir) {
  const result = await runCommand("git", ["status", "--short"], { cwd: dir });
  if (result.code !== 0) {
    throw new Error(`git status failed for ${dir}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

async function packRuntime(packDir) {
  await mustRun("pnpm", ["--filter", "@full-self-browsing/lattice", "build"], {
    cwd: repoRoot,
  }, "runtime build");

  await mustRun("pnpm", ["pack", "--pack-destination", packDir], {
    cwd: join(repoRoot, "packages/lattice"),
  }, "runtime pack");

  const files = await readdir(packDir);
  const tgz = files.find((file) => file.endsWith(".tgz"));
  if (tgz === undefined) {
    throw new Error(`pnpm pack did not produce a .tgz in ${packDir}`);
  }
  return join(packDir, tgz);
}

async function installCandidate(consumerDir, tarballPath) {
  await mkdir(consumerDir, { recursive: true });
  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify({
      name: "lattice-fsb-candidate-consumer",
      private: true,
      type: "module",
    }, null, 2),
  );

  await mustRun("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--loglevel=error",
    tarballPath,
  ], {
    cwd: consumerDir,
  }, "candidate npm install");

  const manifest = JSON.parse(
    await readFile(join(consumerDir, "node_modules/@full-self-browsing/lattice/package.json"), "utf8"),
  );
  const scopedPackageDir = join(consumerDir, "node_modules/@full-self-browsing/lattice");
  const barePackageDir = join(consumerDir, "node_modules/lattice");
  await symlink(scopedPackageDir, barePackageDir, "dir");
  return {
    version: String(manifest.version),
    scopedPackageDir,
  };
}

function shouldCopyFsbPath(fsbDir, sourcePath) {
  const rel = relative(fsbDir, sourcePath);
  if (rel === "") return true;
  const parts = rel.split(sep);
  if (parts.includes("node_modules")) return false;
  if (parts[0] === ".git") return false;
  if (parts[0] === "lattice") return false;
  if (parts[0] === ".planning") return false;
  return true;
}

async function copyFsbCheckout(fsbDir, fsbCopyDir) {
  await cp(fsbDir, fsbCopyDir, {
    recursive: true,
    filter: (sourcePath) => shouldCopyFsbPath(fsbDir, sourcePath),
  });
}

async function writeCandidateSmoke(fsbCopyDir) {
  const testPath = join(fsbCopyDir, "tests/fsb-v14-candidate-smoke.mjs");
  await writeFile(testPath, `import assert from "node:assert/strict";

const lattice = await import("lattice");
const expectedVersion = process.env.EXPECTED_LATTICE_VERSION;

for (const name of [
  "latticeVersion",
  "createLiteLLMProvider",
  "createOpenRouterProvider",
  "collectStream",
  "createOtelRunEventSink",
  "createLangfuseOtlpConfig",
  "createPhoenixOtlpConfig",
  "evalAgentRun",
  "createRemoteReceiptSigner",
  "createRealtimeReceiptDescriptors",
]) {
  assert.notEqual(lattice[name], undefined, name + " export is present");
}

assert.equal(lattice.latticeVersion, expectedVersion, "latticeVersion matches packed package version");
assert.notEqual(lattice.latticeVersion, "0.0.0", "latticeVersion is stamped");

async function* stream() {
  yield { kind: "text-delta", output: "answer", text: "dog" };
  yield { kind: "text-delta", output: "answer", text: "food" };
  yield { kind: "complete", normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 } };
}

const collected = await lattice.collectStream(stream());
assert.equal(collected.rawOutputs.answer, "dogfood", "collectStream works from FSB consumer");

const { privateKeyJwk, publicKeyJwk } = await lattice.generateEd25519KeyPairJwk();
const signer = lattice.createInMemorySigner(privateKeyJwk, {
  kid: "fsb-v14-candidate",
  publicKeyJwk,
});
const envelope = await lattice.createReceipt({
  runId: "fsb-v14-candidate-run",
  model: { requested: "fsb-v14-model", observed: "fsb-v14-observed" },
  route: { providerId: "fsb", capabilityId: "fsb/v14", attemptNumber: 1 },
  modelClass: "general",
  lineageMerkleRoot: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  usage: { promptTokens: 1, completionTokens: 2, costUsd: 0 },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
}, signer);

const keySet = lattice.createMemoryKeySet([
  { kid: "fsb-v14-candidate", publicKeyJwk, state: "active" },
]);
const verified = await lattice.verifyReceipt(envelope, keySet);
assert.equal(verified.ok, true, "v1.4 candidate receipt verifies");
assert.equal(verified.body.version, "lattice-receipt/v1.3", "candidate emits current receipt schema");
assert.equal(
  verified.body.lineageMerkleRoot,
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "lineage merkle root round-trips",
);
assert.equal(verified.body.modelClass, "general", "modelClass round-trips");

const evalReport = lattice.evalAgentRun(
  { iterationsToGoal: 3, usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 } },
  { iterationsToGoal: 3, usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 } },
);
assert.equal(evalReport.ok, true, "evalAgentRun remains reachable");

console.log("FSB v1.4 candidate smoke passed", lattice.latticeVersion);
`);
  return testPath;
}

async function runFsbTests(input) {
  const tests = [
    input.generatedSmoke,
    ...input.legacyTests.map((test) => join(input.fsbCopyDir, test)),
  ];
  const results = [];

  for (const testPath of tests) {
    const rel = relative(input.fsbCopyDir, testPath);
    const result = await runCommand(process.execPath, [testPath], {
      cwd: input.fsbCopyDir,
      env: {
        ...process.env,
        EXPECTED_LATTICE_VERSION: input.version,
      },
    });
    results.push({ test: rel, result });
    if (result.code !== 0) {
      throw new Error(`FSB dogfood test failed: ${rel} (exit ${result.code})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fsbDir = resolve(args.fsbDir);
  const tempRoot = await mkdtemp(join(tmpdir(), "lattice-fsb-dogfood-"));
  const packDir = join(tempRoot, "pack");
  const consumerDir = join(tempRoot, "consumer");
  const fsbCopyDir = join(tempRoot, "fsb");

  try {
    let beforeStatus;
    try {
      beforeStatus = await gitStatusShort(fsbDir);
    } catch (err) {
      throw new Error(`FSB checkout is required at ${fsbDir}: ${(err && err.message) || String(err)}`);
    }

    await mkdir(packDir, { recursive: true });
    const tarballPath = await packRuntime(packDir);
    const install = await installCandidate(consumerDir, tarballPath);
    await copyFsbCheckout(fsbDir, fsbCopyDir);
    await symlink(join(consumerDir, "node_modules"), join(fsbCopyDir, "node_modules"), "dir");
    const generatedSmoke = await writeCandidateSmoke(fsbCopyDir);
    const results = await runFsbTests({
      fsbCopyDir,
      generatedSmoke,
      legacyTests: args.legacyTests,
      version: install.version,
    });

    const afterStatus = await gitStatusShort(fsbDir);
    if (afterStatus !== beforeStatus) {
      throw new Error("FSB checkout status changed during dogfood run");
    }

    for (const { test, result } of results) {
      const passCount = (result.stdout.match(/PASS:/gu) ?? []).length;
      console.log(`[${SCRIPT_NAME}] test=${test} exit=0 passCount=${passCount}`);
    }
    console.log(
      `[${SCRIPT_NAME}] OK - version=${install.version} tarball=${tarballPath} fsbDir=${fsbDir} dirtyLines=${beforeStatus.trim() === "" ? 0 : beforeStatus.trim().split("\n").length}`,
    );
    if (args.keepTemp) {
      console.log(`[${SCRIPT_NAME}] temp=${tempRoot}`);
    }
  } finally {
    if (!args.keepTemp) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(`[${SCRIPT_NAME}] FAIL - ${(err && err.stack) || String(err)}`);
  process.exit(1);
});
