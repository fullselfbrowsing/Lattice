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
 * `path` is always developer-owned: the DECLARED path from the invariant, or
 * for a `must-cite` without one, the `citations` or `evidence` key name the
 * default search covers. It is never a location derived from the output,
 * because such a location can contain model-produced object keys and `path`
 * is signed as is. A nested must-cite list's concrete location appears only
 * in `message`.
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
 * competing citation marker, a schema library's issue text) because it
 * exists to make the runtime error actionable.
 *
 * This evidence reaches callers through `result.error.evidence` so they can
 * debug the violation. Before any of it is SIGNED into a receipt,
 * receipts/redact.ts rewrites `observed` to a non-reversible shape and
 * rebuilds `message` from the kind, `path`, and the detector name; `path` and
 * `invariantId` are signed unchanged. Do not add fields here that must
 * survive signing without also teaching redact.ts about them.
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

/** Keys that hold citation lists. No must-cite walk descends below them. */
const CITATION_KEYS = ["citations", "evidence"] as const;
const CITATION_CONTAINER_KEYS: ReadonlySet<string> = new Set(CITATION_KEYS);

/** Entry keys a numbered marker such as `[1]` is resolved against. */
const CITATION_LABEL_KEYS = ["label", "marker", "id"] as const;

/**
 * Bound on how deep the must-cite walks (the nested-list lookup and the prose
 * scan behind `inline` and `rejectUncited`) descend, the same bound the no-pii
 * walk uses. Containers at this depth are not read. For `rejectUncited`,
 * reaching the bound anywhere means a citing marker could be hidden below it,
 * so the verdict is unknown and the entry is not rejected.
 */
const MAX_MUST_CITE_WALK_DEPTH = 32;

interface CitationList {
  readonly value: readonly unknown[];
  /**
   * The developer-owned name evidence reports for the list: `decl.path`, or
   * the `citations`/`evidence` key the default search covers.
   */
  readonly path: string;
  /**
   * Where a nested list sits, such as `answers[0].citations`. It is built
   * from the output's own keys, so it only ever goes into the runtime
   * message, which receipts/redact.ts rebuilds before signing.
   */
  readonly location?: string;
}

/**
 * `must-cite` checks that a citation naming `artifactName` is present. It
 * does not verify that the cited artifact supports the claim; that is a
 * semantic judgment outside the kernel.
 *
 * The default is a structured match: search top-level `citations` then
 * `evidence`, compare string entries directly and object entries by their
 * `source` key, case-sensitively. `decl.path`, `decl.keys`, and
 * `decl.caseInsensitive` (issue #21 F9) relax each of those in turn. Without
 * `decl.path`, when the first top-level list is missing or does not name the
 * artifact, the other top-level list and every `citations` or `evidence`
 * array nested below the top level are searched as well (see
 * locateMustCiteLists). The default never reads the output's prose.
 *
 * Evidence `path` is `decl.path` or the key name of the reported list, never
 * the dotted location of a nested list: that location is built from the
 * output's keys and would be signed as is. The location goes into the
 * runtime message instead.
 *
 * Two opt-in flags read the prose, meaning every string in the output (or in
 * the `decl.textPath` subtree when set) except those below
 * `citations`/`evidence` keys and the `decl.path` subtree:
 *   - `decl.inline` also accepts a `[...]` or `(...)` group whose content
 *     equals the name (see markerNamesArtifact), but only when no located
 *     list has entries. A list that exists and omits the artifact still
 *     fails.
 *   - `decl.rejectUncited` fails a list entry that names the artifact when
 *     the prose carries citation markers and none of them cites the artifact
 *     (see createMarkerResolver for what counts as a marker). The message
 *     names the first competing marker and where it was found.
 *
 * `caseInsensitive` applies the same `toLowerCase()` fold to list entries and
 * prose. Prose matching compares a bracket's whole content, or whole
 * `;`/`,`-separated parts of it, never substrings, so no word-boundary rule
 * is involved.
 */
