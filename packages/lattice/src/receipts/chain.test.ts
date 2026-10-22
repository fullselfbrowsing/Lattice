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
  it("warns that a dropped leaf is unchecked without expectedCount, and expectedCount catches it", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 3);
    const truncated = [root, children[0]!, children[1]!];
    const silent = await verifyChain(truncated, keySet);
    expect(silent.ok).toBe(true);
    if (silent.ok) {
      expect(silent.advisories).toContainEqual(
        expect.objectContaining({ code: "tail-truncation-unchecked", severity: "warn" }),
      );
    }

    const caught = await verifyChain(truncated, keySet, { expectedCount: 4 });
    expect(caught.ok).toBe(false);
    if (!caught.ok) expect(caught.error.kind).toBe("count-mismatch");
  });

  it("rejects a dropped leaf when the root declares chainClosure", async () => {
    const { signer, keySet } = await makeSigner();
    const root = await createReceipt(
      minimalInput({ stepName: "crew-start:lead", chainClosure: "member-cids" }),
      signer,
    );
    const rootCid = await receiptCid(root);
    const children: ReceiptEnvelope[] = [];
    for (let i = 0; i < 2; i += 1) {
      children.push(
        await createReceipt(
          minimalInput({ parentReceiptCid: rootCid, stepName: `child-${i}` }),
          signer,
        ),
      );
    }
    const memberCids = [rootCid, ...(await Promise.all(children.map((child) => receiptCid(child))))].sort();
    const closer = await createReceipt(
      minimalInput({
        parentReceiptCid: rootCid,
        stepName: "crew-close:lead",
        chainMemberCids: memberCids,
        outputHash: "c".repeat(64),
      }),
      signer,
    );
    const full = [root, ...children, closer];
    const closed = await verifyChain(full, keySet);
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.advisories?.map((note) => note.code)).not.toContain(
        "tail-truncation-unchecked",
      );
    }

    const truncated = [root, children[0]!, closer];
    const dropped = await verifyChain(truncated, keySet);
    expect(dropped.ok).toBe(false);
    if (!dropped.ok) expect(dropped.error.kind).toBe("count-mismatch");

    const withoutCloser = [root, ...children];
    const open = await verifyChain(withoutCloser, keySet);
    expect(open.ok).toBe(false);
    if (!open.ok) expect(open.error.message).toContain("chainMemberCids");
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

/** A closed crew-style tree: root declares chainClosure, closer lists the rest. */
async function mintClosedTree(
  signer: ReceiptSigner,
  childCount: number,
): Promise<{
  root: ReceiptEnvelope;
  rootCid: string;
  children: ReceiptEnvelope[];
  closer: ReceiptEnvelope;
}> {
  const root = await createReceipt(
    minimalInput({ stepName: "crew-start:lead", chainClosure: "member-cids" }),
    signer,
  );
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
  const memberCids = [rootCid, ...(await Promise.all(children.map((child) => receiptCid(child))))].sort();
  const closer = await createReceipt(
    minimalInput({
      parentReceiptCid: rootCid,
      stepName: "crew-close:lead",
      chainMemberCids: memberCids,
    }),
    signer,
  );
  return { root, rootCid, children, closer };
}

function decodeBody(envelope: ReceiptEnvelope): CapabilityReceiptBody {
  return JSON.parse(atob(envelope.payload)) as CapabilityReceiptBody;
}

/** Re-sign `envelope`'s body with one field replaced, bypassing createReceipt. */
async function resignWith(
  envelope: ReceiptEnvelope,
  signer: ReceiptSigner,
  field: string,
  value: unknown,
): Promise<ReceiptEnvelope> {
  const body = { ...decodeBody(envelope), [field]: value };
  return signBody(body as unknown as CapabilityReceiptBody, signer);
}

