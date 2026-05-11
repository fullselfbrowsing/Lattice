/**
 * Phase 10 — materializeReplayEnvelope.
 *
 * Reconstructs a `ReplayEnvelope` from a signed `ReceiptEnvelope` plus a
 * pluggable artifact loader. The flow is:
 *
 *   1. verifyReceipt(receipt, keySet) — REQUIRED before any other work.
 *      A tampered or revoked receipt MUST short-circuit before the artifact
 *      loader is invoked (no side effects on bad input).
 *   2. Parse the verified body to learn `inputHashes`.
 *   3. Invoke `artifactLoader(hash)` once per input hash, in order.
 *   4. Assemble a `ReplayEnvelope` whose `plan` reproduces the receipt's
 *      route/usage fields, attach the receipt itself, and (optionally) the
 *      caller-supplied contract / task / outputs / policy.
 *
 * v1.1 limitation: the receipt body does NOT carry the original task string,
 * outputs schema, or policy snapshot. Callers may supply them via the options
 * bag; when omitted, the envelope's `task` defaults to "" and `outputs`
 * remains undefined. Phase 11's `lattice repro` CLI accepts a sidecar JSON
 * file to populate these fields.
 *
 * Errors NEVER cross the boundary as plain `Error`. All failures surface as
 * typed `MaterializationError` values thrown from the async function so the
 * caller can pattern-match on `error.kind` (and a `MaterializationError` IS
 * a thrown object whose `kind` discriminates the failure mode).
 */

import type { ArtifactInput } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import type { CapabilityContract } from "../contract/contract.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { InferOutputMap } from "../outputs/infer.js";
import { createExecutionPlan, type ExecutionPlan, type UsageRecord } from "../plan/plan.js";
import type { PolicySpec } from "../policy/policy.js";
import type { CapabilityModality } from "../providers/provider.js";
import type {
  CapabilityReceiptBody,
  KeySet,
  ReceiptEnvelope,
} from "../receipts/types.js";
import { verifyReceipt } from "../receipts/verify.js";
import { latticeVersion } from "../version.js";

import type { ReplayEnvelope } from "./replay.js";

/**
 * Discriminated union of materialization failure modes.
 *
 *   - "verify-failed"        — receipt failed verifyReceipt (signature, key
 *                              missing/revoked, canonicalization mismatch).
 *   - "artifact-load-failed" — the artifactLoader callback rejected for at
 *                              least one input hash.
 *   - "envelope-malformed"   — receipt verified but the verified body is
 *                              structurally unusable (should never happen
 *                              under verifyReceipt invariants, but kept as a
 *                              defensive third branch).
 */
export interface MaterializationError {
  readonly kind: "verify-failed" | "artifact-load-failed" | "envelope-malformed";
  readonly message: string;
}

function asMaterializationError(value: unknown): value is MaterializationError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** Throwable shape — `instanceof Error` is not required for typed unions, so
 *  the function just throws a plain object literal that matches the
 *  `MaterializationError` shape. Callers pattern-match on `err.kind`. */
function fail(
  kind: MaterializationError["kind"],
  message: string,
): MaterializationError {
  return { kind, message };
}

/**
 * Async callback that resolves an artifact body from its sha256 hex digest.
 * Phase 10 ships only the in-memory variant for tests. Phase 11's CLI plugs
 * in a filesystem-backed loader reading from `.lattice/fixtures/<sha256>.bin`.
 */
export type ArtifactLoader = (hash: string) => Promise<ArtifactInput>;

export interface MaterializeReplayEnvelopeOptions<
  TOutputs extends OutputContractMap = OutputContractMap,
> {
  readonly artifactLoader: ArtifactLoader;
  readonly keySet: KeySet;
  /** Optional original task string. Defaults to "" when omitted. */
  readonly task?: string;
  /**
   * Optional caller-supplied outputs map. When provided, the resulting
   * `ReplayEnvelope.outputs` is populated and `replayOffline` will return
   * an `ok: true` result. When omitted, `replayOffline` reports an
   * `execution_unavailable` failure (current Phase 5 semantics).
   */
  readonly outputs?: InferOutputMap<TOutputs>;
  readonly policy?: PolicySpec;
  readonly contract?: CapabilityContract;
}

