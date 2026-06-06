/**
 * Sidecar file loader for `lattice repro` and `lattice eval`.
 *
 * Reads a JSON sidecar (the `{ task, outputs, policy, contract }` quadruple
 * that the receipt body intentionally never embeds) from disk, validates
 * it against the v1.1 wire format, and returns a typed `SidecarFile`.
 * Strict-from-day-one: no auto-detection of "old" sidecars, no schema
 * coercion, no implicit fallbacks. The `version` field is REQUIRED and the
 * only accepted value is `"lattice-sidecar/v1"`.
 *
 * v1.1 limitation: `outputs` cannot losslessly carry StandardSchema/Zod
 * validators (those are functions). v1.1 supports ONLY:
 *   - the literal string `"text"`
 *   - the citation contract sentinel `{ kind: "citations" }`
 *   - the artifact contract sentinel `{ kind: "artifacts" }`
 * Any other shape surfaces `kind: "unsupported-output-shape"` with a hint
 * pointing the caller at v1.2 (richer schema-bridge).
 *
 * Error shape mirrors `KeysetLoadError` / `ReceiptLoadError`: a plain object
 * literal (no Error subclass) discriminated by `kind`. Callers pattern-match.
 */

import { readFile } from "node:fs/promises";

import {
  output,
  type CapabilityContract,
  type OutputContractMap,
  type PolicySpec,
} from "@full-self-browsing/lattice";

/** v1.1 sidecar wire format. The `version` field is REQUIRED. */
export interface SidecarFile {
  readonly version: "lattice-sidecar/v1";
  readonly task: string;
  /**
   * Outputs map. v1.1 supports ONLY the literal string "text" and the
   * citation/artifact contract sentinels (`{ kind: "citations" }` /
   * `{ kind: "artifacts" }`). Standard Schema / Zod validators surface
   * `unsupported-output-shape`.
   */
  readonly outputs: Record<string, SidecarOutputSpec>;
  readonly policy: PolicySpec;
  readonly contract: CapabilityContract;
  /**
   * Optional raw output values from the original provider run. When present,
   * `applySidecar` projects these into the `outputs` field of
   * `SidecarApplyResult` so `materializeReplayEnvelope` receives the actual
   * values (not the schema spec) — required for `lattice repro` to recompute
   * the same outputHash the receipt committed to (i.e. reach verdict=match).
   *
   * When omitted, `applySidecar` falls back to rehydrating the schema spec
   * via `output.citations()` / `output.artifacts()` / `"text"` — useful for
   * fixtures whose receipts have `outputHash === null` (failure receipts)
   * where the values are unrecoverable anyway.
   *
   * Additive in v1: existing sidecars without this field continue to load.
   */
  readonly rawOutputs?: Record<string, unknown>;
}

/** Serializable output specs supported by v1.1. */
export type SidecarOutputSpec =
  | "text"
  | { readonly kind: "citations" }
  | { readonly kind: "artifacts" };

/** Discriminated load failure. Callers pattern-match on `kind`. */
export type SidecarLoadError =
  | {
      readonly kind: "file-not-found";
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly kind: "malformed";
      readonly path: string;
      readonly message: string;
    }
  | {
      readonly kind: "version-mismatch";
      readonly path: string;
      readonly message: string;
      readonly received: string;
    }
  | {
      readonly kind: "unsupported-output-shape";
      readonly path: string;
      readonly message: string;
      readonly outputKey: string;
    };

/** Pure projection — narrows a loaded sidecar to the fields
 *  `materializeReplayEnvelope` accepts. */
export interface SidecarApplyResult {
  readonly task: string;
  readonly outputs: OutputContractMap;
  readonly policy: PolicySpec;
  readonly contract: CapabilityContract;
}

