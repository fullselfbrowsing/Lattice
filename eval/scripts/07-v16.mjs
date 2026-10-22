// Verifier opt-ins, structured advisories, chain closure, crew receipts, and
// signer-failure modes. Offline. No network. Numbers written to
// eval/results/v16.json come from this file. Exits non-zero on any failed check.
import { L, writeJSON, makeKeys, ADAPTERS, fakeFetch } from "./lib.mjs";

// The released 1.6.0 verifier (origin/main build), used only for the
// forward-compatibility checks. Optional: skipped checks are reported as failures.
const BASE_DIST = new URL("../../.context/base/packages/lattice/dist/index.js", import.meta.url);
let BASE;
try { BASE = await import(BASE_DIST.href); } catch { BASE = undefined; }

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
const push = (check, ok, kind = "", message = "") => rows.push({ check, ok: ok === true, kind: String(kind ?? ""), message: String(message ?? "") });
/** A check passes when the call returns ok. */
function record(name, result) {
  push(name, result.ok === true, result.ok ? "" : result.error?.kind ?? result.kind ?? "", result.ok ? "" : result.error?.message ?? result.message ?? "");
}
/** A check passes when verification rejects with the expected error kind. */
function expectReject(name, result, kind, pattern) {
  const matches = pattern === undefined || pattern.test(String(result.error?.message ?? ""));
  push(name, result.ok === false && result.error?.kind === kind && matches, result.ok ? "accepted" : result.error?.kind ?? "", result.ok ? "" : result.error?.message ?? "");
}
/** Run a verifier call; a throw becomes a typed failure so "never throws" is checkable. */
async function noThrow(fn) {
  try { return await fn(); } catch (error) { return { ok: false, threw: true, error: { kind: `THREW:${error?.name ?? "Error"}`, message: String(error?.message ?? error) } }; }
}
/** A check passes when fn throws an error with the given name (and message pattern). */
async function expectThrow(name, fn, errorName, pattern) {
  try {
    await fn();
    push(name, false, "no-throw", "");
  } catch (error) {
    const ok = error?.name === errorName && (pattern === undefined || pattern.test(String(error?.message)));
    push(name, ok, error?.name ?? "", String(error?.message ?? "").slice(0, 200));
  }
}
const fmtAdvisories = (list) => (list ?? []).map((a) => `${a.severity}:${a.code}`).join(" || ");
const hasAdvisory = (list, code, severity) => (list ?? []).some((a) => a.code === code && a.severity === severity);
const codes = (list) => (list ?? []).map((a) => a.code);

// ---------- Single receipts: bindings and advisories ----------
const plain = await L.createReceipt(baseBody(), K.signer);
const plainVerify = await L.verifyReceipt(plain, keySet);
record("plain-verifies", plainVerify);
const advisories = L.receiptVerifyAdvisories(plainVerify.ok ? plainVerify.body : {}, {});
push(
  "advisories-on-unbound-receipt",
  ["audience-absent", "nonce-absent", "expiry-absent"].every((c) => hasAdvisory(advisories, c, "info")) &&
    advisories.every((a) => a.severity === "info") && advisories.length === 3,
  `${advisories.length} info advisories`,
  fmtAdvisories(advisories),
);
push(
  "advisory-shape-structured",
  [...advisories].every((a) => typeof a.code === "string" && (a.severity === "warn" || a.severity === "info") && typeof a.message === "string" && a.message.length > 0),
  "{code, severity, message}",
  fmtAdvisories(advisories),
);
push("current-version-no-version-advisory", !codes(advisories).includes("version-below-current"), "", fmtAdvisories(advisories));

const NONCE = "nonce-7Qx91-do-not-echo";
const AUDIENCE = "relying-party";
const bound = await L.createReceipt(baseBody({
  audience: AUDIENCE,
  nonce: NONCE,
  expiresAt: "2099-01-01T00:00:00Z",
}), K.signer);
record("bound-accepts-matching-options", await L.verifyReceipt(bound, keySet, {
  expectedAudience: AUDIENCE,
  expectedNonce: NONCE,
  now: "2026-10-21T00:00:00Z",
}));
expectReject("audience-mismatch", await L.verifyReceipt(bound, keySet, { expectedAudience: "other" }), "audience-mismatch");
expectReject("nonce-mismatch", await L.verifyReceipt(bound, keySet, { expectedNonce: "other" }), "nonce-mismatch");
expectReject("expired", await L.verifyReceipt(bound, keySet, { now: "2100-01-01T00:00:00Z" }), "receipt-expired");
record("minVersion-v1.4-accepts-current", await L.verifyReceipt(plain, keySet, { minVersion: "lattice-receipt/v1.4" }));

