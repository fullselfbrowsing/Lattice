import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

export function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function mustRun(command, args, options, label) {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (exit ${result.code})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function buildPackages(entries, options) {
  for (const entry of entries) {
    await mustRun(
      "pnpm",
      ["--filter", entry.name, "build"],
      { cwd: options.cwd },
      `${entry.name} build`,
    );
  }
}

export async function packPackage(entry, destination) {
  await mkdir(destination, { recursive: true });
  await mustRun(
    "pnpm",
    ["pack", "--pack-destination", destination],
    { cwd: entry.dir },
    `${entry.name} pack`,
  );
  const tarballs = (await readdir(destination)).filter((file) =>
    file.endsWith(".tgz"),
  );
  assert(
    tarballs.length === 1,
    `${entry.name} pack produced ${tarballs.length} tarballs instead of one`,
  );
  return join(destination, tarballs[0]);
}

function isInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent.length > 0 &&
    !pathFromParent.startsWith("..") &&
    !isAbsolute(pathFromParent)
  );
}

export async function installPackedConsumer(options) {
  const dependencies = Object.fromEntries(
    options.packages.map((entry) => [entry.name, `file:${entry.tarball}`]),
  );
  await mkdir(options.consumerDir, { recursive: true });
  await writeJson(join(options.consumerDir, "package.json"), {
    name: options.consumerName,
    private: true,
    type: "module",
    dependencies,
    ...(options.overrides === undefined
      ? {}
      : { pnpm: { overrides: options.overrides } }),
  });
  await mustRun(
    "pnpm",
    ["install", "--ignore-scripts", "--no-frozen-lockfile"],
    { cwd: options.consumerDir },
    "clean consumer install",
  );

  const resolvedConsumerDir = await realpath(options.consumerDir);
  const manifests = {};
  for (const entry of options.packages) {
    const installed = join(
      options.consumerDir,
      "node_modules",
      ...entry.name.split("/"),
    );
    const resolved = await realpath(installed);
    assert(
      isInside(resolvedConsumerDir, resolved),
      `${entry.name} resolved outside the clean consumer: ${resolved}`,
    );
    const manifest = JSON.parse(
      await readFile(join(installed, "package.json"), "utf8"),
    );
    assert(
      manifest.name === entry.name,
      `installed package name mismatch for ${entry.name}`,
    );
    assert(
      !JSON.stringify(manifest).includes("workspace:"),
      `${entry.name} packed manifest still contains a workspace reference`,
    );
    manifests[entry.name] = manifest;
  }

  return manifests;
}
