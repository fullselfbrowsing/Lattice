/**
 * `lattice verify <receipt-path> [--key <keyset-path>] [--standard-only]`
 *
 * Offline integrity check for a signed capability receipt. Reads the
 * receipt JSON, loads the keyset JSON file (default `~/.lattice/keyset.json`),
 * and runs `verifyReceipt` from the lattice public surface.
 *
 * Output contract (exit-code matrix):
 *   exit 0 — success: single stdout line with the receipt verdict,
 *                         verification profile, and deprecation status
 *   exit 1 — verify FAIL: single stderr line `FAIL kind=<VerifyErrorKind> reason=<message>`
 *   exit 2 — load FAIL: single stderr line `FAIL kind=keyset-load-failed reason=...`
 *                         or `FAIL kind=receipt-load-failed reason=...`
 *
 * Redaction discipline: the success line only surfaces signed-body
 * metadata plus verifier-owned profile metadata. It never prints payload
 * bytes, input/output hashes, or signatures.
 *
 * The handler is split into a named exported `runVerify(args, deps)` plus
 * the default-exported `defineCommand`. Tests import `runVerify` and inject
 * a capturing `VerifyDeps`, avoiding subprocesses.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineCommand } from "citty";
import {
  verifyReceipt,
  type LegacyReceiptPolicy,
  type ReceiptEnvelope,
} from "@full-self-browsing/lattice";

import {
  isKeysetLoadError,
  loadKeySetFromPath,
} from "../io/keyset-loader.js";

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

export interface RunVerifyArgs {
  readonly receipt: string;
  readonly key?: string;
  /** Reject receipts that require the deprecated legacy verification profile. */
  readonly standardOnly?: boolean;
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
  const legacyPolicy: LegacyReceiptPolicy = args.standardOnly
    ? "reject"
    : "allow";
  const result = await verifyReceipt(envelope, keySet, { legacyPolicy });
  if (result.ok) {
    deps.stdout(
      `OK kid=${result.body.kid} verdict=${result.body.contractVerdict} profile=${result.verificationProfile} deprecated=${String(result.deprecated)}`,
    );
    deps.exit(0);
    return;
  }
  deps.stderr(`FAIL kind=${result.error.kind} reason=${result.error.message}`);
  deps.exit(1);
}

export const verifyCommand = defineCommand({
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
    "standard-only": {
      type: "boolean",
      description: "Reject receipts that use the deprecated legacy signature profile.",
    },
  },
  async run({ args }) {
    // exactOptionalPropertyTypes: only set `key` when citty actually parsed a
    // value. Spreading conditionally avoids `key: undefined` reaching the
    // optional `RunVerifyArgs.key?: string`.
    const callArgs: RunVerifyArgs = {
      receipt: args.receipt,
      ...(args.key !== undefined ? { key: args.key } : {}),
      ...(args["standard-only"] === true ? { standardOnly: true } : {}),
    };
    await runVerify(callArgs);
  },
});

export default verifyCommand;
