// v1.6 opt-in verifier features, crew chain closure, and signer-failure modes.
// Offline. No network. Numbers written to eval/results/v16.json come from this file.
import { L, writeJSON, makeKeys, ADAPTERS, fakeFetch } from "./lib.mjs";

const K = await makeKeys("v16");
const keySet = K.keySet;

function baseBody(over = {}) {
  return {
    runId: "run-v16",
    model: { requested: "m", observed: null },
    route: { providerId: "openai", capabilityId: "m", attemptNumber: 1 },
    usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: "ab".repeat(32),
    ...over,
  };
}

const rows = [];
function record(name, result) {
  rows.push({
    check: name,
    ok: result.ok === true,
    kind: result.ok ? "" : result.error?.kind ?? result.kind ?? "",
    message: result.ok ? "" : result.error?.message ?? result.message ?? "",
  });
}
/** A check passes when verification rejects with the expected error kind. */
function expectReject(name, result, kind) {
  rows.push({
    check: name,
    ok: result.ok === false && result.error?.kind === kind,
    kind: result.ok ? "accepted" : result.error?.kind ?? "",
    message: result.ok ? "" : result.error?.message ?? "",
  });
}

const plain = await L.createReceipt(baseBody(), K.signer);
const plainVerify = await L.verifyReceipt(plain, keySet);
record("plain-verifies", plainVerify);
const advisories = L.receiptVerifyAdvisories(plainVerify.ok ? plainVerify.body : {}, {});
rows.push({
  check: "advisories-on-unbound-receipt",
  ok: advisories.some((n) => n.includes("audience")) && advisories.some((n) => n.includes("nonce")) && advisories.some((n) => n.includes("expire")),
  kind: String(advisories.length),
  message: advisories.join(" || "),
});

const bound = await L.createReceipt(baseBody({
  audience: "relying-party",
  nonce: "nonce-1",
  expiresAt: "2099-01-01T00:00:00Z",
}), K.signer);
record("bound-accepts-matching-options", await L.verifyReceipt(bound, keySet, {
  expectedAudience: "relying-party",
  expectedNonce: "nonce-1",
  now: "2026-10-21T00:00:00Z",
}));
expectReject("audience-mismatch", await L.verifyReceipt(bound, keySet, { expectedAudience: "other" }), "audience-mismatch");
expectReject("nonce-mismatch", await L.verifyReceipt(bound, keySet, { expectedNonce: "other" }), "nonce-mismatch");
expectReject("expired", await L.verifyReceipt(bound, keySet, { now: "2100-01-01T00:00:00Z" }), "receipt-expired");
record("minVersion-v1.4-accepts-current", await L.verifyReceipt(plain, keySet, { minVersion: "lattice-receipt/v1.4" }));

const old = await L.createReceipt(baseBody(), K.signer);
const oldBody = JSON.parse(Buffer.from(old.payload, "base64").toString("utf8"));
// Re-sign a v1.1 body with the same key so minVersion can reject it.
const { default: canonicalize } = await import(
  "../../packages/lattice/node_modules/canonicalize/lib/canonicalize.js"
);
const v11 = { ...oldBody, version: "lattice-receipt/v1.1" };
delete v11.audience; delete v11.nonce; delete v11.expiresAt; delete v11.chainClosure; delete v11.chainMemberCids;
const payload = Buffer.from(canonicalize(v11), "utf8").toString("base64");
const PT = "application/vnd.lattice.receipt+json";
const pae = (payloadB64) => {
  const t = Buffer.from(PT); const p = Buffer.from(payloadB64);
  return new Uint8Array(Buffer.concat([Buffer.from(`DSSEv1 ${t.length} `), t, Buffer.from(` ${p.length} `), p]));
};
const sig = Buffer.from(await K.signer.sign(pae(payload))).toString("base64");
const v11env = { payloadType: PT, payload, signatures: [{ keyid: K.kid, sig }] };
expectReject("minVersion-floor-rejects-v1.1", await L.verifyReceipt(v11env, keySet, { minVersion: "lattice-receipt/v1.4" }), "schema-version-too-low");
record("v1.1-still-verifies-without-minVersion", await L.verifyReceipt(v11env, keySet));

