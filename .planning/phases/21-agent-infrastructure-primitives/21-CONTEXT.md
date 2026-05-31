# Phase 21: Agent Infrastructure Primitives - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Forward. Five independent primitives that compose with the Phase 19 agent runtime and Phase 20 host seams. All ship as small, pure-function modules under `packages/lattice/src/agent/infra/`.

<domain>
## Phase Boundary

Five small primitives — each independently usable by callers and composable with the agent loop's existing hook surfaces:

- **CostTracker** — accumulates per-iteration `Usage`; exposes a running total; reports budget status against `contract.budget`.
- **TranscriptStore** — records `ConversationTurn[]`; supports tail reads sized for context-window management (turn-count or token-estimate based).
- **GoalProgressTracker** — caller declares a goal-satisfaction score per step; tracker reports `progressing | stalled | regressed`.
- **ActionHistory** — records tool-call actions; detects "consecutive identical tool call" + "ping-pong" patterns; surfaces `STUCK_REASONS`.
- **PermissionContext** — gates tool execution per-tool / per-iteration / per-resource. Includes a SAFETY-band hook helper that wires the context into `BEFORE_TOOL` veto.

All five are pure (no I/O, no side effects). Each ships standalone — callers can use them outside the agent loop too.

Out of scope: showcase + eval (Phase 22), milestone audit + tag (Phase 23).

</domain>

<decisions>
## Implementation Decisions

### Cost Tracker (AGENT-INFRA-01)
- `createCostTracker()` returns `{ recordIteration(usage), total(), budgetStatus(budget) }`.
- `total()` returns `Usage` with summed `promptTokens`, `completionTokens`, and `costUsd` (`null` if no recorded iteration had a non-null cost).
- `budgetStatus(budget)` returns `"ok" | "warning" | "exceeded"`. Warning fires at 80% of `maxCostUsd`.

### Transcript Store (AGENT-INFRA-02)
- `createTranscriptStore()` returns `{ append(turn), all(), tail(limit), tailByTokens(maxTokens, estimator?) }`.
- Default token estimator: 4 chars ≈ 1 token (the ChatGPT rule-of-thumb). Callers can supply their own.
- `tail` and `tailByTokens` always include the FIRST user turn (the original task) plus the most-recent turns that fit the limit.

### Goal-Progress Tracker (AGENT-INFRA-03)
- `createGoalProgressTracker(options?)` returns `{ recordStep({ iterationIndex, goalSatisfaction }), status() }`.
- `goalSatisfaction` is a 0..1 score the caller decides how to compute (could be similarity to goal text, structured-output completeness, etc).
- `status()` returns `"progressing" | "stalled" | "regressed"`:
  - `progressing` — recent step's satisfaction strictly greater than max of prior window.
  - `stalled` — recent N steps within `stallThreshold` (default 0.02) of each other.
  - `regressed` — recent satisfaction below max-of-prior-window by `regressionThreshold` (default 0.1).

### Action History (AGENT-INFRA-04)
- `createActionHistory(options?)` returns `{ recordAction({ iterationIndex, toolName, argsHash }), history() }`.
- `recordAction` returns the latest `StuckReason` if one is triggered by this record, else `null`.
- `STUCK_REASONS` const tuple: `["consecutive-identical-tool-call", "no-progress", "ping-pong"]`.
- "consecutive-identical-tool-call" detected when same `(toolName, argsHash)` recorded `consecutiveLimit` times in a row (default: 3).
- "ping-pong" detected when last 4 records alternate between exactly 2 distinct `(toolName, argsHash)` pairs.

### Permission Context (PERM-01)
- `PermissionRule` — `{ toolName?: string | RegExp; resource?: string | RegExp; verdict: "allow" | "deny"; reason?: string }`.
- `createPermissionContext(rules)` returns `{ decide({ toolName, iterationIndex, resource?, args }): PermissionVerdict }`.
- First matching rule wins. Default verdict (no match): `allow` (open by default; tighter callers use a final deny-all rule).
- Companion `createPermissionGuardHook(context)` returns a `HookHandler` registrable on `BEFORE_TOOL` at `BAND.SAFETY`. The hook reads `ctx.toolName` and either approves or sets `controls.deny(reason)`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 15 `bands.ts` `HookControls` deny pattern — PermissionContext's guard hook composes via this.
- Phase 19 `ConversationTurn` — TranscriptStore uses this shape directly.
- Phase 19 `BudgetInvariant.maxCostUsd` — CostTracker.budgetStatus reads this.

### Established Patterns
- Factory functions return readonly-method objects; no class instances.
- Independent primitives live under `agent/infra/` with one file per primitive.

</code_context>

<specifics>
## Specific Ideas

- File layout:
  - `packages/lattice/src/agent/infra/cost-tracker.ts`
  - `packages/lattice/src/agent/infra/transcript-store.ts`
  - `packages/lattice/src/agent/infra/goal-progress.ts`
  - `packages/lattice/src/agent/infra/action-history.ts`
  - `packages/lattice/src/agent/infra/permission-context.ts`
  - Tests adjacent to each.

</specifics>

<deferred>
## Deferred Ideas

- Multi-iteration tool-call budget (e.g., "no tool may be called more than N times across a run") — Phase 22 showcase will exercise the primitives in combination.
- Adaptive `stallThreshold` / `regressionThreshold` based on observed iteration variance.
- Pluggable PII detection inside PermissionContext (tied to v1.1 `defaultPiiDetectors`).

</deferred>