function evaluateMustCite(output: unknown, decl: MustCiteInvariant): TripwireResult {
  const fold = caseFold(decl.caseInsensitive === true);
  const target = fold(decl.artifactName);
  const keys = decl.keys ?? DEFAULT_MUST_CITE_KEYS;
  const equals = (candidate: unknown): boolean =>
    typeof candidate === "string" && fold(candidate) === target;
  const namesArtifact = (entry: unknown): boolean => {
    if (typeof entry === "string") return equals(entry);
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      return keys.some((key) => key in record && equals(record[key]));
    }
    return false;
  };

  const lists = locateMustCiteLists(output, decl, namesArtifact);
  const matched = lists.find((list) => list.value.some(namesArtifact));
  const reported = matched ?? lists[0];
  const cites = reported?.value ?? [];
  const path = reported?.path ?? decl.path ?? "citations";

  let message = `must-cite: no citation found for "${decl.artifactName}".`;
  if (matched !== undefined) {
    if (decl.rejectUncited !== true) return { ok: true };
    const competing = findCompetingMarker(
      output,
      decl,
      createMarkerResolver({ list: matched.value, keys, fold, target, namesArtifact }),
    );
    if (competing === undefined) return { ok: true };
    const where = competing.foundAt === "" ? "in the output" : `at "${competing.foundAt}"`;
    message =
      `must-cite: citation "${decl.artifactName}" is not cited in the text; ` +
      `${competing.marker} ${where} cites another source.`;
  } else if (
    decl.inline === true &&
    lists.every((list) => list.value.length === 0) &&
    proseHasInlineCitation(output, decl, fold, target)
  ) {
    return { ok: true };
  } else if (reported?.location !== undefined) {
    message =
      `must-cite: no citation found for "${decl.artifactName}"; ` +
      `observed is the list at "${reported.location}".`;
  }

  return {
    ok: false,
    evidence: {
      invariantId: decl.id,
      kind: "must-cite",
      path,
      observed: cites,
      message,
    },
  };
}

function caseFold(caseInsensitive: boolean): (value: string) => string {
  return caseInsensitive ? (value) => value.toLowerCase() : (value) => value;
}

/**
 * The citation lists to search, in reporting order: only the `decl.path`
 * array when a path is declared; otherwise the first top-level list, which
 * alone decides when it names the artifact (the original structured match),
 * else every top-level list followed by the nested lists.
 */
function locateMustCiteLists(
  output: unknown,
  decl: MustCiteInvariant,
  namesArtifact: (entry: unknown) => boolean,
): readonly CitationList[] {
  if (decl.path !== undefined) {
    const declared = locateCitationsAtPath(output, decl.path);
    return declared === undefined ? [] : [declared];
  }
  const top = locateTopLevelCitations(output);
  const first = top[0];
  if (first !== undefined && first.value.some(namesArtifact)) return [first];
  return [...top, ...locateNestedCitations(output, top)];
}

/**
 * The top-level `citations` and `evidence` arrays, in that order. The first
 * is the citations payload the original match reads. Per 08-CONTEXT.md:
 * "Path defaults to evidence if the output has a citations field; the
 * runtime locates the citations payload in the output."
 */
function locateTopLevelCitations(output: unknown): readonly CitationList[] {
  if (typeof output !== "object" || output === null) return [];
  const record = output as Record<string, unknown>;
  const lists: CitationList[] = [];
  for (const key of CITATION_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) lists.push({ value, path: key });
  }
  return lists;
}

interface NestedListWalk {
  readonly found: CitationList[];
  readonly lists: Set<unknown>;
  readonly visited: Map<object, number>;
}

