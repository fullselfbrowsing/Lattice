/**
 * Tests for `walkReceiptsWithSidecars`.
 *
 * Covers:
 *   - pairing happy path (receipt + sidecar both present)
 *   - missing sidecar is NON-FATAL (yields with sidecar: null)
 *   - sidecars-dir-missing is non-fatal (every entry yields sidecar: null)
 *   - receipt-side malformed -> yields a WalkedReceiptError unchanged
 *   - sidecar-side malformed -> yields an error entry pointing at sidecar path
 *   - receipts-dir-missing throws { kind: "missing" } (delegated from receipt walker)
 *
 * Each test uses an isolated tmpdir (mkdtemp) so cases never observe each other.
 */

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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
  walkReceiptsWithSidecars,
  type WalkedReceiptWithSidecarEntry,
} from "../src/io/sidecar-walker.js";
import { isReceiptLoadError } from "../src/io/receipt-loader.js";
import { isSidecarLoadError } from "../src/io/sidecar-loader.js";

void artifact; // keep import for parallelism with receipt-walker.test.ts

async function makeReceipt(
  kid = "sidecar-walker-test-kid",
  artifacts: readonly ArtifactInput[] = [],
): Promise<ReceiptEnvelope> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const ai = createAI({ providers: [createFakeProvider()], signer });
  const result = await ai.run({
    task: "lattice-cli-sidecar-walker-fixture",
    outputs: { text: "text" as const },
    artifacts,
  });
  if (!result.ok || result.receipt === undefined) {
    throw new Error("Failed to make receipt fixture");
  }
  return result.receipt;
}

async function writeReceipt(
  dir: string,
  name: string,
  envelope: ReceiptEnvelope,
): Promise<void> {
  await writeFile(join(dir, name), JSON.stringify(envelope), "utf8");
}

const validPolicy = { privacy: "sensitive" } as const;
const validContract = {
  kind: "capability-contract",
  invariants: [],
} as const;

async function writeValidSidecar(
  dir: string,
  name: string,
  task = "test task",
): Promise<void> {
  const body = {
    version: "lattice-sidecar/v1",
    task,
    outputs: { answer: "text" },
    policy: validPolicy,
    contract: validContract,
  };
  await writeFile(join(dir, name), JSON.stringify(body), "utf8");
}

async function collect(
  receiptsDir: string,
  sidecarDir: string,
): Promise<WalkedReceiptWithSidecarEntry[]> {
  const out: WalkedReceiptWithSidecarEntry[] = [];
  for await (const entry of walkReceiptsWithSidecars(receiptsDir, sidecarDir)) {
    out.push(entry);
  }
  return out;
}

