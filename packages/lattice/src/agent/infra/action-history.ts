/**
 * ActionHistory — Phase 21 (v1.2).
 *
 * Detects stuck patterns in the agent loop's tool-call sequence:
 *   - "consecutive-identical-tool-call" — same (toolName, argsHash) N+ times in a row
 *   - "ping-pong" — last 4 records alternate between 2 distinct (toolName, argsHash) pairs
 *   - "no-progress" — reserved for callers wiring goal-progress feedback here
 *
 * Standalone (no dependency on the agent runtime); callers register the
 * primitive externally and pump `recordAction` from their loop or hook.
 */

export const STUCK_REASONS = [
  "consecutive-identical-tool-call",
  "no-progress",
  "ping-pong",
] as const;

export type StuckReason = typeof STUCK_REASONS[number];

export interface ActionRecord {
  readonly iterationIndex: number;
  readonly toolName: string;
  readonly argsHash: string;
}

export interface ActionHistoryOptions {
  /** Number of consecutive identical records that triggers the consecutive detector. Default 3. */
  readonly consecutiveLimit?: number;
}

export interface ActionHistory {
  readonly kind: "action-history";
  /**
   * Append a record. Returns the latest StuckReason triggered by this
   * record, or null when no detector fires. The most recent reason wins
   * when multiple apply.
   */
  recordAction(action: ActionRecord): StuckReason | null;
  history(): readonly ActionRecord[];
}

function actionKey(record: ActionRecord): string {
  return `${record.toolName}::${record.argsHash}`;
}

export function createActionHistory(options: ActionHistoryOptions = {}): ActionHistory {
  const consecutiveLimit = options.consecutiveLimit ?? 3;
  const records: ActionRecord[] = [];

  return {
    kind: "action-history" as const,
    recordAction(action: ActionRecord): StuckReason | null {
      records.push(action);
      // Consecutive identical detector.
      if (records.length >= consecutiveLimit) {
        const tail = records.slice(-consecutiveLimit);
        const firstKey = actionKey(tail[0]!);
        if (tail.every((r) => actionKey(r) === firstKey)) {
          return "consecutive-identical-tool-call";
        }
      }
      // Ping-pong detector (last 4 alternate between exactly 2 keys).
      if (records.length >= 4) {
        const last4 = records.slice(-4);
        const keys = last4.map(actionKey);
        const distinct = Array.from(new Set(keys));
        if (
          distinct.length === 2 &&
          keys[0] === keys[2] &&
          keys[1] === keys[3] &&
          keys[0] !== keys[1]
        ) {
          return "ping-pong";
        }
      }
      return null;
    },
    history(): readonly ActionRecord[] {
      return Object.freeze([...records]);
    },
  };
}
