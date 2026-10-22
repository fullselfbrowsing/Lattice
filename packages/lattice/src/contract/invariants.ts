import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Tripwire invariant declaration variants produced by the `inv` fluent
 * builder. Each variant is a frozen value carrying a discriminant `kind`
 * and an `id` (auto-generated or caller-supplied).
 *
 * Phase 8 reshapes the Phase 7 placeholder `{ kind: "policy"|"semantic"|"schema" }`
 * into this discriminated union. Phase 7 never populated `invariants`
 * (see 07-04-SUMMARY decisions), so the change is additive in practice
 * but technically a breaking type change for any external caller that
 * authored a literal of the old shape.
 */

/**
 * `must-cite` checks that a citation entry naming `artifactName` is PRESENT
 * in a located citations array. It does NOT verify that the cited artifact
 * supports the claim.
 *
 * With every optional field absent the check is the original structured
 * match: search top-level `citations` then `evidence`, compare string
 * entries directly and object entries by their `source` key,
 * case-sensitively. One fallback extends it: when the first top-level list
 * is missing or does not name the artifact, the other top-level list and the
 * `citations` and `evidence` arrays nested deeper in the output (for example
 * `{ answer: { text, citations } }` or `{ sections: [{ text, citations }] }`)
 * are searched too, so an output that passed before still passes. The
 * output's prose is read only when `inline` or `rejectUncited` is set.
 *
 * On a violation, evidence `path` is `path` when declared, else the key name
 * (`citations` or `evidence`) of the reported list. It is never the dotted
 * location of a nested list, which is built from the output's own keys; that
 * location appears only in the runtime `message`, which receipts rebuild
 * before signing.
 *
 * Optional fields are only present on the declaration when set, and
 * `inline` and `rejectUncited` only when `true`, so contracts that do not
 * use them hash identically to before.
 */
export interface MustCiteInvariant {
  readonly id: string;
  readonly kind: "must-cite";
  readonly artifactName: string;
  /**
   * resolvePath expression locating the citations array (for example
   * `result.refs`). Must resolve to the array holding the entries; `[*]`
   * results are not flattened. A declared path disables the nested
   * fallback, and the prose scans skip its subtree.
   */
  readonly path?: string;
  /** Object keys compared against `artifactName`. Default `["source"]`. */
  readonly keys?: readonly string[];
  /**
   * Compare with `toLowerCase()` on both sides, for list entries and prose
   * markers alike. Default false.
   */
  readonly caseInsensitive?: boolean;
  /**
   * Also pass on an inline marker when no located citations list has any
   * entries: a `[...]` or `(...)` group in the scanned text (see `textPath`)
   * whose content, or one of its `;`/`,`-separated parts, equals
   * `artifactName` after trimming, with or without a trailing `p. 4` or `§3`
   * locator. `[doc-a]`, `(doc-a, p. 4)`, and `[doc-a; doc-b]` cite `doc-a`;
   * `[doc-a.v2]` and `(not doc-a)` do not. Code spans and markdown link text
   * are ignored. The match is syntactic, so a sentence that disowns
   * `(doc-a)` still counts. A non-empty list that omits the artifact still
   * fails. Default false.
   */
  readonly inline?: boolean;
  /**
   * Fail a list entry that names the artifact when the scanned text (see
   * `textPath`) carries citation markers and none of them cites the
   * artifact. Only these square-bracket forms are markers:
   *   - numbers and ranges from 1 to 999 (`[1]`, `[1, 2]`, `[2-4]`), resolved
   *     to the entry whose `label`, `marker`, or `id` is that number, else to
   *     the entry at that 1-based position. A number past the end of the
   *     list cites something else.
   *   - author-year references (`[Smith 1999]`, `[Smith et al., 2001]`).
   *     Month names and date annotations are not authors, so `[March 2024]`,
   *     `[Updated 2024]`, `[Est. 1999]`, and `[Copyright 2025]` are ignored.
   *   - a bracket equal to `artifactName` or to a list entry's identifier.
   * Links, footnotes, `[x]`, `[sic]`, `[INFO]`, `arr[0]`, timestamps, code
   * spans, and parentheses are ignored. Without `textPath` the scan reads
   * every string in the output, so a number in brackets inside a log line
   * or a JSON string (`"[200] OK"`, `'{"ids":[2,3]}'`) counts as a marker;
   * set `textPath` to the answer field to avoid that. The scan skips strings
   * below `citations`/`evidence` keys and the `path` subtree, walks in
   * sorted key order, and goes down to 32 levels; if it reaches that depth
   * anywhere the verdict is unknown and the entry is not rejected. The
   * runtime error names the first competing marker and where it was found.
   * Default false.
   */
  readonly rejectUncited?: boolean;
  /**
   * resolvePath expression for the text that `inline` and `rejectUncited`
   * read, for example `answer` or `sections[*].text`. Only strings at or
   * below it are scanned, still skipping `citations`/`evidence` keys and the
   * `path` subtree. A path that resolves to nothing leaves no text, so
   * `inline` finds no marker and `rejectUncited` finds no competing one.
   * Default: the whole output. No effect unless one of those flags is set.
   */
  readonly textPath?: string;
}

