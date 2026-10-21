/**
 * Shared translation from CLI flags to `VerifyOptions` for `lattice verify`
 * and `lattice receipt verify-chain`.
 *
 * Validation happens here rather than inside the runtime verifier because
 * the verifier treats bad options as programmer errors (TypeError). On the
 * command line they are user errors, so they map to a usage failure
 * (`FAIL kind=invalid-argument`, exit 2) instead of a crash.
 */

import {
  RECEIPT_VERSIONS,
  type ReceiptVersion,
  type VerifyOptions,
} from "@full-self-browsing/lattice";

export interface VerifyOptionArgs {
  readonly minVersion?: string;
  readonly audience?: string;
  readonly nonce?: string;
  readonly maxAgeMs?: number;
}

export type BuildVerifyOptionsResult =
  | { readonly ok: true; readonly options: VerifyOptions }
  | { readonly ok: false; readonly reason: string };

function isReceiptVersion(value: string): value is ReceiptVersion {
  return (RECEIPT_VERSIONS as readonly string[]).includes(value);
}

export function buildVerifyOptions(args: VerifyOptionArgs): BuildVerifyOptionsResult {
  let minVersion: ReceiptVersion | undefined;
  if (args.minVersion !== undefined) {
    if (!isReceiptVersion(args.minVersion)) {
      return {
        ok: false,
        reason: `--min-version "${args.minVersion}" is not a known receipt version (known: ${RECEIPT_VERSIONS.join(", ")})`,
      };
    }
    minVersion = args.minVersion;
  }
  if (
    args.maxAgeMs !== undefined &&
    (!Number.isFinite(args.maxAgeMs) || args.maxAgeMs < 0)
  ) {
    return {
      ok: false,
      reason: "--max-age-ms must be a finite, non-negative number of milliseconds",
    };
  }
  if (args.audience !== undefined && args.audience.length === 0) {
    return { ok: false, reason: "--audience must not be empty" };
  }
  if (args.nonce !== undefined && args.nonce.length === 0) {
    return { ok: false, reason: "--nonce must not be empty" };
  }
  return {
    ok: true,
    options: {
      ...(minVersion !== undefined ? { minVersion } : {}),
      ...(args.audience !== undefined ? { expectedAudience: args.audience } : {}),
      ...(args.nonce !== undefined ? { expectedNonce: args.nonce } : {}),
      ...(args.maxAgeMs !== undefined ? { maxAgeMs: args.maxAgeMs } : {}),
    },
  };
}
