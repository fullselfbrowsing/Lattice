import { describe, expect, it } from "vitest";

import { createGoalProgressTracker } from "./goal-progress.js";

describe("createGoalProgressTracker", () => {
  it("reports 'progressing' until window is filled", () => {
    const t = createGoalProgressTracker({ windowSize: 3 });
    expect(t.status()).toBe("progressing");
    t.recordStep({ iterationIndex: 0, goalSatisfaction: 0.1 });
    t.recordStep({ iterationIndex: 1, goalSatisfaction: 0.2 });
    expect(t.status()).toBe("progressing");
  });

  it("reports 'progressing' when satisfaction monotonically improves", () => {
    const t = createGoalProgressTracker({ windowSize: 3 });
    t.recordStep({ iterationIndex: 0, goalSatisfaction: 0.1 });
    t.recordStep({ iterationIndex: 1, goalSatisfaction: 0.3 });
    t.recordStep({ iterationIndex: 2, goalSatisfaction: 0.5 });
    expect(t.status()).toBe("progressing");
  });

  it("reports 'stalled' when the window is within the stall threshold", () => {
    const t = createGoalProgressTracker({ windowSize: 3, stallThreshold: 0.02 });
    t.recordStep({ iterationIndex: 0, goalSatisfaction: 0.5 });
    t.recordStep({ iterationIndex: 1, goalSatisfaction: 0.505 });
    t.recordStep({ iterationIndex: 2, goalSatisfaction: 0.515 });
    expect(t.status()).toBe("stalled");
  });

  it("reports 'regressed' when satisfaction drops below prior max by regressionThreshold", () => {
    const t = createGoalProgressTracker({ windowSize: 3, regressionThreshold: 0.1 });
    t.recordStep({ iterationIndex: 0, goalSatisfaction: 0.2 });
    t.recordStep({ iterationIndex: 1, goalSatisfaction: 0.8 });
    t.recordStep({ iterationIndex: 2, goalSatisfaction: 0.65 });
    expect(t.status()).toBe("regressed");
  });

  it("regression takes precedence over stall", () => {
    const t = createGoalProgressTracker({
      windowSize: 3,
      stallThreshold: 0.02,
      regressionThreshold: 0.1,
    });
    t.recordStep({ iterationIndex: 0, goalSatisfaction: 0.9 });
    t.recordStep({ iterationIndex: 1, goalSatisfaction: 0.7 });
    t.recordStep({ iterationIndex: 2, goalSatisfaction: 0.71 });
    // 0.7 and 0.71 are within stallThreshold but the max-so-far is 0.9 so
    // the recent values are regressed.
    expect(t.status()).toBe("regressed");
  });
});