// Linear chain: tail truncation is an advisory unless expectedCount is passed.
const chain = [];
let parent;
for (let i = 0; i < 4; i++) {
  const env = await L.createReceipt(baseBody({ runId: "chain-run", ...(parent ? { parentReceiptCid: parent } : {}), stepName: `n${i}` }), K.signer);
  chain.push(env);
  parent = await L.receiptCid(env);
}
const truncated = chain.slice(0, 3);
const open = await L.verifyChain(truncated, keySet);
rows.push({
  check: "truncate-without-expectedCount",
  ok: open.ok === true,
  kind: open.ok ? "accepted" : open.error.kind,
  message: open.ok ? (open.advisories ?? []).join(" || ") : open.error.message,
});
const counted = await L.verifyChain(truncated, keySet, { expectedCount: 4 });
expectReject("truncate-with-expectedCount", counted, "count-mismatch");

// Closed crew-style tree: dropping a leaf fails with no expectedCount.
const root = await L.createReceipt(baseBody({ runId: "closed", stepName: "crew-start:root", chainClosure: "member-cids", outputHash: "aa".repeat(32) }), K.signer);
const rootCid = await L.receiptCid(root);
const child = await L.createReceipt(baseBody({ runId: "closed", parentReceiptCid: rootCid, stepName: "child", outputHash: "bb".repeat(32) }), K.signer);
const childCid = await L.receiptCid(child);
const members = [rootCid, childCid].sort();
const closer = await L.createReceipt(baseBody({
  runId: "closed",
  parentReceiptCid: rootCid,
  stepName: "crew-close:root",
  chainMemberCids: members,
  outputHash: "cc".repeat(32),
}), K.signer);
record("closed-chain-accepts", await L.verifyChain([root, child, closer], keySet));
expectReject("closed-chain-dropped-leaf", await L.verifyChain([root, closer], keySet), "count-mismatch");

// Signer failure modes against one mocked adapter.
const ad = ADAPTERS[0];
const fetchF = fakeFetch(() => ad.body("ok"));
const failing = {
  kid: K.kid,
  publicKeyJwk: K.publicKeyJwk,
  sign: async () => { throw new Error("signer down"); },
};
const flagged = await L.createAI({ providers: [ad.build(fetchF)], signer: failing }).run({
  task: "t", outputs: { answer: "text" },
});
rows.push({
  check: "signer-flag-default",
  ok: flagged.ok === true && flagged.receipt === undefined && flagged.receiptError?.kind === "signer-failed",
  kind: flagged.receiptError?.kind ?? "",
  message: flagged.receiptError?.message ?? "",
});
let threw = false; let throwName = "";
try {
  await L.createAI({
    providers: [ad.build(fetchF)],
    signer: failing,
    receipts: { onSignerError: "throw" },
  }).run({ task: "t", outputs: { answer: "text" } });
} catch (error) {
  threw = true;
  throwName = error?.name ?? "";
}
rows.push({ check: "signer-throw", ok: threw && throwName === "ReceiptSigningError", kind: throwName, message: "" });

const noSigner = await L.createAI({ providers: [ad.build(fetchF)] }).run({ task: "t", outputs: { answer: "text" } });
rows.push({
  check: "no-signer-no-receipt",
  ok: noSigner.ok === true && noSigner.receipt === undefined && noSigner.receiptError === undefined,
  kind: "",
  message: "",
});

const summary = {
  checks: rows.length,
  passed: rows.filter((r) => r.ok).length,
  failed: rows.filter((r) => !r.ok).map((r) => r.check),
  rows,
};
writeJSON("v16.json", summary);
console.table(rows.map((r) => ({ check: r.check, ok: r.ok, kind: r.kind })));
if (summary.failed.length) {
  console.error("FAILED", summary.failed);
  process.exitCode = 1;
}
