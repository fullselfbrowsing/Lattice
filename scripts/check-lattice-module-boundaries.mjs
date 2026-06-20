#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_NAME = "check-lattice-module-boundaries";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageDir = join(repoRoot, "packages", "lattice");
const srcDir = join(packageDir, "src");
const packageJsonPath = join(packageDir, "package.json");

const REQUIRED_MODULES = [
  "./providers",
  "./audit",
  "./context",
  "./artifacts",
  "./routing",
  "./tools",
  "./storage",
  "./eval",
  "./agents",
  "./core",
];

const REQUIRED_BOUNDARIES = [
  {
    name: "providers",
    entry: join(srcDir, "providers.ts"),
    forbidden: [join(srcDir, "agent")],
  },
  {
    name: "audit",
    entry: join(srcDir, "audit.ts"),
    forbidden: [join(srcDir, "agent")],
  },
  {
    name: "core",
    entry: join(srcDir, "core.ts"),
    forbidden: [join(srcDir, "agent")],
  },
];

const COMPATIBILITY_LABELS = new Set([
  "node20-compatible",
  "node24-runtime",
  "adapter-specific",
]);

function toRepoRelative(fullPath) {
  return relative(repoRoot, fullPath).split(sep).join("/");
}

function fail(message) {
  console.error(`[${SCRIPT_NAME}] FAIL - ${message}`);
  process.exitCode = 1;
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    fail(`could not read packages/lattice/package.json: ${error?.message ?? String(error)}`);
    return {};
  }
}

function inspectManifest(manifest) {
  const exportsBlock = manifest.exports;
  if (exportsBlock === undefined || typeof exportsBlock !== "object" || exportsBlock === null) {
    fail("packages/lattice/package.json must define exports");
    return;
  }

  for (const modulePath of REQUIRED_MODULES) {
    const exported = exportsBlock[modulePath];
    if (exported === undefined || typeof exported !== "object" || exported === null) {
      fail(`missing package export ${modulePath}`);
      continue;
    }

    for (const key of ["types", "import", "default"]) {
      if (typeof exported[key] !== "string" || exported[key].length === 0) {
        fail(`export ${modulePath} must define non-empty ${key}`);
      }
    }
  }

  const modules = manifest.lattice?.modules;
  if (modules === undefined || typeof modules !== "object" || modules === null) {
    fail("packages/lattice/package.json must define lattice.modules");
    return;
  }

  for (const modulePath of REQUIRED_MODULES) {
    const metadata = modules[modulePath];
    if (metadata === undefined || typeof metadata !== "object" || metadata === null) {
      fail(`missing lattice.modules metadata for ${modulePath}`);
      continue;
    }

    if (!COMPATIBILITY_LABELS.has(metadata.compatibility)) {
      fail(
        `lattice.modules.${modulePath}.compatibility must be one of ${[
          ...COMPATIBILITY_LABELS,
        ].join(", ")}`,
      );
    }

    if (typeof metadata.description !== "string" || metadata.description.length === 0) {
      fail(`lattice.modules.${modulePath}.description must be a non-empty string`);
    }
  }
}

function importSpecifiers(source) {
  const specifiers = [];
  const pattern =
    /\bimport\s+(?!type\b)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|\bexport\s+(?!type\b)(?:[\s\S]*?\s+from\s+)["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gu;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined && specifier.startsWith(".")) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function resolveSourceImport(fromFile, specifier) {
  const rawTarget = resolve(dirname(fromFile), specifier);
  const ext = extname(rawTarget);
  const candidates = [];

  if (ext.length > 0) {
    candidates.push(rawTarget.replace(/\.(?:js|mjs|cjs|jsx|tsx)$/u, ".ts"));
    candidates.push(rawTarget);
  } else {
    candidates.push(`${rawTarget}.ts`);
    candidates.push(join(rawTarget, "index.ts"));
  }

  return candidates.find((candidate) => existsSync(candidate));
}

function isForbidden(filePath, forbiddenRoots) {
  const normalized = resolve(filePath);
  return forbiddenRoots.some((root) => {
    const normalizedRoot = resolve(root);
    return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${sep}`);
  });
}

async function collectGraph(entry) {
  const visited = new Set();
  const stack = [entry];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const source = await readFile(current, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveSourceImport(current, specifier);
      if (resolved !== undefined && resolved.startsWith(srcDir)) {
        stack.push(resolved);
      }
    }
  }

  return visited;
}

async function inspectBoundary(boundary) {
  if (!existsSync(boundary.entry)) {
    fail(`${boundary.name} boundary entry missing: ${toRepoRelative(boundary.entry)}`);
    return;
  }

  const graph = await collectGraph(boundary.entry);
  const offenders = [...graph].filter((filePath) => isForbidden(filePath, boundary.forbidden));
  for (const offender of offenders) {
    fail(`${boundary.name} boundary reaches forbidden agent module ${toRepoRelative(offender)}`);
  }
}

async function main() {
  inspectManifest(await readManifest());
  for (const boundary of REQUIRED_BOUNDARIES) {
    await inspectBoundary(boundary);
  }

  if (process.exitCode === undefined || process.exitCode === 0) {
    console.log(`[${SCRIPT_NAME}] OK - modular exports and boundaries clean`);
  }
}

main().catch((error) => {
  console.error(`[${SCRIPT_NAME}] FAIL - unexpected error: ${error?.stack ?? String(error)}`);
  process.exit(1);
});
