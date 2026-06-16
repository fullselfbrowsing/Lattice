#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "check-package-version-surfaces";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const PACKAGES = [
  { dir: "packages/lattice", name: "@full-self-browsing/lattice", kind: "runtime" },
  { dir: "packages/lattice-cli", name: "@full-self-browsing/lattice-cli", kind: "cli" },
];

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

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function failReason(entry, reason) {
  throw new Error(`${entry.name} ${reason}`);
}

async function packAndExtract(entry) {
  const packDir = await mkdtemp(join(tmpdir(), "lattice-version-pack-"));
  const extractDir = await mkdtemp(join(tmpdir(), "lattice-version-extract-"));
  try {
    const packResult = await runCommand("pnpm", ["pack", "--pack-destination", packDir], {
      cwd: join(repoRoot, entry.dir),
    });
    if (packResult.code !== 0) {
      failReason(entry, `pnpm pack failed (exit ${packResult.code}): ${packResult.stderr.trim()}`);
    }

    const packFiles = await readdir(packDir);
    const tgz = packFiles.find((file) => file.endsWith(".tgz"));
    if (!tgz) failReason(entry, `no .tgz produced in ${packDir}`);

    const tarballPath = join(packDir, tgz);
    const extractResult = await runCommand("tar", ["-xzf", tarballPath, "-C", extractDir]);
    if (extractResult.code !== 0) {
      failReason(entry, `tar extract failed for ${tgz} (exit ${extractResult.code}): ${extractResult.stderr.trim()}`);
    }

    const manifestPath = join(extractDir, "package", "package.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (err) {
      failReason(entry, `package/package.json is not valid JSON: ${(err && err.message) || String(err)}`);
    }
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      failReason(entry, "package/package.json version must be a non-empty string");
    }

    const sourceNodeModules = join(repoRoot, entry.dir, "node_modules");
    const extractedNodeModules = join(extractDir, "package", "node_modules");
    try {
      await symlink(sourceNodeModules, extractedNodeModules, "dir");
    } catch (err) {
      if (!err || err.code !== "EEXIST") {
        failReason(entry, `could not link node_modules for packed smoke: ${(err && err.message) || String(err)}`);
      }
    }

    return { packDir, extractDir, manifest };
  } catch (err) {
    await rm(packDir, { recursive: true, force: true });
    await rm(extractDir, { recursive: true, force: true });
    throw err;
  }
}

async function inspectRuntime(entry, extractDir, version) {
  const distIndex = join(extractDir, "package", "dist", "index.js");
  const script = `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(process.argv[1]).href);
if (mod.latticeVersion !== process.argv[2]) {
  console.error(\`\${mod.latticeVersion} !== \${process.argv[2]}\`);
  process.exit(1);
}
`;
  const result = await runCommand(process.execPath, [
    "--input-type=module",
    "-e",
    script,
    distIndex,
    version,
  ]);
  if (result.code !== 0) {
    failReason(entry, `latticeVersion mismatch: ${(result.stderr || result.stdout).trim()}`);
  }
}

async function inspectCli(entry, extractDir, version) {
  const cliPath = join(extractDir, "package", "dist", "cli.js");
  const result = await runCommand(process.execPath, [cliPath, "--help"], {
    env: { ...process.env, NO_COLOR: "1" },
  });
  const help = stripAnsi(`${result.stdout}${result.stderr}`);
  if (result.code !== 0) {
    failReason(entry, `CLI --help exited ${result.code}: ${help.trim()}`);
  }
  if (!help.includes(`(lattice v${version})`)) {
    failReason(entry, `CLI help did not include (lattice v${version})`);
  }
  if (help.includes("v0.0.0")) {
    failReason(entry, "CLI help still includes v0.0.0");
  }
}

async function inspectPackage(entry) {
  const { packDir, extractDir, manifest } = await packAndExtract(entry);
  try {
    if (entry.kind === "runtime") {
      await inspectRuntime(entry, extractDir, manifest.version);
    } else if (entry.kind === "cli") {
      await inspectCli(entry, extractDir, manifest.version);
    } else {
      failReason(entry, `unknown package kind ${entry.kind}`);
    }
  } finally {
    await rm(packDir, { recursive: true, force: true });
    await rm(extractDir, { recursive: true, force: true });
  }
}

async function main() {
  for (const entry of PACKAGES) {
    await inspectPackage(entry);
  }
  console.log(`[${SCRIPT_NAME}] OK - inspected ${PACKAGES.length} tarballs`);
}

main().catch((err) => {
  console.error(`[${SCRIPT_NAME}] FAIL - ${(err && err.message) || String(err)}`);
  process.exit(1);
});
