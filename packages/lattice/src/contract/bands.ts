/**
 * Tripwire band pipeline -- Lattice's primitive for ordered, budgeted hook
 * execution around provider + tool boundaries.
 *
 * This module is a SIBLING of tripwire.ts (the pure invariant evaluator) --
 * the two have no callsite coupling. evaluateTripwires stays pure; the
 * band pipeline owns side effects (tracer emit, timing, mutation isolation).
 *
 * Phase 2 (FSB v0.10.0-attempt-2) -- ships:
 *   - Priority bands: SAFETY (0) > OBSERVABILITY (1) > EXTENSION (2)
 *   - Per-handler regex matcher (opt-in)
 *   - Per-handler race-with-log budget (default 100ms; HOOK_TIMEOUT via TracerLike)
 *   - structuredClone + Object.freeze context per handler (mutations don't leak)
 *   - Irreversible freeze() blocking late register()
 *   - HookLifecycleEvent union: BEFORE_PROVIDER, AFTER_PROVIDER, BEFORE_TOOL, AFTER_TOOL
 *
 * Lifecycle event vocabulary is intentionally SEPARATE from tracing.ts's
 * RunEventKind. Run events ("run.start", "provider.attempt", ...) describe
 * Lattice runtime stages; lifecycle events describe pluggable hook
 * attach-points. Phase 3 may add observability event kinds; Phase 2 ships
 * only the four lifecycle events listed.
 *
 * Race-with-log uses no-abort Promise.race: the handler keeps running
 * in the background after a timeout (CPU-leak risk is acceptable; see
 * 02-CONTEXT.md D-09 and 02-RESEARCH.md CD-01 Resolution).
 */

import type { TracerLike } from "../tracing/tracing.js";

/**
 * Hook lifecycle event vocabulary -- separate from RunEventKind by design.
 *
 * Phase 19 (v1.2) additively extends with BEFORE_AGENT_ITERATION and
 * AFTER_AGENT_ITERATION — emitted by `runAgent` around each iteration's
 * provider call. Existing four events continue to fire inside each
 * iteration (BEFORE/AFTER_PROVIDER per native call; BEFORE/AFTER_TOOL
 * per dispatched tool).
 */
export type HookLifecycleEvent =
  | "BEFORE_PROVIDER"
  | "AFTER_PROVIDER"
  | "BEFORE_TOOL"
  | "AFTER_TOOL"
  | "BEFORE_AGENT_ITERATION"
  | "AFTER_AGENT_ITERATION";

/**
 * SAFETY-band veto mechanism — Phase 19.
 *
 * Handlers can deny an iteration by calling `controls.deny(reason)`. The
 * pipeline records the latest reason and exposes it via `lastDenialReason()`.
 * The reason resets at the start of each `run()` call.
 *
 * Composition convention: the agent runtime invokes BEFORE_AGENT_ITERATION
 * before provider call, then checks `pipeline.lastDenialReason()`. If set,
 * the iteration aborts with `agent-iteration-denied` failure.
 */
export interface HookDenyDirective {
  readonly reason: string;
}

/**
 * Controls passed to each handler as an optional second argument.
 *
 * Backward compat: existing single-argument handlers (Phase 15 + Phase 16)
 * ignore this and continue to work unchanged.
 */
export interface HookControls {
  /** Set a denial reason; the latest call wins per `run()`. */
  readonly deny: (reason: string) => void;
}

/**
 * Priority bands. Lower number = higher priority (runs first).
 *
 * SAFETY (0)        -- safety / breaker hooks; cannot be overridden by lower bands
 * OBSERVABILITY (1) -- logging, metrics, audit; runs after safety, before extension
 * EXTENSION (2)     -- user-supplied hooks; runs last
 *
 * Within a band, handlers run in registration order.
 */
export const BAND = {
  SAFETY: 0,
  OBSERVABILITY: 1,
  EXTENSION: 2,
} as const;

export type Band = typeof BAND[keyof typeof BAND];

const BAND_ORDER: readonly Band[] = [BAND.SAFETY, BAND.OBSERVABILITY, BAND.EXTENSION];

/**
 * Handler input -- frozen snapshot of the caller's context at run() time.
 *
 * structuredClone-then-Object.freeze: handlers receive a deep-cloned,
 * surface-frozen view. Mutations on the handler side do NOT leak back to
 * the calling site.
 *
 * The handler's return value is currently ignored; future revisions may
 * add a typed return that downstream bands consume.
 */
export interface HookHandler<TContext = unknown> {
  (context: Readonly<TContext>, controls?: HookControls): void | Promise<void>;
}

export interface RegisterOptions {
  readonly band: Band;
  readonly matcher?: RegExp;
  readonly budgetMs?: number;
}

/**
 * The HookPipeline interface returned by createHookPipeline().
 *
 * IMMUTABILITY: once freeze() is called, register() throws an Error whose
 * .name === "PIPELINE_FROZEN". freeze() is irreversible by design --
 * protects against late-binding hook injection mid-session.
 */
export interface HookPipeline {
  readonly kind: "hook-pipeline";
  register<TContext = unknown>(
    event: HookLifecycleEvent,
    handler: HookHandler<TContext>,
    options: RegisterOptions,
  ): void;
  freeze(): void;
  isFrozen(): boolean;
  run<TContext = unknown>(
    event: HookLifecycleEvent,
    context: TContext,
  ): Promise<void>;
  /**
   * Phase 19: returns the latest denial reason set by any handler during
   * the most recent `run()` call. Resets to `null` at the start of each run.
   * Read by the agent runtime to detect SAFETY-band veto.
   */
  lastDenialReason(): string | null;
}

