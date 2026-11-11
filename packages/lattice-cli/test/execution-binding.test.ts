import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemorySigner, createReceipt, generateEd25519KeyPairJwk } from "@full-self-browsing/lattice";
import { runVerify } from "../src/commands/verify.js";
import { buildVerifyOptions } from "../src/receipt/verify-options.js";

const a = "a".repeat(64);
const b = "b".repeat(64);

describe("CLI execution binding expectations", () => {
  it("maps valid options without sorting or deduplicating request attempts", () => {
    expect(buildVerifyOptions({ taskHash: a, policyHash: b, requestHashes: `${a},${b},${a}` })).toEqual({
      ok: true, options: { expectedTaskHash: a, expectedPolicyHash: b, expectedProviderRequestHashes: [a, b, a] },
    });
  });
  it.each([{ taskHash: "bad" }, { policyHash: "A".repeat(64) }, { requestHashes: "" }, { requestHashes: `${a},` }])("rejects malformed digest options %j", (options) => {
    expect(buildVerifyOptions(options).ok).toBe(false);
  });
  it("checks supplied digest expectations and returns a typed CLI mismatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lattice-binding-"));
    try {
      const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
      const signer = createInMemorySigner(privateKeyJwk, { kid: "cli-binding", publicKeyJwk });
      const envelope = await createReceipt({
        runId: "run", model: { requested: "fake", observed: null },
        route: { providerId: "fake", capabilityId: "fake", attemptNumber: 2 },
        usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        contractVerdict: "success", contractHash: null, inputHashes: [], outputHash: null,
        taskHash: a, policyHash: b, providerRequestHashes: [a, b],
      }, signer);
      const receipt = join(directory, "receipt.json");
      const key = join(directory, "key.json");
      await writeFile(receipt, JSON.stringify(envelope));
      await writeFile(key, JSON.stringify([{ kid: signer.kid, publicKeyJwk, state: "active" }]));
      const out: string[] = [];
      const err: string[] = [];
      let exitCode: number | undefined;
      const deps = { stdout: (line: string) => { out.push(line); }, stderr: (line: string) => { err.push(line); }, exit: (code: number) => { exitCode = code; } };
      await runVerify({ receipt, key, taskHash: a, policyHash: b, requestHashes: `${a},${b}` }, deps);
      expect(exitCode).toBe(0);
      expect(out[0]).toContain("OK");
      await runVerify({ receipt, key, taskHash: b }, deps);
      expect(exitCode).toBe(1);
      expect(err.join("\n")).toContain("execution-binding-mismatch");
      await runVerify({ receipt, key, requestHashes: `${b},${a}` }, deps);
      expect(exitCode).toBe(1);
      await runVerify({ receipt, key, taskHash: "invalid" }, deps);
      expect(exitCode).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
