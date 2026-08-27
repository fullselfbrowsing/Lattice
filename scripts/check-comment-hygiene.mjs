#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_ROOTS = Object.freeze([
  Object.freeze({
    id: "runtime",
    path: "packages/lattice/src",
    language: "typescript",
    extensions: Object.freeze([".ts", ".tsx"]),
  }),
  Object.freeze({
    id: "cli",
    path: "packages/lattice-cli/src",
    language: "typescript",
    extensions: Object.freeze([".ts", ".tsx"]),
  }),
  Object.freeze({
    id: "python-client",
    path: "clients/python/src",
    language: "python",
    extensions: Object.freeze([".py"]),
  }),
  Object.freeze({
    id: "operational-scripts",
    path: "scripts",
    language: "typescript",
    extensions: Object.freeze([".mjs", ".js"]),
  }),
  Object.freeze({
    id: "github-workflows",
    path: ".github/workflows",
    language: "yaml",
    extensions: Object.freeze([".yml", ".yaml"]),
  }),
]);

export const EXCLUSION_POLICIES = Object.freeze([
  Object.freeze({
    id: "tests-and-fixtures",
    reason: "Tests and fixtures are non-production behavioral evidence.",
  }),
  Object.freeze({
    id: "generated-source",
    reason: "Generated commentary must be changed at its generator.",
  }),
  Object.freeze({
    id: "documentation-history",
    reason: "Documentation, specifications, changelogs, and planning retain history.",
  }),
  Object.freeze({
    id: "external-or-derived",
    reason: "Vendored code, build output, and caches are not repository-owned source.",
  }),
]);

const TICKET_PREFIXES = [
  "AGREC",
  "CAPS",
  "CD",
  "CHAT",
  "CI",
  "CLI",
  "COMP",
  "CONTRACT",
  "CONTEXT",
  "COST",
  "CR",
  "CRYPTO",
  "CSS",
  "DECIDE",
  "DELEG",
  "DOC16",
  "EVAL",
  "FOUND",
  "FSB",
  "HYGIENE",
  "IN",
  "INDEX",
  "INFRA",
  "INTG",
  "INV",
  "MAP",
  "MOBILE",
  "NEG",
  "OIDC",
  "OPSVAL",
  "PKG",
  "PERF",
  "PRIM",
  "PUB",
  "QSEL",
  "QUIRK",
  "RECEIPT",
  "REL",
  "RENAME",
  "RERANK",
  "SANITIZE",
  "SC",
  "SCAFF",
  "SIGBR",
  "TOKENS",
  "TOUCH",
  "TRACE",
  "TRIP",
  "TYPO",
  "UAT",
  "WR",
];

export const COMMENT_RULES = Object.freeze([
  Object.freeze({
    id: "CH001_GSD_REFERENCE",
    pattern: /\bGSD\b|\.planning(?:\/|\b)|get-shit-done/iu,
  }),
  Object.freeze({
    id: "CH002_NUMBERED_PHASE_PLAN",
    pattern: /\b(?:phases?|plans?|waves?)\s+(?:[A-Z]+-)?\d+(?:[.-]\d+)*\b/iu,
  }),
  Object.freeze({
    id: "CH003_MILESTONE_CHRONOLOGY",
    pattern: /\bmilestone\s+(?:v?\d|chronology|closeout|completed|shipped)|\bv\d+\.\d+(?:\.\d+)?\s+milestone\b/iu,
  }),
  Object.freeze({
    id: "CH004_DECISION_ID",
    pattern: /\bD-\d+(?:[.-]\d+)*\b/u,
  }),
  Object.freeze({
    id: "CH005_TICKET_REFERENCE",
    pattern: new RegExp(
      `\\b(?:(?:T|${TICKET_PREFIXES.join("|")})-(?:[A-Z0-9]+-)*\\d+|[QA]\\d+|P\\d+-[A-Z])\\b`,
      "u",
    ),
  }),
  Object.freeze({
    id: "CH006_WORKFLOW_NARRATION",
    pattern: /\b(?:this PR|this change|introduced by|deferred to (?:a )?(?:phase|plan)|future follow-up|review (?:finding|note)|audit note|validation gate|sweep gate|pitfalls?|Nyquist|D-lock)\b/iu,
  }),
  Object.freeze({
    id: "CH007_TASK_STATE",
    pattern: /\b(?:task\s+\d+(?:[.-]\d+)*|DEFERRED|OUT[- ]OF[- ]SCOPE|temporary workaround|follow-up task)\b/iu,
  }),
  Object.freeze({
    id: "CH008_WORKFLOW_DOCUMENT",
    pattern: /\b(?:RESEARCH|REVIEW|PLAN|UI-SPEC)(?:\.md)?\b|\b\d+(?:\.\d+)?-REVIEW\.md\b/u,
  }),
]);

const ROOTS_BY_ID = new Map(PRODUCTION_ROOTS.map((root) => [root.id, root]));
const MAX_EXCERPT_LENGTH = 120;