/**
 * Every `citations` or `evidence` array below the top level, for outputs that
 * wrap the list (`{ answer: { text, citations } }`) or hold several answers
 * (`{ sections: [{ text, citations }] }`). The walk uses the no-pii scan's
 * order and guards: plain-object keys in sorted order, arrays in index order,
 * non-plain objects skipped, a depth-keyed visited map so cycles and shared
 * references cannot multiply the work, and MAX_MUST_CITE_WALK_DEPTH. It does
 * not descend into a `citations` or `evidence` value, and skips an array
 * already listed in `known`. Each list's `path` is its key name; its dotted
 * location is kept apart in `location` for the runtime message.
 */
function locateNestedCitations(
  output: unknown,
  known: readonly CitationList[],
): readonly CitationList[] {
  const walk: NestedListWalk = {
    found: [],
    lists: new Set<unknown>(known.map((list) => list.value)),
    visited: new Map<object, number>(),
  };
  collectNestedCitations(output, walk, [], 0);
  return walk.found;
}

function collectNestedCitations(
  value: unknown,
  walk: NestedListWalk,
  frames: PathFrame[],
  depth: number,
): void {
  if (typeof value !== "object" || value === null) return;
  if (depth >= MAX_MUST_CITE_WALK_DEPTH) return;
  const seenAt = walk.visited.get(value);
  if (seenAt !== undefined && seenAt <= depth) return;
  walk.visited.set(value, depth);

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      frames.push({ kind: "index", index });
      collectNestedCitations(entry, walk, frames, depth + 1);
      frames.pop();
    }
    return;
  }
  if (!isPlainObject(value)) return;
  const record = value as Record<string, unknown>;
  if (depth > 0) {
    for (const key of CITATION_KEYS) {
      const list = record[key];
      if (!Array.isArray(list) || walk.lists.has(list)) continue;
      walk.lists.add(list);
      walk.found.push({
        value: list,
        path: key,
        location: formatViolationPath("", [...frames, { kind: "key", key }]),
      });
    }
  }
  for (const key of Object.keys(record).sort()) {
    if (CITATION_CONTAINER_KEYS.has(key)) continue;
    frames.push({ kind: "key", key });
    collectNestedCitations(record[key], walk, frames, depth + 1);
    frames.pop();
  }
}

/**
 * Locate a citations array at an explicit resolvePath expression (issue #21
 * F9). The resolved value must itself be an array; a `[*]` wildcard result
 * is an array of per-element resolutions and is NOT flattened, so point the
 * path at the array that holds the citation entries.
 */
function locateCitationsAtPath(output: unknown, path: string): CitationList | undefined {
  const value = resolvePath(output, path);
  return Array.isArray(value) ? { value, path } : undefined;
}

interface ProseWalk {
  readonly excluded: ReadonlySet<object>;
  readonly visited: Map<object, number>;
  /** Called for each prose string; returning true stops the walk. */
  readonly visit: (text: string, frames: readonly PathFrame[]) => boolean;
  truncated: boolean;
}

/**
 * Walk the output's prose for `inline` and `rejectUncited`: every string at
 * or below `decl.textPath` (the whole output when unset) except those below
 * `citations`/`evidence` keys and the `decl.path` subtree. A `textPath` that
 * resolves to nothing leaves nothing to read. Order and guards match
 * locateNestedCitations, with depth counted from the scanned root. `visit`
 * receives the frames below the root (see proseLocation). `stopped` is true
 * when `visit` ended the walk; `truncated` is true when a container sat at
 * MAX_MUST_CITE_WALK_DEPTH and was not read.
 */
function scanProse(
  output: unknown,
  decl: MustCiteInvariant,
  visit: (text: string, frames: readonly PathFrame[]) => boolean,
): { readonly stopped: boolean; readonly truncated: boolean } {
  const walk: ProseWalk = {
    excluded: declaredSubtree(output, decl),
    visited: new Map<object, number>(),
    visit,
    truncated: false,
  };
  const root = decl.textPath === undefined ? output : resolvePath(output, decl.textPath);
  const stopped = walkProse(root, walk, [], 0);
  return { stopped, truncated: walk.truncated };
}

