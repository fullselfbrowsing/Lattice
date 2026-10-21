/**
 * `lattice verify <receipt-path> [--key <keyset-path>] [--min-version <v>]
 *                 [--audience <aud>] [--nonce <nonce>] [--max-age-ms <ms>]`
 *
 * Offline integrity check for a signed capability receipt. Reads the
 * receipt JSON, loads the keyset JSON file (default `~/.lattice/keyset.json`),
 * and runs `verifyReceipt` from the lattice public surface.
 *
 * Output contract (CONTEXT.md exit-code matrix):
 *   exit 0 — success    : single stdout line `OK kid=<kid> verdict=<contractVerdict>`
 *   exit 1 — verify FAIL: single stderr line `FAIL kind=<VerifyErrorKind> reason=<message>`
 *                         VerifyErrorKind now includes `audience-mismatch`,
 *                         `nonce-mismatch`, and `receipt-expired`.
 *   exit 2 — load FAIL  : single stderr line `FAIL kind=keyset-load-failed reason=...`,
 *                         `FAIL kind=receipt-load-failed reason=...`, or
 *                         `FAIL kind=invalid-argument reason=...` for a bad flag value.
 *
 * Verifier policy flags (issue #21):
 *   --min-version   lowest accepted schema version (`lattice-receipt/v1.3` ...)
 *   --audience      the receipt's `audience` must equal this value
 *   --nonce         the receipt's `nonce` must equal this value
 *   --max-age-ms    reject when `issuedAt + max-age-ms` is in the past
 * A receipt carrying `expiresAt` is always checked against the clock.
 *
 * Redaction discipline (CLI-05): the success line ONLY surfaces fields
 * already present on the signed body (`kid`, `contractVerdict`). No payload
 * bytes, no input/output hashes, no signatures.
 *
 * The handler is split into a named exported `runVerify(args, deps)` plus
 * the default-exported `defineCommand`. Tests import `runVerify` and inject
 * a capturing `VerifyDeps` — the "subcommand handlers tested via mock argv,
 * no spawn" pattern documented in 11-CONTEXT.md.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineCommand } from "citty";
import {
  receiptVerifyAdvisories,
  verifyReceipt,
  type ReceiptEnvelope,
} from "@full-self-browsing/lattice";

import {
  isKeysetLoadError,
  loadKeySetFromPath,
} from "../io/keyset-loader.js";
import { buildVerifyOptions, type VerifyOptionArgs } from "../receipt/verify-options.js";

const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;

export interface VerifyDeps {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
}

const defaultDeps: VerifyDeps = {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
  exit: (code) => {
    process.exit(code);
  },
};

function isReceiptEnvelopeShape(value: unknown): value is ReceiptEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.payloadType !== PAYLOAD_TYPE) return false;
  if (typeof v.payload !== "string") return false;
  if (!Array.isArray(v.signatures)) return false;
  return true;
}

export interface RunVerifyArgs extends VerifyOptionArgs {
  readonly receipt: string;
  readonly key?: string;
}

/**
 * The testable handler. Pure with respect to `deps` — no global side effects
 * unless the default `process.*` deps are used. Returns void; all signaling
 * goes through `deps.stdout/stderr/exit`.
 */
export async function runVerify(
  args: RunVerifyArgs,
  deps: VerifyDeps = defaultDeps,
): Promise<void> {
  // Step 0: translate policy flags. A bad flag is a usage error (exit 2),
  // never a verify verdict.
  const built = buildVerifyOptions(args);
  if (!built.ok) {
    deps.stderr(`FAIL kind=invalid-argument reason=${built.reason}`);
    deps.exit(2);
    return;
  }

  // Step 1: load the keyset. Failure here is distinct from a verify failure
  // (exit 2 vs exit 1) so scripts can branch on "I cannot verify" vs "the
  // receipt does not verify".
  let keySet;
  try {
    keySet = await loadKeySetFromPath(args.key);
  } catch (err) {
    const reason = isKeysetLoadError(err)
      ? `${err.kind} at ${err.path}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
    deps.stderr(`FAIL kind=keyset-load-failed reason=${reason}`);
    deps.exit(2);
    return;
  }

  // Step 2: load the receipt JSON envelope.
  let envelope: ReceiptEnvelope;
  try {
    const resolvedReceipt = resolve(args.receipt);
    const text = await readFile(resolvedReceipt, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!isReceiptEnvelopeShape(parsed)) {
      throw new Error(
        "Receipt JSON does not match ReceiptEnvelope shape (payloadType/payload/signatures).",
      );
    }
    envelope = parsed;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    deps.stderr(`FAIL kind=receipt-load-failed reason=${reason}`);
    deps.exit(2);
    return;
  }

  // Step 3: verify. Branch on `result.ok` — the union narrows so we never
  // touch `result.error` on the success path or `result.body` on the failure
  // path (exactOptionalPropertyTypes safety).
  const result = await verifyReceipt(envelope, keySet, built.options);
  if (result.ok) {
    deps.stdout(`OK kid=${result.body.kid} verdict=${result.body.contractVerdict}`);
    for (const note of receiptVerifyAdvisories(result.body, built.options)) {
      deps.stderr(`WARN ${note}`);
    }
    deps.exit(0);
    return;
  }
  deps.stderr(`FAIL kind=${result.error.kind} reason=${result.error.message}`);
  deps.exit(1);
}

export default defineCommand({
  meta: {
    name: "verify",
    description:
      "Verify a receipt's signature and structural integrity against a keyset.",
  },
  args: {
    receipt: {
      type: "positional",
      required: true,
      description: "Path to a receipt JSON file (ReceiptEnvelope shape).",
    },
    key: {
      type: "string",
      description:
        "Path to the keyset JSON file (default: ~/.lattice/keyset.json).",
    },
    "min-version": {
      type: "string",
      description:
        "Lowest accepted receipt schema version, e.g. lattice-receipt/v1.3.",
    },
    audience: {
      type: "string",
      description: "Require the receipt's audience to equal this value.",
    },
    nonce: {
      type: "string",
      description: "Require the receipt's nonce to equal this value.",
    },
    "max-age-ms": {
      type: "string",
      description:
        "Reject receipts whose issuedAt is older than this many milliseconds.",
    },
  },
  async run({ args }) {
    // exactOptionalPropertyTypes: spread conditionally so citty's
    // `string | undefined` parsed args never reach the optional slots as an
    // explicit `undefined`.
    const callArgs: RunVerifyArgs = {
      receipt: args.receipt,
      ...(args.key !== undefined ? { key: args.key } : {}),
      ...(args["min-version"] !== undefined ? { minVersion: args["min-version"] } : {}),
      ...(args.audience !== undefined ? { audience: args.audience } : {}),
      ...(args.nonce !== undefined ? { nonce: args.nonce } : {}),
      ...(args["max-age-ms"] !== undefined
        ? { maxAgeMs: Number(args["max-age-ms"]) }
        : {}),
    };
    await runVerify(callArgs);
  },
});
