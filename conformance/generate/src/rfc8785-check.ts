/**
 * conformance/generate/src/rfc8785-check.ts
 *
 * RFC 8785 cross-check assertions (VEC-05).
 *
 * TWO-LAYER COMPLIANCE PROOF:
 *
 * Cross-checks A and B in this file prove that the `canonicalize` npm library
 * (version 3.0.0, by Anders Rundgren / cyberphone) is RFC 8785-compliant. They
 * do this using two independent pieces of external reference data:
 *
 *   Cross-check A: The §3.2.4 normative byte sequence published in the IETF
 *     RFC itself (immutable, authoritative). We re-derive the UTF-8 bytes from
 *     the §3.2.2 input object using `canonicalize()` and compare the hex
 *     encoding against the RFC's published hex string.
 *
 *   Cross-check B: The `arrays.json` test vector from the library author's own
 *     canonical test corpus (https://github.com/cyberphone/json-canonicalization).
 *     Input: [56, {"d": true, "10": null, "1": []}]
 *     Expected output: [56,{"1":[],"10":null,"d":true}]
 *     This is an RFC author's published fixture — independent from our codebase.
 *
 * These two cross-checks prove LIBRARY compliance. They do NOT directly prove
 * the project's `canonicalizeReceiptBody` wrapper — that is proved separately
 * by the vec-00 byte-identity assertion in positive.ts, which compares
 * `canonicalizeReceiptBody(redactedBody)` output against the committed
 * spec/vector0-fixture.json bytes. Both proofs are required:
 *   - Cross-checks A+B: the canonicalize library is RFC 8785-compliant.
 *   - vec-00 byte-identity: canonicalizeReceiptBody (wrapper) is faithful.
 *
 * runRFC8785CrossChecks() is called BEFORE any vector files are written,
 * so a wrong hex constant causes the generator to halt with a clear error.
 */

import canonicalize from "canonicalize";

// ---------------------------------------------------------------------------
// RFC 8785 §3.2.4 normative expected bytes (hex, no spaces).
//
// Source: https://www.rfc-editor.org/rfc/rfc8785 §3.2.4 (immutable published
// RFC; this hex sequence is normative and will never change).
//
// The §3.2.2 input object that produces these bytes (decoded from the hex):
//   {
//     "literals": [null, true, false],
//     "numbers":  [333333333.3333333, 1e+30, 4.5, 0.002, 1e-27],
//     "string":   "€$\nA'B\"\\\"/"
//   }
// The "string" field contains the following codepoints in order:
//   U+20AC (€), U+0024 ($), U+000F (form feed, escaped as ),
//   U+000A (newline, escaped as \n), U+0041 (A), U+0027 ('),
//   U+0042 (B), U+0022 (", escaped as \"), U+005C (\, escaped as \\),
//   U+005C (\, escaped as \\), U+0022 (", escaped as \"), U+002F (/)
// ---------------------------------------------------------------------------
const RFC8785_SECTION324_HEX =
  "7b226c69746572616c73223a5b6e756c6c2c747275652c66616c73655d2c226e756d62657273223a5b3333333333333333332e333333333333332c31652b33302c342e352c302e3030322c31652d32375d2c22737472696e67223a22e282ac245c75303030665c6e4127425c225c5c5c5c5c222f227d";

// ---------------------------------------------------------------------------
// Helper: convert Uint8Array to lowercase hex string.
// ---------------------------------------------------------------------------
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// runRFC8785CrossChecks()
//
// Synchronous. Throws immediately on failure (halts generator before any
// file writes). Call this at the top of the generate() function.
// ---------------------------------------------------------------------------
export function runRFC8785CrossChecks(): void {
  // -------------------------------------------------------------------------
  // Cross-check A: RFC 8785 §3.2.4 normative byte sequence.
  //
  // §3.2.2 input object reconstructed from decoding the §3.2.4 hex:
  //   "string" field codepoints: U+20AC U+0024 U+000F U+000A U+0041 U+0027
  //                               U+0042 U+0022 U+005C U+005C U+0022 U+002F
  // In JS string literal:
  //   € = €, $ = $,  = form-feed, \n = newline,
  //   A, ' (no escape), B, \" = double-quote, \\\\ = two backslashes,
  //   \" = double-quote, / = forward-slash (not escaped in JCS output)
  // -------------------------------------------------------------------------
  const rfc8785String = String.fromCodePoint(
    0x20ac, 0x0024, 0x000f, 0x000a, 0x0041, 0x0027,
    0x0042, 0x0022, 0x005c, 0x005c, 0x0022, 0x002f,
  );

  const rfc8785Input = {
    literals: [null, true, false],
    numbers: [333333333.33333329, 1e30, 4.5, 0.002, 1e-27],
    string: rfc8785String,
  };

  const canonicalStr = canonicalize(rfc8785Input);
  if (canonicalStr === undefined) {
    throw new Error(
      "[cross-check A] RFC 8785 §3.2.4: canonicalize() returned undefined for §3.2.2 input",
    );
  }

  const actualBytes = new TextEncoder().encode(canonicalStr);
  const actualHex = toHex(actualBytes);

  if (actualHex !== RFC8785_SECTION324_HEX) {
    throw new Error(
      `[cross-check A] RFC 8785 §3.2.4 FAILED\n` +
        `  expected: ${RFC8785_SECTION324_HEX}\n` +
        `  actual:   ${actualHex}\n` +
        `  actual string repr: ${JSON.stringify(canonicalStr)}`,
    );
  }
  console.log("[cross-check A] RFC 8785 §3.2.4 PASSED");

  // -------------------------------------------------------------------------
  // Cross-check B: cyberphone/json-canonicalization arrays.json test vector.
  //
  // Source: https://github.com/cyberphone/json-canonicalization/tree/master/testdata
  // Input: [56, {"d": true, "10": null, "1": []}]
  // Expected canonical output string: [56,{"1":[],"10":null,"d":true}]
  //
  // This vector exercises JCS object key ordering across mixed-type key names
  // (numeric-looking "10", "1" vs alphabetic "d") using the RFC author's
  // own published fixture — independent from the IETF hex bytes above.
  // -------------------------------------------------------------------------
  const cyberphoneInput = [56, { d: true, "10": null, "1": [] }];
  const CYBERPHONE_EXPECTED = '[56,{"1":[],"10":null,"d":true}]';

  const cyberphoneResult = canonicalize(cyberphoneInput);
  if (cyberphoneResult === undefined) {
    throw new Error(
      "[cross-check B] cyberphone arrays.json: canonicalize() returned undefined",
    );
  }

  if (cyberphoneResult !== CYBERPHONE_EXPECTED) {
    throw new Error(
      `[cross-check B] cyberphone arrays.json FAILED\n` +
        `  expected: ${CYBERPHONE_EXPECTED}\n` +
        `  actual:   ${cyberphoneResult}`,
    );
  }
  console.log("[cross-check B] cyberphone arrays.json PASSED");
}