/** The concrete location of a prose string, from the frames scanProse passes. */
function proseLocation(decl: MustCiteInvariant, frames: readonly PathFrame[]): string {
  return formatViolationPath(decl.textPath ?? "", frames);
}

/**
 * Objects the prose walk skips, by identity, because they are the declared
 * citations location: the value at `decl.path` and, when it is an array, its
 * object entries (a `[*]` path materializes a fresh array whose entries are
 * the real containers).
 */
function declaredSubtree(output: unknown, decl: MustCiteInvariant): ReadonlySet<object> {
  const excluded = new Set<object>();
  if (decl.path === undefined) return excluded;
  const declared = resolvePath(output, decl.path);
  if (typeof declared !== "object" || declared === null) return excluded;
  excluded.add(declared);
  if (Array.isArray(declared)) {
    for (const entry of declared) {
      if (typeof entry === "object" && entry !== null) excluded.add(entry);
    }
  }
  return excluded;
}

function walkProse(value: unknown, walk: ProseWalk, frames: PathFrame[], depth: number): boolean {
  if (typeof value === "string") return walk.visit(value, frames);
  if (typeof value !== "object" || value === null || walk.excluded.has(value)) return false;
  if (depth >= MAX_MUST_CITE_WALK_DEPTH) {
    walk.truncated = true;
    return false;
  }
  const seenAt = walk.visited.get(value);
  if (seenAt !== undefined && seenAt <= depth) return false;
  walk.visited.set(value, depth);

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      frames.push({ kind: "index", index });
      const stopped = walkProse(entry, walk, frames, depth + 1);
      frames.pop();
      if (stopped) return true;
    }
    return false;
  }
  if (!isPlainObject(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    if (CITATION_CONTAINER_KEYS.has(key)) continue;
    frames.push({ kind: "key", key });
    const stopped = walkProse(record[key], walk, frames, depth + 1);
    frames.pop();
    if (stopped) return true;
  }
  return false;
}

interface MarkerGroup {
  /** The group as written, brackets included. */
  readonly raw: string;
  readonly content: string;
}

/**
 * Square-bracket groups of 1 to 120 characters on one line. An escaped
 * `\[...]` is skipped, and so is link text: `[text](url)` is a link.
 */
