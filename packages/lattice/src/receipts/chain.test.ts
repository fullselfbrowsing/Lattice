import { describe, expect, it } from "vitest";

import { canonicalizeReceiptBody } from "./canonical.js";
import { verifyChain } from "./chain.js";
import { receiptCid } from "./cid.js";
import { PAYLOAD_TYPE, base64Encode, buildPae } from "./envelope.js";
import { createMemoryKeySet } from "./keyset.js";
import { createReceipt, type CreateReceiptInput } from "./receipt.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "./sign.js";
import type {
  CapabilityReceiptBody,
  KeySet,
  ReceiptEnvelope,
  ReceiptSigner,
} from "./types.js";

async function makeSigner(
  kid = "chain-key",
): Promise<{ signer: ReceiptSigner; keySet: KeySet }> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keySet = createMemoryKeySet([{ kid, publicKeyJwk, state: "active" }]);
  return { signer, keySet };
}

function minimalInput(overrides: Partial<CreateReceiptInput> = {}): CreateReceiptInput {
  return {
    runId: "run-chain",
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

/** Mint a root plus `childCount` children that all point at the root. */
async function mintTree(
  signer: ReceiptSigner,
  childCount: number,
  overrides: Partial<CreateReceiptInput> = {},
): Promise<{ root: ReceiptEnvelope; children: ReceiptEnvelope[]; rootCid: string }> {
  const root = await createReceipt(minimalInput({ stepName: "crew-start", ...overrides }), signer);
  const rootCid = await receiptCid(root);
  const children: ReceiptEnvelope[] = [];
  for (let i = 0; i < childCount; i += 1) {
    children.push(
      await createReceipt(
        minimalInput({ parentReceiptCid: rootCid, stepName: `child-${i}`, ...overrides }),
        signer,
      ),
    );
  }
  return { root, children, rootCid };
}

function flipSignature(env: ReceiptEnvelope): ReceiptEnvelope {
  const first = env.signatures[0]!;
  const sig = (first.sig.startsWith("A") ? "B" : "A") + first.sig.slice(1);
  return { ...env, signatures: [{ keyid: first.keyid, sig }] };
}

async function signBody(body: CapabilityReceiptBody, signer: ReceiptSigner): Promise<ReceiptEnvelope> {
  const payloadBytes = canonicalizeReceiptBody(body);
  const payload = base64Encode(payloadBytes);
  const pae = buildPae(PAYLOAD_TYPE, payload);
  const sig = await signer.sign(pae);
  return { payloadType: PAYLOAD_TYPE, payload, signatures: [{ keyid: signer.kid, sig: base64Encode(sig) }] };
}

describe("verifyChain — valid trees", () => {
  it("accepts a root with two children and reports count, depth, and cids in input order", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children, rootCid } = await mintTree(signer, 2);
    const result = await verifyChain([root, ...children], keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rootCid).toBe(rootCid);
      expect(result.count).toBe(3);
      expect(result.depth).toBe(1);
      expect(result.cids).toEqual([rootCid, await receiptCid(children[0]!), await receiptCid(children[1]!)]);
    }
  });

  it("is order-independent: a shuffled input yields the same root, count, and depth", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children, rootCid } = await mintTree(signer, 3);
    const shuffled = [children[2]!, root, children[0]!, children[1]!];
    const result = await verifyChain(shuffled, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rootCid).toBe(rootCid);
      expect(result.count).toBe(4);
      expect(result.depth).toBe(1);
      expect(result.cids[1]).toBe(rootCid);
    }
  });

  it("computes depth along a three-level chain", async () => {
    const { signer, keySet } = await makeSigner();
    const root = await createReceipt(minimalInput(), signer);
    const child = await createReceipt(minimalInput({ parentReceiptCid: await receiptCid(root) }), signer);
    const grandchild = await createReceipt(minimalInput({ parentReceiptCid: await receiptCid(child) }), signer);
    const result = await verifyChain([grandchild, child, root], keySet);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.depth).toBe(2);
  });

  it("accepts a lone root with depth 0", async () => {
    const { signer, keySet } = await makeSigner();
    const root = await createReceipt(minimalInput(), signer);
    const result = await verifyChain([root], keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(1);
      expect(result.depth).toBe(0);
    }
  });
});

