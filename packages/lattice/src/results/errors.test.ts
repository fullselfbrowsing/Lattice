import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  LatticeRunError,
  NoContractMatchError,
  TripwireViolationError,
} from "./errors.js";
import { isTerminal } from "./errors.js";

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

describe("Phase 8 isTerminal predicate and TripwireViolationError", () => {
  it("TripwireViolationError has kind 'tripwire-violated' with terminal: true literal", () => {
    const err: TripwireViolationError = {
      kind: "tripwire-violated",
      message: "no-pii: detector \"email\" flagged content at \"text\".",
      invariantId: "no-pii-1",
      evidence: {
        invariantId: "no-pii-1",
        kind: "no-pii",
        path: "text",
        observed: { detector: "email", substring: "a@b.co" },
        message: "no-pii: detector \"email\" flagged content at \"text\".",
      },
      terminal: true,
    };
    expect(err.kind).toBe("tripwire-violated");
    expect(err.terminal).toBe(true);
    expectTypeOf(err.terminal).toEqualTypeOf<true>();
  });

  it("LatticeRunError union includes TripwireViolationError", () => {
    const err: LatticeRunError = {
      kind: "tripwire-violated",
      message: "x",
      invariantId: "must-cite-1",
      evidence: {
        invariantId: "must-cite-1",
        kind: "must-cite",
        path: "citations",
        observed: [],
        message: "x",
      },
      terminal: true,
    };
    expect(err.kind).toBe("tripwire-violated");
  });

  it("isTerminal(tripwire-violated) returns true", () => {
    expect(
      isTerminal({
        kind: "tripwire-violated",
        message: "x",
        invariantId: "id",
        evidence: {
          invariantId: "id",
          kind: "must-cite",
          path: "citations",
          observed: [],
          message: "x",
        },
        terminal: true,
      }),
    ).toBe(true);
  });

  it("isTerminal(no-contract-match) returns true", () => {
    expect(
      isTerminal({
        kind: "no-contract-match",
        message: "x",
        noRouteReasons: [],
      }),
    ).toBe(true);
  });

  it("isTerminal(validation) returns false", () => {
    expect(
      isTerminal({
        kind: "validation",
        message: "x",
        issues: [],
      }),
    ).toBe(false);
  });

  it("isTerminal(no_route) returns false", () => {
    expect(
      isTerminal({
        kind: "no_route",
        message: "x",
        reasons: [],
      }),
    ).toBe(false);
  });

  it("isTerminal(execution_unavailable) returns false", () => {
    expect(
      isTerminal({
        kind: "execution_unavailable",
        message: "x",
      }),
    ).toBe(false);
  });

  it("isTerminal(provider_execution) returns false", () => {
    expect(
      isTerminal({
        kind: "provider_execution",
        message: "x",
      }),
    ).toBe(false);
  });

  it("isTerminal(timeout) returns false", () => {
    expect(
      isTerminal({
        kind: "timeout",
        message: "x",
      }),
    ).toBe(false);
  });
});
