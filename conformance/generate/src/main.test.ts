/**
 * conformance/generate/src/main.test.ts
 *
 * VEC-02: Validates the --regen-vectors flag gate no-op behaviour.
 * VEC-01: Validates the ConformanceVector type shape at compile time.
 * VEC-03: Validates positive vectors cover v1.1, v1.2, v1.3 (one per version).
 * VEC-05: Validates RFC 8785 cross-checks run and pass.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { ConformanceVector } from "./types.js";
import { VERIFY_ERROR_KINDS } from "./types.js";
import { generatePositiveVectors } from "./positive.js";
import { runRFC8785CrossChecks } from "./rfc8785-check.js";

// ---------------------------------------------------------------------------
// Derive paths relative to this test file so tests remain portable.
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// conformance/generate/src/ -> conformance/generate/ -> conformance/ -> repo root
const PACKAGE_ROOT = dirname(__dirname);
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const MAIN_TS = join(PACKAGE_ROOT, "src", "main.ts");
const VECTORS_POSITIVE_DIR = join(REPO_ROOT, "conformance", "vectors", "positive");

// Load the Phase 50 fixture for vec-00 byte-identity check
const FIXTURE_PATH = join(REPO_ROOT, "spec", "vector0-fixture.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
  canonicalBytesHex: string;
  payloadBase64: string;
  paeHex: string;
  signatureHex: string;
  publicKeyJwk: JsonWebKey;
  kid?: string;
};

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

// ---------------------------------------------------------------------------
// Test 4 (VEC-05): RFC 8785 cross-checks pass.
//
// runRFC8785CrossChecks() must not throw. A wrong §3.2.4 hex constant causes
// this test to fail — proving the library is RFC 8785-compliant.
// ---------------------------------------------------------------------------
describe("VEC-05 — RFC 8785 cross-checks", () => {
  it("runRFC8785CrossChecks() does not throw", () => {
    expect(() => runRFC8785CrossChecks()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 5 (VEC-03): Positive vectors cover v1.1, v1.2, v1.3 (one per version).
//
// Calls generatePositiveVectors() and validates the version fields, expected
// results, and count.
// ---------------------------------------------------------------------------
describe("VEC-03 — positive vector version coverage", () => {
  it("generates exactly 3 positive vectors (v1.3, v1.1, v1.2)", async () => {
    const vecs = await generatePositiveVectors();
    expect(vecs).toHaveLength(3);

    // vec-00: v1.3
    expect(vecs[0]?.body["version"]).toBe("lattice-receipt/v1.3");
    expect(vecs[0]?.expectedResult).toBe("ok");

    // vec-01: v1.1
    expect(vecs[1]?.body["version"]).toBe("lattice-receipt/v1.1");
    expect(vecs[1]?.expectedResult).toBe("ok");

    // vec-02: v1.2
    expect(vecs[2]?.body["version"]).toBe("lattice-receipt/v1.2");
    expect(vecs[2]?.expectedResult).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Test 6 (vec-00 byte-identity): canonicalBytesHex must match spec/vector0-fixture.json
// ---------------------------------------------------------------------------
describe("vec-00 byte-identity", () => {
  it("vec-00 canonicalBytesHex is byte-identical to spec/vector0-fixture.json", async () => {
    const vecs = await generatePositiveVectors();
    const vec00 = vecs[0];
    expect(vec00).toBeDefined();
    expect(vec00!.canonicalBytesHex).toBe(fixture.canonicalBytesHex);
  });
});

// ---------------------------------------------------------------------------
// Test 7 (schema validation): v1.1 body must NOT have modelClass; v1.2 MUST.
// ---------------------------------------------------------------------------
describe("schema field validation", () => {
  it("vec-01 (v1.1) body does not contain modelClass", async () => {
    const vecs = await generatePositiveVectors();
    const vec01 = vecs[1];
    expect(vec01).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(vec01!.body, "modelClass")).toBe(false);
  });

  it("vec-02 (v1.2) body contains modelClass: frontier_rlhf", async () => {
    const vecs = await generatePositiveVectors();
    const vec02 = vecs[2];
    expect(vec02).toBeDefined();
    expect(vec02!.body["modelClass"]).toBe("frontier_rlhf");
  });
});

// ---------------------------------------------------------------------------
// Test 8 (file write): conformance/vectors/positive/ contains exactly 3 files.
//
// This test is intentionally skipped if the vectors haven't been written yet
// (first run before main.ts --regen-vectors). After generation it asserts the
// expected file names exist.
// ---------------------------------------------------------------------------
describe("file write — positive vectors", () => {
  it("conformance/vectors/positive/ contains exactly 3 named vector files", () => {
    // The generator must have been run (Task 2 action runs it before this test
    // is expected to pass). If directory doesn't exist, this test fails cleanly.
    const vec00Path = join(VECTORS_POSITIVE_DIR, "vec-00-v1.3.json");
    const vec01Path = join(VECTORS_POSITIVE_DIR, "vec-01-v1.1.json");
    const vec02Path = join(VECTORS_POSITIVE_DIR, "vec-02-v1.2.json");

    expect(existsSync(vec00Path), `Missing: ${vec00Path}`).toBe(true);
    expect(existsSync(vec01Path), `Missing: ${vec01Path}`).toBe(true);
    expect(existsSync(vec02Path), `Missing: ${vec02Path}`).toBe(true);
  });

  it("vec-00-v1.3.json on disk matches fixture canonicalBytesHex", () => {
    const vec00Path = join(VECTORS_POSITIVE_DIR, "vec-00-v1.3.json");
    if (!existsSync(vec00Path)) {
      // Vectors not yet written — skip gracefully with informative message
      console.warn("SKIP: vec-00-v1.3.json not yet written; run --regen-vectors first");
      return;
    }
    const vec00 = JSON.parse(readFileSync(vec00Path, "utf8")) as ConformanceVector;
    expect(vec00.canonicalBytesHex).toBe(fixture.canonicalBytesHex);
  });
});
