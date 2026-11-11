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

interface ClosedChainFixture extends ChainFixture {
  readonly closer: ReceiptEnvelope;
}

/** A crew-shaped closed tree: the root declares chainClosure, the closer lists the rest. */
async function makeClosedChainFixture(childCount = 2): Promise<ClosedChainFixture> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const kid = "chain-cli-closed";
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const root = await createReceipt(
    minimalInput({ stepName: "crew-start:lead", chainClosure: "member-cids" }),
    signer,
  );
  const rootCid = await receiptCid(root);
  const children: ReceiptEnvelope[] = [];
  for (let i = 0; i < childCount; i += 1) {
    children.push(
      await createReceipt(
        minimalInput({ parentReceiptCid: rootCid, stepName: `crew-agent-completion:c${i}` }),
        signer,
      ),
    );
  }
  const memberCids = [rootCid, ...(await Promise.all(children.map((c) => receiptCid(c))))].sort();
  const closer = await createReceipt(
    minimalInput({
      parentReceiptCid: rootCid,
      stepName: "crew-close:lead",
      chainMemberCids: memberCids,
    }),
    signer,
  );
  return { signer, publicKeyJwk, kid, root, rootCid, children, closer };
}

/** RFC 8785 for the ASCII-only, integer-only bodies these fixtures produce. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Re-sign an envelope with one body field replaced. createReceipt refuses
 * malformed closure fields, so a buggy or hostile issuer is simulated here.
 */
async function resignWith(
  env: ReceiptEnvelope,
  signer: ReceiptSigner,
  field: string,
  value: unknown,
): Promise<ReceiptEnvelope> {
  const body = {
    ...(JSON.parse(Buffer.from(env.payload, "base64").toString("utf8")) as Record<string, unknown>),
    [field]: value,
  };
  const payload = Buffer.from(canonicalJson(body), "utf8").toString("base64");
  const type = env.payloadType;
  const pae = new TextEncoder().encode(`DSSEv1 ${type.length} ${type} ${payload.length} ${payload}`);
  const sig = Buffer.from(await signer.sign(pae)).toString("base64");
  return { payloadType: type, payload, signatures: [{ keyid: signer.kid, sig }] };
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
    expect(bag.stderr.filter((line) => line.startsWith("WARN "))).toEqual([
      expect.stringMatching(/^WARN tail-truncation-unchecked: /u),
    ]);
    expect(bag.stderr.every((line) => /^(WARN|INFO) [a-z-]+: /u.test(line))).toBe(true);
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

  it("verifies a closed chain with no tail-truncation WARN, and --quiet leaves stderr empty", async () => {
    const fixture = await makeClosedChainFixture(2);
    await writeFixture(fixture, {
      "0-root.json": fixture.root,
      "1-c0.json": fixture.children[0]!,
      "2-c1.json": fixture.children[1]!,
      "3-close.json": fixture.closer,
    });

    const loud = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, loud.deps);
    expect(loud.bag.exitCode).toBe(0);
    expect(loud.bag.stdout[0]).toMatch(/^OK root=sha256:[0-9a-f]{64} links=4$/);
    expect(loud.bag.stderr.filter((line) => line.startsWith("WARN "))).toEqual([]);
    expect(loud.bag.stderr.length).toBeGreaterThan(0);
    expect(loud.bag.stderr.every((line) => line.startsWith("INFO "))).toBe(true);

    const quiet = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, requireClosure: true, quiet: true },
      quiet.deps,
    );
    expect(quiet.bag.exitCode).toBe(0);
    expect(quiet.bag.stderr).toEqual([]);
  });

  it("rejects a truncated closed chain without --expect-count", async () => {
    const fixture = await makeClosedChainFixture(2);
    await writeFixture(fixture, {
      "0-root.json": fixture.root,
      "1-c0.json": fixture.children[0]!,
      "3-close.json": fixture.closer,
    });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, deps);
    expect(bag.exitCode).toBe(1);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=count-mismatch reason=.*dropped/u);
  });

  it("--partial accepts a disclosed subset that keeps the closer and prints WARN closure-partial, even under --quiet", async () => {
    const fixture = await makeClosedChainFixture(3);
    await writeFixture(fixture, {
      "0-root.json": fixture.root,
      "1-c0.json": fixture.children[0]!,
      "3-close.json": fixture.closer,
    });

    const partial = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath, partial: true }, partial.deps);
    expect(partial.bag.exitCode).toBe(0);
    expect(partial.bag.stdout[0]).toMatch(/ links=3$/u);
    expect(partial.bag.stderr).toContainEqual(expect.stringMatching(/^WARN closure-partial: .*2 member/u));

    const quiet = captureDeps();
    await runReceiptVerifyChain(
      { dir: receiptsDir, key: keysetPath, partial: true, quiet: true },
      quiet.deps,
    );
    expect(quiet.bag.exitCode).toBe(0);
    expect(quiet.bag.stderr).toEqual([expect.stringMatching(/^WARN closure-partial: .*2 member/u)]);
  });

  it("--require-closure fails a chain that declares no closure", async () => {
    const fixture = await makeChainFixture(2);
    await writeFixture(fixture, {
      "root.json": fixture.root,
      "c1.json": fixture.children[0]!,
      "c2.json": fixture.children[1]!,
    });

    const { deps, bag } = captureDeps();
    await runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath, requireClosure: true }, deps);
    expect(bag.exitCode).toBe(1);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=count-mismatch reason=requireClosure/u);
  });

  it.each([
    ["chainMemberCids", "sha256:abc"],
    ["chainMemberCids", null],
    ["chainMemberCids", { a: 1 }],
    ["chainClosure", "merkle-v2"],
  ])("prints a typed FAIL line, not a stack trace, for a closer whose %s is %j", async (field, value) => {
    const fixture = await makeClosedChainFixture(1);
    const malformed =
      field === "chainClosure"
        ? await resignWith(fixture.root, fixture.signer, field, value)
        : await resignWith(fixture.closer, fixture.signer, field, value);
    await writeFixture(fixture, {
      "0-root.json": field === "chainClosure" ? malformed : fixture.root,
      "1-c0.json": fixture.children[0]!,
      "3-close.json": field === "chainClosure" ? fixture.closer : malformed,
    });

    const { deps, bag } = captureDeps();
    await expect(
      runReceiptVerifyChain({ dir: receiptsDir, key: keysetPath }, deps),
    ).resolves.toBeUndefined();
    expect(bag.exitCode).toBe(1);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr).toHaveLength(1);
    expect(bag.stderr[0]).toMatch(
      /^FAIL kind=link-invalid reason=receipt\[\d\] failed verification: version-mismatch: /u,
    );
    expect(bag.stderr[0]).not.toContain("TypeError");
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