const SQUARE_GROUP = /(?<!\\)\[([^\[\]\n]{1,120})\](?!\()/g;
const PAREN_GROUP = /\(([^()\n]{1,120})\)/g;
const FENCE_LINE = /^ {0,3}(?:```|~~~)/;
const CODE_SPAN = /`[^`\n]{1,500}`/g;

/**
 * Bracket groups in `text` that may be citation markers. Fenced code blocks
 * and inline code spans are dropped first, so `arr[0]` in code is never a
 * marker. Parenthesized groups are included only when `parentheses` is set.
 */
function markerGroups(text: string, parentheses: boolean): readonly MarkerGroup[] {
  const prose = withoutCode(text);
  const groups: MarkerGroup[] = [];
  for (const match of prose.matchAll(SQUARE_GROUP)) {
    groups.push({ raw: match[0], content: match[1] ?? "" });
  }
  if (parentheses) {
    for (const match of prose.matchAll(PAREN_GROUP)) {
      groups.push({ raw: match[0], content: match[1] ?? "" });
    }
  }
  return groups;
}

function withoutCode(text: string): string {
  if (!text.includes("`") && !text.includes("~~~")) return text;
  let fenced = false;
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    if (FENCE_LINE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) kept.push(line);
  }
  return kept.join("\n").replace(CODE_SPAN, " ");
}

/** A trailing `p. 4`, `pp. 4-5`, or `§3.2` locator, or a part that is only one. */
const LOCATOR = /(?:^|,\s*|\s+)(?:pp?\.\s*\d+(?:\s*[-–—]\s*\d+)?|§\s*\d+(?:\.\d+)*)$/u;

interface MarkerPart {
  /** The part, trimmed. */
  readonly text: string;
  /** The part, trimmed and without a trailing locator. */
  readonly bare: string;
}

function toMarkerPart(part: string): MarkerPart {
  const text = part.trim();
  return { text, bare: text.replace(LOCATOR, "").trim() };
}

/**
 * The readings of a group's content, in order: the whole content, its
 * `;`-separated parts, then its `;`- and `,`-separated parts. Each part is
 * kept both trimmed and without a trailing locator, so a name that itself
 * ends in a locator shape (`42 U.S.C. § 1983`, `Handbook p. 12`) can still
 * match. A part that is only a locator is dropped.
 */
function markerReadings(content: string): readonly (readonly MarkerPart[])[] {
  return [[content], content.split(";"), content.split(/[;,]/)].map((parts) =>
    parts.map(toMarkerPart).filter((part) => part.bare !== ""),
  );
}

function partIs(part: MarkerPart, fold: (value: string) => string, target: string): boolean {
  return fold(part.text) === target || fold(part.bare) === target;
}

function proseHasInlineCitation(
  output: unknown,
  decl: MustCiteInvariant,
  fold: (value: string) => string,
  target: string,
): boolean {
  return scanProse(output, decl, (text) =>
    markerGroups(text, true).some((group) => markerNamesArtifact(group.content, fold, target)),
  ).stopped;
}

/**
 * Inline match for `inline`: the group's whole content, or one of its
 * `;`/`,`-separated parts, equals the name once trimmed, with or without a
 * trailing locator, so `[doc-a]`, `(doc-a, p. 4)`, and `[doc-a; doc-b]` cite
 * `doc-a`, and `[42 U.S.C. § 1983]` cites `42 U.S.C. § 1983`. It is equality,
 * not containment: `[doc-a.v2]`, `[doc-a-draft]`, and `(not doc-a)` do not,
 * and a name never matches across a group's own delimiter (`[doc]a]` is the
 * group `[doc]`). The check is syntactic, so a sentence that disowns
 * `(doc-a)` still counts.
 */
function markerNamesArtifact(
  content: string,
  fold: (value: string) => string,
  target: string,
): boolean {
  return markerReadings(content).some((parts) => parts.some((part) => partIs(part, fold, target)));
}

interface MarkerContext {
  /** The located list that names the artifact. */
  readonly list: readonly unknown[];
  readonly keys: readonly string[];
  readonly fold: (value: string) => string;
  readonly target: string;
  readonly namesArtifact: (entry: unknown) => boolean;
}

/** What a square-bracket group's content cites; see createMarkerResolver. */
type MarkerResolver = (content: string) => boolean | undefined;

interface CompetingMarker {
  readonly marker: string;
  readonly foundAt: string;
}

/**
 * For `rejectUncited`: the first marker, in walk order, that cites something
 * other than the artifact, provided no marker cites the artifact and the walk
 * read the whole output. Only square brackets are markers here: an aside or
 * an area code in parentheses would otherwise look like a competing citation.
 */
function findCompetingMarker(
  output: unknown,
  decl: MustCiteInvariant,
  resolve: MarkerResolver,
): CompetingMarker | undefined {
  let competing: CompetingMarker | undefined;
  const scan = scanProse(output, decl, (text, frames) => {
    for (const group of markerGroups(text, false)) {
      const cited = resolve(group.content);
      if (cited === true) return true;
      if (cited === false && competing === undefined) {
        competing = { marker: group.raw, foundAt: proseLocation(decl, frames) };
      }
    }
    return false;
  });
  return scan.stopped || scan.truncated ? undefined : competing;
}

const MAX_CITATION_NUMBER = 999;
const CITATION_NUMBER = /^([1-9]\d{0,2})(?:\s*[-–—]\s*([1-9]\d{0,2}))?$/;
const AUTHOR_YEAR =
  /^(\p{Lu}[\p{L}\p{M}'’.-]*)(?:\s+(?:et\s+al\.?|(?:and|&)\s+\p{Lu}[\p{L}\p{M}'’.-]*))?,?\s+(?:1[5-9]|20)\d{2}[a-z]?$/u;

/**
 * Capitalized words that put a year in a date or an annotation rather than
 * name an author: `[March 2024]`, `[Updated 2024]`, `[Est. 1999]`,
 * `[Copyright 2025]`. Compared lowercased, without trailing dots. `May` is
 * here too, so `[May 2019]` reads as a date, not as the author May.
 */
const NOT_AN_AUTHOR: ReadonlySet<string> = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "spring", "summer", "fall", "autumn", "winter",
  "fiscal", "fy", "cy", "ad", "bc", "ce", "bce",
  "early", "late", "mid", "end", "since", "circa", "ca", "in", "from", "until", "by",
  "before", "after", "as", "of",
  "updated", "revised", "rev", "est", "estd", "established", "founded", "copyright",
  "archived", "accessed", "retrieved", "published", "posted", "edited", "modified",
  "released", "version", "ver", "edition", "ed", "effective", "dated", "date", "year",
]);

