/**
 * GoalProgressTracker — Phase 21 (v1.2).
 *
 * Stuck-detection primitive. The caller declares a goal-satisfaction
 * score per iteration (0..1); the tracker reports a coarse status the
 * agent loop can use to back off or surface to the human.
 */

export type ProgressStatus = "progressing" | "stalled" | "regressed";

export interface GoalProgressOptions {
  /**
   * Window of recent steps used for stall + regression detection.
   * Default 3. The tracker waits until it has at least this many steps
   * before reporting anything other than "progressing".
   */
  readonly windowSize?: number;
  /** Max satisfaction delta across the window to count as "stalled". Default 0.02. */
  readonly stallThreshold?: number;
  /** Min drop from prior max to count as "regressed". Default 0.1. */
  readonly regressionThreshold?: number;
}

export interface GoalProgressStep {
  readonly iterationIndex: number;
  readonly goalSatisfaction: number;
}

export interface GoalProgressTracker {
  readonly kind: "goal-progress-tracker";
  recordStep(step: GoalProgressStep): void;
  status(): ProgressStatus;
}

export function createGoalProgressTracker(
  options: GoalProgressOptions = {},
): GoalProgressTracker {
  const windowSize = options.windowSize ?? 3;
  const stallThreshold = options.stallThreshold ?? 0.02;
  const regressionThreshold = options.regressionThreshold ?? 0.1;
  const steps: GoalProgressStep[] = [];

  return {
    kind: "goal-progress-tracker" as const,
    recordStep(step: GoalProgressStep): void {
      steps.push(step);
    },
    status(): ProgressStatus {
      if (steps.length < windowSize) return "progressing";
      const window = steps.slice(-windowSize);
      const latest = window[window.length - 1]!;
      const earlierMax = steps
        .slice(0, -1)
        .reduce((m, s) => (s.goalSatisfaction > m ? s.goalSatisfaction : m), -Infinity);
      if (latest.goalSatisfaction < earlierMax - regressionThreshold) {
        return "regressed";
      }
      const min = window.reduce((m, s) => (s.goalSatisfaction < m ? s.goalSatisfaction : m), Infinity);
      const max = window.reduce((m, s) => (s.goalSatisfaction > m ? s.goalSatisfaction : m), -Infinity);
      if (max - min <= stallThreshold) {
        return "stalled";
      }
      return "progressing";
    },
  };
}
