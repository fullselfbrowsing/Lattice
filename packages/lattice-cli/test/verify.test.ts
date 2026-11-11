/**
 * Integration tests for `lattice verify` exercised via direct handler
 * invocation (mock argv) — no spawnSync, per CONTEXT.md test-strategy.
 *
 * Real receipts are fabricated by driving `createAI({ providers:[fake], signer })`
 * against `createFakeProvider()` and pulling `result.receipt` — the same path
 * documented in `packages/lattice/src/runtime/create-ai.test.ts` "Phase 9
 * receipts integration".
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createAI,
  createFakeProvider,
  createInMemorySigner,
  createReceipt,
  generateEd25519KeyPairJwk,
  verifyReceipt,
  type KeyEntry,
  type ReceiptEnvelope,
  type ReceiptSigner,
} from "@full-self-browsing/lattice";

import { runVerify } from "../src/commands/verify.js";

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

interface ReceiptFixture {
  readonly envelope: ReceiptEnvelope;
  readonly signer: ReceiptSigner;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
}

async function makeReceiptFixture(
  kid = "lattice-cli-test",
): Promise<ReceiptFixture> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const ai = createAI({ providers: [createFakeProvider()], signer });
  const result = await ai.run({
    task: "lattice-cli-verify-test",
    outputs: { text: "text" as const },
  });
  if (!result.ok) {
    throw new Error(
      `Expected ai.run to succeed for fixture; got error kind=${result.error.kind}`,
    );
  }
  if (result.receipt === undefined) {
    throw new Error("Expected ai.run to emit a receipt when signer is set");
  }
  return { envelope: result.receipt, signer, publicKeyJwk, kid };
}

function entry(kid: string, jwk: JsonWebKey, state: KeyEntry["state"]): KeyEntry {
  return { kid, publicKeyJwk: jwk, state };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("lattice verify handler — runVerify(args, deps)", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-verify-"));
  });

  afterEach(() => {
    // Ephemeral tmpdir — left alone; OS cleans up. No persistent state.
  });

  it("Test 1 (OK): writes one stdout line `OK kid=<kid> verdict=<verdict>` and exits 0", async () => {
    const fixture = await makeReceiptFixture("ok-kid-1");
    const receiptPath = join(sandbox, "receipt.json");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(receiptPath, fixture.envelope);
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "active")]);

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(0);
    // A default ai.run receipt carries no bindings: INFO lines only, no WARN.
    expect(bag.stderr.map((line) => line.split(":")[0]).sort()).toEqual([
      "INFO audience-absent",
      "INFO expiry-absent",
      "INFO nonce-absent",
    ]);
    expect(bag.stdout).toHaveLength(1);
    expect(bag.stdout[0]).toMatch(/^OK kid=ok-kid-1 verdict=success$/);

    const quiet = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, quiet: true }, quiet.deps);
    expect(quiet.bag.exitCode).toBe(0);
    expect(quiet.bag.stderr).toEqual([]);
    expect(quiet.bag.stdout).toEqual(bag.stdout);
  });

  it("Test 2 (signature-invalid FAIL): exit 1 with FAIL kind=signature-invalid", async () => {
    const fixture = await makeReceiptFixture("tamper-kid");
    // Tamper with the signature bytes (mutate one byte after base64 decode).
    const sig = fixture.envelope.signatures[0]!;
    const sigBytes = Buffer.from(sig.sig, "base64");
    sigBytes[0] = (sigBytes[0]! ^ 0x01) & 0xff;
    const tamperedEnvelope: ReceiptEnvelope = {
      ...fixture.envelope,
      signatures: [{ keyid: sig.keyid, sig: sigBytes.toString("base64") }],
    };

    const receiptPath = join(sandbox, "receipt.json");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(receiptPath, tamperedEnvelope);
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "active")]);

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(1);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=signature-invalid reason=/);
  });

  it("Test 3 (key-not-found FAIL): exit 1 with FAIL kind=key-not-found", async () => {
    const fixture = await makeReceiptFixture("absent-kid");
    // Use a different kid in the keyset.
    const otherJwk = (await generateEd25519KeyPairJwk()).publicKeyJwk;
    const receiptPath = join(sandbox, "receipt.json");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(receiptPath, fixture.envelope);
    await writeJson(keysetPath, [entry("totally-different-kid", otherJwk, "active")]);

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(1);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=key-not-found reason=/);
  });

  it("Test 4 (key-revoked FAIL): exit 1 with FAIL kind=key-revoked", async () => {
    const fixture = await makeReceiptFixture("revoked-kid");
    const receiptPath = join(sandbox, "receipt.json");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(receiptPath, fixture.envelope);
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "revoked")]);

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(1);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=key-revoked reason=/);
  });

  it("Test 5 (keyset-load-failed): exit 2 with FAIL kind=keyset-load-failed (distinct from verify failure)", async () => {
    const fixture = await makeReceiptFixture("any-kid");
    const receiptPath = join(sandbox, "receipt.json");
    await writeJson(receiptPath, fixture.envelope);

    const { deps, bag } = captureDeps();
    await runVerify(
      { receipt: receiptPath, key: join(sandbox, "nonexistent-keyset.json") },
      deps,
    );

    expect(bag.exitCode).toBe(2);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=keyset-load-failed reason=/);
  });

  it("Test 6 (receipt-load-failed: missing file): exit 2 with FAIL kind=receipt-load-failed", async () => {
    const fixture = await makeReceiptFixture("rl-kid-1");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "active")]);

    const { deps, bag } = captureDeps();
    await runVerify(
      { receipt: join(sandbox, "missing-receipt.json"), key: keysetPath },
      deps,
    );

    expect(bag.exitCode).toBe(2);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=/);
  });

  it("Test 6b (receipt-load-failed: not JSON): exit 2", async () => {
    const fixture = await makeReceiptFixture("rl-kid-2");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "active")]);
    const receiptPath = join(sandbox, "garbage.json");
    await writeFile(receiptPath, "{not json at all", "utf8");

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(2);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=/);
  });

  it("Test 6c (receipt-load-failed: wrong envelope shape): exit 2", async () => {
    const fixture = await makeReceiptFixture("rl-kid-3");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "active")]);
    const receiptPath = join(sandbox, "wrong-shape.json");
    await writeJson(receiptPath, { totally: "wrong", shape: 42 });

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(2);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=/);
  });

  it("Test 7 (redaction discipline): stdout reveals ONLY kid + verdict — no inputHashes, no outputHash, no payload bytes", async () => {
    const fixture = await makeReceiptFixture("redact-kid");
    const receiptPath = join(sandbox, "receipt.json");
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(receiptPath, fixture.envelope);
    await writeJson(keysetPath, [entry(fixture.kid, fixture.publicKeyJwk, "active")]);

    // Independently decode the body so we know exactly which hashes must NOT appear.
    const verified = await verifyReceipt(
      fixture.envelope,
      // Tiny throwaway keyset for the side-channel decode.
      {
        lookup: () => ({
          kid: fixture.kid,
          publicKeyJwk: fixture.publicKeyJwk,
          state: "active" as const,
        }),
      },
    );
    if (!verified.ok) {
      throw new Error(`side-channel verify failed: ${verified.error.kind}`);
    }
    const body = verified.body;

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);

    expect(bag.exitCode).toBe(0);
    expect(bag.stdout).toHaveLength(1);
    const line = bag.stdout[0]!;
    expect(line).toMatch(/^OK kid=\S+ verdict=\S+$/);

    // Hashes / payload bytes must NOT appear in the printed line.
    if (body.outputHash !== null) {
      expect(line.includes(body.outputHash)).toBe(false);
    }
    for (const h of body.inputHashes) {
      expect(line.includes(h)).toBe(false);
    }
    if (body.contractHash !== null) {
      expect(line.includes(body.contractHash)).toBe(false);
    }
    // The base64 payload bytes themselves must not leak either.
    expect(line.includes(fixture.envelope.payload)).toBe(false);
    // The signature bytes must not leak.
    expect(line.includes(fixture.envelope.signatures[0]!.sig)).toBe(false);
  });
});

describe("lattice verify handler — VerifyOptions flags (issue #21)", () => {
  let sandbox: string;
  let receiptPath: string;
  let keysetPath: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-verify-opts-"));
    receiptPath = join(sandbox, "receipt.json");
    keysetPath = join(sandbox, "keyset.json");
  });

  async function mintAndWrite(
    overrides: Record<string, unknown>,
    kid = "verify-opts-key",
  ): Promise<void> {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
    const envelope = await createReceipt(
      {
        runId: "run-verify-opts",
        model: { requested: "m", observed: null },
        route: { providerId: "p", capabilityId: "p/m", attemptNumber: 1 },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        ...overrides,
      },
      signer,
    );
    await writeJson(receiptPath, envelope);
    await writeJson(keysetPath, [entry(kid, publicKeyJwk, "active")]);
  }

  it("--audience: matching value exits 0, mismatch exits 1 with audience-mismatch", async () => {
    await mintAndWrite({ audience: "cli-aud" });

    const ok = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, audience: "cli-aud" }, ok.deps);
    expect(ok.bag.exitCode).toBe(0);
    expect(ok.bag.stdout[0]).toMatch(/^OK kid=verify-opts-key verdict=success$/);

    const bad = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, audience: "other" }, bad.deps);
    expect(bad.bag.exitCode).toBe(1);
    expect(bad.bag.stderr[0]).toMatch(/^FAIL kind=audience-mismatch reason=/);
  });

  it("--nonce: matching value exits 0, mismatch exits 1 without echoing nonce values", async () => {
    await mintAndWrite({ nonce: "cli-nonce" });

    const ok = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, nonce: "cli-nonce" }, ok.deps);
    expect(ok.bag.exitCode).toBe(0);

    const bad = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, nonce: "wrong" }, bad.deps);
    expect(bad.bag.exitCode).toBe(1);
    expect(bad.bag.stderr[0]).toMatch(/^FAIL kind=nonce-mismatch reason=/);
    expect(bad.bag.stderr[0]).not.toContain("cli-nonce");
    expect(bad.bag.stderr[0]).not.toContain("wrong");
  });

  it("--min-version: current version accepted, unknown literal is a usage error (exit 2)", async () => {
    await mintAndWrite({});

    const ok = captureDeps();
    await runVerify(
      { receipt: receiptPath, key: keysetPath, minVersion: "lattice-receipt/v1.4" },
      ok.deps,
    );
    expect(ok.bag.exitCode).toBe(0);

    const bad = captureDeps();
    await runVerify(
      { receipt: receiptPath, key: keysetPath, minVersion: "lattice-receipt/v9" },
      bad.deps,
    );
    expect(bad.bag.exitCode).toBe(2);
    expect(bad.bag.stderr[0]).toMatch(/^FAIL kind=invalid-argument reason=--min-version/);
  });

  it("--max-age-ms: an old receipt is rejected with receipt-expired; a bad number is a usage error", async () => {
    await mintAndWrite({ issuedAt: "2020-01-01T00:00:00.000Z" });

    const expired = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, maxAgeMs: 1000 }, expired.deps);
    expect(expired.bag.exitCode).toBe(1);
    expect(expired.bag.stderr[0]).toMatch(/^FAIL kind=receipt-expired reason=/);

    const invalid = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath, maxAgeMs: Number.NaN }, invalid.deps);
    expect(invalid.bag.exitCode).toBe(2);
    expect(invalid.bag.stderr[0]).toMatch(/^FAIL kind=invalid-argument reason=--max-age-ms/);
  });

  it("prints WARN for an audience and nonce the receipt carries but the flags did not check, even under --quiet", async () => {
    await mintAndWrite({ audience: "bank-A", nonce: "nonce-secret-9", expiresAt: "2999-01-01T00:00:00Z" });

    for (const quiet of [false, true]) {
      const { deps, bag } = captureDeps();
      await runVerify({ receipt: receiptPath, key: keysetPath, quiet }, deps);
      expect(bag.exitCode).toBe(0);
      expect(bag.stdout[0]).toMatch(/^OK kid=verify-opts-key verdict=success$/);
      expect(bag.stderr.map((line) => line.split(":")[0]).sort()).toEqual([
        "WARN audience-unchecked",
        "WARN nonce-unchecked",
      ]);
      expect(bag.stderr.join("\n")).toContain("bank-A");
      expect(bag.stderr.join("\n")).not.toContain("nonce-secret-9");
    }

    const checked = captureDeps();
    await runVerify(
      { receipt: receiptPath, key: keysetPath, audience: "bank-A", nonce: "nonce-secret-9" },
      checked.deps,
    );
    expect(checked.bag.exitCode).toBe(0);
    expect(checked.bag.stderr).toEqual([]);
  });

  it("a receipt carrying a past expiresAt fails even with no flags", async () => {
    await mintAndWrite({
      issuedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T01:00:00.000Z",
    });

    const { deps, bag } = captureDeps();
    await runVerify({ receipt: receiptPath, key: keysetPath }, deps);
    expect(bag.exitCode).toBe(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-expired reason=/);
  });
});