/**
 * Only the leading name is checked: a date or an annotation is one word and
 * a year, while `[Smith and March 2024]` names two authors.
 */
function isAuthorYear(part: string): boolean {
  const lead = AUTHOR_YEAR.exec(part)?.[1];
  return lead !== undefined && !NOT_AN_AUTHOR.has(lead.toLowerCase().replace(/\.+$/u, ""));
}

/**
 * Build the `rejectUncited` resolver for one list. It answers what a
 * square-bracket group cites: `true` for the artifact, `false` for something
 * else, `undefined` when the group is not a citation marker. The first
 * reading (see markerReadings) in which every part is a citation token
 * decides. A token is one of:
 *   - a number or range from 1 to 999 (`[1]`, `[2-4]`, `[1, 3]`). Each number
 *     resolves to the list entries whose `label`, `marker`, or `id` is that
 *     number, else to the entry at that 1-based position. A number past the
 *     end of the list cites something else.
 *   - the artifact name, or an identifier of a list entry (a string entry, a
 *     `keys` value, or a `label`/`marker`/`id`), citing that entry.
 *   - an author-year reference such as `Smith 1999` or `Smith et al., 2001a`
 *     that matches no entry, citing something else, unless the name is a
 *     month or a date annotation (see NOT_AN_AUTHOR).
 * Anything else (`[x]`, `[sic]`, `[INFO]`, `[a, b]`, `[^1]`, `[0]`,
 * timestamps, years) leaves the group as plain text.
 *
 * The lookups are built once, so the cost of a group does not grow with the
 * list or with a range's width: a running count over 1..999 tells whether any
 * number in a range cites the artifact, one map answers identifier lookups,
 * and verdicts are memoized per group content.
 */
