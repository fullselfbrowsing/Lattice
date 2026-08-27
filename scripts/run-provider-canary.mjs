#!/usr/bin/env node

import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPackages,
  installPackedConsumer,
  packPackage,
  runCommand,
} from "./lib/packed-packages.mjs";
import {
  createLauncherFailureReport,
  createSanitizedReport,
  reportExitCode,
} from "./provider-canary-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const runtimePackage = {
  dir: join(repoRoot, "packages/lattice"),
  name: "@full-self-browsing/lattice",
};

export async function preparePackedProviderCanary() {
  const tempRoot = await mkdtemp(join(tmpdir(), "lattice-provider-canary-"));
  const packRoot = join(tempRoot, "pack");
  const consumerDir = join(tempRoot, "consumer");

  try {
    await buildPackages([runtimePackage], { cwd: repoRoot });
    const runtimeTarball = await packPackage(runtimePackage, packRoot);
    await installPackedConsumer({
      consumerDir,
      consumerName: "lattice-packed-provider-canary",
      packages: [{ name: runtimePackage.name, tarball: runtimeTarball }],
    });
    await Promise.all([
      copyFile(
        join(here, "provider-canary-core.mjs"),
        join(consumerDir, "provider-canary-core.mjs"),
      ),
      copyFile(
        join(here, "provider-canary-consumer.mjs"),
        join(consumerDir, "provider-canary-consumer.mjs"),
      ),
    ]);
    const commit = await readCommit();
    return {
      tempRoot,
      consumerDir,
      consumerProgram: join(consumerDir, "provider-canary-consumer.mjs"),
      commit,
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function runPreparedProviderCanary(
  prepared,
  environment = process.env,
) {
  const result = await runCommand(
    process.execPath,
    [prepared.consumerProgram],
    {
      cwd: prepared.consumerDir,
      env: {
        ...environment,
        LATTICE_PROVIDER_CANARY_COMMIT: prepared.commit,
      },
    },
  );
  const parsed = parseConsumerReport(result.stdout);
  const report = createSanitizedReport({
    packageVersion: parsed.packageVersion,
    commit: parsed.commit,
    records: parsed.families,
  });
  if (result.code !== reportExitCode(report)) {
    throw new Error("packed provider canary exit status did not match its report");
  }
  return { report, exitCode: result.code };
}

export async function removePreparedProviderCanary(prepared) {
  await rm(prepared.tempRoot, { recursive: true, force: true });
}

function parseConsumerReport(stdout) {
  const trimmed = stdout.trim();
  if (trimmed.length === 0 || trimmed.includes("\n")) {
    throw new Error("packed provider canary emitted an invalid report");
  }
  const parsed = JSON.parse(trimmed);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray(parsed.families)
  ) {
    throw new Error("packed provider canary emitted an invalid report");
  }
  return parsed;
}

async function readCommit() {
  const result = await runCommand(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: repoRoot },
  );
  const commit = result.stdout.trim();
  return result.code === 0 && /^[a-f0-9]{40}$/u.test(commit)
    ? commit
    : "unknown";
}

async function writeReport(report, reportPath) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function main() {
  const reportPath = resolve(
    process.cwd(),
    process.env.LATTICE_PROVIDER_CANARY_REPORT_PATH ??
      "provider-canary-report.json",
  );
  const keepTemp = process.env.LATTICE_PROVIDER_CANARY_KEEP_TEMP === "1";
  let prepared;

  try {
    prepared = await preparePackedProviderCanary();
    const { report, exitCode } = await runPreparedProviderCanary(prepared);
    await writeReport(report, reportPath);
    process.exitCode = exitCode;
  } catch {
    const report = createLauncherFailureReport({
      commit: prepared?.commit ?? (await readCommit()),
    });
    await writeReport(report, reportPath);
    process.exitCode = 1;
  } finally {
    if (prepared !== undefined && !keepTemp) {
      await removePreparedProviderCanary(prepared);
    }
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
