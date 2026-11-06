import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { L, RESULTS, makeKeys } from "./lib.mjs";

const payloads = JSON.parse(readFileSync(`${RESULTS}/payloads.json`, "utf8"));
const keys = await makeKeys("tamper-suite");
const other = await makeKeys("tamper-other");

function sha(text) {
  return createHash("sha256").update(text).digest("hex");
}

const receipts = [];
for (const run of payloads.runs) {
  receipts.push(await L.createReceipt({
    runId: `tamper:${run.id}`,
    model: { requested: payloads.model, observed: payloads.model },
    route: { providerId: "ollama", capabilityId: payloads.model, attemptNumber: 1 },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [sha(run.requestText)],
    outputHash: sha(run.responseText),
    signer: keys.signer,
  }, keys.signer));
}

async function rejected(receipt) {
  return (await L.verifyReceipt(receipt, keys.keySet)).ok !== true;
}

const flipped = structuredClone(receipts[0]);
const payload = Buffer.from(flipped.payload, "base64");
payload[20] ^= 0xff;
flipped.payload = payload.toString("base64");

const truncated = structuredClone(receipts[0]);
truncated.payload = truncated.payload.slice(0, -8);

const swapped = structuredClone(receipts[0]);
const body = JSON.parse(Buffer.from(swapped.payload, "base64").toString("utf8"));
body.outputHash = sha("swapped-output");
swapped.payload = Buffer.from(JSON.stringify(body)).toString("base64");

const resigned = await L.createReceipt({
  runId: "tamper:other",
  model: { requested: payloads.model, observed: payloads.model },
  route: { providerId: "ollama", capabilityId: payloads.model, attemptNumber: 1 },
  usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [sha("other")],
  outputHash: sha("other-output"),
  signer: other.signer,
}, other.signer);

const mutations = {
  "byte-flip": await rejected(flipped),
  truncate: await rejected(truncated),
  swap: await rejected(swapped),
  "other-key": await rejected(resigned),
};
console.log(JSON.stringify({
  mutations,
  note: "Each class is a single signed receipt. other-key is a receipt signed by a second key and checked against the first key set.",
}));
