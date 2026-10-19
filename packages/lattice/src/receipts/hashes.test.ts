import { describe, expect, it } from "vitest";

import { artifact } from "../artifacts/artifact.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";

import { hashInputArtifacts, hashOutputForReceipt } from "./hashes.js";

describe("hashOutputForReceipt", () => {
  it("equals fingerprintArtifactValue over JSON.stringify(value) and over the raw object (byte-identical to the historical ai.run path)", async () => {
    const output = { text: "hello", nested: { n: 1, list: [1, 2, 3] } };
    const viaString = (await fingerprintArtifactValue(JSON.stringify(output)))?.value;
    const viaObject = (await fingerprintArtifactValue(output))?.value;
    const viaHelper = await hashOutputForReceipt(output);
    expect(viaHelper).toBe(viaString);
    expect(viaHelper).toBe(viaObject);
    expect(viaHelper).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("hashes a plain string through its JSON-quoted form, not its raw bytes", async () => {
    const quoted = (await fingerprintArtifactValue('"plain"'))?.value;
    const raw = (await fingerprintArtifactValue("plain"))?.value;
    const result = await hashOutputForReceipt("plain");
    expect(result).toBe(quoted);
    expect(result).not.toBe(raw);
  });

  it("returns null for undefined and for values with no JSON form", async () => {
    expect(await hashOutputForReceipt(undefined)).toBeNull();
    expect(await hashOutputForReceipt(() => 1)).toBeNull();
    expect(await hashOutputForReceipt(Symbol("s"))).toBeNull();
  });

  it("returns null instead of throwing for values JSON.stringify rejects (review follow-up round 3)", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const throwingToJson = { toJSON: () => { throw new Error("no json for you"); } };
    await expect(hashOutputForReceipt({ n: 10n })).resolves.toBeNull();
    await expect(hashOutputForReceipt(circular)).resolves.toBeNull();
    await expect(hashOutputForReceipt(throwingToJson)).resolves.toBeNull();
    await expect(hashOutputForReceipt(10n)).resolves.toBeNull();
  });

  it("is deterministic", async () => {
    const a = await hashOutputForReceipt({ answer: "x" });
    const b = await hashOutputForReceipt({ answer: "x" });
    expect(a).toBe(b);
  });
});

describe("hashInputArtifacts", () => {
  it("returns one hex digest per artifact in declaration order", async () => {
    const first = artifact.text("alpha");
    const second = artifact.text("beta");
    const hashes = await hashInputArtifacts([first, second]);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toBe((await fingerprintArtifactValue("alpha"))?.value);
    expect(hashes[1]).toBe((await fingerprintArtifactValue("beta"))?.value);
  });

  it('produces "" for artifacts whose value cannot be fingerprinted so the length is preserved', async () => {
    const valueless = { ...artifact.text("gamma"), value: undefined } as unknown as ReturnType<typeof artifact.text>;
    const hashes = await hashInputArtifacts([artifact.text("alpha"), valueless]);
    expect(hashes).toHaveLength(2);
    expect(hashes[1]).toBe("");
  });

  it("returns an empty array for no artifacts", async () => {
    expect(await hashInputArtifacts([])).toEqual([]);
  });
});
