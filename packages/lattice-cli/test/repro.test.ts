/**
 * Integration tests for `lattice repro` exercised via direct handler
 * invocation (mock argv) — no spawnSync, per CONTEXT.md test-strategy.
 *
 * Drift detection rationale (Test 2): `replayOffline` is deterministic by
 * construction over a verified envelope, so a real fixture set will ALWAYS
 * reproduce the original outputHash. To exercise the drift branch we use a
 * vitest module mock on `lattice` to swap `replayOffline` with a function
 * that returns synthetic outputs. The mock is module-scoped via vi.mock at
 * the top of the file.
 */

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  artifact,
  createAI,
  createFakeProvider,
  createInMemorySigner,
  generateEd25519KeyPairJwk,
  verifyReceipt,
  type ArtifactInput,
  type KeyEntry,
  type ReceiptEnvelope,
} from "lattice";

import { runRepro } from "../src/commands/repro.js";

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

interface ReproFixture {
  readonly envelope: ReceiptEnvelope;
  readonly outputs: Record<string, unknown>;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
}

async function makeReproFixture(
  kid = "lattice-cli-repro-test",
  artifacts: readonly ArtifactInput[] = [],
): Promise<ReproFixture> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const ai = createAI({ providers: [createFakeProvider()], signer });
  const result = await ai.run({
    task: "lattice-cli-repro-fixture",
    outputs: { text: "text" as const },
    artifacts,
  });
  if (!result.ok) {
    throw new Error(
      `Expected ai.run to succeed for fixture; got error kind=${result.error.kind}`,
    );
  }
  if (result.receipt === undefined) {
    throw new Error("Expected ai.run to emit a receipt when signer is set");
  }
  return {
    envelope: result.receipt,
    outputs: result.outputs as Record<string, unknown>,
    publicKeyJwk,
    kid,
  };
}

