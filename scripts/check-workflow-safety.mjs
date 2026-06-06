#!/usr/bin/env node
/**
 * Phase 25 Plan 01 — D-06 workflow safety audit gate.
 *
 * Scans .github/workflows/*.yml for two failure modes:
 *
 *   Check A — pull_request_target ban (D-11, PITFALLS OIDC-1):
 *     ANY workflow line that starts the YAML key `pull_request_target:` (after
 *     leading whitespace) is a violation. This is the GitHub Actions
 *     "pwn-request" trigger: it runs with the base-branch secrets and
 *     write-token, against PR-author-controlled code. There is no legitimate
 *     use case for it in this repository.
 *
 *   Check B — id-token: write scope (D-10, PITFALLS OIDC-1):
 *     The OIDC blast radius lesson from the TanStack May 2026 supply-chain
 *     incident: an OIDC `id-token: write` permission granted at workflow root
 *     (or to a non-publish job) lets every step in every job mint an npm
 *     publish token. The mitigation is to confine `id-token: write` to a
 *     single job literally named `publish` inside `release.yml`. Any other
 *     occurrence is a violation.
 *
 * On the current tree where .github/workflows/ does not yet exist (Plan 02
 * creates it), this script vacuously passes. Once Plan 02 lands ci.yml and
 * Phase 28 lands release.yml, the same scan runs against both.
 *
 * Exit codes:
 *   0 — no workflows present, or all workflows pass both checks
 *   1 — at least one violation found
 *
 * Dependencies: zero external npm packages. Uses node: built-ins only.
 * Deliberately string-level scanning, not YAML parsing: adding a YAML parser
 * would violate the no-external-deps constraint, and the failure-mode patterns
 * are textually unambiguous in any sane workflow file.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const wfDir = join(here, "..", ".github", "workflows");

const PR_TARGET_RE = /^pull_request_target\s*:/;
const ID_TOKEN_WRITE_RE = /^-?\s*id-token\s*:\s*write\s*$/;
const JOB_KEY_RE = /^\s{2,4}([a-z0-9_-]+):\s*$/;

async function listWorkflowFiles() {
  let entries;
  try {
    entries = await readdir(wfDir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(wfDir, name));
}

function findEnclosingJobKey(lines, hitIndex) {
  // Walk backwards up to 200 lines to find the nearest preceding line that
  // matches the conventional GitHub Actions job key indentation (2-4 spaces,
  // identifier, colon, end-of-line).
  const limit = Math.max(0, hitIndex - 200);
  for (let i = hitIndex - 1; i >= limit; i -= 1) {
    const line = lines[i];
    const m = line.match(JOB_KEY_RE);
    if (m) return m[1];
  }
  return null;
}

function auditWorkflow(filePath, text) {
  const offenders = [];
  const fileBase = basename(filePath);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trimStart();
    // Check A — pull_request_target ban.
    if (PR_TARGET_RE.test(trimmed)) {
      offenders.push({
        file: filePath,
        line: i + 1,
        rule: "pull_request_target trigger banned (PITFALLS OIDC-1, D-11)",
      });
    }
    // Check B — id-token: write scope.
    if (ID_TOKEN_WRITE_RE.test(trimmed)) {
      if (fileBase !== "release.yml") {
        offenders.push({
          file: filePath,
          line: i + 1,
          rule: "id-token: write outside release.yml (D-10, OIDC-1 blast radius)",
        });
      } else {
        const jobKey = findEnclosingJobKey(lines, i);
        if (jobKey === null) {
          offenders.push({
            file: filePath,
            line: i + 1,
            rule: "id-token: write not scoped under a recognizable job key (D-10)",
          });
        } else if (jobKey !== "publish") {
          offenders.push({
            file: filePath,
            line: i + 1,
            rule: `id-token: write in non-publish job "${jobKey}" (D-10)`,
          });
        }
      }
    }
  }
  return offenders;
}

async function main() {
  const files = await listWorkflowFiles();
  if (files === null) {
    console.log("[check-workflow-safety] OK — no .github/workflows/ directory yet, nothing to audit");
    return;
  }
  if (files.length === 0) {
    console.log("[check-workflow-safety] OK — .github/workflows/ exists but is empty, nothing to audit");
    return;
  }
  const allOffenders = [];
  for (const filePath of files) {
    const text = await readFile(filePath, "utf8");
    const offenders = auditWorkflow(filePath, text);
    for (const o of offenders) allOffenders.push(o);
  }
  if (allOffenders.length > 0) {
    for (const o of allOffenders) {
      console.error(`[check-workflow-safety] FAIL — ${o.file}:${o.line} ${o.rule}`);
    }
    process.exit(1);
  }
  console.log(`[check-workflow-safety] OK — audited ${files.length} workflow file(s), no pull_request_target triggers, no out-of-scope id-token: write declarations`);
}

main().catch((err) => {
  console.error(`[check-workflow-safety] FAIL — unexpected error: ${(err && err.stack) || String(err)}`);
  process.exit(1);
});
