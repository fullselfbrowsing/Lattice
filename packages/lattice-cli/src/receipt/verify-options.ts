/**
 * Shared translation from CLI flags to `VerifyOptions` for `lattice verify`
 * and `lattice receipt verify-chain`.
 *
 * Validation happens here rather than inside the runtime verifier because
 * the verifier treats bad options as programmer errors (TypeError). On the
 * command line they are user errors, so they map to a usage failure
 * (`FAIL kind=invalid-argument`, exit 2) instead of a crash.
 *
 * Also holds the advisory line format both commands print on success.
 */

import {
  RECEIPT_VERSIONS,
  type ReceiptVersion,
  type VerifyAdvisory,
  type VerifyOptions,
} from "@full-self-browsing/lattice";

/**
 * stderr lines for a successful verification: `WARN <code>: <message>` for
 * every warn-severity advisory, and `INFO <code>: <message>` for info ones
 * unless `quiet` is set. Warnings are never suppressed, because each one
 * names a binding or chain property that was not checked.
 */
export function advisoryLines(
  advisories: readonly VerifyAdvisory[],
  quiet: boolean,
): readonly string[] {
  const lines: string[] = [];
  for (const advisory of advisories) {
    if (advisory.severity === "warn") {
      lines.push(`WARN ${advisory.code}: ${advisory.message}`);
    } else if (!quiet) {
      lines.push(`INFO ${advisory.code}: ${advisory.message}`);
    }
  }
  return lines;
}

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