/**
 * Pure async function that reconstructs a `ReplayEnvelope` from a receipt.
 *
 * Verify-FIRST ordering: `verifyReceipt` runs before `artifactLoader` is
 * touched. Tampered receipts MUST NOT cause loader side effects.
 */
export async function materializeReplayEnvelope<
  TOutputs extends OutputContractMap = OutputContractMap,
>(
  receipt: ReceiptEnvelope,
  options: MaterializeReplayEnvelopeOptions<TOutputs>,
): Promise<ReplayEnvelope<TOutputs>> {
  // Step 1: verify FIRST. No artifact loader call before this resolves.
  const verifyResult = await verifyReceipt(receipt, options.keySet);
  if (!verifyResult.ok) {
    throw fail(
      verifyResult.error.kind === "envelope-malformed"
        ? "envelope-malformed"
        : "verify-failed",
      verifyResult.error.message,
    );
  }

  const body: CapabilityReceiptBody = verifyResult.body;

  // Step 2: load every artifact referenced by the receipt's inputHashes.
  // We treat any loader rejection as `artifact-load-failed` and surface the
  // underlying message — the loader is the system boundary, so its error
  // text is the most informative thing we have.
  const loadedInputs: ArtifactInput[] = [];
  for (const hash of body.inputHashes) {
    if (hash === "") {
      // Skip empty-hash slots — Phase 9 emits "" for unfingerprintable
      // values (e.g., undefined artifact bodies). They have no resolvable
      // content and the replay artifacts array preserves order via the
      // remaining loaded entries.
      continue;
    }
    try {
      const input = await options.artifactLoader(hash);
      loadedInputs.push(input);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : asMaterializationError(error)
            ? error.message
            : String(error);
      throw fail("artifact-load-failed", message);
    }
  }

  // Step 3: assemble the ExecutionPlan envelope shell. The receipt does NOT
  // carry the full RouteDecision/ContextPack — we synthesize a minimal but
  // valid plan that reproduces the receipt's route + usage fields. This is
  // intentionally lossy and matches the v1.1 limitation note in 10-CONTEXT.md.
  const artifactRefs = loadedInputs.map(toArtifactRef);
  const outputsMap = (options.outputs !== undefined
    ? (Object.fromEntries(
        Object.keys(options.outputs as Record<string, unknown>).map((k) => [
          k,
          "text" as const,
        ]),
      ) as OutputContractMap)
    : ({} as OutputContractMap));

  const plan: ExecutionPlan = createExecutionPlan({
    task: options.task ?? "",
    artifacts: artifactRefs,
    outputs: outputsMap,
    route: {
      catalogVersion: "materialized",
      selected: {
        providerId: body.route.providerId,
        modelId: body.route.capabilityId,
        score: 0,
        estimates: { inputTokens: 0, outputTokens: 0 },
        inputModalities: [] as readonly CapabilityModality[],
        outputModalities: [] as readonly CapabilityModality[],
        fileTransport: [],
      },
      candidates: [],
      rejected: [],
      fallbackChain: [],
      noRouteReasons: [],
    },
    warnings: [],
    metadata: {
      materialized: true,
      receiptId: body.receiptId,
      runId: body.runId,
      contractVerdict: body.contractVerdict,
      ...(options.policy !== undefined ? { policy: { ...options.policy } } : {}),
    },
  });

  const usage: UsageRecord = {
    inputTokens: body.usage.promptTokens,
    outputTokens: body.usage.completionTokens,
    ...(body.usage.costUsd !== null
      ? { costUsd: Number(body.usage.costUsd) }
      : {}),
  };

  const envelope: ReplayEnvelope<TOutputs> = {
    kind: "replay-envelope",
    version: 1,
    runtimeVersion: latticeVersion,
    catalogVersion: "materialized",
    createdAt: new Date().toISOString(),
    plan,
    artifacts: artifactRefs,
    ...(options.outputs !== undefined ? { outputs: options.outputs } : {}),
    warnings: [],
    errors: [],
    usage,
    events: [],
    receipt,
    ...(options.contract !== undefined ? { contract: options.contract } : {}),
  };

  return envelope;
}
