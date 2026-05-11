import { describe, expect, expectTypeOf, it } from "vitest";
import type { LatticeRunError, NoContractMatchError } from "./errors.js";

describe("Phase 7 LatticeRunError additions", () => {
  it("NoContractMatchError has the expected shape", () => {
    const err: NoContractMatchError = {
      kind: "no-contract-match",
      message: "no route satisfies the contract",
      noRouteReasons: [{ code: "contract-budget-exceeded", message: "x" }],
    };
    expect(err.kind).toBe("no-contract-match");
    expect(err.message).toBe("no route satisfies the contract");
    expect(err.noRouteReasons).toHaveLength(1);
  });

  it("LatticeRunError includes no-contract-match in the union", () => {
    const err: LatticeRunError = {
      kind: "no-contract-match",
      message: "x",
      noRouteReasons: [],
    };
    expect(err.kind).toBe("no-contract-match");
  });

  it("kind discriminant narrows correctly", () => {
    const err: LatticeRunError = {
      kind: "no-contract-match",
      message: "x",
      noRouteReasons: [],
    };
    if (err.kind === "no-contract-match") {
      expectTypeOf(err.noRouteReasons).toMatchTypeOf<
        readonly { code: string; message: string }[]
      >();
    }
  });

  it("RunSuccess type requires a usage field", () => {
    type SuccessUsage = import("./result.js").RunSuccess<{ text: "text" }>["usage"];
    expectTypeOf<SuccessUsage>().toMatchTypeOf<{
      readonly promptTokens: number;
      readonly completionTokens: number;
      readonly costUsd: number | null;
    }>();
  });

  it("RunFailure type requires a usage field", () => {
    type FailureUsage = import("./result.js").RunFailure["usage"];
    expectTypeOf<FailureUsage>().toMatchTypeOf<{
      readonly promptTokens: number;
      readonly completionTokens: number;
      readonly costUsd: number | null;
    }>();
  });
});