describe("verifyChain — chain closure", () => {
  it.each([
    ["a string", "sha256:abc"],
    ["an object", { a: 1 }],
    ["a number", 7],
    ["null", null],
    ["an array of numbers", [1, 2]],
    ["an empty string", ""],
  ])("returns link-invalid (version-mismatch), not a throw, when chainMemberCids is %s", async (_label, value) => {
    const { signer, keySet } = await makeSigner();
    const { root, children, closer } = await mintClosedTree(signer, 1);
    const malformed = await resignWith(closer, signer, "chainMemberCids", value);
    const result = await verifyChain([root, ...children, malformed], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("link-invalid");
      expect(result.error.cause?.kind).toBe("version-mismatch");
    }
  });

  it.each([
    ["an unknown mode", "merkle-v2"],
    ["a boolean", true],
  ])("fails closed when chainClosure is %s", async (_label, value) => {
    const { signer, keySet } = await makeSigner();
    const plainRoot = await createReceipt(minimalInput({ stepName: "crew-start:lead" }), signer);
    const unknownRoot = await resignWith(plainRoot, signer, "chainClosure", value);
    const child = await createReceipt(
      minimalInput({ parentReceiptCid: await receiptCid(unknownRoot), stepName: "child" }),
      signer,
    );
    const result = await verifyChain([unknownRoot, child], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("link-invalid");
      expect(result.error.cause?.kind).toBe("version-mismatch");
    }
  });

  it("rejects an added member that the closer does not list, naming it", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, rootCid, children, closer } = await mintClosedTree(signer, 1);
    const extra = await createReceipt(
      minimalInput({ parentReceiptCid: rootCid, stepName: "late-child" }),
      signer,
    );
    const result = await verifyChain([root, ...children, closer, extra], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("count-mismatch");
      expect(result.error.cid).toBe(await receiptCid(extra));
    }
  });

  it("rejects a closer that lists a member twice", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, rootCid, children, closer } = await mintClosedTree(signer, 1);
    const doubled = await resignWith(closer, signer, "chainMemberCids", [rootCid, rootCid]);
    const result = await verifyChain([root, ...children, doubled], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("count-mismatch");
      expect(result.error.message).toContain("more than once");
    }
  });

  it("rejects chainMemberCids when no receipt declares chainClosure, and two closers", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, rootCid, children } = await mintTree(signer, 1);
    const memberCids = [rootCid, await receiptCid(children[0]!)].sort();
    const closer = await createReceipt(
      minimalInput({ parentReceiptCid: rootCid, stepName: "close", chainMemberCids: memberCids }),
      signer,
    );
    const undeclared = await verifyChain([root, ...children, closer], keySet);
    expect(undeclared.ok).toBe(false);
    if (!undeclared.ok) {
      expect(undeclared.error.kind).toBe("count-mismatch");
      expect(undeclared.error.message).toContain("no receipt declared chainClosure");
    }

    const closed = await mintClosedTree(signer, 1);
    const secondCloser = await createReceipt(
      minimalInput({
        parentReceiptCid: closed.rootCid,
        stepName: "crew-close:again",
        chainMemberCids: [closed.rootCid],
      }),
      signer,
    );
    const twice = await verifyChain(
      [closed.root, ...closed.children, closed.closer, secondCloser],
      keySet,
    );
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.message).toContain("found 2");
  });

  it("requireClosure rejects a tree with no closure and accepts a closed one", async () => {
    const { signer, keySet } = await makeSigner();
    const open = await mintTree(signer, 2);
    const openResult = await verifyChain([open.root, ...open.children], keySet, {
      requireClosure: true,
    });
    expect(openResult.ok).toBe(false);
    if (!openResult.ok) {
      expect(openResult.error.kind).toBe("count-mismatch");
      expect(openResult.error.message).toContain("requireClosure");
    }
    // expectedCount does not stand in for closure when closure is required.
    const counted = await verifyChain([open.root, ...open.children], keySet, {
      requireClosure: true,
      expectedCount: 3,
    });
    expect(counted.ok).toBe(false);

    const closed = await mintClosedTree(signer, 2);
    const closedResult = await verifyChain(
      [closed.root, ...closed.children, closed.closer],
      keySet,
      { requireClosure: true },
    );
    expect(closedResult).toMatchObject({ ok: true, count: 4 });
  });

  it("partial verifies a disclosed subset that includes the closer, with a closure-partial advisory", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children, closer } = await mintClosedTree(signer, 3);
    const subset = [root, children[1]!, closer];

    const strict = await verifyChain(subset, keySet);
    expect(strict.ok).toBe(false);
    if (!strict.ok) expect(strict.error.kind).toBe("count-mismatch");

    const partial = await verifyChain(subset, keySet, { partial: true });
    expect(partial).toMatchObject({ ok: true, count: 3 });
    if (partial.ok) {
      expect(partial.advisories).toContainEqual(
        expect.objectContaining({ code: "closure-partial", severity: "info" }),
      );
      const note = partial.advisories?.find((entry) => entry.code === "closure-partial");
      expect(note?.message).toContain("2 member(s)");
      expect(partial.advisories?.map((entry) => entry.code)).not.toContain(
        "tail-truncation-unchecked",
      );
    }

    const everything = await verifyChain([root, ...children, closer], keySet, { partial: true });
    expect(everything.ok).toBe(true);
    if (everything.ok) {
      expect(everything.advisories?.map((entry) => entry.code)).not.toContain("closure-partial");
    }
  });

  it("partial still requires the closer and still rejects an unlisted receipt", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, rootCid, children, closer } = await mintClosedTree(signer, 2);

    const noCloser = await verifyChain([root, children[0]!], keySet, { partial: true });
    expect(noCloser.ok).toBe(false);
    if (!noCloser.ok) expect(noCloser.error.kind).toBe("count-mismatch");

    const stranger = await createReceipt(
      minimalInput({ parentReceiptCid: rootCid, stepName: "stranger" }),
      signer,
    );
    const added = await verifyChain([root, children[0]!, closer, stranger], keySet, {
      partial: true,
    });
    expect(added.ok).toBe(false);
    if (!added.ok) expect(added.error.cid).toBe(await receiptCid(stranger));
  });

  it("partial has no effect on a chain without closure", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 2);
    const result = await verifyChain([root, children[0]!], keySet, { partial: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.advisories?.map((entry) => entry.code)).toContain(
        "tail-truncation-unchecked",
      );
    }
  });
});

