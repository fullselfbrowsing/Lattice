import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

async function read(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

function jobBlock(workflow, jobName) {
  const lines = workflow.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  assert.notEqual(start, -1, `workflow job ${jobName} must exist`);
  const nextOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^  [a-z0-9_-]+:\s*$/u.test(line));
  const end = nextOffset === -1 ? lines.length : start + 1 + nextOffset;
  return lines.slice(start, end).join("\n");
}

function assertPinnedActions(workflow, name) {
  const uses = [...workflow.matchAll(/^\s*uses:\s*([^\s]+)\s*$/gmu)].map(
    (match) => match[1],
  );
  assert.ok(uses.length > 0, `${name} must use at least one action`);
  for (const action of uses) {
    if (action.startsWith("./")) continue;
    assert.match(
      action,
      /^[^@\s]+@[0-9a-f]{40}$/u,
      `${name} action must use a full commit SHA: ${action}`,
    );
  }
}

const CURRENT_RELEASE_DOCS = [
  "README.md",
  "packages/lattice/README.md",
  "packages/lattice-cli/README.md",
  "docs/modular-entrypoints.md",
  "docs/MIGRATION-v1.6.md",
];

test("package engines and compatibility metadata target Node 24 and newer", async () => {
  const [root, runtime, cli] = await Promise.all([
    readJson("package.json"),
    readJson("packages/lattice/package.json"),
    readJson("packages/lattice-cli/package.json"),
  ]);

  assert.equal(root.engines.node, ">=24");
  assert.equal(runtime.engines.node, ">=24");
  assert.equal(cli.engines.node, ">=24");
  assert.equal(root.scripts["check:packed-consumer"], "node scripts/check-protocol-package-consumer.mjs");
  assert.equal(root.scripts["check:protocol-package"], "pnpm check:packed-consumer");
  assert.equal(root.scripts["check:node20-modules"], undefined);

  const labels = Object.values(runtime.lattice.modules).map(
    (metadata) => metadata.compatibility,
  );
  assert.deepEqual([...new Set(labels)].sort(), ["adapter-specific", "node24-plus"]);
  assert.ok(!JSON.stringify(runtime).includes("node20-compatible"));
});

test("runtime, CLI, source stamps, and lockfile share the 1.6.0 identity", async () => {
  const [runtime, cli, runtimeVersion, cliVersion, lockfile] = await Promise.all([
    readJson("packages/lattice/package.json"),
    readJson("packages/lattice-cli/package.json"),
    read("packages/lattice/src/version.ts"),
    read("packages/lattice-cli/src/version.ts"),
    read("pnpm-lock.yaml"),
  ]);

  assert.equal(runtime.version, "1.6.0");
  assert.equal(cli.version, "1.6.0");
  assert.equal(cli.dependencies["@full-self-browsing/lattice"], "workspace:^1.6.0");
  assert.match(runtimeVersion, /latticeVersion = "1\.6\.0"/u);
  assert.match(cliVersion, /latticeCliVersion = "1\.6\.0"/u);
  assert.match(lockfile, /specifier: workspace:\^1\.6\.0/u);
});

test("current release docs agree on SDK and supported Node lines", async () => {
  for (const relativePath of CURRENT_RELEASE_DOCS) {
    const contents = await read(relativePath);
    assert.match(contents, /1\.6\.0/u, `${relativePath} must name SDK 1.6.0`);
    assert.match(contents, /Node 24/u, `${relativePath} must name Node 24`);
    assert.match(contents, /Node 26/u, `${relativePath} must name Node 26`);
    assert.doesNotMatch(contents, /1\.5\.[01]/u, `${relativePath} has a stale SDK claim`);
    assert.doesNotMatch(contents, /node ?20/iu, `${relativePath} has a stale Node claim`);
  }
});

test("SDK 1.6 documentation preserves the receipt v1.4 bridge boundary", async () => {
  const [root, runtime, cli, modular, migration, specification, protocolChangelog] =
    await Promise.all([
      read("README.md"),
      read("packages/lattice/README.md"),
      read("packages/lattice-cli/README.md"),
      read("docs/modular-entrypoints.md"),
      read("docs/MIGRATION-v1.6.md"),
      read("spec/SPEC.md"),
      read("spec/CHANGELOG.md"),
    ]);

  for (const [name, contents] of [
    ["root README", root],
    ["runtime README", runtime],
    ["CLI README", cli],
    ["modular guide", modular],
    ["SDK migration", migration],
    ["specification", specification],
    ["protocol changelog", protocolChangelog],
  ]) {
    assert.match(contents, /1\.6\.0/u, `${name} must name the SDK release`);
    assert.match(contents, /lattice-receipt\/v1\.4/u, `${name} must name receipt v1.4`);
  }

  for (const [name, contents] of [
    ["root README", root],
    ["runtime README", runtime],
    ["CLI README", cli],
    ["modular guide", modular],
    ["SDK migration", migration],
  ]) {
    assert.match(
      contents,
      /(?:no|does not define)[\s\S]{0,80}lattice-receipt\/v1\.6/iu,
      `${name} must deny a receipt v1.6 schema`,
    );
  }

  for (const contents of [root, runtime, modular, migration]) {
    assert.match(contents, /legacyPolicy[^\n]*reject/u);
    assert.match(contents, /standard-only/iu);
    assert.match(contents, /(?:compatibility|historical)/iu);
  }
  assert.match(cli, /--standard-only/u);
  assert.match(migration, /no public\s+API can mint a legacy signature/iu);
  assert.match(specification, /no conforming minter exposes a historical or\s+legacy signing path/iu);
});

