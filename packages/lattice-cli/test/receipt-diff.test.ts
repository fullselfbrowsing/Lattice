import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { runReceiptDiff, type ReceiptDeps } from "../src/commands/receipt.js";
import type { ReceiptDiffReport } from "../src/receipt/diff.js";

interface CaptureBag {
  readonly stdout: string[];
  readonly stderr: string[];
  exitCode: number | null;
}

function captureDeps(): { readonly deps: ReceiptDeps; readonly bag: CaptureBag } {
  const bag: CaptureBag = { stdout: [], stderr: [], exitCode: null };
  return {
    bag,
    deps: {
      stdout: (line) => bag.stdout.push(line),
      stderr: (line) => bag.stderr.push(line),
      exit: (code) => {
        bag.exitCode = code;
      },
    },
  };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "lattice-receipt/v1.3",
    receiptId: "receipt-a",
    runId: "run-a",
    issuedAt: "2026-06-16T00:00:00.000Z",
    kid: "kid-a",
    model: { requested: "gpt-4.1", observed: "gpt-4.1-2026-06" },
    route: { providerId: "openai", capabilityId: "gpt-4.1", attemptNumber: 0 },
    usage: { promptTokens: 10, completionTokens: 5, costUsd: "0.001" },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: ["sha256:input"],
    outputHash: "sha256:output",
    redactionPolicyId: "default",
    redactions: [],
    parentReceiptCid: "sha256:parent",
    lineageMerkleRoot: "sha256:lineage",
    ...overrides,
  };
}

function envelope(
  payloadBody: unknown,
  signatures: readonly { readonly keyid: string; readonly sig: string }[] = [
    { keyid: "kid-a", sig: "signature-a" },
  ],
): {
  readonly payloadType: "application/vnd.lattice.receipt+json";
  readonly payload: string;
  readonly signatures: readonly { readonly keyid: string; readonly sig: string }[];
} {
  return {
    payloadType: "application/vnd.lattice.receipt+json",
    payload: Buffer.from(JSON.stringify(payloadBody)).toString("base64"),
    signatures,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value), "utf8");
}

describe("lattice receipt diff", () => {
  let sandbox: string;
  let leftPath: string;
  let rightPath: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-receipt-diff-"));
    leftPath = join(sandbox, "left.json");
    rightPath = join(sandbox, "right.json");
  });

  it("exits 0 when compared receipt fields match", async () => {
    const receipt = envelope(body());
    await writeJson(leftPath, receipt);
    await writeJson(rightPath, receipt);

    const { deps, bag } = captureDeps();
    await runReceiptDiff({ left: leftPath, right: rightPath }, deps);

    expect(bag.exitCode).toBe(0);
    const report = JSON.parse(bag.stdout[0]!) as ReceiptDiffReport;
    expect(report.version).toBe("lattice-receipt-diff/v1");
    expect(report.equal).toBe(true);
    expect(report.differences).toEqual([]);
  });

  it("exits 1 and reports required model, route, usage, hash, lineage, parent, and signature differences", async () => {
    await writeJson(leftPath, envelope(body()));
    await writeJson(
      rightPath,
      envelope(
        body({
          model: { requested: "claude-sonnet-4", observed: "claude-sonnet-4" },
          route: {
            providerId: "anthropic",
            capabilityId: "claude-sonnet-4",
            attemptNumber: 1,
          },
          usage: { promptTokens: 11, completionTokens: 6, costUsd: "0.002" },
          inputHashes: ["sha256:other-input"],
          outputHash: "sha256:other-output",
          parentReceiptCid: "sha256:other-parent",
          lineageMerkleRoot: "sha256:other-lineage",
        }),
        [{ keyid: "kid-b", sig: "signature-b" }],
      ),
    );

    const { deps, bag } = captureDeps();
    await runReceiptDiff({ left: leftPath, right: rightPath }, deps);

    expect(bag.exitCode).toBe(1);
    const report = JSON.parse(bag.stdout[0]!) as ReceiptDiffReport;
    expect(report.equal).toBe(false);
    const paths = report.differences.map((d) => d.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "model.requested",
        "route.providerId",
        "usage.promptTokens",
        "hashes.inputHashes",
        "hashes.outputHash",
        "receipt.parentReceiptCid",
        "receipt.lineageMerkleRoot",
        "signatures.keyids",
        "signatures.values",
      ]),
    );
  });

  it("detects contractVerdict-only difference", async () => {
    await writeJson(leftPath, envelope(body({ contractVerdict: "success" })));
    await writeJson(rightPath, envelope(body({ contractVerdict: "tripwire-violated" })));

    const { deps, bag } = captureDeps();
    await runReceiptDiff({ left: leftPath, right: rightPath }, deps);

    expect(bag.exitCode).toBe(1);
    const report = JSON.parse(bag.stdout[0]!) as ReceiptDiffReport;
    expect(report.equal).toBe(false);
    const paths = report.differences.map((d) => d.path);
    expect(paths).toContain("verdict.contractVerdict");
  });

  it("detects contractHash-only difference", async () => {
    await writeJson(leftPath, envelope(body({ contractHash: null })));
    await writeJson(rightPath, envelope(body({ contractHash: "sha256:abc" })));

    const { deps, bag } = captureDeps();
    await runReceiptDiff({ left: leftPath, right: rightPath }, deps);

    expect(bag.exitCode).toBe(1);
    const report = JSON.parse(bag.stdout[0]!) as ReceiptDiffReport;
    expect(report.equal).toBe(false);
    const paths = report.differences.map((d) => d.path);
    expect(paths).toContain("verdict.contractHash");
  });

  it("detects modelClass-only difference", async () => {
    await writeJson(leftPath, envelope(body({ modelClass: "reasoning" })));
    await writeJson(rightPath, envelope(body({ modelClass: "chat" })));

    const { deps, bag } = captureDeps();
    await runReceiptDiff({ left: leftPath, right: rightPath }, deps);

    expect(bag.exitCode).toBe(1);
    const report = JSON.parse(bag.stdout[0]!) as ReceiptDiffReport;
    expect(report.equal).toBe(false);
    const paths = report.differences.map((d) => d.path);
    expect(paths).toContain("model.modelClass");
  });

  it("exits 2 for malformed receipt payloads and emits no JSON", async () => {
    await writeJson(leftPath, {
      payloadType: "application/vnd.lattice.receipt+json",
      payload: Buffer.from("not json").toString("base64"),
      signatures: [],
    });
    await writeJson(rightPath, envelope(body()));

    const { deps, bag } = captureDeps();
    await runReceiptDiff({ left: leftPath, right: rightPath }, deps);

    expect(bag.exitCode).toBe(2);
    expect(bag.stdout).toEqual([]);
    expect(bag.stderr[0]).toMatch(/^FAIL kind=receipt-diff-left-decode reason=/);
  });
});
