import type { KeyEntry, KeySet } from "./types.js";

/**
 * In-memory KeySet factory.
 *
 * Verification flow (plan 09-03):
 *   - keySet.lookup(kid) returns undefined  → VerifyError {kind: "key-not-found"}
 *   - entry.state === "revoked"             → VerifyError {kind: "key-revoked"}
 *   - entry.state === "retired"             → VerifyOk + keyState: "retired" (caller may warn)
 *   - entry.state === "active"              → VerifyOk + keyState: "active"
 *
 * Duplicate kids: last write wins (deterministic — callers control entry order).
 * Empty entries array is legal — every lookup returns undefined.
 * Returned KeySet exposes only `lookup` — no enumeration.
 *
 * See 09-CONTEXT.md "Key Management (UNRETROFITTABLE)".
 */
export function createMemoryKeySet(entries: readonly KeyEntry[]): KeySet {
  const byKid = new Map<string, KeyEntry>();
  for (const entry of entries) {
    byKid.set(entry.kid, entry);
  }
  return {
    lookup(kid: string): KeyEntry | undefined {
      return byKid.get(kid);
    },
  };
}
