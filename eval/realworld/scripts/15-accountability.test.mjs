import assert from "node:assert/strict";
import { test } from "node:test";
import { runAccountabilityBenchmark, SYNTHETIC_FIXTURES } from "./15-accountability.mjs";

test("matched accountability benchmark separates integrity and caller expectations", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Offline benchmark must not use the network"); };
  try {
    const result = await runAccountabilityBenchmark({ generatedAt: "2026-10-27T00:00:00Z" });
    assert.equal(result.records.length, SYNTHETIC_FIXTURES.length);
    assert.equal(result.probes.length, 14 * SYNTHETIC_FIXTURES.length);
    assert.equal(result.allProbesAsExpected, true);
    assert.equal(result.signedArmDecisionParity, true);
    assert.equal(result.inferenceCalls, 0);
    assert.equal(result.spendUsd, 0);
    assert.ok(result.records.every((record) => record.matchedRecordBytes));

    for (const probe of result.probes) {
      const generic = probe.outcomes["signed-canonical-log"];
      const lattice = probe.outcomes["lattice-receipt"];
      const plain = probe.outcomes["json-log"];
      if (probe.category === "integrity-mutation") {
        assert.equal(generic.signatureOrParseAccepted, false);
        assert.equal(lattice.signatureOrParseAccepted, false);
        assert.equal(plain.accepted, true);
        assert.equal(plain.authenticated, false);
      }
      if (probe.category === "expectation-check") {
        assert.equal(generic.signatureOrParseAccepted, true);
        assert.equal(lattice.signatureOrParseAccepted, true);
        assert.equal(generic.expectationAccepted, false);
        assert.equal(lattice.expectationAccepted, false);
        assert.equal(lattice.reason, "execution-binding-mismatch");
        assert.equal(plain.expectationAccepted, false);
      }
      if (probe.id === "trusted-signer-rewrite") {
        assert.equal(generic.accepted, true);
        assert.equal(lattice.accepted, true);
      }
      if (probe.category === "key-mismatch") assert.equal(plain.applicable, false);
    }
    assert.deepEqual(result.summary["signed-canonical-log"], result.summary["lattice-receipt"]);
    assert.equal(result.summary["json-log"]["key-mismatch"].unsupported, SYNTHETIC_FIXTURES.length);

    const repeated = await runAccountabilityBenchmark({ generatedAt: result.generatedAt });
    // Fresh ephemeral keys must not change records, decisions, or denominators.
    assert.deepEqual(repeated, result);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
