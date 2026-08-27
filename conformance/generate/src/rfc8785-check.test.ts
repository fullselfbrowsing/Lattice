/**
 * conformance/generate/src/rfc8785-check.test.ts
 *
 * VEC-05: Validates RFC 8785 cross-check assertions.
 *
 * These tests run runRFC8785CrossChecks() and assert it does NOT throw.
 * A wrong §3.2.4 hex constant causes this test to fail before any vector
 * files are written (Task 2 depends on Task 1's verify passing).
 */

import { describe, it, expect } from "vitest";
import { runRFC8785CrossChecks } from "./rfc8785-check.js";

describe("VEC-05 — RFC 8785 cross-checks", () => {
  it("runRFC8785CrossChecks() does not throw (§3.2.4 hex and cyberphone arrays.json both pass)", () => {
    expect(() => runRFC8785CrossChecks()).not.toThrow();
  });
});
