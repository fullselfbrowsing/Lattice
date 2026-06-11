#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const usage = "Usage: node scripts/extract-release-notes.mjs <version> <output>";
const [versionArg, outputPath] = process.argv.slice(2);

if (!versionArg || !outputPath) {
  console.error(usage);
  process.exit(1);
}

const version = versionArg.replace(/^v/, "");
const changelogPath = new URL("../packages/lattice/CHANGELOG.md", import.meta.url);
const changelog = await readFile(changelogPath, "utf8");

const headingPattern = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+.*)?$`, "m");
const headingMatch = changelog.match(headingPattern);

if (!headingMatch || headingMatch.index === undefined) {
  console.error(`Release notes for version ${version} were not found in packages/lattice/CHANGELOG.md`);
  process.exit(1);
}

const sectionStart = headingMatch.index + headingMatch[0].length;
const rest = changelog.slice(sectionStart);
const nextHeadingMatch = rest.match(/^## \[/m);
const sectionBody = (nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest).trim();

if (!sectionBody) {
  console.error(`Release notes for version ${version} are empty in packages/lattice/CHANGELOG.md`);
  process.exit(1);
}

const body = [
  `# @full-self-browsing/lattice v${version}`,
  "",
  sectionBody,
  "",
  "## Packages",
  `- https://www.npmjs.com/package/@full-self-browsing/lattice/v/${version}`,
  `- https://www.npmjs.com/package/@full-self-browsing/lattice-cli/v/${version}`,
  "",
].join("\n");

await writeFile(outputPath, body, "utf8");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
