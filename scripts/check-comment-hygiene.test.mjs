import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import {
  COMMENT_RULES,
  EXCLUSION_POLICIES,
  PRODUCTION_ROOTS,
  discoverProductionFiles,
  exclusionFor,
  extractComments,
  scanSource,
} from "./check-comment-hygiene.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

test("TypeScript lexer ignores strings, templates, and regex literals", () => {
  const source = [
    'const quoted = "Phase 12 and D-62-01";',
    "const template = `Plan 7 // GSD`;",
    String.raw`const pattern = /Phase\s+12\/\/D-62-01/u;`,
    "// Phase 12 performs the migration.",
  ].join("\n");
  const findings = scanSource({ source, language: "typescript", path: "sample.ts" });
  assert.deepEqual(
    findings.map(({ line, ruleId }) => ({ line, ruleId })),
    [{ line: 4, ruleId: "CH002_NUMBERED_PHASE_PLAN" }],
  );
});

test("TypeScript block comments retain multiline match offsets", () => {
  const source = [
    "const value = 1; /* durable opening",
    " * D-62-01 is workflow history.",
    " */",
  ].join("\n");
  const [finding] = scanSource({ source, language: "typescript", path: "block.ts" });
  assert.equal(finding.line, 2);
  assert.equal(finding.column, 4);
  assert.equal(finding.ruleId, "CH004_DECISION_ID");
});

test("Python lexer ignores quoted and triple-quoted strings", () => {
  const source = [
    'value = "Phase 12"',
    'doc = """Plan 2 and GSD',
    'still a string"""',
    "# Plan 2 is complete.",
  ].join("\n");
  const findings = scanSource({ source, language: "python", path: "sample.py" });
  assert.deepEqual(
    findings.map(({ line, ruleId }) => ({ line, ruleId })),
    [{ line: 4, ruleId: "CH002_NUMBERED_PHASE_PLAN" }],
  );
});

test("YAML lexer ignores quoted hashes and block scalar content", () => {
  const source = [
    'name: "# Phase 12"',
    "run: |",
    "  # Plan 2 is shell input, not a YAML comment.",
    "  printf '# D-62-01'",
    "key: value # Phase 12 is chronology.",
  ].join("\n");
  const comments = extractComments(source, "yaml");
  assert.equal(comments.length, 1);
  const findings = scanSource({ source, language: "yaml", path: "workflow.yml" });
  assert.deepEqual(
    findings.map(({ line, ruleId }) => ({ line, ruleId })),
    [{ line: 5, ruleId: "CH002_NUMBERED_PHASE_PLAN" }],
  );
});

test("CRLF input reports one-based line and column", () => {
  const source = "const value = 1;\r\n  // GSD state\r\n";
  const [finding] = scanSource({ source, language: "typescript", path: "crlf.ts" });
  assert.deepEqual(
    { line: finding.line, column: finding.column, ruleId: finding.ruleId },
    { line: 2, column: 6, ruleId: "CH001_GSD_REFERENCE" },
  );
});

test("every forbidden form maps to a stable rule", () => {
  const cases = [
    ["// GSD state", "CH001_GSD_REFERENCE"],
    ["// Phase 62 cleanup", "CH002_NUMBERED_PHASE_PLAN"],
    ["// milestone v1.6 closeout", "CH003_MILESTONE_CHRONOLOGY"],
    ["// D-62-01 decision", "CH004_DECISION_ID"],
    ["// T-21-02 ticket", "CH005_TICKET_REFERENCE"],
    ["// this PR adds a branch", "CH006_WORKFLOW_NARRATION"],
    ["// DEFERRED until later", "CH007_TASK_STATE"],
    ["// See RESEARCH.md", "CH008_WORKFLOW_DOCUMENT"],
  ];
  assert.equal(COMMENT_RULES.length, cases.length);
  for (const [source, expectedRule] of cases) {
    const rules = scanSource({ source, language: "typescript" }).map(
      ({ ruleId }) => ruleId,
    );
    assert.ok(rules.includes(expectedRule), `${source} should match ${expectedRule}`);
  }
});

test("durable uses of workflow, phase, plan, and protocol terms are allowed", () => {
  const source = [
    "// The parser enters its verification phase after decoding.",
    "// ExecutionPlan is the public inspectable route contract.",
    "// This workflow cancels superseded pull requests.",
    "// SHA-256 binds the canonical payload bytes.",
    "// ISO-8601 timestamps and UTF-8 strings are part of the wire format.",
    "// IEEE-754 defines the numeric representation.",
  ].join("\n");
  assert.deepEqual(scanSource({ source, language: "typescript" }), []);
});