export async function scanRepository({
  repoRoot = process.cwd(),
  roots = PRODUCTION_ROOTS,
} = {}) {
  const files = await discoverProductionFiles({ repoRoot, roots });
  const findings = [];
  for (const file of files) {
    const source = await readFile(file.absolutePath, "utf8");
    findings.push(
      ...scanSource({
        source,
        language: file.language,
        path: file.relativePath,
      }),
    );
  }
  return sortFindings(findings);
}

export async function discoverProductionFiles({ repoRoot, roots }) {
  validateRoots(roots);
  const files = [];
  for (const root of roots) {
    const absoluteRoot = join(repoRoot, ...root.path.split("/"));
    let entries;
    try {
      entries = await readdir(absoluteRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(`Required production root is missing: ${root.path}`);
      }
      throw error;
    }
    await walkRoot({
      repoRoot,
      root,
      directory: absoluteRoot,
      entries,
      files,
    });
  }
  return files.sort((left, right) => compareText(left.relativePath, right.relativePath));
}

function validateRoots(roots) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error("Production root configuration must not be empty.");
  }
  const seen = new Set();
  for (const root of roots) {
    const canonical = ROOTS_BY_ID.get(root?.id);
    if (
      canonical === undefined ||
      canonical.path !== root.path ||
      canonical.language !== root.language ||
      JSON.stringify(canonical.extensions) !== JSON.stringify(root.extensions) ||
      seen.has(root.id)
    ) {
      throw new Error(`Unknown or invalid production root: ${root?.id ?? "missing"}`);
    }
    seen.add(root.id);
  }
}

async function walkRoot({ repoRoot, root, directory, entries, files }) {
  const sorted = [...entries].sort((left, right) => compareText(left.name, right.name));
  for (const entry of sorted) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = join(directory, entry.name);
    const relativePath = normalizePath(relative(repoRoot, absolutePath));
    const exclusion = exclusionFor(relativePath);
    if (entry.isDirectory()) {
      if (exclusion !== undefined) continue;
      const children = await readdir(absolutePath, { withFileTypes: true });
      await walkRoot({ repoRoot, root, directory: absolutePath, entries: children, files });
      continue;
    }
    if (
      entry.isFile() &&
      exclusion === undefined &&
      root.extensions.includes(extname(entry.name))
    ) {
      files.push({ absolutePath, relativePath, language: root.language });
    }
  }
}

export function exclusionFor(inputPath) {
  const path = normalizePath(inputPath);
  const lower = path.toLowerCase();
  const name = lower.split("/").at(-1) ?? lower;
  if (
    /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__|testdata)(?:\/|$)/u.test(lower) ||
    /\.(?:test|spec)\.[^.]+$/u.test(name)
  ) {
    return EXCLUSION_POLICIES[0];
  }
  if (/\.generated\.[^.]+$/u.test(name) || /(?:^|\/)generated(?:\/|$)/u.test(lower)) {
    return EXCLUSION_POLICIES[1];
  }
  if (
    /(?:^|\/)(?:\.planning|docs?|spec)(?:\/|$)/u.test(lower) ||
    /(?:^|\/)(?:readme|changelog)(?:\.[^/]*)?$/u.test(lower)
  ) {
    return EXCLUSION_POLICIES[2];
  }
  if (
    /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|out|target|\.cache|\.turbo|__pycache__)(?:\/|$)/u.test(lower) ||
    /\.egg-info(?:\/|$)/u.test(lower)
  ) {
    return EXCLUSION_POLICIES[3];
  }
  return undefined;
}

export function scanSource({ source, language, path = "fixture" }) {
  const comments = extractComments(source, language);
  const lineStarts = buildLineStarts(source);
  const findings = [];
  for (const comment of comments) {
    for (const rule of COMMENT_RULES) {
      const match = rule.pattern.exec(comment.text);
      if (match === null) continue;
      const absoluteIndex = comment.contentStart + match.index;
      const { line, column } = positionAt(lineStarts, absoluteIndex);
      findings.push({
        path: normalizePath(path),
        line,
        column,
        ruleId: rule.id,
        excerpt: boundedExcerpt(comment.text, match.index),
      });
    }
  }
  return sortFindings(findings);
}

export function extractComments(source, language) {
  if (language === "typescript") return extractTypeScriptComments(source);
  if (language === "python") return extractPythonComments(source);
  if (language === "yaml") return extractYamlComments(source);
  throw new Error(`Unsupported comment language: ${language}`);
}

function extractTypeScriptComments(source) {
  const comments = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index, char);
      continue;
    }
    if (char === "`") {
      index = skipTemplate(source, index);
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      const end = lineEnd(source, index + 2);
      comments.push({ text: source.slice(index + 2, end), contentStart: index + 2 });
      index = end;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close === -1 ? source.length : close;
      comments.push({ text: source.slice(index + 2, end), contentStart: index + 2 });
      index = close === -1 ? source.length : close + 2;
      continue;
    }
    if (char === "/" && canStartRegex(source, index)) {
      index = skipRegex(source, index);
      continue;
    }
    index += 1;
  }
  return comments;
}