describe("verifyChain — advisories", () => {
  it("deduplicates per-receipt advisories across links", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 3);
    const result = await verifyChain([root, ...children], keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const codes = result.advisories?.map((entry) => entry.code) ?? [];
      expect(codes.filter((code) => code === "audience-absent")).toHaveLength(1);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("warns when every link is bound to an audience and nonce the caller did not check", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 1, { audience: "svc-a", nonce: "n-secret" });
    const result = await verifyChain([root, ...children], keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const warns = result.advisories?.filter((entry) => entry.severity === "warn") ?? [];
      expect(warns.map((entry) => entry.code).sort()).toEqual([
        "audience-unchecked",
        "nonce-unchecked",
        "tail-truncation-unchecked",
      ]);
      for (const entry of result.advisories ?? []) {
        expect(entry.message).not.toContain("n-secret");
      }
    }
    const checked = await verifyChain([root, ...children], keySet, {
      expectedAudience: "svc-a",
      expectedNonce: "n-secret",
      expectedCount: 2,
    });
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.advisories?.filter((entry) => entry.severity === "warn") ?? []).toEqual([]);
    }
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

describe("verifyChain — non-canonical payloads (review follow-up)", () => {
  it("returns link-invalid with an envelope-malformed cause instead of throwing", async () => {
    const { signer, keySet } = await makeSigner();
    const { root, children } = await mintTree(signer, 1);
    const child = children[0]!;
    const half = Math.floor(child.payload.length / 2);
    const spaced: ReceiptEnvelope = {
      ...child,
      payload: `${child.payload.slice(0, half)} ${child.payload.slice(half)}`,
    };
    const result = await verifyChain([root, spaced], keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("link-invalid");
      expect(result.error.cause?.kind).toBe("envelope-malformed");
      expect(result.error.message).toContain("receipt[1]");
    }
  });
});
