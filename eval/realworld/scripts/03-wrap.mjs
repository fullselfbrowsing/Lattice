// Wrap the recorded payloads in a Lattice receipt and a Sello receipt.
// Model calls already happened. This measures the artifact, not generation.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { L, ROOT, RESULTS, makeKeys, containsMarker, writeJSON } from "./lib.mjs";

// Comparison checkouts live in CMP_DIR (see fetch-competitors.sh).
const CMP_DIR = process.env.CMP_DIR ?? resolve(ROOT, ".cache", "cmp");
const SELLO = process.env.SELLO_SRC ?? resolve(CMP_DIR, "sello", "sdks", "typescript", "src");
const payloads = JSON.parse(readFileSync(resolve(RESULTS, "payloads.json"), "utf8"));
const markers = payloads.markers ?? [];

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

const keys = await makeKeys("realworld-wrap");
const other = await makeKeys("realworld-attacker");
const latticeRows = [];
for (const run of payloads.runs) {
  const bodyText = JSON.stringify({ request: run.requestText, response: run.responseText });
  const t0 = performance.now();
  const receipt = await L.createReceipt({
    runId: `realworld:${run.id}`,
    model: { requested: payloads.model, observed: payloads.model },
    route: { providerId: "ollama", capabilityId: payloads.model, attemptNumber: 1 },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [sha(run.requestText)],
    outputHash: sha(run.responseText),
    signer: keys.signer,
  }, keys.signer);
  const ms = performance.now() - t0;
  const encoded = JSON.stringify(receipt);
  const verify = await L.verifyReceipt(receipt, keys.keySet);
  const tampered = JSON.parse(encoded);
  const payload = Buffer.from(tampered.payload, "base64");
  payload[20] ^= 0xff;
  tampered.payload = payload.toString("base64");
  const flipped = await L.verifyReceipt(tampered, keys.keySet);
  const resigned = await L.createReceipt({
    runId: `realworld:${run.id}`,
    model: { requested: payloads.model, observed: payloads.model },
    route: { providerId: "ollama", capabilityId: payloads.model, attemptNumber: 1 },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [sha(run.requestText)],
    outputHash: sha("tampered"),
    signer: other.signer,
  }, other.signer);
  const resignedCheck = await L.verifyReceipt(resigned, keys.keySet);
  latticeRows.push({
    id: run.id,
    ms: +ms.toFixed(3),
    bytes: Buffer.byteLength(encoded),
    verifyOk: verify.ok === true,
    byteFlipRejected: flipped.ok !== true,
    resignOtherKeyRejected: resignedCheck.ok !== true,
    leak: containsMarker(encoded, markers).leak,
  });
}

const sello = await import(`${SELLO}/service/create-receipt.ts`);
const cose = await import(`${SELLO}/cose/sign1.ts`);
const hpke = await import(`${SELLO}/hpke/receipt.ts`);
const ids = await import(`${SELLO}/crypto/identifiers.ts`);
const mockLog = await import(`${SELLO}/log/mock-log.ts`);
const jws = await import(`${SELLO}/token/jws-profile.ts`);
const registry = await import(`${SELLO}/registry/json-registry.ts`);
const owner = await import(`${SELLO}/owner/verify.ts`);

const textEncoder = new TextEncoder();
const logUrl = "https://log.example/sello";
const ownerKeys = hpke.generateHpkeKeyPair();
const service = cose.generateEd25519KeyPair();
const trustRoot = cose.generateEd25519KeyPair();
const tokenIssuer = cose.generateEd25519KeyPair();
const serviceKid = textEncoder.encode("lattice-eval");
const log = new mockLog.MockTransparencyLog(logUrl);
const authorizationToken = jws.signSelloJwsToken({
  issuerPrivateKey: tokenIssuer.privateKey,
  payload: {
    sub: "lattice-eval",
    owner_hpke_pk: jws.base64urlEncode(ownerKeys.publicKey),
    sello_logs: [logUrl],
  },
});
const registryBytes = textEncoder.encode(JSON.stringify({
  [ids.toHex(serviceKid)]: {
    service_identifier: "lattice-eval",
    public_key_ed25519: Buffer.from(service.publicKey).toString("base64url"),
  },
}));
const loadedRegistry = registry.loadSignedRegistry({
  registryBytes,
  signatureBase64Url: registry.signRegistryJson(registryBytes, trustRoot.privateKey),
  trustRootPublicKey: trustRoot.publicKey,
});

