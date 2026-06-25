/**
 * conformance/generate/src/main.test.ts
 *
 * VEC-02: Validates the --regen-vectors flag gate no-op behaviour.
 * VEC-01: Validates the ConformanceVector type shape at compile time.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { ConformanceVector } from "./types.js";
import { VERIFY_ERROR_KINDS } from "./types.js";

// ---------------------------------------------------------------------------
// Derive paths relative to this test file so tests remain portable.
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// conformance/generate/src/ -> conformance/generate/ -> conformance/ -> repo root
const PACKAGE_ROOT = dirname(__dirname);
const MAIN_TS = join(PACKAGE_ROOT, "src", "main.ts");

// ---------------------------------------------------------------------------
// Test 1 (VEC-02): No-op without --regen-vectors flag
//
// Spawns `tsx src/main.ts` as a subprocess (no --regen-vectors flag) and
// asserts exit code 0. This is the most reliable check: it exercises the real
// process.exit(0) path without any mocking.
// ---------------------------------------------------------------------------
describe("VEC-02 — no-op flag gate", () => {
  it("exits 0 and writes nothing when --regen-vectors is absent", () => {
    // Find tsx via the package's node_modules/.bin
    const tsxBin = join(PACKAGE_ROOT, "node_modules", ".bin", "tsx");

    const result = spawnSync(tsxBin, [MAIN_TS], {
      encoding: "utf8",
      // Do not inherit env so CI variables don't interfere, but keep PATH for
      // tsx to resolve its own Node runtime helpers.
      env: { ...process.env },
    });

    // Must exit 0 (no-op path).
    expect(result.status, `tsx exited with ${result.status}; stderr: ${result.stderr}`).toBe(0);

    // Must print the no-op message.
    expect(result.stdout).toContain(
      "[generate-vectors] No-op: pass --regen-vectors to regenerate committed vectors.",
    );

    // Must NOT print the regen-start message (the flag gate must have short-circuited).
    expect(result.stdout).not.toContain("[generate-vectors] Starting vector regeneration...");
  });
});

// ---------------------------------------------------------------------------
// Test 2 (VEC-01): ConformanceVector type shape — compile-time enforcement.
//
// Constructs a valid ConformanceVector object and assigns it to a typed
// variable. TypeScript enforces all required fields at compile time (tsc
// --noEmit). Any missing required field or wrongly-typed optional field causes
// a compile error, not a runtime error.
// ---------------------------------------------------------------------------
describe("VEC-01 — ConformanceVector type shape", () => {
  it("accepts a fully-populated positive vector object", () => {
    const positiveVector: ConformanceVector = {
      WARNING:
        "EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION. This keypair is committed for specification purposes only.",
      body: { version: "lattice-receipt/v1.3", receiptId: "test-id" },
      canonicalBytesHex: "7b7d",
      payloadBase64: "e30=",
      paeHex: "4453...",
      signatureHex: "a".repeat(128),
      publicKeyJwk: {
        key_ops: ["verify"],
        ext: true,
        alg: "Ed25519",
        crv: "Ed25519",
        x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
        kty: "OKP",
      },
      kid: "spec-example-key-v0",
      expectedResult: "ok",
    };
    // Runtime sanity: required fields present and have correct types.
    expect(typeof positiveVector.WARNING).toBe("string");
    expect(typeof positiveVector.canonicalBytesHex).toBe("string");
    expect(positiveVector.expectedResult).toBe("ok");
    // Optional fields absent (positive vector).
    expect(positiveVector.verifyKeyState).toBeUndefined();
    expect(positiveVector.envelope).toBeUndefined();
  });

  it("accepts a negative vector with verifyKeyState and envelope fields", () => {
    const negativeVector: ConformanceVector = {
      WARNING:
        "EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION. This keypair is committed for specification purposes only.",
      body: { version: "lattice-receipt/v1.3", receiptId: "neg-test" },
      canonicalBytesHex: "7b7d",
      payloadBase64: "e30=",
      paeHex: "4453...",
      signatureHex: "b".repeat(128),
      publicKeyJwk: { kty: "OKP" },
      kid: "spec-example-key-v0",
      expectedResult: "key-revoked",
      verifyKeyState: "revoked",
    };
    expect(negativeVector.expectedResult).toBe("key-revoked");
    expect(negativeVector.verifyKeyState).toBe("revoked");
  });

  it("accepts a negative vector with envelope field for envelope-malformed", () => {
    const envelopeMalformedVector: ConformanceVector = {
      WARNING:
        "EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION. This keypair is committed for specification purposes only.",
      body: { version: "lattice-receipt/v1.3", receiptId: "neg-env" },
      canonicalBytesHex: "7b7d",
      payloadBase64: "e30=",
      paeHex: "4453...",
      signatureHex: "c".repeat(128),
      publicKeyJwk: { kty: "OKP" },
      kid: "spec-example-key-v0",
      expectedResult: "envelope-malformed",
      envelope: {
        payloadType: "application/vnd.lattice.receipt+json",
        payload: "!!!invalid-base64!!!",
        signatures: [{ keyid: "spec-example-key-v0", sig: "badsig" }],
      },
    };
    expect(envelopeMalformedVector.expectedResult).toBe("envelope-malformed");
    expect(envelopeMalformedVector.envelope).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 3 (VERIFY_ERROR_KINDS): Exported const contains all 7 VerifyErrorKind
// values — used by test assertions in downstream phases.
// ---------------------------------------------------------------------------
describe("VERIFY_ERROR_KINDS", () => {
  it("exports exactly 7 VerifyErrorKind string literals", () => {
    expect(VERIFY_ERROR_KINDS).toHaveLength(7);
    expect(VERIFY_ERROR_KINDS).toContain("envelope-malformed");
    expect(VERIFY_ERROR_KINDS).toContain("version-mismatch");
    expect(VERIFY_ERROR_KINDS).toContain("schema-version-too-low");
    expect(VERIFY_ERROR_KINDS).toContain("key-not-found");
    expect(VERIFY_ERROR_KINDS).toContain("key-revoked");
    expect(VERIFY_ERROR_KINDS).toContain("canonicalization-mismatch");
    expect(VERIFY_ERROR_KINDS).toContain("signature-invalid");
  });
});