// A receipt that is bound but verified without the matching expectation warns,
// and the nonce value never appears in any advisory.
const boundVerify = await L.verifyReceipt(bound, keySet);
const boundNotes = boundVerify.ok ? L.receiptVerifyAdvisories(boundVerify.body, {}) : [];
push(
  "bound-unchecked-audience-warns",
  boundVerify.ok && hasAdvisory(boundNotes, "audience-unchecked", "warn") && !codes(boundNotes).includes("audience-absent"),
  "warn:audience-unchecked",
  fmtAdvisories(boundNotes),
);
push(
  "bound-unchecked-nonce-warns",
  boundVerify.ok && hasAdvisory(boundNotes, "nonce-unchecked", "warn") && !codes(boundNotes).includes("nonce-absent"),
  "warn:nonce-unchecked",
  fmtAdvisories(boundNotes),
);
const boundChain = await L.verifyChain([bound], keySet);
const echoed = JSON.stringify(boundNotes).includes(NONCE) || JSON.stringify(boundChain).includes(NONCE);
push(
  "nonce-value-never-echoed",
  boundChain.ok === true && hasAdvisory(boundChain.advisories, "nonce-unchecked", "warn") && !echoed,
  echoed ? "echoed" : "not echoed",
  fmtAdvisories(boundChain.advisories),
);
push(
  "expiresAt-set-no-expiry-advisory",
  boundVerify.ok && !codes(boundNotes).includes("expiry-absent"),
  "",
  fmtAdvisories(boundNotes),
);
const checkedNotes = boundVerify.ok ? L.receiptVerifyAdvisories(boundVerify.body, { expectedAudience: AUDIENCE, expectedNonce: NONCE }) : ["unverified"];
push("bound-and-checked-no-advisories", checkedNotes.length === 0, `${checkedNotes.length} advisories`, fmtAdvisories(checkedNotes));
const maxAgeNotes = plainVerify.ok ? L.receiptVerifyAdvisories(plainVerify.body, { maxAgeMs: 60_000 }) : [];
push("maxAgeMs-silences-expiry-absent", plainVerify.ok && !codes(maxAgeNotes).includes("expiry-absent"), "", fmtAdvisories(maxAgeNotes));

// ---------- Raw re-sign helper for bodies createReceipt would refuse ----------
const { default: canonicalize } = await import(
  "../../packages/lattice/node_modules/canonicalize/lib/canonicalize.js"
);
const PT = "application/vnd.lattice.receipt+json";
const pae = (payloadB64) => {
  const t = Buffer.from(PT); const p = Buffer.from(payloadB64);
  return new Uint8Array(Buffer.concat([Buffer.from(`DSSEv1 ${t.length} `), t, Buffer.from(` ${p.length} `), p]));
};
const decode = (env) => JSON.parse(Buffer.from(env.payload, "base64").toString("utf8"));
async function resign(body) {
  const payload = Buffer.from(canonicalize(body), "utf8").toString("base64");
  const sig = Buffer.from(await K.signer.sign(pae(payload))).toString("base64");
  return { payloadType: PT, payload, signatures: [{ keyid: K.kid, sig }] };
}

