/**
 * TranscriptStore — Phase 21 (v1.2).
 *
 * Records the running conversation log with filtered tail reads sized for
 * context-window management. Always preserves the FIRST user turn (the
 * original task) in tail reads so the model retains its mission.
 */

import type { ConversationTurn } from "../format-tools.js";

/**
 * Token estimator used by `tailByTokens`. The default ~4 chars / token is
 * the OpenAI rule of thumb for English text. Callers with provider-specific
 * tokenizers can supply their own.
 */
export type TokenEstimator = (text: string) => number;

const DEFAULT_TOKEN_ESTIMATOR: TokenEstimator = (text) => Math.ceil(text.length / 4);

export interface TranscriptStore {
  readonly kind: "transcript-store";
  append(turn: ConversationTurn): void;
  all(): readonly ConversationTurn[];
  /** Returns the first user turn (if any) + the most-recent `limit` turns. */
  tail(limit: number): readonly ConversationTurn[];
  /**
   * Returns the first user turn (if any) + the most-recent turns whose
   * combined token estimate fits within `maxTokens`. The default estimator
   * is the ~4 chars / token rule; callers can override for provider-
   * specific tokenizers.
   */
  tailByTokens(maxTokens: number, estimator?: TokenEstimator): readonly ConversationTurn[];
}

export function createTranscriptStore(): TranscriptStore {
  const turns: ConversationTurn[] = [];

  function firstUserTurn(): ConversationTurn | null {
    for (const turn of turns) {
      if (turn.role === "user") return turn;
    }
    return null;
  }

  return {
    kind: "transcript-store" as const,
    append(turn: ConversationTurn): void {
      turns.push(turn);
    },
    all(): readonly ConversationTurn[] {
      return Object.freeze([...turns]);
    },
    tail(limit: number): readonly ConversationTurn[] {
      if (limit <= 0) return Object.freeze([]);
      if (turns.length <= limit) return Object.freeze([...turns]);
      const start = turns.length - limit;
      const tail = turns.slice(start);
      const first = firstUserTurn();
      if (first === null || tail.includes(first)) {
        return Object.freeze(tail);
      }
      return Object.freeze([first, ...tail]);
    },
    tailByTokens(
      maxTokens: number,
      estimator: TokenEstimator = DEFAULT_TOKEN_ESTIMATOR,
    ): readonly ConversationTurn[] {
      if (maxTokens <= 0) return Object.freeze([]);
      const reversed = [...turns].reverse();
      const selected: ConversationTurn[] = [];
      let used = 0;
      for (const turn of reversed) {
        const cost = estimator(turn.content);
        if (used + cost > maxTokens) break;
        selected.unshift(turn);
        used += cost;
      }
      const first = firstUserTurn();
      if (first !== null && !selected.includes(first)) {
        selected.unshift(first);
      }
      return Object.freeze(selected);
    },
  };
}