function createMarkerResolver(context: MarkerContext): MarkerResolver {
  const { list, keys, fold, target, namesArtifact } = context;
  const citing = list.map(namesArtifact);
  // label -> whether some entry carrying it names the artifact
  const byLabel = new Map<string, boolean>();
  // folded identifier -> whether some entry carrying it names the artifact
  const byIdentifier = new Map<string, boolean>();
  for (const [index, entry] of list.entries()) {
    const cites = citing[index] === true;
    for (const label of entryLabels(entry)) {
      byLabel.set(label, byLabel.get(label) === true || cites);
    }
    for (const identifier of entryIdentifiers(entry, keys)) {
      const folded = fold(identifier);
      byIdentifier.set(folded, byIdentifier.get(folded) === true || cites);
    }
  }

  // citingUpTo[n] counts the numbers 1..n that cite the artifact.
  let citingUpTo: Int32Array | undefined;
  const rangeCites = (first: number, last: number): boolean => {
    if (citingUpTo === undefined) {
      const counts = new Int32Array(MAX_CITATION_NUMBER + 1);
      for (let n = 1; n <= MAX_CITATION_NUMBER; n += 1) {
        const cites = byLabel.get(String(n)) ?? (n <= list.length && citing[n - 1] === true);
        counts[n] = (counts[n - 1] ?? 0) + (cites ? 1 : 0);
      }
      citingUpTo = counts;
    }
    return (citingUpTo[last] ?? 0) - (citingUpTo[first - 1] ?? 0) > 0;
  };

  const resolveToken = (part: MarkerPart): boolean | undefined => {
    const range = citationRange(part.bare);
    if (range !== undefined) return rangeCites(range.first, range.last);
    if (partIs(part, fold, target)) return true;
    const listed = byIdentifier.get(fold(part.text)) ?? byIdentifier.get(fold(part.bare));
    if (listed !== undefined) return listed;
    return isAuthorYear(part.bare) ? false : undefined;
  };

  const resolveContent = (content: string): boolean | undefined => {
    for (const parts of markerReadings(content)) {
      if (parts.length === 0) continue;
      const cited = parts.map(resolveToken);
      if (cited.every((value) => value !== undefined)) return cited.includes(true);
    }
    return undefined;
  };

  const verdicts = new Map<string, boolean | undefined>();
  return (content) => {
    if (verdicts.has(content)) return verdicts.get(content);
    const verdict = resolveContent(content);
    verdicts.set(content, verdict);
    return verdict;
  };
}

function citationRange(part: string): { readonly first: number; readonly last: number } | undefined {
  const match = CITATION_NUMBER.exec(part);
  if (match === null) return undefined;
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  return last < first ? undefined : { first, last };
}

/** `label`, `marker`, and `id` values as strings, with one `[...]` wrapper removed. */
function entryLabels(entry: unknown): readonly string[] {
  if (typeof entry !== "object" || entry === null) return [];
  const record = entry as Record<string, unknown>;
  const labels: string[] = [];
  for (const key of CITATION_LABEL_KEYS) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      labels.push(String(value).trim().replace(/^\[([^\]]*)\]$/, "$1").trim());
    }
  }
  return labels;
}

function entryIdentifiers(entry: unknown, keys: readonly string[]): readonly string[] {
  if (typeof entry === "string") return [entry];
  if (typeof entry !== "object" || entry === null) return [];
  const record = entry as Record<string, unknown>;
  const identifiers: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") identifiers.push(value);
  }
  return [...identifiers, ...entryLabels(entry)];
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
 *   - a `visited` map records the shallowest depth at which each object has
 *     been scanned. Meeting an object again at the same or a greater depth
 *     is a cycle or a shared reference whose subtree was already covered at
 *     least as deeply, so it is skipped. Meeting it strictly shallower
 *     rescans it, because the earlier visit may have lost descendants to the
 *     depth cap (review finding on PR #22: an object first reached at depth
 *     31 was marked scanned while its children were cut at 32, and a later
 *     shallow reference to it was skipped). Each object is rescanned at most
 *     MAX_NO_PII_WALK_DEPTH times, so shared references cannot blow up the
 *     walk the way a path-stack-only cycle guard would on a diamond graph.
 * Traversal order takes precedence over detector order: the first string
 * reached that any detector flags is the reported violation.
 */
function scanForPii(
  value: unknown,
  detectors: readonly PiiDetector[],
  frames: PathFrame[],
  visited: Map<object, number>,
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
  const scannedAt = visited.get(value);
  if (scannedAt !== undefined && scannedAt <= depth) return undefined;
  visited.set(value, depth);

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
  const hit = scanForPii(value, detectors, [], new Map<object, number>(), 0);
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
