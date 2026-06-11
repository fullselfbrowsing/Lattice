/**
 * Checkpoint hook -- Lattice's per-step receipt + tracer-event primitive.
 *
 * This module is a SIBLING of bands.ts (the hook pipeline factory) and
 * receipt.ts (the Capability Receipt mint). It does NOT modify either; the
 * checkpoint hook is composed from both surfaces.
 *
 * Phase 3 (FSB v0.10.0-attempt-2) -- ships:
 *   - createCheckpointHook(options) factory returning a HookHandler
 *   - One signed v1.2 Capability Receipt minted per handler invocation
 *     (when a signer is configured); body carries step-marker fields
 *   - Exactly one "step.transition" tracer event emitted per invocation
 *     (when a tracer is configured); metadata carries the same step
 *     fields plus runId and either receiptId (mint success) or mintError
 *     (mint failed)
 *
 * Registration convention (D-06): the caller registers the returned
 * handler on a HookPipeline at BAND.OBSERVABILITY -- between SAFETY
 * (must run first) and EXTENSION (user-supplied; runs last). The factory
 * exposes DEFAULT_CHECKPOINT_BAND as a re-export of BAND.OBSERVABILITY
 * for clarity at the registration site. The factory does NOT auto-
 * register -- the caller owns lifecycle.
 *
 * Best-effort mint contract (D-07): signer.sign() failures are caught
 * by an internal try/catch; the handler emits a tracer event with
 * mintError (no throw upstream). Mirrors maybeIssueReceipt at
 * create-ai.ts:956-992. Callers cannot rely on receipt minting; if
 * minting is required for correctness, the caller must inspect the
 * envelope returned via the tracer event (event.metadata.envelope) AND
 * check mintError absence.
 *
 * Step-marker field contract (carries forward Phase 2 D-04):
 *   - stepName, parentStepName, previousStepName, sessionId are STABLE
 *     IDENTIFIERS, NOT user content. Callers MUST NOT populate them
 *     with free-form user input -- those fields appear cleartext in
 *     the signed receipt (the redaction manifest at redact.ts
 *     intentionally does NOT cover them per Phase 2 D-04).
 *   - timestamp is ISO-8601 RFC 3339 (e.g., "2026-05-24T18:00:00.000Z").
 *   - stepIndex is a monotonically increasing ordinal supplied by the
 *     caller. The handler does NOT auto-increment -- the caller owns
 *     ordering (typically via session state).
 *
 * Tracer event vocabulary (D-01):
 *   - Event name: "step.transition" (added to RunEventKind in the
 *     preceding tracing.ts commit; namespace-sibling of run.start /
 *     stage.start / provider.attempt / tool.call).
 *   - Metadata keys (flat -- CD-01 resolved to flat per existing
 *     emitEvent at create-ai.ts:862-868):
 *       { stepName, stepIndex, parentStepName?, previousStepName?,
 *         sessionId?, timestamp, runId,
 *         receiptId? | mintError?, envelope? }
 *   - envelope (the minted ReceiptEnvelope) is included on success so
 *     downstream subscribers can persist or display the signed receipt
 *     without re-minting.
 *
 * Vocabulary separation (D-02): HookLifecycleEvent (bands.ts) and
 * RunEventKind (tracing.ts) remain SEPARATE unions. This module
 * subscribes to HookLifecycleEvent (the caller registers on BEFORE_TOOL
 * or AFTER_TOOL or wherever) and emits a RunEventKind tracer event.
 * The two vocabularies meet only at the checkpoint hook boundary.
 */

import type { ReceiptEnvelope, ReceiptModel, ReceiptRoute, ReceiptSigner } from "../receipts/types.js";
import { createReceipt, type CreateReceiptInput } from "../receipts/receipt.js";
import type { TracerLike } from "../tracing/tracing.js";

import { BAND, type Band, type HookHandler } from "./bands.js";

/**
 * The tracer event name Lattice's checkpoint hook emits per step transition.
 * Identical to the literal added to RunEventKind in tracing.ts.
 */
export const STEP_TRANSITION_EVENT_NAME = "step.transition" as const;

/**
 * Default band convention for the checkpoint hook (D-06). The caller is
 * free to register in a different band but the documented convention is
 * OBSERVABILITY -- between SAFETY (runs first) and EXTENSION (runs last).
 */
export const DEFAULT_CHECKPOINT_BAND: Band = BAND.OBSERVABILITY;

/**
 * Per-step context the caller passes through the hook pipeline.
 *
 * Fields are stable identifiers (D-04 carryforward); do NOT populate with
 * user content -- they appear cleartext in the signed receipt body.
 *
 * - stepName: required. Stable identifier for this step.
 * - stepIndex: required. Monotonically increasing ordinal; caller-owned.
 * - parentStepName: optional. Names the enclosing step when nested.
 * - previousStepName: optional. Names the immediately-prior step in the
 *   linked-list timeline (D-09 linked-list threading).
 * - timestamp: required. ISO-8601 RFC 3339.
 */
export interface CheckpointHookContext {
  readonly stepName: string;
  readonly stepIndex: number;
  readonly parentStepName?: string;
  readonly previousStepName?: string;
  readonly timestamp: string;
}

/**
 * The factory's options.
 *
 * - runId: required. Threaded into every receipt body + every tracer event.
 * - tracer: optional. When omitted, the handler still mints (when signer
 *   present) but does NOT emit a tracer event. When provided, the handler
 *   ALWAYS emits exactly one event per invocation (independent of mint
 *   success/failure per D-10).
 * - signer: optional. When omitted, the handler emits a tracer event only
 *   (no mint attempted). When provided, the handler attempts to mint via
 *   createReceipt(...) inside a try/catch (D-07 best-effort).
 * - sessionId: optional. Threaded into receipt body and event metadata.
 * - model: optional. ReceiptModel descriptor for the receipt body; the
 *   factory provides a sensible "step" default when omitted.
 * - route: optional. ReceiptRoute descriptor for the receipt body; the
 *   factory provides a sensible "step" default when omitted.
 * - contractVerdict: optional. Defaults to "success" -- step transitions
 *   are observability events, not contract evaluations.
 */
