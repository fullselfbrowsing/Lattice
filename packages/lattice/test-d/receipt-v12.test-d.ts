import {
  expectAssignable,
  expectError,
  expectType,
} from "tsd";
import type {
  CapabilityReceiptBody,
  TrainingClass,
} from "@full-self-browsing/lattice";

declare const body: CapabilityReceiptBody;

expectType<TrainingClass | undefined>(body.modelClass);
expectAssignable<CapabilityReceiptBody["modelClass"]>("frontier_rlhf");
expectAssignable<CapabilityReceiptBody["modelClass"]>(undefined);
expectError<CapabilityReceiptBody["modelClass"]>("not-a-real-class");
