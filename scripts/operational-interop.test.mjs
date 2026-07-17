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
