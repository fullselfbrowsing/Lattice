#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SCRIPT_NAME = "stamp-package-version";

function fail(reason) {
  console.error(`[${SCRIPT_NAME}] FAIL - ${reason}`);
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length !== 6) {
    fail("expected --package <path> --out <path> --export <identifier>");
  }

  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!value) fail(`missing value for ${flag}`);
    if (flag !== "--package" && flag !== "--out" && flag !== "--export") {
      fail(`unknown flag ${flag}`);
    }
    if (values[flag] !== undefined) fail(`duplicate flag ${flag}`);
    values[flag] = value;
  }

  if (!values["--package"]) fail("missing --package");
  if (!values["--out"]) fail("missing --out");
  if (!values["--export"]) fail("missing --export");

  return {
    packagePath: resolve(values["--package"]),
    outPath: resolve(values["--out"]),
    exportName: values["--export"],
  };
}

async function main() {
  const { packagePath, outPath, exportName } = parseArgs(process.argv.slice(2));

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)) {
    fail(`invalid export identifier ${JSON.stringify(exportName)}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(packagePath, "utf8"));
  } catch (err) {
    fail(`could not read package JSON: ${(err && err.message) || String(err)}`);
  }

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    fail("package JSON version must be a non-empty string");
  }

  const source = [
    "// AUTO-GENERATED FILE - DO NOT EDIT.",
    "// Source: package.json version field.",
    "// Regenerate with this package's stamp:version script.",
    `export const ${exportName} = ${JSON.stringify(manifest.version)};`,
    "",
  ].join("\n");

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, source, "utf8");
}

main().catch((err) => {
  fail(`unexpected error: ${(err && err.stack) || String(err)}`);
});