test("public docs cover the complete runtime bridge and operational links", async () => {
  const [root, runtime, cli, migration, receiptMigration] = await Promise.all([
    read("README.md"),
    read("packages/lattice/README.md"),
    read("packages/lattice-cli/README.md"),
    read("docs/MIGRATION-v1.6.md"),
    read("spec/MIGRATION-v1.4.md"),
  ]);

  for (const [name, contents] of [
    ["root README", root],
    ["runtime README", runtime],
  ]) {
    assert.match(contents, /route-specific materialized context\s+projection/iu, `${name} needs context authority`);
    assert.match(contents, /receiptMode|receipt policy/iu, `${name} needs audit policy`);
    assert.match(contents, /unknown pricing|missing pricing/iu, `${name} needs cost semantics`);
    assert.match(contents, /exact (?:issued )?envelope/iu, `${name} needs exact agent evidence`);
    assert.match(contents, /check:packed-consumer/u, `${name} needs packed validation`);
    assert.match(contents, /provider canary/iu, `${name} needs the live boundary`);
  }

  assert.match(cli, /authoritative context/iu);
  assert.match(cli, /exact agent\/crew receipt attachment/iu);
  assert.match(cli, /check:packed-consumer/u);
  assert.match(root, /docs\/MIGRATION-v1\.6\.md/u);
  assert.match(root, /docs\/provider-canaries\.md/u);
  assert.match(receiptMigration, /docs\/MIGRATION-v1\.6\.md/u);
  assert.match(migration, /provider-canaries\.md/u);
});

test("provider canary runbook documents protected tri-state sanitized evidence", async () => {
  const [runbook, workflow] = await Promise.all([
    read("docs/provider-canaries.md"),
    read(".github/workflows/provider-canary.yml"),
  ]);
  const environmentNames = [
    "PROVIDER_CANARY_OPENAI_API_KEY",
    "PROVIDER_CANARY_ANTHROPIC_API_KEY",
    "PROVIDER_CANARY_GEMINI_API_KEY",
    "PROVIDER_CANARY_OPENAI_MODEL",
    "PROVIDER_CANARY_OPENAI_BASE_URL",
    "PROVIDER_CANARY_OPENAI_INPUT_PRICE_PER_1K_USD",
    "PROVIDER_CANARY_OPENAI_OUTPUT_PRICE_PER_1K_USD",
    "PROVIDER_CANARY_OPENAI_MAX_SPEND_USD",
    "PROVIDER_CANARY_ANTHROPIC_MODEL",
    "PROVIDER_CANARY_ANTHROPIC_INPUT_PRICE_PER_1K_USD",
    "PROVIDER_CANARY_ANTHROPIC_OUTPUT_PRICE_PER_1K_USD",
    "PROVIDER_CANARY_ANTHROPIC_MAX_SPEND_USD",
    "PROVIDER_CANARY_GEMINI_MODEL",
    "PROVIDER_CANARY_GEMINI_INPUT_PRICE_PER_1K_USD",
    "PROVIDER_CANARY_GEMINI_OUTPUT_PRICE_PER_1K_USD",
    "PROVIDER_CANARY_GEMINI_MAX_SPEND_USD",
  ];

  for (const name of environmentNames) {
    assert.match(workflow, new RegExp(name, "u"), `workflow must map ${name}`);
    assert.match(runbook, new RegExp(`\\b${name}\\b`, "u"), `runbook must name ${name}`);
  }

  assert.match(runbook, /protected environment/iu);
  assert.match(runbook, /pricing variables are operational configuration/iu);
  assert.match(runbook, /schedule or through a\s+manual dispatch/iu);
  assert.match(runbook, /`not-run`[\s\S]*`passed`[\s\S]*`failed`/u);
  assert.match(runbook, /not-run` as missing live evidence/u);
  assert.match(runbook, /node --test scripts\/provider-canary\.test\.mjs/u);
  assert.match(runbook, /retains this sanitized artifact for 30 days/iu);
  assert.match(runbook, /Never add steps that print[^.]*HTTP bodies/iu);
  assert.match(runbook, /"receiptVerified"/u);
  assert.match(runbook, /discards credentials, base URLs, prompts, provider output, raw requests, raw\s+responses, receipt envelopes/iu);
});

test("CI runs one packed-consumer matrix on Node 24 and Node 26", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const packed = jobBlock(workflow, "packed-consumer");

  assert.match(packed, /node:\s*\['24', '26'\]/u);
  assert.match(packed, /node-version:\s*\$\{\{ matrix\.node \}\}/u);
  assert.match(packed, /run:\s*pnpm check:packed-consumer/u);
  assert.doesNotMatch(packed, /pnpm -r (?:test|typecheck|lint:packages)/u);
  assert.equal((workflow.match(/run:\s*pnpm -r test\s*$/gmu) ?? []).length, 1);
  assertPinnedActions(workflow, "ci.yml");
});

test("release validates the same packed command on Node 24 before publish", async () => {
  const workflow = await read(".github/workflows/release.yml");
  const publish = jobBlock(workflow, "publish");
  const packedIndex = publish.indexOf("run: pnpm check:packed-consumer");
  const publishIndex = publish.indexOf("run: pnpm -r publish");

  assert.match(publish, /node-version:\s*'24'/u);
  assert.ok(packedIndex >= 0, "publish job must run the packed consumer");
  assert.ok(publishIndex > packedIndex, "packed validation must precede publish");
  assertPinnedActions(workflow, "release.yml");
});

test("conformance retains its focused Node 24 packed lane", async () => {
  const workflow = await read(".github/workflows/conformance.yml");

  assert.match(workflow, /node-version:\s*"24"/u);
  assert.match(workflow, /run:\s*pnpm check:packed-consumer/u);
  assert.match(workflow, /scripts\/lib\/packed-packages\.mjs/u);
  assertPinnedActions(workflow, "conformance.yml");
});
