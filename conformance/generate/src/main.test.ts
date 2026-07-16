import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STANDARD_POSITIVE_FILENAMES,
  bodyMatchesV14Schema,
  generatePositiveVectors,
} from "./positive.js";
import {
  DEFAULT_VECTORS_ROOT,
  generateStandardVectors,
  runGeneratorCli,
} from "./main.js";
import {
  REQUIRED_ADVERSARIAL_AXES,
  STANDARD_NEGATIVE_FILENAMES,
  generateNegativeVectors,
} from "./negative.js";
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
const standardNegativeDir = join(
  repoRoot,
  "conformance",
  "vectors",
  "standard",
  "negative",
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

describe("standard adversarial corpus", () => {
  it("covers every required axis exactly once", async () => {
    const vectors = await generateNegativeVectors();
    const axes = vectors.map((vector) => vector.adversarialAxis);
    expect(axes).toEqual(REQUIRED_ADVERSARIAL_AXES);
    expect(new Set(axes).size).toBe(axes.length);
    expect(vectors).toHaveLength(STANDARD_NEGATIVE_FILENAMES.length);
  });

  it("records explicit failure, schema, profile, and deprecation metadata", async () => {
    for (const vector of await generateNegativeVectors()) {
      expect(vector.corpusProfile).toBe("standard");
      expect(vector.schema).toBe("spec/schema/v1.4.json");
      expect(vector.expectedResult).not.toBe("ok");
      expect(vector.expectedVerificationProfile).toBeNull();
      expect(vector.expectedDeprecated).toBeNull();
      expect(vector.expectedSchemaResult).toBe(
        bodyMatchesV14Schema(vector.body) ? "valid" : "invalid",
      );
      expect(vector.envelope).toBeDefined();
    }
  });

  it("makes legacy PAE on v1.4 terminal signature-invalid", async () => {
    const vector = (await generateNegativeVectors()).find(
      (candidate) => candidate.adversarialAxis === "legacy-pae-on-v1.4",
    );
    expect(vector).toMatchObject({
      expectedResult: "signature-invalid",
      expectedVerificationProfile: null,
      expectedDeprecated: null,
    });
    expect(vector?.body["version"]).toBe("lattice-receipt/v1.4");
    expect(vector?.body["signatureProfile"]).toBe("dsse-v1");
    expect(vector?.paeHex).not.toMatch(
      new RegExp(`${vector?.canonicalBytesHex ?? "$^"}$`),
    );
  });

  it("classifies noncanonical payload and signature base64 as envelope-malformed", async () => {
    const vectors = await generateNegativeVectors();
    for (const axis of [
      "payload-base64-noncanonical",
      "signature-base64-noncanonical",
    ] as const) {
      const vector = vectors.find(
        (candidate) => candidate.adversarialAxis === axis,
      );
      expect(vector?.expectedResult).toBe("envelope-malformed");
      expect(vector?.envelope).toBeDefined();
    }
  });

  it("matches every committed negative file", async () => {
    const generated = await generateNegativeVectors();
    const committed = STANDARD_NEGATIVE_FILENAMES.map((filename) =>
      JSON.parse(
        readFileSync(join(standardNegativeDir, filename), "utf8"),
      ) as StandardConformanceVector,
    );
    expect(committed).toEqual(generated);
  });
});

describe("generation output boundary", () => {
  it("is a no-op without --regen-vectors", async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), "lattice-conformance-noop-"));
    const messages: string[] = [];
    try {
      const result = await runGeneratorCli(
        ["--output-root", outputRoot],
        (message) => messages.push(message),
      );
      expect(result).toBeNull();
      expect(existsSync(join(outputRoot, "standard"))).toBe(false);
      expect(messages).toEqual([
        "[generate-vectors] No-op: pass --regen-vectors to regenerate committed vectors.",
      ]);
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("writes only the standard subtree and preserves unrelated files", async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), "lattice-conformance-safe-"));
    const standardRoot = join(outputRoot, "standard");
    try {
      writeFileSync(join(outputRoot, "keep.txt"), "root sentinel\n", "utf8");
      mkdirSync(standardRoot);
      writeFileSync(join(standardRoot, "keep.txt"), "standard sentinel\n", "utf8");

      const result = await generateStandardVectors(outputRoot);
      expect(result).toMatchObject({ positiveCount: 3, negativeCount: 12 });
      expect(readdirSync(outputRoot).sort()).toEqual(["keep.txt", "standard"]);
      expect(readdirSync(standardRoot).sort()).toEqual([
        "keep.txt",
        "negative",
        "positive",
      ]);
      expect(readFileSync(join(outputRoot, "keep.txt"), "utf8")).toBe(
        "root sentinel\n",
      );
      expect(readFileSync(join(standardRoot, "keep.txt"), "utf8")).toBe(
        "standard sentinel\n",
      );
      expect(readdirSync(join(standardRoot, "positive"))).toHaveLength(3);
      expect(readdirSync(join(standardRoot, "negative"))).toHaveLength(12);
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("rejects a legacy target before creating any path", async () => {
    const blockedTarget = join(
      DEFAULT_VECTORS_ROOT,
      "legacy",
      `blocked-${process.pid}-${Date.now()}`,
    );
    expect(existsSync(blockedTarget)).toBe(false);
    await expect(generateStandardVectors(blockedTarget)).rejects.toThrow(
      /immutable legacy corpus/,
    );
    expect(existsSync(blockedTarget)).toBe(false);
  });
});
