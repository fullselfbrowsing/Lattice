import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createInMemorySigner,
  createReceipt,
  generateEd25519KeyPairJwk,
  receiptCid,
  type CreateReceiptInput,
  type ReceiptEnvelope,
} from "@full-self-browsing/lattice";

const binPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runBin(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 10_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("lattice CLI bin smoke test", () => {
  it("prints help and exits 0 for --help", () => {
    const { status, stdout } = runBin(["--help"]);
    const help = stripAnsi(stdout);
    expect(status).toBe(0);
    expect(help).toMatch(/repro/);
    expect(help).toMatch(/verify/);
    expect(help).toMatch(/eval/);
    expect(help).toMatch(/receipt/);
    expect(help).toMatch(/diagnostics/);
    expect(help).toMatch(new RegExp(`\\(lattice v${escapeRegExp(pkg.version)}\\)`));
    expect(help).not.toContain("v0.0.0");
  });

  it("prints help for receipt diff and diagnostics command groups", () => {
    const receiptHelp = stripAnsi(runBin(["receipt", "--help"]).stdout);
    const diagnosticsHelp = stripAnsi(runBin(["diagnostics", "--help"]).stdout);
    const lmStudioHelp = stripAnsi(
      runBin(["diagnostics", "lm-studio", "--help"]).stdout,
    );

    expect(receiptHelp).toMatch(/diff/);
    expect(receiptHelp).toMatch(/verify-chain/);
    expect(diagnosticsHelp).toMatch(/lm-studio/);
    expect(lmStudioHelp).toMatch(/--events/);
  });

  // Plan 11-03 replaced the repro stub with the real handler. Calling repro
  // with a bare id against an empty cwd exercises the load-failure branch
  // (exit 2) with a `FAIL kind=...-load-failed` message — distinct from the
  // earlier not-implemented stub. The default fixtures dir / receipts dir
  // are usually absent during CI, so receipt-load-failed (or keyset-load-failed
  // if the default keyset path happens to exist) is the most common outcome;
  // any *-load-failed kind is acceptable here. Exit code 2 is still the
  // contract.
  it("repro subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
    const { status, stderr } = runBin(["repro", "abc"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/^FAIL kind=(receipt|keyset)-load-failed reason=/m);
  });

  // Plan 11-02 replaces the verify stub with the real handler. Pointing at a
  // non-existent receipt path now exercises the load-failure branch (exit 2)
  // with a `FAIL kind=...-load-failed` message — distinct from the
  // not-implemented stub. The default keyset path is usually absent during
  // CI, so keyset-load-failed is the most common outcome; either *-load-failed
  // kind is acceptable here. Exit code 2 is still the contract.
  it("verify subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
    const { status, stderr } = runBin(["verify", "./fixture.json"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/^FAIL kind=(keyset|receipt)-load-failed reason=/m);
  });

  // Plan 12-03 adds the `eval` subcommand. Running it in an empty cwd
  // (no .lattice/, no keyset) MUST exit 2 with a FAIL kind=... message —
  // any of receipt-/keyset-/baseline-/session- prefixed kinds with
  // -missing/-malformed/-failed suffix is acceptable; the contract is the
  // exit code and the FAIL line shape.
  it("eval subcommand exits 2 with a FAIL load-failed message when paths are absent", () => {
    const { status, stderr } = runBin(["eval"]);
    expect(status).toBe(2);
    expect(stderr).toMatch(
      /^FAIL kind=(receipt|keyset|baseline|session)-(missing|malformed|failed)/m,
    );
  });
});

function receiptInput(overrides: Partial<CreateReceiptInput> = {}): CreateReceiptInput {
  return {
    runId: "run-cli-bin",
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

// The handler tests call runReceiptVerifyChain/runVerify with typed args;
// these go through the built binary so the citty flag mapping is covered.
describe("lattice CLI bin — verify-chain and verify policy flags", () => {
  let sandbox: string;
  let keysetPath: string;
  let openDir: string;
  let closedDir: string;
  let subsetDir: string;
  let receiptPath: string;

  async function writeDir(dir: string, envelopes: readonly ReceiptEnvelope[]): Promise<void> {
    await mkdir(dir, { recursive: true });
    for (const [index, envelope] of envelopes.entries()) {
      await writeFile(join(dir, `${index}.json`), JSON.stringify(envelope), "utf8");
    }
  }

  beforeAll(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-cli-bin-"));
    const kid = "cli-bin-key";
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
    keysetPath = join(sandbox, "keyset.json");
    await writeFile(keysetPath, JSON.stringify([{ kid, publicKeyJwk, state: "active" }]), "utf8");

    const openRoot = await createReceipt(receiptInput({ stepName: "root" }), signer);
    const openChild = await createReceipt(
      receiptInput({ parentReceiptCid: await receiptCid(openRoot), stepName: "child" }),
      signer,
    );
    openDir = join(sandbox, "open");
    await writeDir(openDir, [openRoot, openChild]);

    const root = await createReceipt(
      receiptInput({ stepName: "crew-start:lead", chainClosure: "member-cids" }),
      signer,
    );
    const rootCid = await receiptCid(root);
    const children = [
      await createReceipt(receiptInput({ parentReceiptCid: rootCid, stepName: "crew-agent-completion:a" }), signer),
      await createReceipt(receiptInput({ parentReceiptCid: rootCid, stepName: "crew-agent-completion:b" }), signer),
    ];
    const memberCids = [rootCid, ...(await Promise.all(children.map((child) => receiptCid(child))))].sort();
    const closer = await createReceipt(
      receiptInput({ parentReceiptCid: rootCid, stepName: "crew-close:lead", chainMemberCids: memberCids }),
      signer,
    );
    closedDir = join(sandbox, "closed");
    await writeDir(closedDir, [root, ...children, closer]);
    subsetDir = join(sandbox, "subset");
    await writeDir(subsetDir, [root, children[0]!, closer]);

    receiptPath = join(sandbox, "single.json");
    await writeFile(receiptPath, JSON.stringify(openRoot), "utf8");
  });

  afterAll(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  it("--require-closure fails an open chain with count-mismatch (exit 1)", () => {
    const plain = runBin(["receipt", "verify-chain", openDir, "--key", keysetPath]);
    expect(plain.status).toBe(0);
    expect(plain.stderr).toMatch(/^WARN tail-truncation-unchecked: /mu);

    const required = runBin(["receipt", "verify-chain", openDir, "--key", keysetPath, "--require-closure"]);
    expect(required.status).toBe(1);
    expect(required.stdout).toBe("");
    expect(required.stderr).toMatch(/^FAIL kind=count-mismatch reason=requireClosure/mu);

    // Flag before the positional maps the same way.
    const flagFirst = runBin(["receipt", "verify-chain", "--require-closure", "--key", keysetPath, openDir]);
    expect(flagFirst.status).toBe(1);
    expect(flagFirst.stderr).toMatch(/^FAIL kind=count-mismatch reason=requireClosure/mu);

    const closed = runBin(["receipt", "verify-chain", closedDir, "--key", keysetPath, "--require-closure"]);
    expect(closed.status).toBe(0);
    expect(closed.stdout).toMatch(/^OK root=sha256:[0-9a-f]{64} links=4$/mu);
  });

  it("--partial accepts a disclosed subset and keeps WARN closure-partial under --quiet", () => {
    const strict = runBin(["receipt", "verify-chain", subsetDir, "--key", keysetPath]);
    expect(strict.status).toBe(1);
    expect(strict.stderr).toMatch(/^FAIL kind=count-mismatch reason=.*dropped/mu);

    const partial = runBin(["receipt", "verify-chain", subsetDir, "--key", keysetPath, "--partial", "--quiet"]);
    expect(partial.status).toBe(0);
    expect(partial.stdout).toMatch(/^OK root=sha256:[0-9a-f]{64} links=3$/mu);
    expect(partial.stderr.trim().split("\n")).toEqual([
      expect.stringMatching(/^WARN closure-partial: .*1 member/u),
    ]);
  });

  it("--quiet drops INFO lines for verify-chain and verify, and WARN-free output stays empty", () => {
    const loud = runBin(["receipt", "verify-chain", closedDir, "--key", keysetPath]);
    expect(loud.status).toBe(0);
    expect(loud.stderr).toMatch(/^INFO [a-z-]+: /mu);
    expect(loud.stderr).not.toMatch(/^WARN /mu);

    const quiet = runBin(["receipt", "verify-chain", closedDir, "--key", keysetPath, "--quiet"]);
    expect(quiet.status).toBe(0);
    expect(quiet.stderr).toBe("");

    const verifyLoud = runBin(["verify", receiptPath, "--key", keysetPath]);
    expect(verifyLoud.status).toBe(0);
    expect(verifyLoud.stderr).toMatch(/^INFO audience-absent: /mu);

    const verifyQuiet = runBin(["verify", "--quiet", receiptPath, "--key", keysetPath]);
    expect(verifyQuiet.status).toBe(0);
    expect(verifyQuiet.stdout).toMatch(/^OK kid=cli-bin-key verdict=success$/mu);
    expect(verifyQuiet.stderr).toBe("");
  });
});