export function isSidecarLoadError(value: unknown): value is SidecarLoadError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.path !== "string") return false;
  if (typeof v.message !== "string") return false;
  switch (v.kind) {
    case "file-not-found":
    case "malformed":
      return true;
    case "version-mismatch":
      return typeof v.received === "string";
    case "unsupported-output-shape":
      return typeof v.outputKey === "string";
    default:
      return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyOutputSpec(value: unknown): SidecarOutputSpec | null {
  if (value === "text") return "text";
  if (isPlainObject(value)) {
    if (value.kind === "citations") return { kind: "citations" };
    if (value.kind === "artifacts") return { kind: "artifacts" };
  }
  return null;
}

/**
 * Strict loader. Throws `SidecarLoadError` on any failure.
 */
export async function loadSidecar(path: string): Promise<SidecarFile> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw {
      kind: "file-not-found",
      path,
      message,
    } satisfies SidecarLoadError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw { kind: "malformed", path, message } satisfies SidecarLoadError;
  }

  if (!isPlainObject(parsed)) {
    throw {
      kind: "malformed",
      path,
      message: "Sidecar JSON must be a top-level object.",
    } satisfies SidecarLoadError;
  }

  const versionValue = parsed.version;
  if (typeof versionValue !== "string") {
    throw {
      kind: "malformed",
      path,
      message: "Sidecar JSON is missing a string `version` field.",
    } satisfies SidecarLoadError;
  }
  if (versionValue !== "lattice-sidecar/v1") {
    throw {
      kind: "version-mismatch",
      path,
      received: versionValue,
      message: `Expected lattice-sidecar/v1, got ${versionValue}.`,
    } satisfies SidecarLoadError;
  }

  if (typeof parsed.task !== "string") {
    throw {
      kind: "malformed",
      path,
      message: "Sidecar JSON is missing a string `task` field.",
    } satisfies SidecarLoadError;
  }

  if (!isPlainObject(parsed.outputs)) {
    throw {
      kind: "malformed",
      path,
      message: "Sidecar JSON is missing an object `outputs` field.",
    } satisfies SidecarLoadError;
  }

  if (!isPlainObject(parsed.policy)) {
    throw {
      kind: "malformed",
      path,
      message: "Sidecar JSON is missing an object `policy` field.",
    } satisfies SidecarLoadError;
  }

  if (!isPlainObject(parsed.contract)) {
    throw {
      kind: "malformed",
      path,
      message: "Sidecar JSON is missing an object `contract` field.",
    } satisfies SidecarLoadError;
  }

  const validatedOutputs: Record<string, SidecarOutputSpec> = {};
  for (const [key, rawValue] of Object.entries(parsed.outputs)) {
    const classified = classifyOutputSpec(rawValue);
    if (classified === null) {
      throw {
        kind: "unsupported-output-shape",
        path,
        outputKey: key,
        message: `Output '${key}' uses a non-literal Standard Schema validator. v1.1 sidecars support only literal 'text' outputs and the citation/artifact contract sentinels — defer richer schema serialization to v1.2.`,
      } satisfies SidecarLoadError;
    }
    validatedOutputs[key] = classified;
  }

  // Optional rawOutputs (Phase 13.1-03). When present, callers can opt to
  // round-trip the receipt's outputHash through `lattice repro`. Additive
  // field: existing sidecars without it still load.
  let rawOutputs: Record<string, unknown> | undefined;
  if (parsed.rawOutputs !== undefined) {
    if (!isPlainObject(parsed.rawOutputs)) {
      throw {
        kind: "malformed",
        path,
        message:
          "Sidecar JSON's optional `rawOutputs` field must be a plain object when present.",
      } satisfies SidecarLoadError;
    }
    rawOutputs = parsed.rawOutputs;
  }

  return {
    version: "lattice-sidecar/v1",
    task: parsed.task,
    outputs: validatedOutputs,
    policy: parsed.policy as unknown as PolicySpec,
    contract: parsed.contract as unknown as CapabilityContract,
    ...(rawOutputs !== undefined ? { rawOutputs } : {}),
  };
}

/**
 * Pure projection — rehydrates the sidecar's serialized output specs to
 * runtime `OutputContractMap` values (the literal `"text"` stays as
 * `"text"`; sentinels are reconstructed via `output.citations()` /
 * `output.artifacts()`). Returns the four optional fields ready to spread
 * into `MaterializeReplayEnvelopeOptions`.
 *
 * Phase 13.1-03: when the sidecar carries `rawOutputs` (the original
 * provider output VALUES), the returned `outputs` field is set to those
 * values directly so `materializeReplayEnvelope` populates the replay
 * envelope with values that recompute the receipt's recorded outputHash
 * (i.e. `lattice repro` reaches verdict=match). Without `rawOutputs` the
 * fallback (schema spec) still satisfies the type, but the replay's
 * outputHash will not match the receipt's — appropriate for fixtures whose
 * receipts have `outputHash === null` (failure / refusal receipts).
 */
export function applySidecar(sidecar: SidecarFile): SidecarApplyResult {
  if (sidecar.rawOutputs !== undefined) {
    return {
      task: sidecar.task,
      // Cast: rawOutputs is the validated value shape from the original
      // provider run. `materializeReplayEnvelope` accepts these as
      // `InferOutputMap<TOutputs>` (the inferred value shape).
      outputs: sidecar.rawOutputs as unknown as OutputContractMap,
      policy: sidecar.policy,
      contract: sidecar.contract,
    };
  }
  const outputs: Record<string, OutputContractMap[string]> = {};
  for (const [key, spec] of Object.entries(sidecar.outputs)) {
    if (spec === "text") {
      outputs[key] = "text";
    } else if (spec.kind === "citations") {
      outputs[key] = output.citations();
    } else {
      outputs[key] = output.artifacts();
    }
  }
  return {
    task: sidecar.task,
    outputs,
    policy: sidecar.policy,
    contract: sidecar.contract,
  };
}