// Re-sign a v1.1 body with the same key so minVersion can reject it.
const v11 = { ...decode(plain), version: "lattice-receipt/v1.1" };
delete v11.audience; delete v11.nonce; delete v11.expiresAt; delete v11.chainClosure; delete v11.chainMemberCids;
const v11env = await resign(v11);
expectReject("minVersion-floor-rejects-v1.1", await L.verifyReceipt(v11env, keySet, { minVersion: "lattice-receipt/v1.4" }), "schema-version-too-low");
const v11Verify = await L.verifyReceipt(v11env, keySet);
record("v1.1-still-verifies-without-minVersion", v11Verify);
const v11Notes = v11Verify.ok ? L.receiptVerifyAdvisories(v11Verify.body, {}) : [];
const v11Version = v11Notes.find((a) => a.code === "version-below-current");
push(
  "version-below-current-info-effective-floor",
  v11Version?.severity === "info" && /effective floor lattice-receipt\/v1\.1/.test(v11Version.message) && /pass minVersion/.test(v11Version.message),
  v11Version ? `${v11Version.severity}:${v11Version.code}` : "absent",
  v11Version?.message ?? "",
);
const v11FloorNotes = v11Verify.ok ? L.receiptVerifyAdvisories(v11Verify.body, { minVersion: "lattice-receipt/v1.1" }) : [];
const v11Floor = v11FloorNotes.find((a) => a.code === "version-below-current");
push(
  "version-below-current-kept-at-baseline-minVersion",
  v11Floor?.severity === "info" && /raise minVersion above lattice-receipt\/v1\.1/.test(v11Floor.message),
  v11Floor ? `${v11Floor.severity}:${v11Floor.code}` : "absent",
  v11Floor?.message ?? "",
);

// ---------- Linear chain: tail truncation is a warn unless expectedCount is passed ----------
const chain = [];
let parent;
for (let i = 0; i < 4; i++) {
  const env = await L.createReceipt(baseBody({ runId: "chain-run", ...(parent ? { parentReceiptCid: parent } : {}), stepName: `n${i}` }), K.signer);
  chain.push(env);
  parent = await L.receiptCid(env);
}
const truncated = chain.slice(0, 3);
const open = await L.verifyChain(truncated, keySet);
push(
  "truncate-without-expectedCount",
  open.ok === true && hasAdvisory(open.advisories, "tail-truncation-unchecked", "warn"),
  open.ok ? "accepted" : open.error.kind,
  open.ok ? fmtAdvisories(open.advisories) : open.error.message,
);
const counted = await L.verifyChain(truncated, keySet, { expectedCount: 4 });
expectReject("truncate-with-expectedCount", counted, "count-mismatch");
const countedOk = await L.verifyChain(chain, keySet, { expectedCount: 4 });
push(
  "expectedCount-silences-tail-advisory",
  countedOk.ok === true && !codes(countedOk.advisories).includes("tail-truncation-unchecked"),
  countedOk.ok ? "accepted" : countedOk.error.kind,
  countedOk.ok ? fmtAdvisories(countedOk.advisories) : "",
);
expectReject("requireClosure-rejects-unclosed-chain", await L.verifyChain(chain, keySet, { requireClosure: true }), "count-mismatch");

// ---------- Closed tree built with createReceipt ----------
const root = await L.createReceipt(baseBody({ runId: "closed", stepName: "crew-start:root", chainClosure: "member-cids", outputHash: "aa".repeat(32) }), K.signer);
const rootCid = await L.receiptCid(root);
const child = await L.createReceipt(baseBody({ runId: "closed", parentReceiptCid: rootCid, stepName: "child", outputHash: "bb".repeat(32) }), K.signer);
const childCid = await L.receiptCid(child);
const child2 = await L.createReceipt(baseBody({ runId: "closed", parentReceiptCid: rootCid, stepName: "child2", outputHash: "dd".repeat(32) }), K.signer);
const child2Cid = await L.receiptCid(child2);
const extra = await L.createReceipt(baseBody({ runId: "closed", parentReceiptCid: rootCid, stepName: "extra", outputHash: "ee".repeat(32) }), K.signer);
const closeOver = (members) => L.createReceipt(baseBody({
  runId: "closed",
  parentReceiptCid: rootCid,
  stepName: "crew-close:root",
  chainMemberCids: members,
  outputHash: "cc".repeat(32),
}), K.signer);
const closer = await closeOver([rootCid, childCid].sort());
const closedOk = await L.verifyChain([root, child, closer], keySet);
record("closed-chain-accepts", closedOk);
push(
  "closed-chain-no-tail-advisory",
  closedOk.ok === true && !codes(closedOk.advisories).includes("tail-truncation-unchecked"),
  "",
  closedOk.ok ? fmtAdvisories(closedOk.advisories) : "",
);
expectReject("closed-chain-dropped-leaf", await L.verifyChain([root, closer], keySet), "count-mismatch", /dropped/);
expectReject("closed-chain-dropped-closer", await L.verifyChain([root, child], keySet), "count-mismatch", /found 0/);
record("requireClosure-accepts-closed-chain", await L.verifyChain([root, child, closer], keySet, { requireClosure: true }));

