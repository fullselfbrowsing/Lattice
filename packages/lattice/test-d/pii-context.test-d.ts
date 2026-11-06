import { expectAssignable, expectError, expectType } from "tsd";
import {
  inv,
  type PiiDetector,
  type PiiDetectorResult,
  type PiiMatch,
  type PiiDetectionContext,
  type NoPiiInvariant,
  type NoPiiOptions,
} from "@full-self-browsing/lattice";
import type {
  PiiDetector as CoreDetector,
  PiiMatch as CoreMatch,
  PiiDetectionContext as CoreContext,
  NoPiiOptions as CoreOptions,
} from "@full-self-browsing/lattice/core";

declare const detector: PiiDetector;
declare const context: PiiDetectionContext;
expectType<PiiDetectorResult>(detector.detect("text"));
expectType<PiiDetectorResult>(detector.detect("text", context));
expectType<readonly PiiMatch[] | undefined>(detector.findAll?.("text", context));
expectType<CoreDetector>(detector);
expectType<CoreContext>(context);
expectAssignable<CoreMatch>({ start: 0, end: 1, substring: "x" });
expectAssignable<PiiDetector>({ name: "legacy", detect: () => ({ matched: false }) });
expectAssignable<NoPiiOptions>({ id: "privacy", contextual: true });
expectAssignable<CoreOptions>({ contextual: false });
expectType<NoPiiInvariant>(inv.noPII("answer", { contextual: true }));
expectError(inv.noPII("answer", { contextual: "true" }));