const selloRows = [];
const envelopes = [];
for (const run of payloads.runs) {
  const t0 = performance.now();
  const created = sello.createReceiptFromJwsToken({
    authorizationToken,
    tokenIssuerPublicKey: tokenIssuer.publicKey,
    serviceKid,
    servicePrivateKey: service.privateKey,
    serviceIdentifier: "lattice-eval",
    log,
    actionType: run.id,
    actionInputBytes: textEncoder.encode(run.requestText),
    actionOutputBytes: textEncoder.encode(run.responseText),
    resultStatus: "success",
    timestamp: "2026-10-21T17:00:00Z",
  });
  const ms = performance.now() - t0;
  envelopes.push(created.envelope);
  const raw = Buffer.from(created.envelope).toString("utf8");
  selloRows.push({
    id: run.id,
    ms: +ms.toFixed(3),
    bytes: created.envelope.byteLength,
    leak: markers.some((marker) => raw.includes(marker)),
  });
}
const verified = owner.verifyReceipts({
  authorizationTokenBytes: textEncoder.encode(authorizationToken),
  trustedLogs: [log],
  registry: loadedRegistry,
  ownerPrivateKey: ownerKeys.privateKey,
});
const selloVerifyOk = verified.receipts.length === payloads.runs.length && verified.rejected.length === 0;

// Tamper one stored envelope the way the Sello demo does, then verify again.
const decoded = cose.decodeReceiptEnvelope(envelopes[0]);
const cbor = await import(`${SELLO}/cbor.ts`);
log.append(cbor.encodeCbor([
  decoded.protectedBytes,
  new Map(),
  textEncoder.encode("tampered payload"),
  decoded.signature,
]), "2026-10-21T17:00:01Z");
const after = owner.verifyReceipts({
  authorizationTokenBytes: textEncoder.encode(authorizationToken),
  trustedLogs: [log],
  registry: loadedRegistry,
  ownerPrivateKey: ownerKeys.privateKey,
});

const dir = resolve(RESULTS, "artifacts");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "sello-envelopes.bin"), Buffer.concat(envelopes.map((e) => Buffer.from(e))));

writeJSON("wrap-node.json", {
  lattice: {
    measured: true,
    locNote: "createReceipt over sha256 of the recorded request and response",
    rows: latticeRows,
    verifyOk: latticeRows.every((r) => r.verifyOk),
    byteFlipRejected: latticeRows.every((r) => r.byteFlipRejected),
    resignOtherKeyRejected: latticeRows.every((r) => r.resignOtherKeyRejected),
    leak: latticeRows.some((r) => r.leak),
    bytes: latticeRows.reduce((s, r) => s + r.bytes, 0),
    ms: latticeRows.reduce((s, r) => s + r.ms, 0),
  },
  sello: {
    measured: true,
    mode: "typescript SDK createReceiptFromJwsToken + MockTransparencyLog (not the public transparency log)",
    commit: process.env.SELLO_COMMIT ?? null,
    verifyOk: selloVerifyOk,
    validBeforeTamper: verified.receipts.length,
    rejectedBeforeTamper: verified.rejected.length,
    rejectedAfterTamper: after.rejected.length,
    tamperDetected: after.rejected.length > verified.rejected.length,
    leak: selloRows.some((r) => r.leak),
    bytes: selloRows.reduce((s, r) => s + r.bytes, 0),
    ms: selloRows.reduce((s, r) => s + r.ms, 0),
    rows: selloRows,
  },
});
console.log(JSON.stringify({ latticeLeak: latticeRows.some((r) => r.leak), selloLeak: selloRows.some((r) => r.leak), selloVerifyOk, tamper: after.rejected.length }));
