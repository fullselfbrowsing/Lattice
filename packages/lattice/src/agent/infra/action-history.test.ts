import { describe, expect, it } from "vitest";

import { createActionHistory, STUCK_REASONS } from "./action-history.js";

describe("createActionHistory", () => {
  it("STUCK_REASONS vocabulary is the documented 3-value tuple", () => {
    expect([...STUCK_REASONS]).toEqual([
      "consecutive-identical-tool-call",
      "no-progress",
      "ping-pong",
    ]);
  });

  it("returns null while the history is shorter than consecutiveLimit", () => {
    const h = createActionHistory({ consecutiveLimit: 3 });
    expect(h.recordAction({ iterationIndex: 0, toolName: "x", argsHash: "a" })).toBeNull();
    expect(h.recordAction({ iterationIndex: 1, toolName: "x", argsHash: "a" })).toBeNull();
  });

  it("detects consecutive-identical-tool-call when the same (name, args) repeats", () => {
    const h = createActionHistory({ consecutiveLimit: 3 });
    h.recordAction({ iterationIndex: 0, toolName: "search", argsHash: "a" });
    h.recordAction({ iterationIndex: 1, toolName: "search", argsHash: "a" });
    expect(h.recordAction({ iterationIndex: 2, toolName: "search", argsHash: "a" })).toBe(
      "consecutive-identical-tool-call",
    );
  });

  it("does NOT fire consecutive when args differ", () => {
    const h = createActionHistory({ consecutiveLimit: 3 });
    h.recordAction({ iterationIndex: 0, toolName: "search", argsHash: "a" });
    h.recordAction({ iterationIndex: 1, toolName: "search", argsHash: "b" });
    expect(h.recordAction({ iterationIndex: 2, toolName: "search", argsHash: "a" })).toBeNull();
  });

  it("detects ping-pong when last 4 alternate between 2 distinct (name, args) pairs", () => {
    const h = createActionHistory();
    h.recordAction({ iterationIndex: 0, toolName: "a", argsHash: "1" });
    h.recordAction({ iterationIndex: 1, toolName: "b", argsHash: "2" });
    h.recordAction({ iterationIndex: 2, toolName: "a", argsHash: "1" });
    expect(h.recordAction({ iterationIndex: 3, toolName: "b", argsHash: "2" })).toBe("ping-pong");
  });

  it("history() returns an immutable copy of records", () => {
    const h = createActionHistory();
    h.recordAction({ iterationIndex: 0, toolName: "t", argsHash: "x" });
    const snapshot = h.history();
    expect(snapshot.length).toBe(1);
    // Frozen: mutation throws in strict mode (TS readonly is structural,
    // runtime Object.freeze is enforced).
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