function keyEntry(kid: string, jwk: JsonWebKey, state: KeyEntry["state"]): KeyEntry {
  return { kid, publicKeyJwk: jwk, state };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("lattice repro handler — runRepro(args, deps)", () => {
  let sandbox: string;
  let savedCwd: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-repro-"));
    savedCwd = process.cwd();
    process.chdir(sandbox);
    vi.resetModules();
    vi.doUnmock("lattice");
  });

  afterEach(() => {
    process.chdir(savedCwd);
    vi.doUnmock("lattice");
    vi.restoreAllMocks();
  });

  /**
   * Helper: writes the receipt + keyset + fixture artifact bytes inside the
   * cwd-rooted sandbox. Returns the paths the handler needs.
   */
  async function seedSandbox(
    fixture: ReproFixture,
    options: { receiptName?: string; receiptsSubdir?: string; fixtureBytes?: Uint8Array | null } = {},
  ): Promise<{
    receiptPath: string;
    keysetPath: string;
    fixturesDir: string;
    receiptsDir: string;
  }> {
    const receiptsDir = join(sandbox, options.receiptsSubdir ?? ".lattice/receipts");
    const fixturesDir = join(sandbox, ".lattice/fixtures");
    await mkdir(receiptsDir, { recursive: true });
    await mkdir(fixturesDir, { recursive: true });
    const receiptPath = join(receiptsDir, `${options.receiptName ?? "receipt"}.json`);
    const keysetPath = join(sandbox, "keyset.json");
    await writeJson(receiptPath, fixture.envelope);
    await writeJson(keysetPath, [keyEntry(fixture.kid, fixture.publicKeyJwk, "active")]);

    // Decode body to learn inputHashes so we can place real fixture bytes
    // at <fixturesDir>/<hash>.bin. We use a side-channel verifyReceipt for
    // this — same trick verify.test.ts uses.
    const verified = await verifyReceipt(fixture.envelope, {
      lookup: () => ({
        kid: fixture.kid,
        publicKeyJwk: fixture.publicKeyJwk,
        state: "active" as const,
      }),
    });
    if (!verified.ok) {
      throw new Error(`side-channel verify failed: ${verified.error.kind}`);
    }
    const inputHashes = verified.body.inputHashes;
    if (options.fixtureBytes !== null) {
      const bytes = options.fixtureBytes ?? new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      for (const h of inputHashes) {
        if (h === "") continue;
        await writeFile(join(fixturesDir, `${h}.bin`), bytes);
      }
    }
    return { receiptPath, keysetPath, fixturesDir, receiptsDir };
  }

  it("Test 1 (match): mocked replayOffline returns the receipt's outputs -> verdict=match, exit 0", async () => {
    const fixture = await makeReproFixture("match-kid");
    const { keysetPath, fixturesDir, receiptPath } = await seedSandbox(fixture);

    // Mock replayOffline to return the same outputs the original run produced,
    // so JSON.stringify(outputs) hashes to body.outputHash.
    vi.doMock("lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("lattice")>();
      return {
        ...mod,
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });
    const { runRepro: mockedRunRepro } = await import("../src/commands/repro.js");

    const { deps, bag } = captureDeps();
    await mockedRunRepro(
      { target: receiptPath, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(0);
    expect(bag.stderr).toEqual([]);
    const stdout = bag.stdout.join("\n");
    expect(stdout).toMatch(/receiptId=/);
    expect(stdout).toMatch(/kid=match-kid/);
    expect(stdout).toMatch(/contractVerdict=success/);
    expect(stdout).toMatch(/model\.requested=/);
    expect(stdout).toMatch(/route\.providerId=/);
    expect(stdout).toMatch(/route\.capabilityId=/);
    expect(stdout).toMatch(/usage\.costUsd=/);
    expect(stdout).toMatch(/verdict=match/);
  });

  it("Test 2 (drift): mocked replayOffline returns different outputs -> verdict=drift, exit 1", async () => {
    const fixture = await makeReproFixture("drift-kid");
    const { keysetPath, fixturesDir, receiptPath } = await seedSandbox(fixture);

    vi.doMock("lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("lattice")>();
      return {
        ...mod,
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: { text: "DRIFTED-PAYLOAD-NOT-WHAT-WAS-SIGNED" },
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });
    const { runRepro: mockedRunRepro } = await import("../src/commands/repro.js");

    const { deps, bag } = captureDeps();
    await mockedRunRepro(
      { target: receiptPath, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(1);
    const stdout = bag.stdout.join("\n");
    expect(stdout).toMatch(/verdict=drift/);
    expect(stdout).toMatch(/expected\.outputHash=/);
    expect(stdout).toMatch(/actual\.outputHash=/);
  });

  it("Test 3 (verify-failed): tampered signature -> exit 2 with FAIL kind=verify-failed", async () => {
    const fixture = await makeReproFixture("verify-fail-kid");
    // Seed with the valid envelope (side-channel verify succeeds), THEN
    // overwrite the on-disk receipt with a tampered signature. This avoids
    // tripping the seedSandbox helper's own side-channel verify.
    const { keysetPath, fixturesDir, receiptPath } = await seedSandbox(fixture);
    const sig = fixture.envelope.signatures[0]!;
    const sigBytes = Buffer.from(sig.sig, "base64");
    sigBytes[0] = (sigBytes[0]! ^ 0x01) & 0xff;
    const tampered: ReceiptEnvelope = {
      ...fixture.envelope,
      signatures: [{ keyid: sig.keyid, sig: sigBytes.toString("base64") }],
    };
    await writeJson(receiptPath, tampered);

    const { deps, bag } = captureDeps();
    await runRepro(
      { target: receiptPath, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(2);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=verify-failed reason=/);
  });

  it("Test 4 (artifact-load-failed): missing fixture file -> exit 2 with FAIL kind=artifact-load-failed", async () => {
    // Use an input artifact so the receipt has a non-empty inputHashes —
    // otherwise the materializer has nothing to load and we'd never hit
    // the artifact-load-failed branch.
    const fixture = await makeReproFixture("missing-art-kid", [
      artifact.text("input-bytes-for-fixture-load-test"),
    ]);
    const { keysetPath, fixturesDir, receiptPath } = await seedSandbox(fixture, {
      fixtureBytes: null,
    });

    const { deps, bag } = captureDeps();
    await runRepro(
      { target: receiptPath, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(2);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=artifact-load-failed reason=/);
  });

  it("Test 5 (receipt-load-failed): nonexistent receipt path -> exit 2 with FAIL kind=receipt-load-failed", async () => {
    const fixture = await makeReproFixture("rl-kid");
    const { keysetPath, fixturesDir } = await seedSandbox(fixture);
    const missingReceipt = join(sandbox, "does-not-exist.json");

    const { deps, bag } = captureDeps();
    await runRepro(
      { target: missingReceipt, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(2);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-load-failed reason=/);
  });

  it("Test 6 (id resolution): bare id resolves to .lattice/receipts/<id>.json relative to cwd", async () => {
    const fixture = await makeReproFixture("id-resolve-kid");
    const { keysetPath, fixturesDir } = await seedSandbox(fixture, {
      receiptName: "abc123",
    });

    // Mock replayOffline so we don't depend on real replay to verify id resolution worked.
    vi.doMock("lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("lattice")>();
      return {
        ...mod,
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });
    const { runRepro: mockedRunRepro } = await import("../src/commands/repro.js");

    const { deps, bag } = captureDeps();
    await mockedRunRepro(
      { target: "abc123", key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    // Bare id "abc123" must resolve to <cwd>/.lattice/receipts/abc123.json.
    expect(bag.exitCode).toBe(0);
    expect(bag.stdout.join("\n")).toMatch(/verdict=match/);
  });

  it("Test 7 (no-outputhash receipt): receipt with null outputHash -> exit 2 with kind=receipt-had-no-outputhash", async () => {
    // Build a tripwire-violated receipt by hand (no fake provider tripwire path
    // available; use createReceipt-like flow: we'll re-sign a receipt with
    // outputHash null, which any failure-receipt path produces. Easiest way:
    // run ai.run that fails / outputs nothing -> but the fake provider always
    // succeeds. Instead, we construct a receipt manually via createReceipt is
    // not public... So we'll mock replayOffline to return ok:true but with a
    // receipt body where outputHash is null. The cleanest path: use a real
    // receipt, then re-sign one with outputHash null. Since createReceipt is
    // not exported, we'll use a different approach: use fake provider with a
    // response that omits outputs (tripwire-violated path is the only public
    // way to get outputHash=null and that's far from minimal).
    //
    // Practical alternative: tamper the payload AFTER signing — but that
    // invalidates verify (-> Test 3 path). Instead, we just verify the path
    // works against any contractVerdict by writing a synthetic envelope whose
    // payload decodes to a body with outputHash=null. But signing requires
    // the private key.
    //
    // Cleanest: re-sign manually. Generate keypair + sign canonical body.
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const kid = "no-outputhash-kid";
    const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });

    // Build body with outputHash:null. Use the lattice public canonical/sign
    // path via createReceipt — wait, not public. Use this side-channel:
    // craft a body, canonicalize via JSON.stringify (close enough for the
    // shape test), then sign. The actual `verifyReceipt` canonicalizes
    // independently and will check.
    //
    // Simpler: drive ai.run to success, then RE-CREATE the receipt with
    // outputHash:null by using internal createReceipt? Not public.
    //
    // Real-shot: use a runtime provider response that triggers
    // contractVerdict="tripwire-violated"+ outputHash=null without needing a
    // tripwire. The simplest deterministic path is: trigger contract failure
    // by providing a contract whose tripwire fires on the fake output.
    //
    // We'll skip the receipt manufacturing complexity and use the fact that
    // a "no outputHash" branch should also fire if our handler computes the
    // wrong thing. Instead we mock replayOffline to return outputs that
    // make hash recomputation succeed BUT we tamper with `verifyReceipt` to
    // return body.outputHash=null... which we can't mock cleanly without
    // touching internals.
    //
    // Pragmatic call: this branch is exercised by a unit-style assertion in
    // the handler's logic — we test it via vi.mock on verifyReceipt to
    // return a body with outputHash=null.
    void privateKeyJwk;
    void signer;

    const fixture = await makeReproFixture("nohash-fixture-kid");
    const { keysetPath, fixturesDir, receiptPath } = await seedSandbox(fixture);

    vi.doMock("lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("lattice")>();
      return {
        ...mod,
        verifyReceipt: vi.fn(async () => ({
          ok: true,
          body: {
            version: "lattice-receipt/v1",
            receiptId: "fake-receipt-id",
            runId: "fake-run-id",
            issuedAt: "2026-01-01T00:00:00Z",
            kid,
            model: { requested: "fake", observed: "fake" },
            route: { providerId: "p", capabilityId: "c", attemptNumber: 1 },
            usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
            contractVerdict: "tripwire-violated",
            contractHash: null,
            inputHashes: [] as readonly string[],
            outputHash: null,
            redactionPolicyId: "v1",
            redactions: [] as readonly { path: string; reason: string }[],
          },
          keyState: "active" as const,
        })),
        materializeReplayEnvelope: vi.fn(async () => ({
          kind: "replay-envelope",
          version: 1,
          runtimeVersion: "test",
          catalogVersion: "test",
          createdAt: "2026-01-01T00:00:00Z",
          plan: {
            kind: "execution-plan",
          },
          artifacts: [],
          warnings: [],
          errors: [],
          events: [],
        })),
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: {},
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });
    const { runRepro: mockedRunRepro } = await import("../src/commands/repro.js");

    const { deps, bag } = captureDeps();
    await mockedRunRepro(
      { target: receiptPath, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(2);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-had-no-outputhash reason=/);
  });

  it("Test 8 (redaction discipline): match summary contains no inputHashes substrings", async () => {
    const fixture = await makeReproFixture("redact-kid");
    const { keysetPath, fixturesDir, receiptPath } = await seedSandbox(fixture);

    // Side-channel verify to learn the real inputHashes.
    const verified = await verifyReceipt(fixture.envelope, {
      lookup: () => ({
        kid: fixture.kid,
        publicKeyJwk: fixture.publicKeyJwk,
        state: "active" as const,
      }),
    });
    if (!verified.ok) throw new Error("side-channel verify failed");
    const body = verified.body;

    vi.doMock("lattice", async (importOriginal) => {
      const mod = await importOriginal<typeof import("lattice")>();
      return {
        ...mod,
        replayOffline: vi.fn(async () => ({
          ok: true,
          outputs: fixture.outputs,
          artifacts: [],
          usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          plan: { kind: "execution-plan" },
          events: [],
        })),
      };
    });
    const { runRepro: mockedRunRepro } = await import("../src/commands/repro.js");

    const { deps, bag } = captureDeps();
    await mockedRunRepro(
      { target: receiptPath, key: keysetPath, fixtures: fixturesDir },
      deps,
    );

    expect(bag.exitCode).toBe(0);
    const out = bag.stdout.join("\n");
    // No inputHash substring should appear in the match summary.
    for (const h of body.inputHashes) {
      if (h === "") continue;
      expect(out.includes(h)).toBe(false);
    }
    // The envelope's payload bytes must not leak either.
    expect(out.includes(fixture.envelope.payload)).toBe(false);
    expect(out.includes(fixture.envelope.signatures[0]!.sig)).toBe(false);
  });
});