describe("verifyChain — structural failures", () => {
  it("rejects an empty input as no-root", async () => {
    const { keySet } = await makeSigner();
    const result = await verifyChain([], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-root");
  });

  it("reports no-root when the root was dropped (children only)", async () => {
    const { signer, keySet } = await makeSigner();
    const { children } = await mintTree(signer, 2);
    const result = await verifyChain(children, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-root");
  });

  it("reports multiple-roots when two receipts lack a parent", async () => {
    const { signer, keySet } = await makeSigner();
    const a = await createReceipt(minimalInput(), signer);
    const b = await createReceipt(minimalInput(), signer);
    const result = await verifyChain([a, b], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("multiple-roots");
      expect(result.error.cid).toBe(await receiptCid(b));
    }
  });

  it("reports orphan-link with the offending cid when a parent is not in the set", async () => {
    const { signer, keySet } = await makeSigner();
    const root = await createReceipt(minimalInput(), signer);
    const orphan = await createReceipt(
      minimalInput({ parentReceiptCid: `sha256:${"ef".repeat(32)}` }),
      signer,
    );
    const result = await verifyChain([root, orphan], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("orphan-link");
      expect(result.error.cid).toBe(await receiptCid(orphan));
    }
  });

  it("reports orphan-link when a middle link was dropped (grandchild cannot reach the root)", async () => {
    const { signer, keySet } = await makeSigner();
    const root = await createReceipt(minimalInput(), signer);
    const child = await createReceipt(minimalInput({ parentReceiptCid: await receiptCid(root) }), signer);
    const grandchild = await createReceipt(minimalInput({ parentReceiptCid: await receiptCid(child) }), signer);
    const result = await verifyChain([root, grandchild], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("orphan-link");
  });

  it("rejects a foreign link spliced in from another run as run-id-mismatch", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children, rootCid } = await mintTree(signer, 1);
    const foreign = await createReceipt(
      minimalInput({ runId: "run-other", parentReceiptCid: rootCid }),
      signer,
    );
    const result = await verifyChain([root, ...children, foreign], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("run-id-mismatch");
      expect(result.error.cid).toBe(await receiptCid(foreign));
    }
  });

  it("rejects when expectedRunId does not match", async () => {
    const { signer, keySet } = await makeSigner();
    const { root } = await mintTree(signer, 0);
    const result = await verifyChain([root], keySet, { expectedRunId: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("run-id-mismatch");
  });

  it("rejects the same envelope presented twice as duplicate-cid", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 1);
    const result = await verifyChain([root, children[0]!, children[0]!], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("duplicate-cid");
  });

  it("rejects a tampered child as link-invalid carrying the underlying verify error", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 2);
    const tampered = flipSignature(children[1]!);
    const result = await verifyChain([root, children[0]!, tampered], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("link-invalid");
      expect(result.error.cause?.kind).toBe("signature-invalid");
      expect(result.error.cid).toBe(await receiptCid(tampered));
      expect(result.error.message).toContain("receipt[2]");
    }
  });

  it("never throws on a garbage envelope in the set", async () => {
    const { signer, keySet } = await makeSigner();
    const { root } = await mintTree(signer, 0);
    const garbage: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload: "!!!not-base64!!!",
      signatures: [{ keyid: "chain-key", sig: "AAAA" }],
    };
    const result = await verifyChain([root, garbage], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("link-invalid");
      expect(result.error.cause?.kind).toBe("envelope-malformed");
    }
  });
});

describe("verifyChain — out-of-band commitments", () => {
  it("documents the limitation: a dropped leaf still verifies without expectedCount", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 3);
    const truncated = [root, children[0]!, children[1]!];
    const silent = await verifyChain(truncated, keySet);
    expect(silent.ok).toBe(true);

    const caught = await verifyChain(truncated, keySet, { expectedCount: 4 });
    expect(caught.ok).toBe(false);
    if (!caught.ok) expect(caught.error.kind).toBe("count-mismatch");
  });

  it("rejects a replaced root via expectedRootCid", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children, rootCid } = await mintTree(signer, 1);
    const ok = await verifyChain([root, ...children], keySet, { expectedRootCid: rootCid });
    expect(ok.ok).toBe(true);
    const bad = await verifyChain([root, ...children], keySet, {
      expectedRootCid: `sha256:${"00".repeat(32)}`,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.kind).toBe("root-mismatch");
  });
});

describe("verifyChain — VerifyOptions pass-through", () => {
  it("applies expectedAudience to every link", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 1, { audience: "svc-a" });
    expect((await verifyChain([root, ...children], keySet, { expectedAudience: "svc-a" })).ok).toBe(true);
    const mismatch = await verifyChain([root, ...children], keySet, { expectedAudience: "svc-b" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.kind).toBe("link-invalid");
      expect(mismatch.error.cause?.kind).toBe("audience-mismatch");
    }
  });

  it("applies minVersion to every link, rejecting a hand-signed v1.3 member", async () => {
    const { signer, keySet } = await makeSigner();
    const root = await createReceipt(minimalInput(), signer);
    const rootCid = await receiptCid(root);
    const legacyChild = await signBody(
      {
        version: "lattice-receipt/v1.3",
        receiptId: "00000000-0000-4000-8000-00000000beef",
        runId: "run-chain",
        issuedAt: "2026-01-01T00:00:00.000Z",
        kid: "chain-key",
        model: { requested: "m", observed: null },
        route: { providerId: "p", capabilityId: "c", attemptNumber: 1 },
        parentReceiptCid: rootCid,
        usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        redactionPolicyId: "lattice.default.v1",
        redactions: [],
      },
      signer,
    );
    expect((await verifyChain([root, legacyChild], keySet)).ok).toBe(true);
    const strict = await verifyChain([root, legacyChild], keySet, { minVersion: "lattice-receipt/v1.4" });
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error.cause?.kind).toBe("schema-version-too-low");
  });
});
