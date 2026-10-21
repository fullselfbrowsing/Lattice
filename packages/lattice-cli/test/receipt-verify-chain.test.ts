/**
 * Integration tests for `lattice receipt verify-chain` via direct handler
 * invocation (mock argv), mirroring test/verify.test.ts. Fixtures are a crew
 * style tree: one root receipt and children whose parentReceiptCid is the
 * root's CID, minted with createReceipt and receiptCid directly.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createInMemorySigner,
  createReceipt,
  generateEd25519KeyPairJwk,
  receiptCid,
  type CreateReceiptInput,
  type KeyEntry,
  type ReceiptEnvelope,
  type ReceiptSigner,
} from "@full-self-browsing/lattice";

import { runReceiptVerifyChain } from "../src/commands/receipt.js";

interface CaptureBag {
  readonly stdout: string[];
  readonly stderr: string[];
  exitCode: number | null;
}

function captureDeps(): {
  deps: {
    stdout: (line: string) => void;
    stderr: (line: string) => void;
    exit: (code: number) => void;
  };
  bag: CaptureBag;
} {
  const bag: CaptureBag = { stdout: [], stderr: [], exitCode: null };
  return {
    bag,
    deps: {
      stdout: (line: string) => bag.stdout.push(line),
      stderr: (line: string) => bag.stderr.push(line),
      exit: (code: number) => {
        bag.exitCode = code;
      },
    },
  };
}

function minimalInput(overrides: Partial<CreateReceiptInput> = {}): CreateReceiptInput {
  return {
    runId: "run-chain-cli",
    model: { requested: "m", observed: null },
    route: { providerId: "lattice-crew", capabilityId: "lattice-crew/run", attemptNumber: 1 },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    ...overrides,
  };
}

interface ChainFixture {
  readonly signer: ReceiptSigner;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
  readonly root: ReceiptEnvelope;
  readonly rootCid: string;
  readonly children: readonly ReceiptEnvelope[];
}

async function makeChainFixture(childCount = 2, kid = "chain-cli-key"): Promise<ChainFixture> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const root = await createReceipt(minimalInput({ stepName: "crew-start" }), signer);
  const rootCid = await receiptCid(root);
  const children: ReceiptEnvelope[] = [];
  for (let i = 0; i < childCount; i += 1) {
    children.push(
      await createReceipt(
        minimalInput({ parentReceiptCid: rootCid, stepName: `child-${i}` }),
        signer,
      ),
    );
  }
  return { signer, publicKeyJwk, kid, root, rootCid, children };
}

function flipSignature(env: ReceiptEnvelope): ReceiptEnvelope {
  const first = env.signatures[0]!;
  const sig = (first.sig.startsWith("A") ? "B" : "A") + first.sig.slice(1);
  return { ...env, signatures: [{ keyid: first.keyid, sig }] };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("lattice receipt verify-chain handler — runReceiptVerifyChain(args, deps)", () => {
  let sandbox: string;
  let receiptsDir: string;
  let keysetPath: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-verify-chain-"));
    receiptsDir = join(sandbox, "receipts");
    keysetPath = join(sandbox, "keyset.json");
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  async function writeFixture(
    fixture: ChainFixture,
    files: Record<string, ReceiptEnvelope>,
    state: KeyEntry["state"] = "active",
  ): Promise<void> {
    await mkdir(receiptsDir, { recursive: true });
    for (const [name, envelope] of Object.entries(files)) {
      await writeJson(join(receiptsDir, name), envelope);
    }
    await writeJson(keysetPath, [
      { kid: fixture.kid, publicKeyJwk: fixture.publicKeyJwk, state },
    ]);
  }

  it("verifies a root plus two children and prints only the root CID and link count (exit 0)", async () => {
    const fixture = await makeChainFixture(2);
    await writeFixture(fixture, {
      "root.json": fixture.root,
      "c1.json": fixture.children[0]!,
      "c2.json": fixture.children[1]!,
    });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(0);
    expect(bag.stderr.every((line) => line.startsWith("WARN "))).toBe(true);
    expect(bag.stderr.some((line) => line.includes("tail truncation"))).toBe(true);
    expect(bag.stdout).toHaveLength(1);
    expect(bag.stdout[0]).toMatch(/^OK root=sha256:[0-9a-f]{64} links=3$/);
    expect(bag.stdout[0]).toContain(fixture.rootCid);
    expect(bag.stdout[0]!.includes(fixture.root.payload)).toBe(false);
    expect(bag.stdout[0]!.includes(fixture.root.signatures[0]!.sig)).toBe(false);
  });

  it("reports link-invalid with exit 1 when a child signature is tampered", async () => {
    const fixture = await makeChainFixture(2);
    await writeFixture(fixture, {
      "root.json": fixture.root,
      "c1.json": fixture.children[0]!,
      "c2.json": flipSignature(fixture.children[1]!),
    });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(1);
    expect(bag.stdout).toHaveLength(0);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=link-invalid reason=.*signature-invalid.* cid=sha256:[0-9a-f]{64}$/);
  });

  it("detects dropped leaves only when --expect-count is supplied", async () => {
    const fixture = await makeChainFixture(3);
    await writeFixture(fixture, {
      "root.json": fixture.root,
      "c1.json": fixture.children[0]!,
      "c2.json": fixture.children[1]!,
    });

    const silent = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, silent.deps);
    expect(silent.bag.exitCode).toBe(0);

    const caught = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, expectCount: 4 },
      caught.deps,
    );
    expect(caught.bag.exitCode).toBe(1);
    expect(caught.bag.stderr[0]).toMatch(/^FAIL kind=count-mismatch reason=/);
  });

  it("rejects a wrong --run-id with run-id-mismatch", async () => {
    const fixture = await makeChainFixture(1);
    await writeFixture(fixture, { "root.json": fixture.root, "c1.json": fixture.children[0]! });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath, runId: "nope" }, deps);

    expect(bag.exitCode).toBe(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=run-id-mismatch reason=/);
  });

  it("rejects a wrong --root-cid with root-mismatch and accepts the right one", async () => {
    const fixture = await makeChainFixture(1);
    await writeFixture(fixture, { "root.json": fixture.root, "c1.json": fixture.children[0]! });

    const good = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, rootCid: fixture.rootCid },
      good.deps,
    );
    expect(good.bag.exitCode).toBe(0);

    const bad = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, rootCid: `sha256:${"00".repeat(32)}` },
      bad.deps,
    );
    expect(bad.bag.exitCode).toBe(1);
    expect(bad.bag.stderr[0]).toMatch(/^FAIL kind=root-mismatch reason=/);
  });

  it("reports no-root when the root file is missing", async () => {
    const fixture = await makeChainFixture(2);
    await writeFixture(fixture, {
      "c1.json": fixture.children[0]!,
      "c2.json": fixture.children[1]!,
    });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=no-root reason=/);
  });

  it("passes --min-version and --audience through to every link", async () => {
    const fixture = await makeChainFixture(1);
    await writeFixture(fixture, { "root.json": fixture.root, "c1.json": fixture.children[0]! });

    const minVersionOk = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, minVersion: "lattice-receipt/v1.4" },
      minVersionOk.deps,
    );
    expect(minVersionOk.bag.exitCode).toBe(0);

    const audienceFail = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, audience: "someone-else" },
      audienceFail.deps,
    );
    expect(audienceFail.bag.exitCode).toBe(1);
    expect(audienceFail.bag.stderr[0]).toMatch(/^FAIL kind=link-invalid reason=.*audience-mismatch/);
  });

  it("exits 2 with invalid-argument for a bad --min-version or --expect-count", async () => {
    const fixture = await makeChainFixture(1);
    await writeFixture(fixture, { "root.json": fixture.root });

    const badVersion = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, minVersion: "lattice-receipt/v9" },
      badVersion.deps,
    );
    expect(badVersion.bag.exitCode).toBe(2);
    expect(badVersion.bag.stderr[0]).toMatch(/^FAIL kind=invalid-argument reason=--min-version/);

    const badCount = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, expectCount: 1.5 },
      badCount.deps,
    );
    expect(badCount.bag.exitCode).toBe(2);
    expect(badCount.bag.stderr[0]).toMatch(/^FAIL kind=invalid-argument reason=--expect-count/);
  });

  it("exits 2 with receipt-load-failed for a missing directory, an empty directory, and a garbage file", async () => {
    const fixture = await makeChainFixture(0);

    const missing = captureDeps();
    await writeJson(keysetPath, [
      { kid: fixture.kid, publicKeyJwk: fixture.publicKeyJwk, state: "active" },
    ]);
    await runReceiptVerifyChain(
      { dir: join(sandbox, "does-not-exist"), key: keysetPath },
      missing.deps,
    );
    expect(missing.bag.exitCode).toBe(2);
    expect(missing.bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=/);

    await writeFixture(fixture, {});
    const empty = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, empty.deps);
    expect(empty.bag.exitCode).toBe(2);
    expect(empty.bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=.*no \*\.json receipts found$/);

    await writeFile(join(receiptsDir, "garbage.json"), "{ not json", "utf8");
    await writeJson(join(receiptsDir, "root.json"), fixture.root);
    const garbage = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, garbage.deps);
    expect(garbage.bag.exitCode).toBe(2);
    expect(garbage.bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=/);
  });

  it("exits 2 with keyset-load-failed when the keyset is missing", async () => {
    const fixture = await makeChainFixture(0);
    await writeFixture(fixture, { "root.json": fixture.root });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: join(sandbox, "missing-keyset.json") },
      deps,
    );
    expect(bag.exitCode).toBe(2);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=keyset-load-failed reason=/);
  });
});