function extractPythonComments(source) {
  const comments = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"' || char === "'") {
      const triple = source.slice(index, index + 3) === char.repeat(3);
      index = triple
        ? skipPythonTriple(source, index, char)
        : skipQuoted(source, index, char);
      continue;
    }
    if (char === "#") {
      const end = lineEnd(source, index + 1);
      comments.push({ text: source.slice(index + 1, end), contentStart: index + 1 });
      index = end;
      continue;
    }
    index += 1;
  }
  return comments;
}

function extractYamlComments(source) {
  const comments = [];
  let lineStart = 0;
  let blockScalarIndent;
  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart);
    const lineEndIndex = newline === -1 ? source.length : newline;
    const rawLine = source.slice(lineStart, lineEndIndex).replace(/\r$/u, "");
    const indent = rawLine.match(/^\s*/u)?.[0].length ?? 0;
    const blank = rawLine.trim().length === 0;
    if (blockScalarIndent !== undefined) {
      if (blank || indent > blockScalarIndent) {
        lineStart = newline === -1 ? source.length + 1 : newline + 1;
        continue;
      }
      blockScalarIndent = undefined;
    }

    const hashIndex = yamlCommentIndex(rawLine);
    if (hashIndex !== -1) {
      comments.push({
        text: rawLine.slice(hashIndex + 1),
        contentStart: lineStart + hashIndex + 1,
      });
    }
    const yamlCode = hashIndex === -1 ? rawLine : rawLine.slice(0, hashIndex);
    if (/:(?:\s*)[|>][+-]?[1-9]?(?:\s*)$/u.test(yamlCode)) {
      blockScalarIndent = indent;
    }
    lineStart = newline === -1 ? source.length + 1 : newline + 1;
  }
  return comments;
}

function yamlCommentIndex(line) {
  let quote;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote === "double") {
      if (char === "\\") index += 1;
      else if (char === '"') quote = undefined;
      continue;
    }
    if (quote === "single") {
      if (char === "'" && line[index + 1] === "'") index += 1;
      else if (char === "'") quote = undefined;
      continue;
    }
    if (char === '"') quote = "double";
    else if (char === "'") quote = "single";
    else if (char === "#") return index;
  }
  return -1;
}

function skipQuoted(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") index += 2;
    else if (source[index] === quote) return index + 1;
    else index += 1;
  }
  return source.length;
}

function skipTemplate(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") index += 2;
    else if (source[index] === "`") return index + 1;
    else index += 1;
  }
  return source.length;
}

function skipPythonTriple(source, start, quote) {
  const close = source.indexOf(quote.repeat(3), start + 3);
  return close === -1 ? source.length : close + 3;
}

function canStartRegex(source, slashIndex) {
  let index = slashIndex - 1;
  while (index >= 0 && /\s/u.test(source[index])) index -= 1;
  if (index < 0) return true;
  if (/[[({,:;=!?&|+*%^~<>-]/u.test(source[index])) return true;
  const prefix = source.slice(0, index + 1);
  return /\b(?:return|throw|case|delete|void|typeof|instanceof|in|of|yield|await|new|else|do)$/u.test(prefix);
}

function skipRegex(source, start) {
  let index = start + 1;
  let inClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\") index += 2;
    else if (char === "[") {
      inClass = true;
      index += 1;
    } else if (char === "]") {
      inClass = false;
      index += 1;
    } else if (char === "/" && !inClass) {
      index += 1;
      while (/[A-Za-z]/u.test(source[index] ?? "")) index += 1;
      return index;
    } else if (char === "\n" || char === "\r") {
      return index;
    } else index += 1;
  }
  return source.length;
}

function lineEnd(source, start) {
  const newline = source.indexOf("\n", start);
  return newline === -1 ? source.length : newline;
}

function buildLineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function positionAt(lineStarts, absoluteIndex) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= absoluteIndex) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: absoluteIndex - lineStarts[lineIndex] + 1,
  };
}

function boundedExcerpt(text, matchIndex) {
  const start = Math.max(0, matchIndex - 40);
  const excerpt = text
    .slice(start, start + MAX_EXCERPT_LENGTH)
    .replace(/\s+/gu, " ")
    .trim();
  return excerpt.length <= MAX_EXCERPT_LENGTH
    ? excerpt
    : excerpt.slice(0, MAX_EXCERPT_LENGTH);
}

function sortFindings(findings) {
  return [...findings].sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      left.line - right.line ||
      left.column - right.column ||
      compareText(left.ruleId, right.ruleId),
  );
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(path) {
  return sep === "/" ? path : path.split(sep).join("/");
}

async function main() {
  try {
    const findings = await scanRepository();
    for (const finding of findings) {
      process.stdout.write(
        `${finding.path}:${finding.line}:${finding.column} [${finding.ruleId}] ${finding.excerpt}\n`,
      );
    }
    process.stdout.write(`${findings.length} comment hygiene finding(s)\n`);
    process.exitCode = findings.length === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scanner failure.";
    process.stderr.write(`[check-comment-hygiene] ERROR ${message.slice(0, 200)}\n`);
    process.exitCode = 2;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  realpathSync(invokedPath) === realpathSync(fileURLToPath(import.meta.url))
) {
  await main();
}
