import {
  expectAssignable,
  expectError,
  expectType,
} from "tsd";
import {
  RECEIPT_VERSIONS,
  receiptVerifyAdvisories,
  verifyChain,
  verifyReceipt,
  type CapabilityReceiptBody,
  type CreateReceiptInput,
  type KeySet,
  type ReceiptEnvelope,
  type ReceiptVersion,
  type VerifyAdvisory,
  type VerifyAdvisoryCode,
  type VerifyAdvisorySeverity,
  type VerifyChainOk,
  type VerifyChainOptions,
  type VerifyChainResult,
  type VerifyErrorKind,
  type VerifyOptions,
  type VerifyResult,
} from "@full-self-browsing/lattice";

declare const body: CapabilityReceiptBody;
declare const envelope: ReceiptEnvelope;
declare const keySet: KeySet;

// Issue #21 F2: v1.4 binding fields are additive-optional on the body.
expectType<string | undefined>(body.audience);
expectType<string | undefined>(body.nonce);
expectType<string | undefined>(body.expiresAt);
expectError<CapabilityReceiptBody["expiresAt"]>(42);

// The version union gained v1.4; unknown literals are rejected at compile time.
expectAssignable<CapabilityReceiptBody["version"]>("lattice-receipt/v1.4");
expectAssignable<ReceiptVersion>("lattice-receipt/v1.1");
expectError<CapabilityReceiptBody["version"]>("lattice-receipt/v2");
expectType<readonly ReceiptVersion[]>(RECEIPT_VERSIONS);

// CreateReceiptInput accepts the binding fields.
expectAssignable<CreateReceiptInput>({
  runId: "run-x",
  model: { requested: "m", observed: null },
  route: { providerId: "p", capabilityId: "p/m", attemptNumber: 1 },
  usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: null,
  audience: "svc-a",
  nonce: "n-1",
  expiresAt: "2026-01-01T00:00:00.000Z",
});

// F2/F4: VerifyOptions and the three-argument verifyReceipt.
expectAssignable<VerifyOptions>({
  minVersion: "lattice-receipt/v1.3",
  expectedAudience: "svc-a",
  expectedNonce: "n-1",
  now: new Date(),
  maxAgeMs: 60_000,
});
expectAssignable<VerifyOptions>({ now: "2026-01-01T00:00:00Z" });
expectError<VerifyOptions>({ minVersion: "lattice-receipt/v9" });
expectType<Promise<VerifyResult>>(verifyReceipt(envelope, keySet));
expectType<Promise<VerifyResult>>(verifyReceipt(envelope, keySet, {}));
expectAssignable<VerifyErrorKind>("audience-mismatch");
expectAssignable<VerifyErrorKind>("nonce-mismatch");
expectAssignable<VerifyErrorKind>("receipt-expired");

// F3: verifyChain over a set of envelopes.
expectType<Promise<VerifyChainResult>>(verifyChain([envelope], keySet));
expectType<Promise<VerifyChainResult>>(
  verifyChain([envelope], keySet, {
    expectedRunId: "run-x",
    expectedCount: 1,
    expectedRootCid: "sha256:abab",
    expectedAudience: "svc-a",
  }),
);

// Chain closure: signed body fields, issuance input, and verifier options.
expectType<"member-cids" | undefined>(body.chainClosure);
expectType<readonly string[] | undefined>(body.chainMemberCids);
expectError<CapabilityReceiptBody["chainClosure"]>("merkle-v2");
expectAssignable<CreateReceiptInput>({
  runId: "run-x",
  model: { requested: "m", observed: null },
  route: { providerId: "p", capabilityId: "p/m", attemptNumber: 1 },
  usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: null,
  chainClosure: "member-cids",
  chainMemberCids: ["sha256:abab"],
});
expectError<CreateReceiptInput["chainClosure"]>("merkle-v2");
expectAssignable<VerifyChainOptions>({ requireClosure: true, partial: true });
expectError<VerifyChainOptions>({ requireClosure: "yes" });

// Structured advisories from receiptVerifyAdvisories and VerifyChainOk.
declare const chainOk: VerifyChainOk;
expectType<readonly VerifyAdvisory[]>(receiptVerifyAdvisories(body));
expectType<readonly VerifyAdvisory[]>(receiptVerifyAdvisories(body, { expectedAudience: "svc-a" }));
expectType<readonly VerifyAdvisory[] | undefined>(chainOk.advisories);
declare const advisory: VerifyAdvisory;
expectType<VerifyAdvisoryCode>(advisory.code);
expectType<VerifyAdvisorySeverity>(advisory.severity);
expectType<string>(advisory.message);
expectAssignable<VerifyAdvisorySeverity>("warn");
expectAssignable<VerifyAdvisorySeverity>("info");
expectError<VerifyAdvisorySeverity>("error");
expectAssignable<VerifyAdvisoryCode>("audience-unchecked");
expectAssignable<VerifyAdvisoryCode>("tail-truncation-unchecked");
expectError<VerifyAdvisoryCode>("audience");
