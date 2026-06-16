import { describe, expectTypeOf, it } from "vitest";

import type {
  BudgetInvariant,
  CapabilityContract,
  ContractRejectReasonCode,
  InvariantDeclaration,
  QualityFloorInvariant,
  RealtimeSessionSpec,
  RemoteReceiptSignRequest,
  RemoteReceiptSignerOptions,
  Usage,
} from "./public-types.js";

describe("Phase 7 public type exports", () => {
  it("CapabilityContract is reachable from public-types", () => {
    expectTypeOf<CapabilityContract["kind"]>().toEqualTypeOf<"capability-contract">();
  });

  it("BudgetInvariant fields are optional", () => {
    const b: BudgetInvariant = {};
    expectTypeOf(b).toMatchTypeOf<{
      readonly maxCostUsd?: number;
      readonly p95LatencyMs?: number;
    }>();
  });

  it("QualityFloorInvariant has required suite and minScore", () => {
    const q: QualityFloorInvariant = { suite: "fixtures/x", minScore: 0.8 };
    expectTypeOf(q.suite).toEqualTypeOf<string>();
    expectTypeOf(q.minScore).toEqualTypeOf<number>();
  });

  it("Usage.costUsd is number | null (never undefined)", () => {
    const u: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };
    expectTypeOf(u.costUsd).toEqualTypeOf<number | null>();
  });

  it("ContractRejectReasonCode is the closed four-value union", () => {
    const a: ContractRejectReasonCode = "contract-budget-exceeded";
    const b: ContractRejectReasonCode = "contract-quality-floor";
    const c: ContractRejectReasonCode = "contract-modality-missing";
    const d: ContractRejectReasonCode = "contract-privacy-mismatch";
    expectTypeOf<ContractRejectReasonCode>().toEqualTypeOf<
      | "contract-budget-exceeded"
      | "contract-quality-floor"
      | "contract-modality-missing"
      | "contract-privacy-mismatch"
    >();
    // value-level reachability sanity check
    const all = [a, b, c, d] as const;
    expectTypeOf(all).toMatchTypeOf<readonly ContractRejectReasonCode[]>();
  });

  it("InvariantDeclaration kind is the closed four-value discriminated union (Phase 8 reshape)", () => {
    expectTypeOf<InvariantDeclaration["kind"]>().toEqualTypeOf<
      "must-cite" | "field-from-table" | "no-pii" | "matches"
    >();
  });

  it("RealtimeSessionSpec is reachable as a direction-level public type", () => {
    expectTypeOf<RealtimeSessionSpec["kind"]>().toEqualTypeOf<"realtime-session-spec">();
    expectTypeOf<RealtimeSessionSpec["supportLevel"]>().toEqualTypeOf<"direction-only">();
  });

  it("Remote receipt signer types are reachable from public-types", () => {
    expectTypeOf<RemoteReceiptSignRequest["payloadFormat"]>().toEqualTypeOf<"dsse-pae">();
    expectTypeOf<RemoteReceiptSignerOptions["kid"]>().toEqualTypeOf<string>();
  });
});
