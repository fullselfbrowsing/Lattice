#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "check-protocol-package-consumer";
const KEEP_TEMP = process.env.LATTICE_PROTOCOL_PACKAGE_KEEP_TEMP === "1";
const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const packages = {
  runtime: {
    dir: join(repoRoot, "packages/lattice"),
    name: "@full-self-browsing/lattice",
  },
  cli: {
    dir: join(repoRoot, "packages/lattice-cli"),
    name: "@full-self-browsing/lattice-cli",
  },
};

function runCommand(command, args, options = {}) {
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

async function mustRun(command, args, options, label) {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (exit ${result.code})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildPackages() {
  await mustRun(
    "pnpm",
    ["--filter", packages.runtime.name, "build"],
    { cwd: repoRoot },
    "runtime build",
  );
  await mustRun(
    "pnpm",
    ["--filter", packages.cli.name, "build"],
    { cwd: repoRoot },
    "CLI build",
  );
}

async function packPackage(entry, destination) {
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

async function createFixtures(fixturesDir) {
  const standardVector = JSON.parse(
    await readFile(
      join(
        repoRoot,
        "conformance/vectors/standard/positive/vec-00-v1.4-unicode-redaction.json",
      ),
      "utf8",
    ),
  );
  const legacyVector = JSON.parse(
    await readFile(
      join(
        repoRoot,
        "conformance/vectors/legacy/positive/vec-00-v1.3.json",
      ),
      "utf8",
    ),
  );

  assert(
    standardVector.kid === legacyVector.kid,
    "protocol fixtures must use the same public test key",
  );
  assert(
    JSON.stringify(standardVector.publicKeyJwk) ===
      JSON.stringify(legacyVector.publicKeyJwk),
    "protocol fixtures must use the same public test JWK",
  );

  const toEnvelope = (vector) => ({
    payloadType: PAYLOAD_TYPE,
    payload: vector.payloadBase64,
    signatures: [
      {
        keyid: vector.kid,
        sig: Buffer.from(vector.signatureHex, "hex").toString("base64"),
      },
    ],
  });

  await mkdir(fixturesDir, { recursive: true });
  const standardPath = join(fixturesDir, "standard-receipt.json");
  const legacyPath = join(fixturesDir, "legacy-receipt.json");
  const keysetPath = join(fixturesDir, "keyset.json");
  await writeJson(standardPath, toEnvelope(standardVector));
  await writeJson(legacyPath, toEnvelope(legacyVector));
  await writeJson(keysetPath, [
    {
      kid: standardVector.kid,
      publicKeyJwk: standardVector.publicKeyJwk,
      state: "active",
    },
  ]);
  return { standardPath, legacyPath, keysetPath };
}

async function installConsumer(consumerDir, runtimeTarball, cliTarball) {
  const runtimeSpec = `file:${runtimeTarball}`;
  const cliSpec = `file:${cliTarball}`;
  await mkdir(consumerDir, { recursive: true });
  await writeJson(join(consumerDir, "package.json"), {
    name: "lattice-protocol-package-consumer",
    private: true,
    type: "module",
    dependencies: {
      [packages.runtime.name]: runtimeSpec,
      [packages.cli.name]: cliSpec,
    },
    pnpm: {
      overrides: {
        [packages.runtime.name]: runtimeSpec,
      },
    },
  });
  await mustRun(
    "pnpm",
    ["install", "--ignore-scripts", "--no-frozen-lockfile"],
    { cwd: consumerDir },
    "clean consumer install",
  );

  const resolvedConsumerDir = await realpath(consumerDir);
  for (const entry of Object.values(packages)) {
    const installed = join(consumerDir, "node_modules", ...entry.name.split("/"));
    const resolved = await realpath(installed);
    assert(
      resolved.startsWith(`${resolvedConsumerDir}/`),
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
  }
}

async function writeRuntimeSmoke(consumerDir) {
  const smokePath = join(consumerDir, "protocol-smoke.mjs");
  await writeFile(
    smokePath,
    `import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createInMemorySigner,
  createMemoryKeySet,
  createReceipt,
  generateEd25519KeyPairJwk,
  receiptCid,
  verifyReceipt,
} from "@full-self-browsing/lattice";

const fixturesDir = join(process.cwd(), "fixtures");
const readJson = async (name) =>
  JSON.parse(await readFile(join(fixturesDir, name), "utf8"));
const [standardEnvelope, legacyEnvelope, keyEntries] = await Promise.all([
  readJson("standard-receipt.json"),
  readJson("legacy-receipt.json"),
  readJson("keyset.json"),
]);
const keySet = createMemoryKeySet(keyEntries);

const standard = await verifyReceipt(standardEnvelope, keySet, {
  legacyPolicy: "reject",
});
assert.equal(standard.ok, true, "standard vector verifies under strict policy");
assert.equal(standard.verificationProfile, "dsse-v1");
assert.equal(standard.deprecated, false);
const expectedCid =
  "sha256:" +
  createHash("sha256")
    .update(Buffer.from(standardEnvelope.payload, "base64"))
    .digest("hex");
assert.equal(await receiptCid(standardEnvelope), expectedCid);

const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
const signer = createInMemorySigner(privateKeyJwk, {
  kid: "packed-consumer-key",
  publicKeyJwk,
});
const createdEnvelope = await createReceipt(
  {
    runId: "packed-consumer-run",
    receiptId: "00000000-0000-4000-a000-000000000058",
    issuedAt: "2026-07-16T00:00:00.000Z",
    model: { requested: "packed-model", observed: "packed-model-1" },
    route: {
      providerId: "packed-provider",
      capabilityId: "chat",
      attemptNumber: 1,
    },
    usage: { promptTokens: 1, completionTokens: 2, costUsd: 0.0001 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  },
  signer,
);
const createdKeySet = createMemoryKeySet([
  { kid: signer.kid, publicKeyJwk, state: "active" },
]);
const created = await verifyReceipt(createdEnvelope, createdKeySet, {
  legacyPolicy: "reject",
});
assert.equal(created.ok, true, "fresh packed receipt verifies");
assert.equal(created.body.version, "lattice-receipt/v1.4");
assert.equal(created.body.signatureProfile, "dsse-v1");
assert.equal(created.verificationProfile, "dsse-v1");
assert.equal(created.deprecated, false);

const legacyAllowed = await verifyReceipt(legacyEnvelope, keySet);
assert.equal(legacyAllowed.ok, true, "legacy vector verifies by default");
assert.equal(legacyAllowed.verificationProfile, "lattice-legacy-base64-pae");
assert.equal(legacyAllowed.deprecated, true);
const legacyRejected = await verifyReceipt(legacyEnvelope, keySet, {
  legacyPolicy: "reject",
});
assert.equal(legacyRejected.ok, false, "strict policy rejects legacy vector");
assert.equal(legacyRejected.error.kind, "legacy-profile-rejected");

console.log("packed runtime protocol smoke passed");
`,
    "utf8",
  );
  return smokePath;
}

function assertCliResult(result, expected) {
  assert(
    result.code === expected.code,
    `${expected.label} exited ${result.code}, expected ${expected.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (expected.stdout !== undefined) {
    assert(
      stdout === expected.stdout,
      `${expected.label} stdout mismatch\nexpected: ${expected.stdout}\nactual: ${stdout}`,
    );
  }
  if (expected.stderrPrefix !== undefined) {
    assert(
      stderr.startsWith(expected.stderrPrefix),
      `${expected.label} stderr did not start with ${expected.stderrPrefix}\nactual: ${stderr}`,
    );
  }
  if (expected.stderr !== undefined) {
    assert(
      stderr === expected.stderr,
      `${expected.label} stderr mismatch\nexpected: ${expected.stderr}\nactual: ${stderr}`,
    );
  }
}

async function runCliSmoke(consumerDir, fixtures) {
  const executable = join(
    consumerDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "lattice.cmd" : "lattice",
  );
  const options = {
    cwd: consumerDir,
    env: { ...process.env, NO_COLOR: "1" },
  };

  const standard = await runCommand(
    executable,
    [
      "verify",
      fixtures.standardPath,
      "--key",
      fixtures.keysetPath,
      "--standard-only",
    ],
    options,
  );
  assertCliResult(standard, {
    label: "standard strict CLI verify",
    code: 0,
    stdout:
      "OK kid=spec-example-key-v0 verdict=success profile=dsse-v1 deprecated=false",
    stderr: "",
  });

  const legacyDefault = await runCommand(
    executable,
    ["verify", fixtures.legacyPath, "--key", fixtures.keysetPath],
    options,
  );
  assertCliResult(legacyDefault, {
    label: "legacy default CLI verify",
    code: 0,
    stdout:
      "OK kid=spec-example-key-v0 verdict=success profile=lattice-legacy-base64-pae deprecated=true",
    stderr: "",
  });

  const legacyStrict = await runCommand(
    executable,
    [
      "verify",
      fixtures.legacyPath,
      "--key",
      fixtures.keysetPath,
      "--standard-only",
    ],
    options,
  );
  assertCliResult(legacyStrict, {
    label: "legacy strict CLI verify",
    code: 1,
    stdout: "",
    stderrPrefix: "FAIL kind=legacy-profile-rejected reason=",
  });
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), "lattice-protocol-package-"));
  const packRoot = join(tempRoot, "pack");
  const consumerDir = join(tempRoot, "consumer");

  try {
    await buildPackages();
    const runtimeTarball = await packPackage(
      packages.runtime,
      join(packRoot, "runtime"),
    );
    const cliTarball = await packPackage(packages.cli, join(packRoot, "cli"));
    await installConsumer(consumerDir, runtimeTarball, cliTarball);
    const fixtures = await createFixtures(join(consumerDir, "fixtures"));
    const runtimeSmoke = await writeRuntimeSmoke(consumerDir);
    await mustRun(
      process.execPath,
      [runtimeSmoke],
      { cwd: consumerDir },
      "packed runtime protocol smoke",
    );
    await runCliSmoke(consumerDir, fixtures);
    console.log(
      `[${SCRIPT_NAME}] OK - packed runtime and CLI bridge behavior verified`,
    );
  } finally {
    if (KEEP_TEMP) {
      console.log(`[${SCRIPT_NAME}] temp=${tempRoot}`);
    } else {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(
    `[${SCRIPT_NAME}] FAIL - ${(error && error.stack) || String(error)}`,
  );
  process.exit(1);
});