export interface FieldFromTableInvariant {
  readonly id: string;
  readonly kind: "field-from-table";
  readonly path: string;
  readonly allowedValues: readonly string[];
}

export interface NoPiiInvariant {
  readonly id: string;
  readonly kind: "no-pii";
  readonly path: string;
}

export interface MatchesInvariant<T = unknown> {
  readonly id: string;
  readonly kind: "matches";
  readonly path: string;
  readonly schema: StandardSchemaV1<unknown, T>;
}

export type InvariantDeclaration =
  | MustCiteInvariant
  | FieldFromTableInvariant
  | NoPiiInvariant
  | MatchesInvariant;

export interface InvariantOptions {
  readonly id?: string;
}

/** Options for `inv.mustCite` (issue #21 F9). See MustCiteInvariant. */
export interface MustCiteOptions extends InvariantOptions {
  readonly path?: string;
  readonly keys?: readonly string[];
  readonly caseInsensitive?: boolean;
  readonly inline?: boolean;
  readonly rejectUncited?: boolean;
  readonly textPath?: string;
}

let counter = 0;

function nextId(kind: string, options?: InvariantOptions): string {
  counter += 1;
  return options?.id ?? `${kind}-${counter}`;
}

/**
 * Fluent builder for tripwire invariants.
 *
 * Each helper returns a frozen `InvariantDeclaration` with an auto-generated
 * id of the form `${kind}-${counter}`. Callers may override the id via the
 * second-positional `options.id` arg.
 *
 * The counter is monotonic across kinds — calling `inv.mustCite("a")` then
 * `inv.fieldFromTable("x", ["y"])` yields ids `must-cite-1` then
 * `field-from-table-2`. This keeps ids globally unique within a process.
 *
 * Note on `inv.matches`: the caller supplies the StandardSchema validator,
 * and the tripwire evaluator trusts whatever `~standard.validate` returns.
 * This is by design — `matches` is the caller-driven escape hatch (see
 * T-08-05 in the 08-01-PLAN threat register).
 */
export const inv = {
  /**
   * Throws `TypeError` when `artifactName` is empty or only whitespace,
   * because no citation can meaningfully name it.
   */
  mustCite(artifactName: string, options?: MustCiteOptions): MustCiteInvariant {
    if (typeof artifactName !== "string" || artifactName.trim() === "") {
      throw new TypeError("inv.mustCite: artifactName must not be empty.");
    }
    return Object.freeze({
      id: nextId("must-cite", options),
      kind: "must-cite" as const,
      artifactName,
      // Conditional spreads keep the declaration (and the signed contractHash)
      // byte-identical to the pre-options shape when no option is set.
      ...(options?.path !== undefined ? { path: options.path } : {}),
      ...(options?.keys !== undefined ? { keys: Object.freeze([...options.keys]) } : {}),
      ...(options?.caseInsensitive !== undefined
        ? { caseInsensitive: options.caseInsensitive }
        : {}),
      // The opt-in flags appear only when true, so `false` hashes like unset.
      ...(options?.inline === true ? { inline: true } : {}),
      ...(options?.rejectUncited === true ? { rejectUncited: true } : {}),
      ...(options?.textPath !== undefined ? { textPath: options.textPath } : {}),
    });
  },
  fieldFromTable(
    path: string,
    allowedValues: readonly string[],
    options?: InvariantOptions,
  ): FieldFromTableInvariant {
    return Object.freeze({
      id: nextId("field-from-table", options),
      kind: "field-from-table" as const,
      path,
      allowedValues: Object.freeze([...allowedValues]),
    });
  },
  /**
   * `no-pii` scans the value at `path`. Strings run the default (or
   * caller-supplied) detectors; arrays and plain objects are walked
   * recursively in deterministic order (issue #21 F8), so a wildcard path
   * such as `items[*].note` or a path to a whole object is covered. Numbers,
   * booleans, and null pass. The evidence `path` is always this declared
   * path; the concrete sub-path of the offending string is reported as
   * `observed.foundAt` on the runtime error only, because it can contain
   * model-produced object keys and must not enter the signed receipt.
   */
  noPII(path: string, options?: InvariantOptions): NoPiiInvariant {
    return Object.freeze({
      id: nextId("no-pii", options),
      kind: "no-pii" as const,
      path,
    });
  },
  matches<T>(
    path: string,
    schema: StandardSchemaV1<unknown, T>,
    options?: InvariantOptions,
  ): MatchesInvariant<T> {
    return Object.freeze({
      id: nextId("matches", options),
      kind: "matches" as const,
      path,
      schema,
    });
  },
  /**
   * Test-only: reset the auto-id counter. NOT exported from the package
   * root barrel — callers must import `inv` directly from this module if
   * they ever need it, which is intentional friction.
   */
  __resetCounterForTests(): void {
    counter = 0;
  },
} as const;
