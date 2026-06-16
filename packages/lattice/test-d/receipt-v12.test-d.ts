import {
  expectAssignable,
  expectError,
  expectType,
} from "tsd";
import type {
  CapabilityReceiptBody,
  CreateReceiptInput,
  TrainingClass,
} from "@full-self-browsing/lattice";

declare const body: CapabilityReceiptBody;

expectType<TrainingClass | undefined>(body.modelClass);
expectAssignable<CapabilityReceiptBody["modelClass"]>("frontier_rlhf");
expectAssignable<CapabilityReceiptBody["modelClass"]>(undefined);
expectError<CapabilityReceiptBody["modelClass"]>("not-a-real-class");

// Phase 39 (DELEG-06): parentReceiptCid is additive-optional on the v1.2 body.
expectType<string | undefined>(body.parentReceiptCid);
expectAssignable<CapabilityReceiptBody["parentReceiptCid"]>(
  "sha256:abababababababababababababababababababababababababababababababab",
);
expectAssignable<CapabilityReceiptBody["parentReceiptCid"]>(undefined);
expectError<CapabilityReceiptBody["parentReceiptCid"]>(42);

// Phase 46 (REC-01): lineageMerkleRoot is additive-optional on the v1.3 body.
expectType<string | undefined>(body.lineageMerkleRoot);
expectAssignable<CapabilityReceiptBody["lineageMerkleRoot"]>(
  "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
);
expectAssignable<CapabilityReceiptBody["lineageMerkleRoot"]>(undefined);
expectError<CapabilityReceiptBody["lineageMerkleRoot"]>(42);

// CreateReceiptInput accepts the optional member.
declare const input: CreateReceiptInput;
expectType<string | undefined>(input.parentReceiptCid);
expectType<string | undefined>(input.lineageMerkleRoot);
expectAssignable<CreateReceiptInput>({
  runId: "run-x",
  model: { requested: "m", observed: null },
  route: { providerId: "p", capabilityId: "p/m", attemptNumber: 1 },
  usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: null,
  parentReceiptCid:
    "sha256:abababababababababababababababababababababababababababababababab",
  lineageMerkleRoot:
    "sha256:cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
});
