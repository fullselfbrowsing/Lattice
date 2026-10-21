import type { ArtifactInput } from "../artifacts/artifact.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";

/**
 * Receipt hashing helpers shared by `ai.run`, the crew dispatcher, and the
 * crew orchestrator so every receipt commits to its output the same way and
 * replay (`replayOffline`) can recompute the value byte for byte.
 */

/**
 * SHA-256 hex of the UTF-8 bytes of `JSON.stringify(output)`.
 *
 * This is exactly what `ai.run` has always written to `outputHash`: the
 * runtime used to pass `JSON.stringify(outputs)` into
 * `fingerprintArtifactValue`, which hashes a string's UTF-8 bytes directly.
 * Hashing the object through `fingerprintArtifactValue` would give the same
 * bytes (it stringifies non-binary values), but keeping the stringify here
 * makes the contract explicit for callers that hold a plain string output.
 *
 * Returns `null` when the value has no JSON form, matching the
 * `outputHash: string | null` receipt field: `undefined`, functions, and
 * symbols stringify to `undefined`, while BigInt values, circular structures,
 * and a throwing `toJSON` make `JSON.stringify` throw. The throw is caught
 * here so an output the runtime cannot commit to is recorded as `null`
 * rather than reported as a signer failure (or, for crews, rejecting the crew
 * after the agents have finished).
 */
export async function hashOutputForReceipt(output: unknown): Promise<string | null> {
  if (output === undefined) return null;
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(output);
  } catch {
    return null;
  }
  if (serialized === undefined) return null;
  return (await fingerprintArtifactValue(serialized))?.value ?? null;
}

/**
 * SHA-256 hex of each artifact's `value`, in declaration order. Values that
 * cannot be fingerprinted produce `""` so the array length always equals
 * `artifacts.length`; `materializeReplayEnvelope` skips empty slots.
 */
export async function hashInputArtifacts(
  artifacts: readonly ArtifactInput[],
): Promise<readonly string[]> {
  const out: string[] = [];
  for (const artifact of artifacts) {
    const fp = await fingerprintArtifactValue(
      (artifact as { readonly value?: unknown }).value,
    );
    out.push(fp?.value ?? "");
  }
  return out;
}