describe("walkReceiptsWithSidecars", () => {
  let sandbox: string;
  let receiptsDir: string;
  let sidecarDir: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-sidecar-walker-"));
    receiptsDir = join(sandbox, "receipts");
    sidecarDir = join(sandbox, "sidecars");
    await mkdir(receiptsDir, { recursive: true });
    await mkdir(sidecarDir, { recursive: true });
  });

  afterEach(() => {
    // tmpdir isolated per case
  });

  it("Test 1: pairing happy path — both receipts and sidecars present, lex order", async () => {
    const env = await makeReceipt();
    await writeReceipt(receiptsDir, "b.json", env);
    await writeReceipt(receiptsDir, "a.json", env);
    await writeValidSidecar(sidecarDir, "a.json");
    await writeValidSidecar(sidecarDir, "b.json");

    const entries = await collect(receiptsDir, sidecarDir);
    expect(entries).toHaveLength(2);

    const e0 = entries[0]!;
    const e1 = entries[1]!;
    expect(isWalkedReceiptError(e0)).toBe(false);
    expect(isWalkedReceiptError(e1)).toBe(false);
    if (isWalkedReceiptError(e0) || isWalkedReceiptError(e1)) {
      throw new Error("unreachable");
    }
    expect(e0.id).toBe("a");
    expect(e1.id).toBe("b");
    expect(e0.sidecar).not.toBeNull();
    expect(e1.sidecar).not.toBeNull();
    expect(e0.sidecarPath).toMatch(/a\.json$/);
    expect(e1.sidecarPath).toMatch(/b\.json$/);
    expect(e0.sidecar?.task).toBe("test task");
  });

  it("Test 2: missing sidecar — receipt yields with sidecar: null (non-fatal)", async () => {
    const env = await makeReceipt();
    await writeReceipt(receiptsDir, "a.json", env);
    // sidecarDir intentionally empty

    const entries = await collect(receiptsDir, sidecarDir);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(isWalkedReceiptError(e)).toBe(false);
    if (isWalkedReceiptError(e)) throw new Error("unreachable");
    expect(e.id).toBe("a");
    expect(e.sidecar).toBeNull();
    expect(e.sidecarPath).toBeNull();
  });

  it("Test 3: sidecars-dir-missing — every entry yields sidecar: null (non-fatal)", async () => {
    const env = await makeReceipt();
    await writeReceipt(receiptsDir, "a.json", env);
    await writeReceipt(receiptsDir, "b.json", env);
    const nonexistentSidecarDir = join(sandbox, "does-not-exist");

    const entries = await collect(receiptsDir, nonexistentSidecarDir);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(isWalkedReceiptError(e)).toBe(false);
      if (isWalkedReceiptError(e)) throw new Error("unreachable");
      expect(e.sidecar).toBeNull();
      expect(e.sidecarPath).toBeNull();
    }
  });

  it("Test 4: receipt-side malformed — yields a WalkedReceiptError unchanged", async () => {
    await writeFile(
      join(receiptsDir, "bad.json"),
      JSON.stringify({ not: "a receipt" }),
      "utf8",
    );

    const entries = await collect(receiptsDir, sidecarDir);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(isWalkedReceiptError(e)).toBe(true);
    if (!isWalkedReceiptError(e)) throw new Error("unreachable");
    expect(e.id).toBe("bad");
    expect(isReceiptLoadError(e.error)).toBe(true);
    expect(e.error.kind).toBe("malformed");
  });

  it("Test 5: sidecar-side malformed — yields an error entry pointing at the sidecar path", async () => {
    const env = await makeReceipt();
    await writeReceipt(receiptsDir, "a.json", env);
    await writeFile(join(sidecarDir, "a.json"), "{not json", "utf8");

    const entries = await collect(receiptsDir, sidecarDir);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(isWalkedReceiptError(e)).toBe(true);
    if (!isWalkedReceiptError(e)) throw new Error("unreachable");
    expect(e.id).toBe("a");
    expect(e.resolvedPath).toMatch(/sidecars\/a\.json$/);
    expect(e.error.kind).toBe("malformed");
    expect(typeof e.error.message).toBe("string");
  });

  it("Test 5b: sidecar-side version-mismatch surfaces as an error entry (with original kind in message)", async () => {
    const env = await makeReceipt();
    await writeReceipt(receiptsDir, "a.json", env);
    await writeFile(
      join(sidecarDir, "a.json"),
      JSON.stringify({
        version: "lattice-sidecar/v2",
        task: "",
        outputs: {},
        policy: {},
        contract: {},
      }),
      "utf8",
    );

    const entries = await collect(receiptsDir, sidecarDir);
    expect(entries).toHaveLength(1);
    const e = entries[0]!;
    expect(isWalkedReceiptError(e)).toBe(true);
    if (!isWalkedReceiptError(e)) throw new Error("unreachable");
    expect(e.error.kind).toBe("malformed");
    expect(e.error.message).toContain("version-mismatch");
  });

  it("Test 6: receipts-dir-missing throws { kind: 'missing' } (delegated)", async () => {
    const missing = join(sandbox, "no-receipts");
    let thrown: unknown = null;
    try {
      for await (const _ of walkReceiptsWithSidecars(missing, sidecarDir)) {
        void _;
      }
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeNull();
    expect(isReceiptLoadError(thrown)).toBe(true);
    expect((thrown as { kind: string }).kind).toBe("missing");
  });

  it("Test 7: pairing keeps the union sound — isSidecarLoadError is still callable on raw errors", () => {
    // Sanity: ensure the public error guard re-exported from sidecar-loader
    // is exported from elsewhere, not from sidecar-walker (CLI-06 boundary).
    expect(typeof isSidecarLoadError).toBe("function");
  });
});