export interface CheckpointHookOptions {
  readonly runId: string;
  readonly tracer?: TracerLike;
  readonly signer?: ReceiptSigner;
  readonly sessionId?: string;
  readonly model?: ReceiptModel;
  readonly route?: ReceiptRoute;
  readonly contractVerdict?: CreateReceiptInput["contractVerdict"];
}

const DEFAULT_MODEL: ReceiptModel = {
  requested: "lattice-checkpoint/observability",
  observed: null,
};

const DEFAULT_ROUTE: ReceiptRoute = {
  providerId: "lattice-checkpoint",
  capabilityId: "lattice-checkpoint/step-transition",
  attemptNumber: 1,
};

const DEFAULT_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  costUsd: null as null,
};

/**
 * Build a checkpoint hook handler.
 *
 * The returned handler is suitable for registration on a HookPipeline
 * created via createHookPipeline (see ./bands.ts). The handler does not
 * auto-register; the caller passes it to pipeline.register(...) with the
 * desired lifecycle event (typically AFTER_TOOL or BEFORE_TOOL) and band
 * (typically BAND.OBSERVABILITY, exported as DEFAULT_CHECKPOINT_BAND).
 *
 * Per-invocation behavior:
 *   1. Build event metadata from options + per-call context.
 *   2. If signer is configured, attempt createReceipt(...) inside a
 *      try/catch. On success, set metadata.receiptId + metadata.envelope.
 *      On failure, set metadata.mintError (string from caught error).
 *   3. If tracer is configured, emit exactly one tracer.event?.(
 *      STEP_TRANSITION_EVENT_NAME, metadata) call.
 *   4. Return void.
 *
 * NO upstream throw (D-07). NO global mutation (D-05).
 */
export function createCheckpointHook(
  options: CheckpointHookOptions,
): HookHandler<CheckpointHookContext> {
  const runId = options.runId;
  const tracer = options.tracer;
  const signer = options.signer;
  const sessionId = options.sessionId;
  const model = options.model ?? DEFAULT_MODEL;
  const route = options.route ?? DEFAULT_ROUTE;
  const contractVerdict = options.contractVerdict ?? "success";

  return async function checkpointHookHandler(
    ctx: Readonly<CheckpointHookContext>,
  ): Promise<void> {
    // Step 1: assemble event metadata. Optional context fields are spread
    // conditionally to honor exactOptionalPropertyTypes (mirrors the
    // conditional-spread pattern in receipt.ts createReceipt).
    const baseMetadata: Record<string, unknown> = {
      runId,
      stepName: ctx.stepName,
      stepIndex: ctx.stepIndex,
      timestamp: ctx.timestamp,
      ...(ctx.parentStepName !== undefined ? { parentStepName: ctx.parentStepName } : {}),
      ...(ctx.previousStepName !== undefined ? { previousStepName: ctx.previousStepName } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
    };

    // Step 2: best-effort receipt mint (D-07). The try/catch absorbs
    // signer.sign() failures so the handler never throws upstream.
    let envelope: ReceiptEnvelope | undefined;
    let receiptId: string | undefined;
    let mintError: string | undefined;
    if (signer !== undefined) {
      try {
        const input: CreateReceiptInput = {
          runId,
          model,
          route,
          usage: DEFAULT_USAGE,
          contractVerdict,
          contractHash: null,
          inputHashes: [],
          outputHash: null,
          stepName: ctx.stepName,
          stepIndex: ctx.stepIndex,
          timestamp: ctx.timestamp,
          ...(ctx.parentStepName !== undefined ? { parentStepName: ctx.parentStepName } : {}),
          ...(ctx.previousStepName !== undefined ? { previousStepName: ctx.previousStepName } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
        };
        envelope = await createReceipt(input, signer);
        // Re-derive receiptId from the envelope by decoding the canonical
        // payload bytes. createReceipt does not return the body directly;
        // the receiptId lives inside the payload. We pull it back so
        // subscribers can correlate the tracer event to the receipt
        // without re-decoding the envelope themselves.
        receiptId = extractReceiptId(envelope);
      } catch (err) {
        mintError = err instanceof Error ? err.message : String(err);
      }
    }

    // Step 3: assemble the final metadata + emit. tracer.event?.() is
    // optional-chained per the established pattern (create-ai.ts:862).
    const metadata: Record<string, unknown> = {
      ...baseMetadata,
      ...(receiptId !== undefined ? { receiptId } : {}),
      ...(envelope !== undefined ? { envelope } : {}),
      ...(mintError !== undefined ? { mintError } : {}),
    };
    tracer?.event?.(STEP_TRANSITION_EVENT_NAME, metadata);
  };
}

/**
 * Decode the canonical payload of a freshly-minted envelope and return
 * its receiptId. The envelope's payload is base64-encoded JSON of the
 * signed body (DSSE v1.0 form); receiptId is a top-level field.
 *
 * Returns undefined if decoding fails (defensive -- the handler still
 * emits the tracer event with the envelope itself so subscribers can
 * re-derive the id if they want).
 */
function extractReceiptId(envelope: ReceiptEnvelope): string | undefined {
  try {
    // base64 decode without depending on Node-only Buffer.
    const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { receiptId?: unknown };
    return typeof body.receiptId === "string" ? body.receiptId : undefined;
  } catch {
    return undefined;
  }
}