// partial: a disclosed subset verifies only with the closer present, and the
// unpresented members are reported as a closure-partial warning.
const closer3 = await closeOver([rootCid, childCid, child2Cid].sort());
const partialSubset = await L.verifyChain([root, child, closer3], keySet, { partial: true });
const partialNote = (partialSubset.advisories ?? []).find((a) => a.code === "closure-partial");
push(
  "partial-subset-accepts-with-closure-partial-warn",
  partialSubset.ok === true && partialNote?.severity === "warn" && /1 member\(s\)/.test(partialNote.message),
  partialNote ? `${partialNote.severity}:${partialNote.code}` : partialSubset.ok ? "no advisory" : partialSubset.error.kind,
  partialNote?.message ?? (partialSubset.ok ? "" : partialSubset.error.message),
);
const partialFull = await L.verifyChain([root, child, child2, closer3], keySet, { partial: true });
push(
  "partial-full-set-no-closure-partial",
  partialFull.ok === true && !codes(partialFull.advisories).includes("closure-partial"),
  partialFull.ok ? "accepted" : partialFull.error.kind,
  partialFull.ok ? fmtAdvisories(partialFull.advisories) : partialFull.error.message,
);
expectReject("subset-without-partial-rejected", await L.verifyChain([root, child, closer3], keySet), "count-mismatch");
expectReject("partial-requires-closer", await L.verifyChain([root, child], keySet, { partial: true }), "count-mismatch", /found 0/);
expectReject("partial-rejects-unlisted-member", await L.verifyChain([root, child, extra, closer], keySet, { partial: true }), "count-mismatch", /not listed/);

// ---------- createReceipt refuses malformed closure input ----------
const cidA = "sha256:" + "1".repeat(64), cidB = "sha256:" + "2".repeat(64);
await expectThrow("createReceipt-rejects-malformed-member-cid", () => closeOver(["not-a-cid"]), "TypeError", /chainMemberCids\[0\]/);
await expectThrow("createReceipt-rejects-non-array-member-list", () => closeOver(cidA), "TypeError", /must be an array/);
await expectThrow("createReceipt-rejects-duplicate-member-cid", () => closeOver([cidA, cidA]), "TypeError", /more than once/);
await expectThrow("createReceipt-rejects-unsorted-member-list", () => closeOver([cidB, cidA]), "TypeError", /sorted/);
await expectThrow("createReceipt-rejects-unknown-closure-mode", () => L.createReceipt(baseBody({ chainClosure: "all" }), K.signer), "TypeError", /member-cids/);
await expectThrow(
  "createReceipt-rejects-closure-on-non-root",
  () => L.createReceipt(baseBody({ parentReceiptCid: rootCid, chainClosure: "member-cids" }), K.signer),
  "TypeError",
  /only valid on a root/,
);