export interface CreateHookPipelineOptions {
  readonly tracer?: TracerLike;
  readonly sessionId?: string;
  readonly defaultBudgetMs?: number;
}

export const HOOK_DEFAULT_BUDGET_MS = 100;
export const PIPELINE_FROZEN_ERROR_NAME = "PIPELINE_FROZEN";
export const HOOK_TIMEOUT_EVENT_NAME = "HOOK_TIMEOUT";

interface HandlerRecord {
  readonly handler: HookHandler<unknown>;
  readonly matcher?: RegExp;
  readonly budgetMs: number;
  readonly band: Band;
  readonly registrationIndex: number;
}

function freezeContext<T>(ctx: T): Readonly<T> {
  let cloned: T;
  try {
    cloned = structuredClone(ctx);
  } catch {
    cloned = ctx;
  }
  if (typeof cloned === "object" && cloned !== null) {
    Object.freeze(cloned);
  }
  return cloned as Readonly<T>;
}

async function runHandlerWithBudget(
  record: HandlerRecord,
  ctx: Readonly<unknown>,
  controls: HookControls,
  emit: ((kind: string, payload: Record<string, unknown>) => void) | undefined,
  event: HookLifecycleEvent,
  sessionId: string | undefined,
): Promise<void> {
  const startedAt = performance.now();
  let timeoutFired = false;
  const budgetMs = record.budgetMs;
  const budgetPromise = new Promise<"__timeout__">((resolve) => {
    setTimeout(() => {
      timeoutFired = true;
      resolve("__timeout__");
    }, budgetMs);
  });
  const handlerPromise = (async () => {
    try {
      await record.handler(ctx, controls);
    } catch {
      // handler errors are absorbed (pipeline does not propagate)
    }
    return "__done__" as const;
  })();
  const result = await Promise.race([handlerPromise, budgetPromise]);
  if (result === "__timeout__" && timeoutFired) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (emit !== undefined) {
      emit(HOOK_TIMEOUT_EVENT_NAME, {
        event,
        band: record.band,
        budgetMs,
        ...(sessionId !== undefined ? { sessionId } : {}),
        handlerIndex: record.registrationIndex,
        elapsedMs,
      });
    }
  }
}

/**
 * Factory: build a fresh hook pipeline.
 */
export function createHookPipeline(
  options?: CreateHookPipelineOptions,
): HookPipeline {
  const tracer = options?.tracer;
  const sessionId = options?.sessionId;
  const defaultBudgetMs = options?.defaultBudgetMs ?? HOOK_DEFAULT_BUDGET_MS;
  const registry: Map<HookLifecycleEvent, Map<Band, HandlerRecord[]>> = new Map();
  let frozen = false;
  let globalRegistrationCounter = 0;
  let currentDenialReason: string | null = null;

  // TracerLike.event is optional on the interface; the emit factory bridges
  // through optional-chain so a tracer without an event method (or no tracer
  // at all) becomes a no-op rather than a TypeError. Mirrors the pattern at
  // runtime/create-ai.ts:862 (normalized.tracing?.event?.(...)).
  const emit: ((kind: string, payload: Record<string, unknown>) => void) | undefined =
    tracer !== undefined
      ? (kind, payload) => {
          tracer.event?.(kind, payload);
        }
      : undefined;

  function register<TContext = unknown>(
    event: HookLifecycleEvent,
    handler: HookHandler<TContext>,
    opts: RegisterOptions,
  ): void {
    if (frozen) {
      const err = new Error("HookPipeline.register() called after freeze()");
      err.name = PIPELINE_FROZEN_ERROR_NAME;
      throw err;
    }
    let perEventBands = registry.get(event);
    if (perEventBands === undefined) {
      perEventBands = new Map();
      registry.set(event, perEventBands);
    }
    let arr = perEventBands.get(opts.band);
    if (arr === undefined) {
      arr = [];
      perEventBands.set(opts.band, arr);
    }
    const record: HandlerRecord = {
      handler: handler as HookHandler<unknown>,
      ...(opts.matcher !== undefined ? { matcher: opts.matcher } : {}),
      budgetMs: opts.budgetMs ?? defaultBudgetMs,
      band: opts.band,
      registrationIndex: globalRegistrationCounter,
    };
    globalRegistrationCounter += 1;
    arr.push(record);
  }

  function freezePipeline(): void {
    frozen = true;
  }

  function isFrozen(): boolean {
    return frozen;
  }

  async function run<TContext = unknown>(
    event: HookLifecycleEvent,
    context: TContext,
  ): Promise<void> {
    currentDenialReason = null;
    const perEventBands = registry.get(event);
    if (perEventBands === undefined) return;
    const controls: HookControls = {
      deny: (reason: string) => {
        currentDenialReason = reason;
      },
    };
    for (const band of BAND_ORDER) {
      const arr = perEventBands.get(band);
      if (arr === undefined || arr.length === 0) continue;
      for (const record of arr) {
        if (record.matcher !== undefined && !record.matcher.test(event)) {
          continue;
        }
        const ctx = freezeContext(context);
        await runHandlerWithBudget(record, ctx, controls, emit, event, sessionId);
      }
    }
  }

  function lastDenialReason(): string | null {
    return currentDenialReason;
  }

  const pipeline: HookPipeline = {
    kind: "hook-pipeline",
    register,
    freeze: freezePipeline,
    isFrozen,
    run,
    lastDenialReason,
  };
  return pipeline;
}
