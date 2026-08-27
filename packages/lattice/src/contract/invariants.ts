import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Tripwire invariant declaration variants produced by the `inv` fluent
 * builder. Each variant is a frozen value carrying a discriminant `kind`
 * and an `id` (auto-generated or caller-supplied).
 *
 * The discriminated union replaces an earlier
 * `{ kind: "policy"|"semantic"|"schema" }` placeholder. Existing runtime
 * values never populated `invariants`, but external callers that authored
 * the old literal shape must migrate.
 */

export interface MustCiteInvariant {
  readonly id: string;
  readonly kind: "must-cite";
  readonly artifactName: string;
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
 * This is by design: `matches` is the caller-driven escape hatch.
 */
export const inv = {
  mustCite(artifactName: string, options?: InvariantOptions): MustCiteInvariant {
    return Object.freeze({
      id: nextId("must-cite", options),
      kind: "must-cite" as const,
      artifactName,
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