// ---------- Malformed closure fields re-signed by the key holder ----------
// verifyReceipt reads them as version-mismatch; verifyChain reports link-invalid. Neither throws.
const rootBody = decode(root), closerBody = decode(closer);
const badRootMode = await resign({ ...rootBody, chainClosure: "all-members" });
const badListString = await resign({ ...closerBody, chainMemberCids: closerBody.chainMemberCids[0] });
const badListNumbers = await resign({ ...closerBody, chainMemberCids: [1, 2] });
for (const [name, env] of [["malformed-chainClosure-mode", badRootMode], ["malformed-chainMemberCids-string", badListString], ["malformed-chainMemberCids-non-string", badListNumbers]]) {
  expectReject(`${name}-verifyReceipt`, await noThrow(() => L.verifyReceipt(env, keySet)), "version-mismatch");
}
{
  const r1 = await noThrow(() => L.verifyChain([badRootMode, child, closer], keySet));
  push("malformed-root-closure-verifyChain-link-invalid", r1.ok === false && r1.error?.kind === "link-invalid" && r1.error?.cause?.kind === "version-mismatch", r1.ok ? "accepted" : `${r1.error.kind}(${r1.error.cause?.kind ?? ""})`, r1.ok ? "" : r1.error.message);
  const r2 = await noThrow(() => L.verifyChain([root, child, badListString], keySet));
  push("malformed-closer-verifyChain-link-invalid", r2.ok === false && r2.error?.kind === "link-invalid" && r2.error?.cause?.kind === "version-mismatch", r2.ok ? "accepted" : `${r2.error.kind}(${r2.error.cause?.kind ?? ""})`, r2.ok ? "" : r2.error.message);
  const r3 = await noThrow(() => L.verifyChain([root, child, badListNumbers], keySet, { partial: true }));
  push("malformed-closer-partial-link-invalid", r3.ok === false && r3.error?.kind === "link-invalid" && r3.error?.cause?.kind === "version-mismatch", r3.ok ? "accepted" : `${r3.error.kind}(${r3.error.cause?.kind ?? ""})`, r3.ok ? "" : r3.error.message);
}
// Well-shaped but inconsistent closers: a duplicated member, and closure declared below the root.
const dupCloser = await resign({ ...closerBody, chainMemberCids: [rootCid, rootCid] });
expectReject("duplicate-member-cid-verifyChain", await noThrow(() => L.verifyChain([root, dupCloser], keySet)), "count-mismatch", /more than once/);
const nonRootClosure = await resign({ ...decode(child), chainClosure: "member-cids" });
record("non-root-closure-receipt-verifies-alone", await L.verifyReceipt(nonRootClosure, keySet));
expectReject("non-root-closure-verifyChain-rejected", await noThrow(() => L.verifyChain([root, nonRootClosure, closer], keySet)), "count-mismatch", /not the root/);
expectReject("non-root-closure-partial-rejected", await noThrow(() => L.verifyChain([root, nonRootClosure, closer], keySet, { partial: true })), "count-mismatch", /not the root/);
{
  const plainRoot = await L.createReceipt(baseBody({ runId: "nr", stepName: "root" }), K.signer);
  const nrChild = await resign({ ...decode(await L.createReceipt(baseBody({ runId: "nr", parentReceiptCid: await L.receiptCid(plainRoot), stepName: "c" }), K.signer)), chainClosure: "member-cids" });
  expectReject("root-only-closure-unclosed-root", await noThrow(() => L.verifyChain([plainRoot, nrChild], keySet)), "count-mismatch", /not the root/);
}

// ---------- Crew receipts from runAgentCrew with fake providers ----------
const stubSchema = { "~standard": { version: 1, vendor: "eval-stub", validate: (value) => ({ value }) } };
const leaf = (id) => L.defineAgent({ id, intent: `Run delegated task as ${id}.`, tools: [], summaryReturnSchema: stubSchema });
const lead = (children) => L.defineAgent({ id: "lead", intent: "Coordinate child agents and produce a final answer.", tools: [], childAgents: children, summaryReturnSchema: stubSchema });
function scripted(answers, usage = { promptTokens: 1, completionTokens: 1, costUsd: null }) {
  const queue = [...answers]; const tasks = [];
  const provider = L.createFakeProvider({
    id: "crew-fake",
    response: (request) => { tasks.push(request.task); return { rawOutputs: { answer: queue.shift() ?? "" }, normalizedUsage: usage }; },
  });
  return { provider, tasks };
}
function twoChildCrew(usage) {
  return {
    root: lead([leaf("alpha"), leaf("beta")]),
    ...scripted([
      '{"tool_calls":[{"id":"a","name":"alpha","args":{"task":"A"}}]}', "alpha summary",
      '{"tool_calls":[{"id":"b","name":"beta","args":{"task":"B"}}]}', "beta summary",
      "final",
    ], usage),
  };
}
function oneChildCrew(usage) {
  return { root: lead([leaf("alpha")]), ...scripted(['{"tool_calls":[{"id":"a","name":"alpha","args":{"task":"A"}}]}', "alpha summary", "final"], usage) };
}
const stepOf = (env) => decode(env).stepName;
/** Signer that fails when the receipt being signed has a matching stepName. */
function failingSigner(failOn) {
  return {
    kid: K.signer.kid,
    publicKeyJwk: K.signer.publicKeyJwk,
    async sign(bytes) {
      const text = new TextDecoder().decode(bytes);
      const step = JSON.parse(Buffer.from(text.slice(text.lastIndexOf(" ") + 1), "base64").toString("utf8")).stepName ?? "";
      if (failOn(step)) throw new Error(`remote signer 503 on ${step}`);
      return K.signer.sign(bytes);
    },
  };
}
const hosts = { childHost: L.createNoopAgentHost() };

