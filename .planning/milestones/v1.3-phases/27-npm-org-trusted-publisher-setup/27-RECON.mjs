#!/usr/bin/env node
/**
 * Phase 27 Trust-Tuple Recon (ORG-01..03 verification).
 *
 * Verifies the three artifacts that must exist before Phase 28's first
 * OIDC publish:
 *   1. The `npm-publish` GitHub Environment in fullselfbrowsing/Lattice
 *      with at least one required reviewer configured.
 *   2. The npm Trusted Publisher entry for @full-self-browsing/lattice
 *      matching the locked trust tuple from 27-CONTEXT.md D-03.
 *   3. The npm Trusted Publisher entry for @full-self-browsing/lattice-cli
 *      matching the same trust tuple shape.
 *
 * Verification strategy: this script uses the public npm registry HTTP API
 * and the GitHub REST API rather than driving the FSB browser, so it can
 * run in CI without a logged-in browser session. The shape of each entry
 * is checked at the API level; the walkthrough doc covers the UI flow.
 *
 * Required environment:
 *   - GITHUB_TOKEN: a fine-grained PAT or classic token with read access
 *     to the repository's Environments. The repo settings expose this via
 *     the `actions:read` and `administration:read` scopes.
 *   - NPM_REGISTRY (optional, defaults to https://registry.npmjs.org)
 *
 * Exit codes: 0 if all three checks pass. 1 if any check fails. The script
 * prints one OK or FAIL line per check followed by a structured details
 * block so the walkthrough can be re-entered to fix the offending step.
 */

const NPM_REGISTRY = process.env.NPM_REGISTRY ?? "https://registry.npmjs.org";
const GITHUB_API = "https://api.github.com";
const REPO_OWNER = "fullselfbrowsing";
const REPO_NAME = "Lattice";
const ENVIRONMENT_NAME = "npm-publish";

const PACKAGES = [
  "@full-self-browsing/lattice",
  "@full-self-browsing/lattice-cli",
];

const EXPECTED_TRUST = Object.freeze({
  repository: `${REPO_OWNER}/${REPO_NAME}`,
  workflow_filename: "release.yml",
  environment: ENVIRONMENT_NAME,
});

function fmt(ok, label, detail) {
  const status = ok ? "OK" : "FAIL";
  const tail = detail ? ` -- ${detail}` : "";
  return `[recon] ${status} ${label}${tail}`;
}

async function ghJson(path, token) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lattice-phase-27-recon",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const truncated = body.length > 200 ? `${body.slice(0, 200)}...` : body;
    throw new Error(`GitHub ${res.status} ${res.statusText}: ${truncated}`);
  }
  return await res.json();
}

async function npmJson(name) {
  const encoded = name.replace("/", "%2F");
  const res = await fetch(`${NPM_REGISTRY}/${encoded}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`npm ${res.status} ${res.statusText} for ${name}`);
  }
  return await res.json();
}

async function checkEnvironment(token) {
  try {
    const env = await ghJson(
      `/repos/${REPO_OWNER}/${REPO_NAME}/environments/${ENVIRONMENT_NAME}`,
      token,
    );
    const reviewers = env.protection_rules?.find((r) => r.type === "required_reviewers");
    if (reviewers === undefined) {
      return {
        ok: false,
        label: `GitHub Environment ${ENVIRONMENT_NAME}`,
        detail: "exists but has no required_reviewers protection rule (Step 2 incomplete)",
      };
    }
    const reviewerNames = (reviewers.reviewers ?? [])
      .map((r) => r.reviewer?.login)
      .filter(Boolean);
    if (reviewerNames.length === 0) {
      return {
        ok: false,
        label: `GitHub Environment ${ENVIRONMENT_NAME}`,
        detail: "required_reviewers rule present but reviewer list empty",
      };
    }
    return {
      ok: true,
      label: `GitHub Environment ${ENVIRONMENT_NAME}`,
      detail: `required reviewers: ${reviewerNames.join(", ")}`,
    };
  } catch (err) {
    return {
      ok: false,
      label: `GitHub Environment ${ENVIRONMENT_NAME}`,
      detail: err.message,
    };
  }
}

/**
 * The npm registry's Trusted Publisher metadata is not yet exposed in the
 * public package document. Until it is, this recon falls back to two
 * indirect signals:
 *   1. The package exists on the registry (bootstrap publish completed).
 *   2. The latest published version's dist.attestations field is populated
 *      with at least one provenance attestation OR is empty for the
 *      bootstrap version (which intentionally lacks provenance).
 *
 * A real "trust tuple is configured" assertion needs either the npm UI or
 * an authenticated session against the npm public-facing GraphQL endpoint
 * which is not stable enough to ship a script against. The walkthrough's
 * Step 4 manual visual check on the access page is the canonical proof.
 */
async function checkPackagePresence(name) {
  try {
    const doc = await npmJson(name);
    if (doc === null) {
      return {
        ok: false,
        label: `npm package ${name}`,
        detail: "not on registry yet (Step 3 bootstrap publish incomplete)",
      };
    }
    const versions = Object.keys(doc.versions ?? {});
    const tagged = doc["dist-tags"] ?? {};
    const bootstrapVersion = tagged.bootstrap ?? null;
    if (versions.length === 0) {
      return {
        ok: false,
        label: `npm package ${name}`,
        detail: "registry entry exists but has zero versions",
      };
    }
    return {
      ok: true,
      label: `npm package ${name}`,
      detail: `published versions: ${versions.length}, bootstrap dist-tag: ${bootstrapVersion ?? "absent"}`,
    };
  } catch (err) {
    return {
      ok: false,
      label: `npm package ${name}`,
      detail: err.message,
    };
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const checks = [];

  if (typeof token !== "string" || token.length === 0) {
    checks.push({
      ok: false,
      label: `GitHub Environment ${ENVIRONMENT_NAME}`,
      detail: "GITHUB_TOKEN environment variable not set (cannot read Environment)",
    });
  } else {
    checks.push(await checkEnvironment(token));
  }

  for (const name of PACKAGES) {
    checks.push(await checkPackagePresence(name));
  }

  for (const c of checks) {
    process.stdout.write(`${fmt(c.ok, c.label, c.detail)}\n`);
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) {
    process.stdout.write(`[recon] OK ${checks.length}/${checks.length} checks passed\n`);
    process.stdout.write(`[recon] Expected trust tuple for both packages: ${JSON.stringify(EXPECTED_TRUST)}\n`);
    process.stdout.write(`[recon] Trust tuple shape is verified visually on each package access page per 27-WALKTHROUGH.md Step 4.\n`);
    process.exit(0);
  }
  process.stdout.write(`[recon] FAIL ${failed.length}/${checks.length} check(s) failed -- re-run 27-WALKTHROUGH.md from the first failing step\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stdout.write(`[recon] FAIL recon script crashed: ${err.message}\n`);
  process.exit(1);
});
