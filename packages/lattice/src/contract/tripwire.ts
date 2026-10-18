import type { StandardSchemaV1 } from "@standard-schema/spec";

import type {
  FieldFromTableInvariant,
  InvariantDeclaration,
  MatchesInvariant,
  MustCiteInvariant,
  NoPiiInvariant,
} from "./invariants.js";
import { defaultPiiDetectors, type PiiDetector } from "./pii-detectors.js";

/**
 * Evidence emitted when a tripwire invariant fires.
 *
 * `path` is always the DECLARED path from the invariant (or the located
 * citations key for `must-cite`), never a location derived from the output.
 *
 * `observed` is the runtime (unsigned) view of what the kernel saw. It is
 * narrowed, not sanitized:
 *   - for `must-cite`: the citations array as found at the located path
 *   - for `field-from-table`: the actual value at `path`
 *   - for `no-pii`: ONLY `{ detector, substring, foundAt }` — the matched
 *     fragment and its concrete location below `path`, never the full input
 *     (T-08-01 in the 08-01-PLAN threat register)
 *   - for `matches`: the value at `path`
 *
 * `message` may embed the same runtime content (the concrete location, a
 * schema library's issue text) because it exists to make the runtime error
 * actionable.
 *
 * This evidence reaches callers through `result.error.evidence` so they can
 * debug the violation. Before any of it is SIGNED into a receipt,
 * receipts/redact.ts rewrites `observed` (and the `matches` message) to a
 * non-reversible shape. Do not add fields here that must survive signing
 * without also teaching redact.ts about them.
 */
export interface TripwireEvidence {
  readonly invariantId: string;
  readonly kind: "must-cite" | "field-from-table" | "no-pii" | "matches";
  readonly path: string;
  readonly observed: unknown;
  readonly message: string;
}

export type TripwireResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly evidence: TripwireEvidence };

/**
 * Pure tripwire evaluator.
 *
 * No I/O, no Date.now, no random — same `(output, invariants)` always
 * returns the same `TripwireResult`. Phase 9 receipts can reconstruct the
 * verdict deterministically (T-08-04).
 *
 * Evaluates invariants in declaration order; the FIRST failing invariant
 * aborts and returns its evidence. Subsequent invariants are not evaluated.
 *
 * @param output      The provider output to inspect.
 * @param invariants  Invariants to evaluate, in declaration order.
 * @param detectors   PII detectors used for `no-pii` invariants. Defaults
 *                    to `defaultPiiDetectors`. Callers can pass a custom
 *                    list to override.
 */