const crew = twoChildCrew();
const crewRun = await L.runAgentCrew({ root: crew.root, hosts, signer: K.signer }, { providers: [crew.provider] });
const crewSteps = crewRun.receipts.map(stepOf);
const expectedSteps = ["crew-start:lead", "crew-agent-completion:alpha", "crew-agent-completion:beta", "crew-agent-completion:lead", "crew-close:lead"];
push(
  "crew-receipts-n-plus-2",
  crewRun.result.kind === "success" && crewRun.receipts.length === 3 + 2 && JSON.stringify(crewSteps) === JSON.stringify(expectedSteps) && crewRun.receiptError === undefined,
  `${crewRun.receipts.length} receipts for 3 agents`,
  crewSteps.join(", "),
);
const crewBodies = crewRun.receipts.map(decode);
const crewClose = crewBodies.find((b) => b.stepName === "crew-close:lead");
push(
  "crew-start-declares-closure-closer-lists-members",
  crewBodies[0]?.chainClosure === "member-cids" && crewBodies[0]?.parentReceiptCid === undefined && crewClose?.chainMemberCids?.length === crewRun.receipts.length - 1,
  `closer lists ${crewClose?.chainMemberCids?.length ?? 0}`,
  "",
);
record("crew-chain-verifies-requireClosure", await L.verifyChain(crewRun.receipts, keySet, {
  requireClosure: true, expectedRunId: crewRun.runId, expectedRootCid: crewRun.crewRootCid,
}));
push("crew-closer-verdict-success", crewClose?.contractVerdict === "success", crewClose?.contractVerdict ?? "", "");
const dropLeaf = crewRun.receipts.filter((env) => stepOf(env) !== "crew-agent-completion:alpha");
expectReject("crew-dropped-leaf-count-mismatch", await L.verifyChain(dropLeaf, keySet), "count-mismatch");
const dropCloser = crewRun.receipts.filter((env) => stepOf(env) !== "crew-close:lead");
expectReject("crew-dropped-closer-count-mismatch", await L.verifyChain(dropCloser, keySet), "count-mismatch");
{
  const disclosed = await L.verifyChain(dropLeaf, keySet, { partial: true });
  push(
    "crew-partial-disclosure-warns",
    disclosed.ok === true && hasAdvisory(disclosed.advisories, "closure-partial", "warn"),
    disclosed.ok ? "warn:closure-partial" : disclosed.error.kind,
    disclosed.ok ? fmtAdvisories(disclosed.advisories) : disclosed.error.message,
  );
}

// The crew budget verdict is taken when work ends; the closer signs execution-failed.
{
  const c = oneChildCrew({ promptTokens: 1, completionTokens: 1, costUsd: 1 });
  const run = await L.runAgentCrew({ root: c.root, hosts, signer: K.signer, policy: { budget: { maxCostUsd: 1.5 } } }, { providers: [c.provider] });
  const close = run.receipts.map(decode).find((b) => b.stepName === "crew-close:lead");
  const verified = await L.verifyChain(run.receipts, keySet, { requireClosure: true });
  push(
    "crew-budget-exceeded-closer-execution-failed",
    run.result.kind === "crew-budget-exceeded" && close?.contractVerdict === "execution-failed" && verified.ok === true,
    `${run.result.kind} / ${close?.contractVerdict ?? "no closer"}`,
    verified.ok ? "" : verified.error.message,
  );
}