test("repository-specific ticket namespaces are rejected", () => {
  const source = [
    "// CAPS-01 tracks capability discovery.",
    "// RECEIPT-05 tracks envelope verification.",
    "// REL-03 tracks publishing.",
    "// Q7 records an open question.",
    "// A2 records an audit answer.",
    "// P2-B records a planning section.",
  ].join("\n");
  assert.deepEqual(
    scanSource({ source, language: "typescript" }).map(({ line, ruleId }) => ({
      line,
      ruleId,
    })),
    [
      { line: 1, ruleId: "CH005_TICKET_REFERENCE" },
      { line: 2, ruleId: "CH005_TICKET_REFERENCE" },
      { line: 3, ruleId: "CH005_TICKET_REFERENCE" },
      { line: 4, ruleId: "CH005_TICKET_REFERENCE" },
      { line: 5, ruleId: "CH005_TICKET_REFERENCE" },
      { line: 6, ruleId: "CH005_TICKET_REFERENCE" },
    ],
  );
});

test("workflow pitfall narration is rejected", () => {
  const [finding] = scanSource({
    source: "// Pitfall 3 motivated this branch.",
    language: "typescript",
  });
  assert.equal(finding.ruleId, "CH006_WORKFLOW_NARRATION");
});

test("findings are deterministically ordered by location and rule", () => {
  const source = [
    "// Phase 2 uses D-2.",
    "// GSD state.",
  ].join("\n");
  const findings = scanSource({ source, language: "typescript", path: "z.ts" });
  assert.deepEqual(
    findings.map(({ line, ruleId }) => `${line}:${ruleId}`),
    [
      "1:CH002_NUMBERED_PHASE_PLAN",
      "1:CH004_DECISION_ID",
      "2:CH001_GSD_REFERENCE",
    ],
  );
});

test("diagnostic excerpts are bounded", () => {
  const source = `// ${"x".repeat(400)} Phase 22 ${"y".repeat(400)}`;
  const [finding] = scanSource({ source, language: "typescript" });
  assert.ok(finding.excerpt.length <= 120);
  assert.match(finding.excerpt, /Phase 22/u);
});

test("every exclusion has a narrow reasoned example", () => {
  const examples = [
    ["packages/lattice/src/example.test.ts", "tests-and-fixtures"],
    ["packages/lattice/src/capabilities/registry.generated.ts", "generated-source"],
    [".planning/ROADMAP.md", "documentation-history"],
    ["clients/python/src/lattice_receipt/__pycache__/core.py", "external-or-derived"],
  ];
  assert.equal(EXCLUSION_POLICIES.length, examples.length);
  for (const [path, id] of examples) {
    const exclusion = exclusionFor(path);
    assert.equal(exclusion?.id, id);
    assert.ok(exclusion?.reason.length > 20);
  }
  assert.equal(exclusionFor("packages/lattice/src/runtime/create-ai.ts"), undefined);
});

test("production discovery is fixed, sorted, and excludes tests and generated files", async () => {
  const repoRoot = await createFixtureRepository();
  await writeFixture(repoRoot, "packages/lattice/src/z.ts", "// durable\n");
  await writeFixture(repoRoot, "packages/lattice/src/a.ts", "// durable\n");
  await writeFixture(repoRoot, "packages/lattice/src/a.test.ts", "// Phase 2\n");
  await writeFixture(
    repoRoot,
    "packages/lattice/src/registry.generated.ts",
    "// Phase 2\n",
  );
  const files = await discoverProductionFiles({ repoRoot, roots: PRODUCTION_ROOTS });
  assert.deepEqual(
    files.map(({ relativePath }) => relativePath),
    ["packages/lattice/src/a.ts", "packages/lattice/src/z.ts"],
  );
});

test("empty, unknown, and missing root configurations fail loudly", async () => {
  const repoRoot = await createFixtureRepository();
  await assert.rejects(
    discoverProductionFiles({ repoRoot, roots: [] }),
    /must not be empty/u,
  );
  await assert.rejects(
    discoverProductionFiles({
      repoRoot,
      roots: [{ id: "unknown", path: "unknown", language: "typescript", extensions: [".ts"] }],
    }),
    /Unknown or invalid production root/u,
  );
  await rm(join(repoRoot, "scripts"), { recursive: true, force: true });
  await assert.rejects(
    discoverProductionFiles({ repoRoot, roots: PRODUCTION_ROOTS }),
    /Required production root is missing: scripts/u,
  );
});

async function createFixtureRepository() {
  const root = await mkdtemp(join(tmpdir(), "lattice-comment-hygiene-"));
  temporaryRoots.push(root);
  await Promise.all(
    PRODUCTION_ROOTS.map((entry) =>
      mkdir(join(root, ...entry.path.split("/")), { recursive: true }),
    ),
  );
  return root;
}

async function writeFixture(root, path, content) {
  const absolute = join(root, ...path.split("/"));
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, content, "utf8");
}
