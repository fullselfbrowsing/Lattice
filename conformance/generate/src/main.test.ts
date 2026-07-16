import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STANDARD_POSITIVE_FILENAMES,
  bodyMatchesV14Schema,
  generatePositiveVectors,
} from "./positive.js";
import {
  PAYLOAD_TYPE,
  buildStandardPae,
} from "./protocol.js";
import type { StandardConformanceVector } from "./types.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(sourceDir, "..", "..", "..");
const standardPositiveDir = join(
  repoRoot,
  "conformance",
  "vectors",
  "standard",
  "positive",
);

describe("standalone standard PAE", () => {
  it("places raw object bytes in PAE rather than base64 text", () => {
    const payload = new TextEncoder().encode("{}");
    const pae = buildStandardPae(PAYLOAD_TYPE, payload);
    expect(new TextDecoder().decode(pae)).toBe(
      "DSSEv1 36 application/vnd.lattice.receipt+json 2 {}",
    );
  });

  it("uses UTF-8 byte length for a Unicode payload type", () => {
    const pae = buildStandardPae("π", new TextEncoder().encode("{}"));
    expect(new TextDecoder().decode(pae)).toBe("DSSEv1 2 π 2 {}");
  });

  it("preserves arbitrary binary payload bytes exactly", () => {
    const payload = Uint8Array.from([0x00, 0xff, 0x20, 0x80]);
    const pae = buildStandardPae("binary", payload);
    expect(Array.from(pae.slice(-payload.byteLength))).toEqual(
      Array.from(payload),
    );
    expect(new TextDecoder().decode(pae.slice(0, -payload.byteLength))).toBe(
      "DSSEv1 6 binary 4 ",
    );
  });
});

describe("standard positive corpus", () => {
  it("generates three deterministic v1.4 vectors", async () => {
    const first = await generatePositiveVectors();
    const second = await generatePositiveVectors();
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("validates every body against the closed v1.4 schema", async () => {
    for (const vector of await generatePositiveVectors()) {
      expect(bodyMatchesV14Schema(vector.body)).toBe(true);
      expect(vector.body["version"]).toBe("lattice-receipt/v1.4");
      expect(vector.body["signatureProfile"]).toBe("dsse-v1");
    }
  });

  it("labels profile, deprecation, result, schema, and corpus explicitly", async () => {
    for (const vector of await generatePositiveVectors()) {
      expect(vector).toMatchObject({
        corpusProfile: "standard",
        schema: "spec/schema/v1.4.json",
        expectedSchemaResult: "valid",
        expectedVerificationProfile: "dsse-v1",
        expectedDeprecated: false,
        expectedResult: "ok",
      });
      expect(vector.adversarialAxis).toBeUndefined();
    }
  });

  it("covers Unicode/redaction, minimal, and lineage/agent bodies", async () => {
    const [unicode, minimal, lineage] = await generatePositiveVectors();
    expect(unicode?.body["stepName"]).toBe("分析-step");
    expect(unicode?.body["redactions"]).toEqual([
      {
        path: "tripwireEvidence.observed",
        reason: "no-pii-detector-substring-only",
      },
    ]);

    for (const field of [
      "modelClass",
      "parentReceiptCid",
      "lineageMerkleRoot",
      "stepName",
      "stepIndex",
      "sessionId",
    ]) {
      expect(Object.hasOwn(minimal?.body ?? {}, field)).toBe(false);
    }

    expect(lineage?.body["parentReceiptCid"]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lineage?.body["lineageMerkleRoot"]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lineage?.body["stepIndex"]).toBe(2);
    expect(lineage?.body["sessionId"]).toBe("standard-session-001");
  });

  it("commits the canonical body bytes as the final PAE field", async () => {
    for (const vector of await generatePositiveVectors()) {
      const pae = Buffer.from(vector.paeHex, "hex");
      const canonical = Buffer.from(vector.canonicalBytesHex, "hex");
      expect(pae.subarray(-canonical.byteLength)).toEqual(canonical);
      expect(vector.payloadBase64).toBe(canonical.toString("base64"));
    }
  });

  it("matches the committed positive files", async () => {
    const generated = await generatePositiveVectors();
    const committed = STANDARD_POSITIVE_FILENAMES.map((filename) =>
      JSON.parse(
        readFileSync(join(standardPositiveDir, filename), "utf8"),
      ) as StandardConformanceVector,
    );
    expect(committed).toEqual(generated);
  });
});

describe("generator independence", () => {
  it("has no production receipt imports", () => {
    for (const filename of [
      "types.ts",
      "protocol.ts",
      "positive.ts",
      "negative.ts",
      "main.ts",
    ]) {
      const source = readFileSync(join(sourceDir, filename), "utf8");
      expect(source).not.toMatch(
        /from\s+["'][^"']*packages\/lattice\/src\/receipts/,
      );
    }
  });
});
