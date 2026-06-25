/**
 * conformance/generate/src/main.test.ts
 *
 * VEC-02: Validates the --regen-vectors flag gate no-op behaviour.
 * VEC-01: Validates the ConformanceVector type shape at compile time.
 * VEC-03: Validates positive vectors cover v1.1, v1.2, v1.3 (one per version).
 * VEC-05: Validates RFC 8785 cross-checks run and pass.
 * VEC-04: Validates negative vectors cover all 7 VerifyErrorKind values.
 * VEC-06: Validates MANIFEST.sha256 passes sha256sum --check.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { ConformanceVector } from "./types.js";
import { VERIFY_ERROR_KINDS } from "./types.js";
import { generatePositiveVectors } from "./positive.js";
import { generateNegativeVectors } from "./negative.js";
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
const VECTORS_NEGATIVE_DIR = join(REPO_ROOT, "conformance", "vectors", "negative");
const VECTORS_DIR = join(REPO_ROOT, "conformance", "vectors");

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

// ---------------------------------------------------------------------------
// Test 9 (VEC-04): generateNegativeVectors() covers all 7 VerifyErrorKind.
//
// Calls generateNegativeVectors() and validates:
//   - returns exactly 9 vectors
//   - expectedResult values cover all 7 VerifyErrorKind values
//   - "schema-version-too-low" and "signature-invalid" each appear exactly twice
//   - VERIFY_ERROR_KINDS.every(kind => results.some(v => v.expectedResult === kind))
// ---------------------------------------------------------------------------
describe("VEC-04 — negative vector kind coverage (in-memory)", () => {
  it("generateNegativeVectors() returns exactly 9 vectors", async () => {
    const vecs = await generateNegativeVectors();
    expect(vecs).toHaveLength(9);
  });

  it("covers all 7 VerifyErrorKind values", async () => {
    const vecs = await generateNegativeVectors();
    for (const kind of VERIFY_ERROR_KINDS) {
      expect(
        vecs.some((v) => v.expectedResult === kind),
        `Missing kind: ${kind}`,
      ).toBe(true);
    }
  });

  it("schema-version-too-low appears exactly twice", async () => {
    const vecs = await generateNegativeVectors();
    const count = vecs.filter((v) => v.expectedResult === "schema-version-too-low").length;
    expect(count).toBe(2);
  });

  it("signature-invalid appears exactly twice", async () => {
    const vecs = await generateNegativeVectors();
    const count = vecs.filter((v) => v.expectedResult === "signature-invalid").length;
    expect(count).toBe(2);
  });

  it("NEG-05 (key-revoked) has verifyKeyState === 'revoked'", async () => {
    const vecs = await generateNegativeVectors();
    const neg05 = vecs.find((v) => v.expectedResult === "key-revoked");
    expect(neg05).toBeDefined();
    expect(neg05!.verifyKeyState).toBe("revoked");
  });

  it("NEG-01 (envelope-malformed) has envelope field with payloadType 'application/json'", async () => {
    const vecs = await generateNegativeVectors();
    const neg01 = vecs.find((v) => v.expectedResult === "envelope-malformed");
    expect(neg01).toBeDefined();
    expect(neg01!.envelope).toBeDefined();
    expect(neg01!.envelope!.payloadType).toBe("application/json" as unknown as "application/vnd.lattice.receipt+json");
  });

  it("NEG-08 (kid mismatch) has body.kid !== 'spec-example-key-v0' and vector.kid === 'spec-example-key-v0'", async () => {
    const vecs = await generateNegativeVectors();
    // NEG-08 is the second signature-invalid vector (kid mismatch, not corrupted sig)
    const signatureInvalids = vecs.filter((v) => v.expectedResult === "signature-invalid");
    expect(signatureInvalids).toHaveLength(2);
    // The kid-mismatch one has body.kid !== vector.kid
    const kidMismatch = signatureInvalids.find(
      (v) => v.body["kid"] !== "spec-example-key-v0",
    );
    expect(kidMismatch).toBeDefined();
    expect(kidMismatch!.body["kid"]).toBe("wrong-kid");
    expect(kidMismatch!.kid).toBe("spec-example-key-v0");
  });
});

// ---------------------------------------------------------------------------
// Test 10 (VEC-04 from disk): after generation, negative vector files on disk
// cover all 7 VerifyErrorKind values.
// ---------------------------------------------------------------------------
describe("VEC-04 — negative vectors on disk", () => {
  it("conformance/vectors/negative/ contains exactly 9 files", () => {
    if (!existsSync(VECTORS_NEGATIVE_DIR)) {
      console.warn("SKIP: conformance/vectors/negative/ not yet written; run --regen-vectors first");
      return;
    }
    const files = readdirSync(VECTORS_NEGATIVE_DIR).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.warn("SKIP: conformance/vectors/negative/ is empty; run --regen-vectors first");
      return;
    }
    expect(files).toHaveLength(9);
  });

  it("neg-01-envelope-malformed.json has envelope field with payloadType 'application/json'", () => {
    const neg01Path = join(VECTORS_NEGATIVE_DIR, "neg-01-envelope-malformed.json");
    if (!existsSync(neg01Path)) {
      console.warn("SKIP: neg-01 not yet written");
      return;
    }
    const vec = JSON.parse(readFileSync(neg01Path, "utf8")) as ConformanceVector & {
      envelope?: { payloadType: string };
    };
    expect(vec.envelope).toBeDefined();
    expect(vec.envelope!.payloadType).toBe("application/json");
  });

  it("neg-05-key-revoked.json has verifyKeyState === 'revoked'", () => {
    const neg05Path = join(VECTORS_NEGATIVE_DIR, "neg-05-key-revoked.json");
    if (!existsSync(neg05Path)) {
      console.warn("SKIP: neg-05 not yet written");
      return;
    }
    const vec = JSON.parse(readFileSync(neg05Path, "utf8")) as ConformanceVector;
    expect(vec.verifyKeyState).toBe("revoked");
  });

  it("neg-08-signature-invalid-kid-mismatch.json has body.kid !== 'spec-example-key-v0'", () => {
    const neg08Path = join(VECTORS_NEGATIVE_DIR, "neg-08-signature-invalid-kid-mismatch.json");
    if (!existsSync(neg08Path)) {
      console.warn("SKIP: neg-08 not yet written");
      return;
    }
    const vec = JSON.parse(readFileSync(neg08Path, "utf8")) as ConformanceVector;
    expect(vec.body["kid"]).toBe("wrong-kid");
    expect(vec.kid).toBe("spec-example-key-v0");
  });

  it("all 7 VerifyErrorKind values are covered by disk files", () => {
    if (!existsSync(VECTORS_NEGATIVE_DIR)) {
      console.warn("SKIP: negative vector directory not yet written");
      return;
    }
    const files = readdirSync(VECTORS_NEGATIVE_DIR).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.warn("SKIP: negative vector directory is empty; run --regen-vectors first");
      return;
    }
    const kinds = new Set<string>(
      files
        .map((f) => {
          const parsed = JSON.parse(
            readFileSync(join(VECTORS_NEGATIVE_DIR, f), "utf8"),
          ) as { expectedResult: string };
          return parsed.expectedResult;
        }),
    );
    for (const kind of VERIFY_ERROR_KINDS) {
      expect(kinds.has(kind), `Missing kind: ${kind}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 11 (VEC-06): MANIFEST.sha256 passes sha256sum --check.
//
// The tamper-detection test modifies one byte of the first vector file,
// asserts sha256sum --check fails, then restores and asserts it passes again.
// ---------------------------------------------------------------------------
describe("VEC-06 — MANIFEST.sha256 integrity", () => {
  const MANIFEST_PATH = join(VECTORS_DIR, "MANIFEST.sha256");

  it("sha256sum --check MANIFEST.sha256 exits 0", () => {
    if (!existsSync(MANIFEST_PATH)) {
      console.warn("SKIP: MANIFEST.sha256 not yet written; run --regen-vectors first");
      return;
    }
    const result = spawnSync("sha256sum", ["--check", "MANIFEST.sha256"], {
      cwd: VECTORS_DIR,
      encoding: "utf8",
    });
    expect(
      result.status,
      `sha256sum --check failed (exit ${result.status}): ${result.stderr || result.stdout}`,
    ).toBe(0);
  });

  it("tamper-detection: modifying a vector file breaks the manifest check", () => {
    if (!existsSync(MANIFEST_PATH)) {
      console.warn("SKIP: MANIFEST.sha256 not yet written; run --regen-vectors first");
      return;
    }
    // Pick the first vector file listed in the manifest
    const manifestContent = readFileSync(MANIFEST_PATH, "utf8");
    const firstLine = manifestContent.split("\n").find((l) => l.trim().length > 0);
    if (!firstLine) {
      throw new Error("MANIFEST.sha256 is empty — cannot perform tamper-detection test");
    }
    // Format: "<hex>  <relative-path>"
    const parts = firstLine.split("  ");
    if (parts.length < 2) {
      throw new Error(`Unexpected MANIFEST line format: ${firstLine}`);
    }
    const relPath = parts.slice(1).join("  ");
    const fullPath = join(VECTORS_DIR, relPath);

    // Read original, tamper, verify fails, restore, verify passes
    const original = readFileSync(fullPath);
    const tampered = Buffer.from(original);
    const lastIdx = tampered.length - 1;
    if (lastIdx < 0) throw new Error("Vector file is empty — cannot tamper");
    tampered[lastIdx] = (tampered[lastIdx] ?? 0) ^ 0x01; // flip last byte

    try {
      writeFileSync(fullPath, tampered);
      const resultFail = spawnSync("sha256sum", ["--check", "MANIFEST.sha256"], {
        cwd: VECTORS_DIR,
        encoding: "utf8",
      });
      expect(
        resultFail.status,
        "sha256sum --check should exit non-zero after tampering a file",
      ).not.toBe(0);
    } finally {
      // Always restore original
      writeFileSync(fullPath, original);
    }

    // Verify passes after restore
    const resultPass = spawnSync("sha256sum", ["--check", "MANIFEST.sha256"], {
      cwd: VECTORS_DIR,
      encoding: "utf8",
    });
    expect(
      resultPass.status,
      `sha256sum --check failed after restore: ${resultPass.stderr || resultPass.stdout}`,
    ).toBe(0);
  });

  it("MANIFEST.sha256 mtime is later than all vector files", () => {
    if (!existsSync(MANIFEST_PATH)) {
      console.warn("SKIP: MANIFEST.sha256 not yet written");
      return;
    }
    const manifestMtime = statSync(MANIFEST_PATH).mtime;
    const posFiles = existsSync(join(VECTORS_DIR, "positive"))
      ? readdirSync(join(VECTORS_DIR, "positive")).map((f) =>
          statSync(join(VECTORS_DIR, "positive", f)).mtime,
        )
      : [];
    const negFiles = existsSync(VECTORS_NEGATIVE_DIR)
      ? readdirSync(VECTORS_NEGATIVE_DIR).map((f) =>
          statSync(join(VECTORS_NEGATIVE_DIR, f)).mtime,
        )
      : [];
    const allVectorMtimes = [...posFiles, ...negFiles];
    for (const mtime of allVectorMtimes) {
      expect(
        manifestMtime.getTime(),
        `MANIFEST.sha256 mtime (${manifestMtime.toISOString()}) must be >= vector file mtime (${mtime.toISOString()})`,
      ).toBeGreaterThanOrEqual(mtime.getTime());
    }
  });
});
