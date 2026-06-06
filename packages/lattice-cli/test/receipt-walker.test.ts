/**
 * Tests for `walkReceiptsDirectory`.
 *
 * Covers:
 *   - empty directory yields zero entries
 *   - directory with a valid receipt JSON yields { id, envelope, resolvedPath }
 *   - directory with a malformed JSON file yields { id, error: ReceiptLoadError, resolvedPath }
 *   - directory with non-.json files skips them entirely
 *   - non-existent directory throws { kind: "missing", ... } (does NOT yield)
 *   - entries are emitted in lexicographic filename order
 *
 * Each test uses an isolated tmpdir (mkdtemp) so cases never observe each other.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  artifact,
  createAI,
  createFakeProvider,
  createInMemorySigner,
  generateEd25519KeyPairJwk,
  type ArtifactInput,
  type ReceiptEnvelope,
} from "@full-self-browsing/lattice";

import {
  isWalkedReceiptError,
  walkReceiptsDirectory,
  type WalkedEntry,
} from "../src/io/receipt-walker.js";
import { isReceiptLoadError } from "../src/io/receipt-loader.js";

async function makeReceipt(
  kid = "walker-test-kid",
  artifacts: readonly ArtifactInput[] = [],
): Promise<ReceiptEnvelope> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const ai = createAI({ providers: [createFakeProvider()], signer });
  const result = await ai.run({
    task: "lattice-cli-walker-fixture",
    outputs: { text: "text" as const },
    artifacts,
  });
  if (!result.ok || result.receipt === undefined) {
    throw new Error("Failed to make receipt fixture");
  }
  return result.receipt;
}

async function writeReceipt(dir: string, name: string, envelope: ReceiptEnvelope): Promise<void> {
  await writeFile(join(dir, name), JSON.stringify(envelope), "utf8");
}

async function collect(dir: string): Promise<WalkedEntry[]> {
  const out: WalkedEntry[] = [];
  for await (const entry of walkReceiptsDirectory(dir)) {
    out.push(entry);
  }
  return out;
}

describe("walkReceiptsDirectory", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-walker-"));
  });

  afterEach(() => {
    // tmpdir is isolated per case; node will clean automatically on suite end
  });

  it("Test 1: empty directory yields zero entries (no throw)", async () => {
    const entries = await collect(sandbox);
    expect(entries).toEqual([]);
  });

  it("Test 2: one valid receipt JSON yields { id, envelope, resolvedPath } with id = filename minus .json", async () => {
    const env = await makeReceipt();
    await writeReceipt(sandbox, "abc.json", env);

    const entries = await collect(sandbox);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(isWalkedReceiptError(e)).toBe(false);
    if (isWalkedReceiptError(e)) throw new Error("unreachable");
    expect(e.id).toBe("abc");
    expect(e.envelope.payloadType).toBe("application/vnd.lattice.receipt+json");
    expect(e.resolvedPath).toMatch(/abc\.json$/);
  });

  it("Test 3: malformed JSON (not a ReceiptEnvelope) yields { id, error } with kind=\"malformed\", does NOT throw", async () => {
    await writeFile(join(sandbox, "bad.json"), JSON.stringify({ not: "a receipt" }), "utf8");

    const entries = await collect(sandbox);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(isWalkedReceiptError(e)).toBe(true);
    if (!isWalkedReceiptError(e)) throw new Error("unreachable");
    expect(e.id).toBe("bad");
    expect(isReceiptLoadError(e.error)).toBe(true);
    expect(e.error.kind).toBe("malformed");
  });

  it("Test 4: non-.json files are skipped entirely", async () => {
    const env = await makeReceipt();
    await writeReceipt(sandbox, "real.json", env);
    await writeFile(join(sandbox, "notes.txt"), "this is not a receipt", "utf8");
    await writeFile(join(sandbox, "README.md"), "# nothing here", "utf8");

    const entries = await collect(sandbox);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    if (isWalkedReceiptError(e)) throw new Error("expected success entry");
    expect(e.id).toBe("real");
  });

  it("Test 5: non-existent directory throws { kind: \"missing\" } (does NOT yield)", async () => {
    const missing = join(sandbox, "does-not-exist");
    let thrown: unknown = null;
    try {
      for await (const _ of walkReceiptsDirectory(missing)) {
        void _;
      }
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeNull();
    expect(isReceiptLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("missing");
  });

  it("Test 6: entries are yielded in lexicographic filename order", async () => {
    const env = await makeReceipt();
    // Write out of order; walker must sort.
    await writeReceipt(sandbox, "c.json", env);
    await writeReceipt(sandbox, "a.json", env);
    await writeReceipt(sandbox, "b.json", env);

    const entries = await collect(sandbox);
    expect(entries).toHaveLength(3);
    const ids = entries.map((e) => (isWalkedReceiptError(e) ? e.id : e.id));
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("Test 7: mixed valid + malformed in same directory — malformed reported, walk continues", async () => {
    const env = await makeReceipt();
    await writeReceipt(sandbox, "a.json", env);
    await writeFile(join(sandbox, "b.json"), "{not json", "utf8");
    await writeReceipt(sandbox, "c.json", env);

    const entries = await collect(sandbox);
    expect(entries).toHaveLength(3);
    expect(isWalkedReceiptError(entries[0]!)).toBe(false);
    expect(isWalkedReceiptError(entries[1]!)).toBe(true);
    expect(isWalkedReceiptError(entries[2]!)).toBe(false);
  });
});
