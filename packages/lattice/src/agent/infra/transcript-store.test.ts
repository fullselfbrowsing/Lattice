import { describe, expect, it } from "vitest";

import type { ConversationTurn } from "../format-tools.js";

import { createTranscriptStore } from "./transcript-store.js";

const u = (content: string): ConversationTurn => ({ role: "user", content });
const a = (content: string): ConversationTurn => ({ role: "assistant", content });

describe("createTranscriptStore", () => {
  it("starts empty and accumulates appended turns", () => {
    const t = createTranscriptStore();
    expect(t.all()).toEqual([]);
    t.append(u("first"));
    t.append(a("ack"));
    expect(t.all().length).toBe(2);
  });

  it("tail(N) returns at most N turns when the store has fewer than N", () => {
    const t = createTranscriptStore();
    t.append(u("first"));
    expect(t.tail(5)).toEqual([u("first")]);
  });

  it("tail(N) always includes the first user turn even when it would fall off", () => {
    const t = createTranscriptStore();
    t.append(u("original task"));
    for (let i = 0; i < 10; i += 1) t.append(a(`step ${i}`));
    const tail = t.tail(3);
    // First user turn + last 3 assistant steps = 4 turns
    expect(tail.length).toBe(4);
    expect(tail[0]).toEqual(u("original task"));
    expect(tail[1]?.content).toBe("step 7");
    expect(tail[2]?.content).toBe("step 8");
    expect(tail[3]?.content).toBe("step 9");
  });

  it("tail(0) returns empty array", () => {
    const t = createTranscriptStore();
    t.append(u("x"));
    expect(t.tail(0)).toEqual([]);
  });

  it("tailByTokens fits the most recent turns within the budget; first user turn is always included", () => {
    const t = createTranscriptStore();
    t.append(u("original")); // 8 chars -> 2 tokens
    for (let i = 0; i < 5; i += 1) t.append(a("x".repeat(8))); // 2 tokens each
    // Budget = 6 tokens fits 3 most-recent assistant turns; first user turn
    // is prepended unconditionally (the task is mission-critical and worth
    // a small overshoot on the budget).
    const tail = t.tailByTokens(6);
    expect(tail[0]).toEqual(u("original"));
    expect(tail.length).toBe(4); // first user + 3 most-recent assistant
  });

  it("tailByTokens with a custom estimator", () => {
    const t = createTranscriptStore();
    t.append(u("task"));
    t.append(a("answer"));
    // Custom: every turn is exactly 1 token.
    const tail = t.tailByTokens(2, () => 1);
    expect(tail.length).toBe(2);
  });

  it("tailByTokens(0) returns empty", () => {
    const t = createTranscriptStore();
    t.append(u("anything"));
    expect(t.tailByTokens(0)).toEqual([]);
  });
});