export async function evaluateTripwires(
  output: unknown,
  invariants: readonly InvariantDeclaration[],
  detectors: readonly PiiDetector[] = defaultPiiDetectors,
): Promise<TripwireResult> {
  for (const declaration of invariants) {
    const result = await evaluateOne(output, declaration, detectors);
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function evaluateOne(
  output: unknown,
  declaration: InvariantDeclaration,
  detectors: readonly PiiDetector[],
): Promise<TripwireResult> {
  switch (declaration.kind) {
    case "must-cite":
      return evaluateMustCite(output, declaration);
    case "field-from-table":
      return evaluateFieldFromTable(output, declaration);
    case "no-pii":
      return evaluateNoPii(output, declaration, detectors);
    case "matches":
      return evaluateMatches(output, declaration);
    default: {
      // Exhaustiveness guard. If a new kind is added without updating this
      // switch, TS will reject the assignment below.
      const _exhaustive: never = declaration;
      throw new Error(`Unknown invariant kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

const DEFAULT_MUST_CITE_KEYS: readonly string[] = ["source"];

/**
 * `must-cite` checks that a citation naming `artifactName` is PRESENT in the
 * located citations array. It does not verify that the cited artifact
 * supports the claim; that is a semantic judgment outside the kernel.
 *
 * Defaults reproduce the original behavior exactly: search top-level
 * `citations` then `evidence`, compare string entries directly and object
 * entries by their `source` key, case-sensitively. `decl.path`, `decl.keys`,
 * and `decl.caseInsensitive` (issue #21 F9) relax each of those in turn.
 */
function evaluateMustCite(output: unknown, decl: MustCiteInvariant): TripwireResult {
  const located =
    decl.path !== undefined
      ? locateCitationsAtPath(output, decl.path)
      : locateCitations(output);
  const cites = located?.value ?? [];
  const path = located?.path ?? decl.path ?? "citations";
  const keys = decl.keys ?? DEFAULT_MUST_CITE_KEYS;
  const equals = (candidate: unknown): boolean =>
    typeof candidate === "string" &&
    (decl.caseInsensitive === true
      ? candidate.toLowerCase() === decl.artifactName.toLowerCase()
      : candidate === decl.artifactName);

  const matched = cites.some((entry) => {
    if (typeof entry === "string") return equals(entry);
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      return keys.some((key) => key in record && equals(record[key]));
    }
    return false;
  });

  if (matched) return { ok: true };

  return {
    ok: false,
    evidence: {
      invariantId: decl.id,
      kind: "must-cite",
      path,
      observed: cites,
      message: `must-cite: no citation found for "${decl.artifactName}".`,
    },
  };
}

/**
 * Locate the citations payload in `output`. Searches top-level for a
 * `citations` or `evidence` key holding an array. Per 08-CONTEXT.md:
 * "Path defaults to evidence if the output has a citations field; the
 * runtime locates the citations payload in the output."
 *
 * Returns `undefined` when neither field is an array.
 */
function locateCitations(
  output: unknown,
): { readonly value: readonly unknown[]; readonly path: string } | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const record = output as Record<string, unknown>;
  for (const key of ["citations", "evidence"] as const) {
    const value = record[key];
    if (Array.isArray(value)) return { value, path: key };
  }
  return undefined;
}

/**
 * Locate a citations array at an explicit resolvePath expression (issue #21
 * F9). The resolved value must itself be an array; a `[*]` wildcard result
 * is an array of per-element resolutions and is NOT flattened, so point the
 * path at the array that holds the citation entries.
 */
function locateCitationsAtPath(
  output: unknown,
  path: string,
): { readonly value: readonly unknown[]; readonly path: string } | undefined {
  const value = resolvePath(output, path);
  return Array.isArray(value) ? { value, path } : undefined;
}

function evaluateFieldFromTable(
  output: unknown,
  decl: FieldFromTableInvariant,
): TripwireResult {
  const value = resolvePath(output, decl.path);
  if (typeof value === "string" && decl.allowedValues.includes(value)) {
    return { ok: true };
  }
  return {
    ok: false,
    evidence: {
      invariantId: decl.id,
      kind: "field-from-table",
      path: decl.path,
      observed: value,
      message: `field-from-table: value at "${decl.path}" not in allowedValues.`,
    },
  };
}

/**
 * Bound on how deep the no-pii walk descends into nested containers. Values
 * below this depth are not scanned. Provider outputs are bounded by token
 * caps, so 32 levels is far beyond anything a schema produces; the cap only
 * guards pathological inputs. Documented in the no-pii invariant docs.
 */
const MAX_NO_PII_WALK_DEPTH = 32;

type PathFrame =
  | { readonly kind: "index"; readonly index: number }
  | { readonly kind: "key"; readonly key: string };

interface PiiHit {
  readonly detector: string;
  readonly substring: string;
  readonly frames: readonly PathFrame[];
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Depth-first scan for PII. Deterministic by construction (issue #21 F8):
 *   - strings run the detectors in order; the first match wins
 *   - arrays are walked in index order
 *   - plain objects are walked in sorted key order (UTF-16 code units, the
 *     same order JCS uses), so insertion order never changes the verdict
 *   - Date, Map, typed arrays, and other non-plain objects are skipped
 *   - numbers, booleans, null, undefined pass (numbers are not stringified)
 *   - a `visited` set guards cycles and shared references; an object that
 *     has already been scanned clean cannot contain PII
 * Traversal order takes precedence over detector order: the first string
 * reached that any detector flags is the reported violation.
 */
function scanForPii(
  value: unknown,
  detectors: readonly PiiDetector[],
  frames: PathFrame[],
  visited: Set<object>,
  depth: number,
): PiiHit | undefined {
  if (typeof value === "string") {
    for (const detector of detectors) {
      const result = detector.detect(value);
      if (result.matched) {
        return { detector: detector.name, substring: result.substring, frames: [...frames] };
      }
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  if (depth >= MAX_NO_PII_WALK_DEPTH) return undefined;
  if (visited.has(value)) return undefined;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      frames.push({ kind: "index", index });
      const hit = scanForPii(entry, detectors, frames, visited, depth + 1);
      frames.pop();
      if (hit !== undefined) return hit;
    }
    return undefined;
  }

  if (!isPlainObject(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    frames.push({ kind: "key", key });
    const hit = scanForPii(record[key], detectors, frames, visited, depth + 1);
    frames.pop();
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * Build the concrete path of a violating string from the declared path plus
 * the frames walked below it. Leading index frames fill `[*]` wildcards in
 * order, because resolvePath materializes exactly one array level per
 * wildcard; remaining frames append `[i]` or `.key`.
 *
 *   items        + [2].note  -> items[2].note
 *   items[*].note + [2]      -> items[2].note
 *   a[*].b       + [1][1]    -> a[1].b[1]
 *   ""           + x.y       -> x.y
 */
function formatViolationPath(declaredPath: string, frames: readonly PathFrame[]): string {
  let path = declaredPath;
  let wildcardsLeft = declaredPath.split("[*]").length - 1;
  for (const frame of frames) {
    if (frame.kind === "index") {
      if (wildcardsLeft > 0) {
        path = path.replace("[*]", `[${frame.index}]`);
        wildcardsLeft -= 1;
      } else {
        path += `[${frame.index}]`;
      }
      continue;
    }
    path = path === "" ? frame.key : `${path}.${frame.key}`;
  }
  return path;
}

function evaluateNoPii(
  output: unknown,
  decl: NoPiiInvariant,
  detectors: readonly PiiDetector[],
): TripwireResult {
  const value = resolvePath(output, decl.path);
  // Issue #21 F8: a non-string value at the path used to pass silently,
  // which let PII inside nested objects, arrays, and `[*]` wildcard results
  // through. Walk containers instead; see scanForPii for the order rules.
  const hit = scanForPii(value, detectors, [], new Set<object>(), 0);
  if (hit === undefined) return { ok: true };

  const foundAt = formatViolationPath(decl.path, hit.frames);
  return {
    ok: false,
    evidence: {
      invariantId: decl.id,
      kind: "no-pii",
      // `path` stays the DECLARED path, which is developer-owned. The
      // concrete location can contain model-produced object keys, so it
      // travels only in `observed.foundAt` and `message`, both of which
      // receipts/redact.ts rewrites before anything is signed.
      path: decl.path,
      // Narrowed to the detector name and the matched substring, never
      // the full input string (T-08-01). The substring itself is still
      // sensitive; receipts/redact.ts masks it before signing.
      observed: { detector: hit.detector, substring: hit.substring, foundAt },
      message: `no-pii: detector "${hit.detector}" flagged content at "${foundAt}".`,
    },
  };
}

async function evaluateMatches(
  output: unknown,
  decl: MatchesInvariant,
): Promise<TripwireResult> {
  const value = resolvePath(output, decl.path);
  const validateResult = decl.schema["~standard"].validate(value);
  const validation: StandardSchemaV1.Result<unknown> =
    validateResult instanceof Promise ? await validateResult : validateResult;

  if ("issues" in validation && validation.issues !== undefined) {
    const firstIssue = validation.issues[0];
    return {
      ok: false,
      evidence: {
        invariantId: decl.id,
        kind: "matches",
        path: decl.path,
        observed: value,
        message: firstIssue?.message ?? `matches: schema validation failed at "${decl.path}".`,
      },
    };
  }
  return { ok: true };
}

/**
 * Resolve a dotted/bracketed path expression against a value.
 *
 * Supports three segment forms:
 *   - dotted key:    `a.b.c`
 *   - bracket index: `a[0].b`
 *   - wildcard:      `a[*].b` (materializes the array of resolutions)
 *
 * Returns `undefined` for missing paths (does not throw).
 *
 * NOTE (T-08-03): `[*]` materializes the array; deeply nested wildcard
 * chains could allocate O(N^k). Accepted for v1.1 — provider responses
 * are bounded by output token caps.
 */
function resolvePath(value: unknown, path: string): unknown {
  if (path === "") return value;
  const tokens = tokenize(path);
  return walk(value, tokens, 0);
}

type Token =
  | { readonly type: "key"; readonly name: string }
  | { readonly type: "index"; readonly index: number }
  | { readonly type: "wildcard" };

function tokenize(path: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let buffer = "";
  const flushKey = (): void => {
    if (buffer.length > 0) {
      tokens.push({ type: "key", name: buffer });
      buffer = "";
    }
  };
  while (i < path.length) {
    const ch = path[i];
    if (ch === ".") {
      flushKey();
      i += 1;
      continue;
    }
    if (ch === "[") {
      flushKey();
      const end = path.indexOf("]", i + 1);
      if (end === -1) {
        // Malformed path — treat the rest as a literal key so we degrade
        // to `undefined` rather than throw on user input.
        buffer = path.slice(i);
        i = path.length;
        continue;
      }
      const inner = path.slice(i + 1, end);
      if (inner === "*") {
        tokens.push({ type: "wildcard" });
      } else {
        const idx = Number(inner);
        if (Number.isInteger(idx) && idx >= 0) {
          tokens.push({ type: "index", index: idx });
        } else {
          // Non-numeric bracket content — treat as a key (e.g. `a[b]` →
          // unusual but plausible).
          tokens.push({ type: "key", name: inner });
        }
      }
      i = end + 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flushKey();
  return tokens;
}

function walk(value: unknown, tokens: readonly Token[], cursor: number): unknown {
  if (cursor >= tokens.length) return value;
  if (value === undefined || value === null) return undefined;
  const token = tokens[cursor]!;
  if (token.type === "key") {
    if (typeof value !== "object") return undefined;
    const next = (value as Record<string, unknown>)[token.name];
    return walk(next, tokens, cursor + 1);
  }
  if (token.type === "index") {
    if (!Array.isArray(value)) return undefined;
    return walk(value[token.index], tokens, cursor + 1);
  }
  // wildcard
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => walk(entry, tokens, cursor + 1));
}

/**
 * Test-only export: lets unit tests exercise the path resolver directly.
 * Not part of the public surface; lives behind a `__` prefix to discourage
 * runtime use.
 */
export function __resolvePathForTests(value: unknown, path: string): unknown {
  return resolvePath(value, path);
}
