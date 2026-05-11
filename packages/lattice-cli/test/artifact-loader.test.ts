/**
 * Tests for the filesystem ArtifactLoader and receipt id-or-path resolver
 * used by `lattice repro`.
 *
 * artifact-loader.ts:
 *   - createFilesystemArtifactLoader(fixturesDir) returns (hash) => Promise<ArtifactInput>
 *   - Reads `<fixturesDir>/<hash>.bin`; constructs an ArtifactInput.
 *   - Regex-gates hash against /^[a-f0-9]{64}$/u BEFORE any fs access
 *     (path-traversal defense).
 *   - Throws an ArtifactLoaderError discriminated by `kind`.
 *
 * receipt-loader.ts:
 *   - loadReceiptByIdOrPath(target, { receiptsDir }) reads a ReceiptEnvelope.
 *   - Treats `target` as a path when it contains "/" or ends in ".json"; else
 *     resolves to `<receiptsDir>/<target>.json` (default `.lattice/receipts/`).
 *   - Throws ReceiptLoadError { kind: "missing" | "malformed", ... }.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createFilesystemArtifactLoader,
  isArtifactLoaderError,
} from "../src/io/artifact-loader.js";
import {
  isReceiptLoadError,
  loadReceiptByIdOrPath,
} from "../src/io/receipt-loader.js";

const VALID_HASH =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("createFilesystemArtifactLoader", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-artifact-loader-"));
  });

  afterEach(() => {
    // tmpdir cleanup handled by OS.
  });

  it("Test 1: reads <fixturesDir>/<hash>.bin and returns an ArtifactInput with matching size", async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await writeFile(join(sandbox, `${VALID_HASH}.bin`), payload);

    const loader = createFilesystemArtifactLoader(sandbox);
    const input = await loader(VALID_HASH);

    expect(input.kind).toBe("file");
    expect(input.mediaType).toBe("application/octet-stream");
    expect(input.size?.bytes).toBe(payload.byteLength);
    expect(input.value).toBeInstanceOf(Uint8Array);
    expect(Array.from(input.value as Uint8Array)).toEqual(Array.from(payload));
  });

  it("Test 2: missing file rejects with ArtifactLoaderError { kind: 'missing' }", async () => {
    const loader = createFilesystemArtifactLoader(sandbox);
    expect.assertions(4);
    try {
      await loader(VALID_HASH);
    } catch (err) {
      expect(isArtifactLoaderError(err)).toBe(true);
      const e = err as { kind: string; hash: string; path?: string };
      expect(e.kind).toBe("missing");
      expect(e.hash).toBe(VALID_HASH);
      expect(typeof e.path).toBe("string");
    }
  });

  it("Test 3: hash with invalid characters (path-traversal attempt) rejects with kind 'invalid-hash' BEFORE any fs access", async () => {
    const loader = createFilesystemArtifactLoader(sandbox);
    const traversal = "../../etc/passwd";
    expect.assertions(3);
    try {
      await loader(traversal);
    } catch (err) {
      expect(isArtifactLoaderError(err)).toBe(true);
      const e = err as { kind: string; hash: string };
      expect(e.kind).toBe("invalid-hash");
      expect(e.hash).toBe(traversal);
    }
  });

  it("Test 3b: uppercase hex also rejected (lowercase enforced)", async () => {
    const loader = createFilesystemArtifactLoader(sandbox);
    const upper = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
    expect.assertions(2);
    try {
      await loader(upper);
    } catch (err) {
      expect(isArtifactLoaderError(err)).toBe(true);
      const e = err as { kind: string };
      expect(e.kind).toBe("invalid-hash");
    }
  });

  it("Test 4: empty file (0 bytes) reads as a valid ArtifactInput with size 0", async () => {
    await writeFile(join(sandbox, `${VALID_HASH}.bin`), new Uint8Array(0));

    const loader = createFilesystemArtifactLoader(sandbox);
    const input = await loader(VALID_HASH);

    expect(input.size?.bytes).toBe(0);
    expect(input.value).toBeInstanceOf(Uint8Array);
    expect((input.value as Uint8Array).byteLength).toBe(0);
  });

  it("isArtifactLoaderError narrows to ArtifactLoaderError", () => {
    expect(isArtifactLoaderError({ kind: "missing", hash: "x", message: "m" })).toBe(true);
    expect(isArtifactLoaderError({ kind: "invalid-hash", hash: "x", message: "m" })).toBe(true);
    expect(isArtifactLoaderError({ kind: "other", hash: "x", message: "m" })).toBe(false);
    expect(isArtifactLoaderError(null)).toBe(false);
    expect(isArtifactLoaderError("missing")).toBe(false);
  });
});

describe("loadReceiptByIdOrPath", () => {
  let sandbox: string;
  let savedCwd: string;

  const envelope = {
    payloadType: "application/vnd.lattice.receipt+json",
    payload: "eyJ2ZXJzaW9uIjoibGF0dGljZS1yZWNlaXB0L3YxIn0",
    signatures: [{ keyid: "kid-1", sig: "sigbytes" }],
  };

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-receipt-loader-"));
    savedCwd = process.cwd();
    process.chdir(sandbox);
  });

  afterEach(() => {
    process.chdir(savedCwd);
  });

  it("Test 5: target containing '/' is treated as a path", async () => {
    const sub = join(sandbox, "fixture");
    await writeFile(join(sandbox, "r.json"), JSON.stringify(envelope));
    await import("node:fs/promises").then((m) => m.mkdir(sub, { recursive: true }));
    await writeFile(join(sub, "r.json"), JSON.stringify(envelope));

    const loaded = await loadReceiptByIdOrPath("./fixture/r.json");
    expect(loaded.envelope.payloadType).toBe(envelope.payloadType);
    expect(loaded.idOrPath).toBe("./fixture/r.json");
  });

  it("Test 6: target ending in '.json' is treated as a path", async () => {
    await writeFile(join(sandbox, "r.json"), JSON.stringify(envelope));

    const loaded = await loadReceiptByIdOrPath("./r.json");
    expect(loaded.envelope.payloadType).toBe(envelope.payloadType);
  });

  it("Test 7: target without '/' or '.json' resolves to <receiptsDir>/<id>.json (default .lattice/receipts/ relative to cwd)", async () => {
    const fs = await import("node:fs/promises");
    await fs.mkdir(join(sandbox, ".lattice", "receipts"), { recursive: true });
    await writeFile(
      join(sandbox, ".lattice", "receipts", "abc123.json"),
      JSON.stringify(envelope),
    );

    const loaded = await loadReceiptByIdOrPath("abc123");
    expect(loaded.envelope.payloadType).toBe(envelope.payloadType);
    expect(loaded.resolvedPath).toMatch(/\.lattice\/receipts\/abc123\.json$/);
  });

  it("Test 7b: receiptsDir option overrides default", async () => {
    const customDir = join(sandbox, "custom", "receipts");
    const fs = await import("node:fs/promises");
    await fs.mkdir(customDir, { recursive: true });
    await writeFile(
      join(customDir, "myid.json"),
      JSON.stringify(envelope),
    );

    const loaded = await loadReceiptByIdOrPath("myid", { receiptsDir: customDir });
    expect(loaded.envelope.payloadType).toBe(envelope.payloadType);
  });

  it("Test 8: missing file rejects with ReceiptLoadError { kind: 'missing' }", async () => {
    expect.assertions(3);
    try {
      await loadReceiptByIdOrPath("./does-not-exist.json");
    } catch (err) {
      expect(isReceiptLoadError(err)).toBe(true);
      const e = err as { kind: string; resolvedPath: string };
      expect(e.kind).toBe("missing");
      expect(typeof e.resolvedPath).toBe("string");
    }
  });

  it("Test 9: malformed JSON rejects with ReceiptLoadError { kind: 'malformed' }", async () => {
    await writeFile(join(sandbox, "bad.json"), "{not json at all");
    expect.assertions(2);
    try {
      await loadReceiptByIdOrPath("./bad.json");
    } catch (err) {
      expect(isReceiptLoadError(err)).toBe(true);
      const e = err as { kind: string };
      expect(e.kind).toBe("malformed");
    }
  });

  it("Test 10: JSON not matching ReceiptEnvelope shape rejects with malformed", async () => {
    await writeFile(
      join(sandbox, "wrong.json"),
      JSON.stringify({ totally: "wrong", shape: 42 }),
    );
    expect.assertions(2);
    try {
      await loadReceiptByIdOrPath("./wrong.json");
    } catch (err) {
      expect(isReceiptLoadError(err)).toBe(true);
      const e = err as { kind: string };
      expect(e.kind).toBe("malformed");
    }
  });
});