// Child completion mint failure: "flag" (default and explicit) keeps the work and names it.
for (const [label, receipts] of [["default", undefined], ["flag", { onSignerError: "flag" }]]) {
  const c = oneChildCrew();
  const run = await L.runAgentCrew(
    { root: c.root, hosts, signer: failingSigner((s) => s === "crew-agent-completion:alpha") },
    { providers: [c.provider], ...(receipts ? { receipts } : {}) },
  );
  const verified = await L.verifyChain(run.receipts, keySet, { requireClosure: true });
  push(
    `crew-child-mint-failure-${label}-receiptError`,
    run.result.kind === "success" && run.receiptError?.kind === "signer-failed" && /crew-agent-completion:alpha receipt was not minted/.test(run.receiptError?.message ?? "") &&
      run.receipts.length === 3 && verified.ok === true,
    run.receiptError?.kind ?? "none",
    (run.receiptError?.message ?? "").slice(0, 200),
  );
}
{
  const c = oneChildCrew();
  await expectThrow(
    "crew-child-mint-failure-throw-ReceiptSigningError",
    () => L.runAgentCrew({ root: c.root, hosts, signer: failingSigner((s) => s === "crew-agent-completion:alpha") }, { providers: [c.provider], receipts: { onSignerError: "throw" } }),
    "ReceiptSigningError",
    /crew-agent-completion:alpha/,
  );
  push("crew-child-mint-throw-stops-crew", c.tasks.length === 2, `${c.tasks.length} provider calls`, "");
}
// A failed closer leaves the closed chain unverifiable, and receiptError says so.
{
  const c = oneChildCrew();
  const run = await L.runAgentCrew({ root: c.root, hosts, signer: failingSigner((s) => s.startsWith("crew-close:")) }, { providers: [c.provider] });
  const verified = await L.verifyChain(run.receipts, keySet);
  push(
    "crew-closer-mint-failure-flagged-chain-unverifiable",
    run.result.kind === "success" && /crew-close:lead/.test(run.receiptError?.message ?? "") && verified.ok === false && verified.error.kind === "count-mismatch",
    verified.ok ? "accepted" : verified.error.kind,
    (run.receiptError?.message ?? "").slice(0, 200),
  );
}
// crew-start failure always throws ReceiptSigningError, before any agent runs.
for (const mode of [undefined, "flag", "throw"]) {
  const c = oneChildCrew();
  await expectThrow(
    `crew-start-failure-${mode ?? "default"}-ReceiptSigningError`,
    () => L.runAgentCrew({ root: c.root, hosts, signer: failingSigner((s) => s.startsWith("crew-start:")) }, { providers: [c.provider], ...(mode ? { receipts: { onSignerError: mode } } : {}) }),
    "ReceiptSigningError",
    /crew-start:lead receipt was not minted/,
  );
  if (c.tasks.length !== 0) push(`crew-start-failure-${mode ?? "default"}-ran-agents`, false, `${c.tasks.length} provider calls`, "");
}

// Forward compatibility: the released 1.6.0 verifier still accepts a new crew chain.
if (BASE?.verifyChain && BASE?.createMemoryKeySet) {
  const baseKeys = BASE.createMemoryKeySet([{ kid: K.kid, publicKeyJwk: K.publicKeyJwk, state: "active" }]);
  const each = await Promise.all(crewRun.receipts.map((env) => BASE.verifyReceipt(env, baseKeys)));
  const baseChain = await BASE.verifyChain(crewRun.receipts, baseKeys);
  push(
    "base-1.6.0-verifier-accepts-new-crew-chain",
    each.every((v) => v.ok) && baseChain.ok === true && baseChain.count === crewRun.receipts.length,
    `latticeVersion ${BASE.latticeVersion}`,
    baseChain.ok ? `count=${baseChain.count}` : baseChain.error.kind,
  );
  // Documented limitation: closure is enforced only by verifiers from this release on.
  const baseDrop = await BASE.verifyChain(dropLeaf, baseKeys);
  push(
    "base-1.6.0-verifier-does-not-enforce-closure (documented)",
    baseDrop.ok === true,
    baseDrop.ok ? "accepted" : baseDrop.error.kind,
    "closure is enforced only by the new verifier",
  );
} else {
  push("base-1.6.0-verifier-accepts-new-crew-chain", false, "base dist missing", BASE_DIST.pathname);
}

// ---------- Signer failure modes for ai.run against one mocked adapter ----------
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
push(
  "signer-flag-default",
  flagged.ok === true && flagged.receipt === undefined && flagged.receiptError?.kind === "signer-failed",
  flagged.receiptError?.kind ?? "",
  flagged.receiptError?.message ?? "",
);
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
push("signer-throw", threw && throwName === "ReceiptSigningError", throwName, "");

const noSigner = await L.createAI({ providers: [ad.build(fetchF)] }).run({ task: "t", outputs: { answer: "text" } });
push("no-signer-no-receipt", noSigner.ok === true && noSigner.receipt === undefined && noSigner.receiptError === undefined, "", "");

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
