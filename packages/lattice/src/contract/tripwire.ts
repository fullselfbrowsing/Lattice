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
 * `observed` is the SHAPE-MATCHED redacted payload, not the raw output:
 *   - for `must-cite`: the citations array as found at the located path
 *   - for `field-from-table`: the actual value at `path`
 *   - for `no-pii`: ONLY `{ detector, substring }` — never the full input
 *     (T-08-01 in the 08-01-PLAN threat register)
 *   - for `matches`: the value at `path`
 *
 * Phase 9 receipts will sign this evidence, so leaking the full PII into
 * `observed` would defeat redact-before-sign.
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

function evaluateMustCite(output: unknown, decl: MustCiteInvariant): TripwireResult {
  const located = locateCitations(output);
  const cites = located?.value ?? [];
  const path = located?.path ?? "citations";

  const matched = cites.some((entry) => {
    if (typeof entry === "string") return entry === decl.artifactName;
    if (typeof entry === "object" && entry !== null && "source" in entry) {
      return (entry as { source?: unknown }).source === decl.artifactName;
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

function evaluateNoPii(
  output: unknown,
  decl: NoPiiInvariant,
  detectors: readonly PiiDetector[],
): TripwireResult {
  const value = resolvePath(output, decl.path);
  if (typeof value !== "string") return { ok: true };

  for (const detector of detectors) {
    const result = detector.detect(value);
    if (result.matched) {
      return {
        ok: false,
        evidence: {
          invariantId: decl.id,
          kind: "no-pii",
          path: decl.path,
          // CRITICAL: redacted — only the detector name and the matched
          // substring, never the full input string (T-08-01).
          observed: { detector: detector.name, substring: result.substring },
          message: `no-pii: detector "${detector.name}" flagged content at "${decl.path}".`,
        },
      };
    }
  }
  return { ok: true };
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
