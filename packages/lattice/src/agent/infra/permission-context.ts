/**
 * PermissionContext — Phase 21 (v1.2).
 *
 * Gates tool execution per-tool / per-iteration / per-resource. Includes
 * a SAFETY-band hook helper that wires the context into the agent loop's
 * BEFORE_TOOL pipeline via the Phase 19 `controls.deny(reason)` veto.
 */

import { BAND, type HookHandler, type RegisterOptions } from "../../contract/bands.js";

export interface PermissionRule {
  /** Match on tool name. String = exact match; RegExp = test. Both undefined = match-any. */
  readonly toolName?: string | RegExp;
  /**
   * Optional resource matcher. The caller passes `resource` on each
   * decide() invocation; this rule fires only when the rule's resource
   * matches.
   */
  readonly resource?: string | RegExp;
  readonly verdict: "allow" | "deny";
  readonly reason?: string;
}

export interface PermissionDecisionInput {
  readonly toolName: string;
  readonly iterationIndex: number;
  readonly resource?: string;
  readonly args?: unknown;
}

export type PermissionVerdict =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: string };

export interface PermissionContext {
  readonly kind: "permission-context";
  decide(input: PermissionDecisionInput): PermissionVerdict;
}

function matches(matcher: string | RegExp | undefined, value: string | undefined): boolean {
  if (matcher === undefined) return true;
  if (value === undefined) return false;
  if (typeof matcher === "string") return matcher === value;
  return matcher.test(value);
}

export function createPermissionContext(
  rules: readonly PermissionRule[],
): PermissionContext {
  return {
    kind: "permission-context" as const,
    decide(input: PermissionDecisionInput): PermissionVerdict {
      for (const rule of rules) {
        if (!matches(rule.toolName, input.toolName)) continue;
        if (rule.resource !== undefined && !matches(rule.resource, input.resource)) continue;
        if (rule.verdict === "allow") return { allow: true };
        return { allow: false, reason: rule.reason ?? `denied by permission rule for ${input.toolName}` };
      }
      // Default: allow when no rule matches.
      return { allow: true };
    },
  };
}

/**
 * Hook handler shape suitable for registering on `BEFORE_TOOL` at
 * BAND.SAFETY. Reads `toolName` and `iterationIndex` from the agent
 * runtime's BEFORE_TOOL context shape (`{ iterationIndex, toolName,
 * args }`) and translates a deny verdict into `controls.deny(reason)`.
 */
export interface PermissionHookContext {
  readonly iterationIndex: number;
  readonly toolName: string;
  readonly resource?: string;
  readonly args?: unknown;
}

export function createPermissionGuardHook(
  context: PermissionContext,
): HookHandler<PermissionHookContext> {
  return (ctx, controls) => {
    const verdict = context.decide({
      iterationIndex: ctx.iterationIndex,
      toolName: ctx.toolName,
      ...(ctx.resource !== undefined ? { resource: ctx.resource } : {}),
      ...(ctx.args !== undefined ? { args: ctx.args } : {}),
    });
    if (!verdict.allow) {
      controls?.deny(verdict.reason);
    }
  };
}

/**
 * Convenience: returns RegisterOptions for the SAFETY-band registration.
 * Callers do `pipeline.register("BEFORE_TOOL", hook, permissionGuardRegisterOptions())`.
 */
export function permissionGuardRegisterOptions(): RegisterOptions {
  return { band: BAND.SAFETY };
}
