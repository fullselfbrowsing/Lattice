/**
 * AgentSpec — Phase 39 (v1.3). Sibling of defineTool; crew member
 * specification composing by value as a tree (D-03).
 *
 * `defineAgent(spec)` mirrors `defineTool` (tools/tools.ts) literally:
 * an `Omit<…, "kind">` factory that spreads the definition under the
 * `kind: "agent"` discriminant. The runtime (CrewDispatcher, 39-05)
 * branches on `kind` to route dispatch through the crew chokepoint
 * instead of `runTool` (D-01).
 *
 * `childAgents` composes by value — a crew is a literal tree of specs,
 * not a registry of ids. `summaryReturnSchema` validates the child's
 * `{ summary, artifacts, receipts }` return envelope (Standard Schema,
 * Zod-compatible). `contract` carries an optional per-agent sub-budget
 * (D-07): the effective child budget is `min(spec.contract.budget,
 * remaining crew pool)`.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { CapabilityContract } from "../../contract/contract.js";
import type { ToolDefinition } from "../../tools/tools.js";

/**
 * Crew member specification. A literal sibling of `ToolDefinition`
 * discriminated by `kind: "agent"` (D-03).
 */
export interface AgentSpec {
  readonly kind: "agent";
  readonly id: string;
  readonly intent: string;
  readonly tools: ReadonlyArray<ToolDefinition<StandardSchemaV1>>;
  readonly childAgents?: ReadonlyArray<AgentSpec>;
  readonly summaryReturnSchema: StandardSchemaV1;
  /** Optional per-agent sub-budget (D-07). */
  readonly contract?: CapabilityContract;
}

/**
 * Factory for `AgentSpec` values. Mirrors `defineTool` exactly: spread
 * preserves input identity (no cloning, no mutation) and absent optional
 * members stay absent (`exactOptionalPropertyTypes`-safe).
 */
export function defineAgent(definition: Omit<AgentSpec, "kind">): AgentSpec {
  return {
    kind: "agent",
    ...definition,
  };
}
