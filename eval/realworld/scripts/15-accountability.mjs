// Offline matched-record comparison. No model, provider, or network calls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as L from "../../../packages/lattice/dist/index.js";

// Reuse the core package's installed canonicalizer through its declared ESM entry.
const canonicalizerRoot = new URL("../../../packages/lattice/node_modules/canonicalize/", import.meta.url);
const canonicalizerPackage = JSON.parse(readFileSync(new URL("package.json", canonicalizerRoot), "utf8"));
const { default: canonicalize } = await import(new URL(canonicalizerPackage.exports["."].import, canonicalizerRoot));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const LATTICE_DIST = fileURLToPath(new URL("../../../packages/lattice/dist/", import.meta.url));
const DEFAULT_OUTPUT = fileURLToPath(new URL("../results/accountability.json", import.meta.url));
const GENERIC_VERSION = "matched-signed-log/v1";
const GENERIC_PREFIX = Buffer.from(`${GENERIC_VERSION}\n`, "utf8");
const KID = "offline-synthetic-key";
const ARMS = ["json-log", "signed-canonical-log", "lattice-receipt"];

export const SYNTHETIC_FIXTURES = [
  {
    id: "ticket-a",
    task: "Summarize the shipping request.",
    policy: { privacy: "standard", noLogging: true },
    input: "Synthetic order A requests delivery on Tuesday.",
    output: { answer: "Order A requests Tuesday delivery." },
  },
  {
    id: "ticket-b",
    task: "Résume ce message synthétique.",
    policy: { noPublicUrl: true, privacy: "sensitive" },
    input: "Le colis synthétique B arrive mercredi.",
    output: { answer: "Le colis B arrive mercredi." },
  },
  {
    id: "ticket-c",
    task: "Classify the synthetic support request.",
    policy: { gateway: { metadata: { team: "synthetic", purpose: "offline-test" } }, noUpload: true },
    input: "Synthetic account C needs a password reset.",
    output: { answer: "Account support: password reset." },
  },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalBytes(value) {
  const text = canonicalize(value);
  assert.equal(typeof text, "string", "Record must have a canonical JSON representation");
  return Buffer.from(text, "utf8");
}

function decodeRecord(envelope) {
  return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
}

function genericSign(record, privateKey) {
  const bytes = canonicalBytes(record);
  return {
    version: GENERIC_VERSION,
    keyid: record.kid,
    payload: bytes.toString("base64"),
    signature: sign(null, Buffer.concat([GENERIC_PREFIX, bytes]), privateKey).toString("base64"),
  };
}

function genericVerify(envelope, publicKey) {
  try {
    if (envelope.version !== GENERIC_VERSION) return { ok: false, reason: "unsupported-format" };
    const bytes = Buffer.from(envelope.payload, "base64");
    const record = decodeRecord(envelope);
    if (envelope.keyid !== record.kid || envelope.keyid !== KID) return { ok: false, reason: "key-mismatch" };
    if (bytes.toString("base64") !== envelope.payload || !canonicalBytes(record).equals(bytes)) {
      return { ok: false, reason: "noncanonical-payload" };
    }
    const ok = verify(null, Buffer.concat([GENERIC_PREFIX, bytes]), publicKey, Buffer.from(envelope.signature, "base64"));
    return { ok, record, reason: ok ? "signature-valid" : "signature-invalid" };
  } catch {
    return { ok: false, reason: "malformed-artifact" };
  }
}

// Give the generic signed log the same application-level equality policy as
// Lattice. Signature verification alone does not compare external expectations.
function matchesExpectations(record, expectations) {
  return [
    ["taskHash", "expectedTaskHash"],
    ["policyHash", "expectedPolicyHash"],
    ["providerRequestHashes", "expectedProviderRequestHashes"],
  ].every(([field, option]) => expectations[option] === undefined ||
    canonicalize(record[field]) === canonicalize(expectations[option]));
}

async function evaluate(arm, artifact, keys, expectations) {
  let base;
  if (arm === "lattice-receipt") {
    const result = await L.verifyReceipt(artifact, keys.keySet);
    base = result.ok
      ? { ok: true, record: result.body, reason: "signature-valid" }
      : { ok: false, reason: result.error.kind };
  } else if (arm === "signed-canonical-log") {
    base = genericVerify(artifact, keys.publicKey);
  } else {
    try {
      const record = JSON.parse(artifact);
      base = { ok: record !== null && typeof record === "object" && !Array.isArray(record), record, reason: "json-parses-without-authentication" };
    } catch {
      base = { ok: false, reason: "malformed-json" };
    }
  }
  let expectationAccepted = null;
  let reason = base.reason;
  if (base.ok && expectations !== undefined) {
    if (arm === "lattice-receipt") {
      const checked = await L.verifyReceipt(artifact, keys.keySet, expectations);
      expectationAccepted = checked.ok;
      if (!checked.ok) reason = checked.error.kind;
    } else {
      expectationAccepted = matchesExpectations(base.record, expectations);
      if (!expectationAccepted) reason = "application-binding-mismatch";
    }
  }
  return {
    applicable: true,
    signatureOrParseAccepted: base.ok,
    authenticated: arm === "json-log" ? false : base.ok,
    expectationAccepted,
    accepted: base.ok && expectationAccepted !== false,
    reason,
  };
}

function keysFromPair(pair) {
  const publicKeyJwk = pair.publicKey.export({ format: "jwk" });
  return {
    ...pair,
    signer: L.createInMemorySigner(pair.privateKey.export({ format: "jwk" }), { kid: KID, publicKeyJwk }),
    keySet: L.createMemoryKeySet([{ kid: KID, publicKeyJwk, state: "active" }]),
  };
}

async function makeArtifacts(input, keys) {
  const receipt = await L.createReceipt(input, keys.signer);
  // The complete receipt body is the common record. The generic comparator
  // signs every field, including all input/output/task/policy/request hashes.
  const record = decodeRecord(receipt);
  const json = canonicalBytes(record).toString("utf8");
  const generic = genericSign(record, keys.privateKey);
  assert.equal(generic.payload, receipt.payload, "Signed arms must carry identical canonical record bytes");
  return {
    record,
    artifacts: { "json-log": json, "signed-canonical-log": generic, "lattice-receipt": receipt },
  };
}

function mutateContent(original, mutate) {
  const record = structuredClone(original.record);
  mutate(record);
  const bytes = canonicalBytes(record);
  return {
    "json-log": bytes.toString("utf8"),
    "signed-canonical-log": { ...original.artifacts["signed-canonical-log"], payload: bytes.toString("base64") },
    "lattice-receipt": { ...original.artifacts["lattice-receipt"], payload: bytes.toString("base64") },
  };
}

function summaryFor(probes, arm) {
  const categories = {};
  for (const probe of probes) {
    const counts = categories[probe.category] ??= { cases: 0, accepted: 0, rejected: 0, unsupported: 0 };
    counts.cases += 1;
    const outcome = probe.outcomes[arm];
    if (!outcome.applicable) counts.unsupported += 1;
    else if (outcome.accepted) counts.accepted += 1;
    else counts.rejected += 1;
  }
  return categories;
}

export async function runAccountabilityBenchmark({ generatedAt = new Date().toISOString() } = {}) {
  const keys = keysFromPair(generateKeyPairSync("ed25519"));
  const wrongKeys = keysFromPair(generateKeyPairSync("ed25519"));
  const records = [];
  const probes = [];

  for (const fixture of SYNTHETIC_FIXTURES) {
    const requestBytes = JSON.stringify({
      model: "synthetic:offline", messages: [{ role: "user", content: fixture.task }], input: fixture.input,
    });
    const input = {
      runId: `synthetic:${fixture.id}`, receiptId: `synthetic-receipt:${fixture.id}`,
      issuedAt: "2026-10-27T00:00:00.000Z",
      model: { requested: "synthetic:offline", observed: "synthetic:offline" },
      route: { providerId: "synthetic", capabilityId: "synthetic:offline", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      contractVerdict: "success", contractHash: null,
      taskHash: await L.hashCanonicalForReceipt(fixture.task),
      policyHash: await L.hashCanonicalForReceipt(fixture.policy),
      inputHashes: [sha256(fixture.input)], outputHash: sha256(canonicalBytes(fixture.output)),
      providerRequestHashes: [sha256(requestBytes)],
    };
    const original = await makeArtifacts(input, keys);
    records.push({ fixtureId: fixture.id, record: original.record, canonicalRecordSha256: sha256(canonicalBytes(original.record)), matchedRecordBytes: true });

    async function probe(id, category, artifacts, expected, { verifyKeys = keys, expectations } = {}) {
      const outcomes = {};
      for (const arm of ARMS) {
        outcomes[arm] = category === "key-mismatch" && arm === "json-log"
          ? { applicable: false, signatureOrParseAccepted: null, authenticated: false, expectationAccepted: null, accepted: null, reason: "unsigned-log-has-no-key-verification" }
          : await evaluate(arm, artifacts[arm], verifyKeys, expectations);
      }
      probes.push({
        fixtureId: fixture.id, id, category,
        ...(expectations !== undefined ? { expectations } : {}),
        expectedAccepted: expected, outcomes,
        asExpected: ARMS.every((arm) => outcomes[arm].accepted === expected[arm]),
      });
    }

    const acceptAll = Object.fromEntries(ARMS.map((arm) => [arm, true]));
    const rejectAll = Object.fromEntries(ARMS.map((arm) => [arm, false]));
    const rejectSigned = { "json-log": true, "signed-canonical-log": false, "lattice-receipt": false };
    await probe("unchanged", "positive-control", original.artifacts, acceptAll);
    const editedBytes = Buffer.from(original.artifacts["json-log"], "utf8");
    const byteIndex = editedBytes.indexOf(Buffer.from("synthetic:offline"));
    assert.ok(byteIndex >= 0);
    editedBytes[byteIndex] = "S".charCodeAt(0);
    assert.notEqual(editedBytes.toString("utf8"), original.artifacts["json-log"]);
    JSON.parse(editedBytes.toString("utf8"));
    await probe("valid-json-byte-edit", "integrity-mutation", {
      "json-log": editedBytes.toString("utf8"),
      "signed-canonical-log": { ...original.artifacts["signed-canonical-log"], payload: editedBytes.toString("base64") },
      "lattice-receipt": { ...original.artifacts["lattice-receipt"], payload: editedBytes.toString("base64") },
    }, rejectSigned);

    const changedTaskHash = await L.hashCanonicalForReceipt(`${fixture.task} Changed.`);
    const changedPolicyHash = await L.hashCanonicalForReceipt({ ...fixture.policy, noLogging: false });
    const changedRequestHash = sha256(`${requestBytes} `);
    const mutations = [
      ["content-edit", (record) => { record.model.observed = "changed-model-claim"; }],
      ["task-change", (record) => { record.taskHash = changedTaskHash; }],
      ["policy-change", (record) => { record.policyHash = changedPolicyHash; }],
      ["input-change", (record) => { record.inputHashes = [sha256(`${fixture.input} Changed.`)]; }],
      ["output-change", (record) => { record.outputHash = sha256("changed output"); }],
      ["request-change", (record) => { record.providerRequestHashes = [changedRequestHash]; }],
    ];
    for (const [id, mutate] of mutations) {
      await probe(id, "integrity-mutation", mutateContent(original, mutate), rejectSigned);
    }
    await probe("wrong-verification-key", "key-mismatch", original.artifacts, {
      "json-log": null, "signed-canonical-log": false, "lattice-receipt": false,
    }, { verifyKeys: wrongKeys });

    const rewritten = await makeArtifacts({ ...input, taskHash: changedTaskHash, outputHash: sha256("signer-authorized replacement output") }, keys);
    await probe("trusted-signer-rewrite", "positive-control", rewritten.artifacts, acceptAll);
    for (const [id, expectations] of [
      ["expected-task-mismatch", { expectedTaskHash: changedTaskHash }],
      ["expected-policy-mismatch", { expectedPolicyHash: changedPolicyHash }],
      ["expected-request-mismatch", { expectedProviderRequestHashes: [changedRequestHash] }],
    ]) {
      await probe(id, "expectation-check", original.artifacts, rejectAll, { expectations });
    }
    await probe("trusted-rewrite-vs-original-task", "expectation-check", rewritten.artifacts, rejectAll, {
      expectations: { expectedTaskHash: input.taskHash },
    });
  }

  return {
    schemaVersion: "lattice-accountability-benchmark/v1",
    kind: "offline-synthetic", generatedAt, inferenceCalls: 0, spendUsd: 0,
    provenance: {
      codeRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim(),
      trackedWorktreeDirty: execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: REPO, encoding: "utf8" }).trim().length > 0,
      scriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      fixtureSha256: sha256(canonicalBytes(SYNTHETIC_FIXTURES)),
      builtLibrarySha256: sha256(canonicalBytes(readdirSync(LATTICE_DIST).filter((name) => name.endsWith(".js")).sort().map((name) => ({ name, sha256: sha256(readFileSync(resolve(LATTICE_DIST, name))) })))),
      canonicalizerVersion: canonicalizerPackage.version,
      node: process.version, latticeVersion: L.latticeVersion,
    },
    methodology: {
      commonRecord: "All arms store the complete identical canonical Lattice receipt body, including every task, policy, input, output, and request digest. Raw synthetic values are committed by hashes in every arm.",
      signing: "Both signed arms use the same ephemeral Ed25519 key. The generic log signs its domain prefix plus canonical record bytes using node:crypto; Lattice signs its DSSE PAE. Private keys are never saved.",
      mutations: "Integrity probes change the same record bytes or fields without updating either signature. The byte edit preserves valid JSON; JSON parsing failures are not counted as integrity protection.",
      expectationPolicy: "Generic and unsigned logs receive matching explicit application equality checks; Lattice uses VerifyOptions. Base signature/parse acceptance is reported separately from expectation acceptance. Unsigned equality does not authenticate the asserted fields.",
      interpretation: "A trusted signer can rewrite and re-sign records; both signed formats should accept that positive control. Signatures do not establish factual correctness, policy enforcement, real model execution, or provider consumption. No truncation/chain completeness claim is tested.",
      aggregation: "Category counts retain controls, expectation checks, and unsupported key checks separately. asExpected measures benchmark correctness, not model quality or comparative security superiority.",
    },
    fixtures: SYNTHETIC_FIXTURES,
    records,
    probes,
    summary: Object.fromEntries(ARMS.map((arm) => [arm, summaryFor(probes, arm)])),
    signedArmDecisionParity: probes.every((probe) => probe.outcomes["signed-canonical-log"].accepted === probe.outcomes["lattice-receipt"].accepted),
    allProbesAsExpected: probes.every((probe) => probe.asExpected),
  };
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === "--out")) {
    throw new Error("Usage: node eval/realworld/scripts/15-accountability.mjs [--out path]");
  }
  const destination = args.length === 2 ? resolve(args[1]) : DEFAULT_OUTPUT;
  const result = await runAccountabilityBenchmark();
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ output: destination, records: result.records.length, probes: result.probes.length, signedArmDecisionParity: result.signedArmDecisionParity, allProbesAsExpected: result.allProbesAsExpected, inferenceCalls: 0 }));
  if (!result.allProbesAsExpected) process.exitCode = 1;
}
