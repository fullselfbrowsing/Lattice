/**
 * `lattice repro <receipt-id-or-path> [--key <keyset-path>] [--fixtures <dir>]`
 *
 * Local-repro-of-a-prod-thumbs-down: load a signed receipt, verify it,
 * materialize a `ReplayEnvelope` from on-disk fixture artifacts, run
 * `replayOffline`, and diff the result's outputHash against the receipt's
 * recorded `outputHash`.
 *
 * Pipeline (each stage maps to one exit-code branch):
 *   1. loadReceiptByIdOrPath        -> exit 2 (FAIL kind=receipt-load-failed)
 *   2. loadKeySetFromPath           -> exit 2 (FAIL kind=keyset-load-failed)
 *   3. createFilesystemArtifactLoader (pure; no I/O until materialize calls it)
 *   4. materializeReplayEnvelope    -> exit 2 (FAIL kind=verify-failed
 *                                              | artifact-load-failed
 *                                              | envelope-malformed
 *                                              | invalid-hash)
 *   5. verifyReceipt (second call)  -> obtain typed body for the summary;
 *                                       unreachable failure (materialize verifies first)
 *   6. replayOffline                -> exit 2 (FAIL kind=replay-failed) if !ok
 *   7. Recompute hash, diff:
 *      - body.outputHash === null   -> exit 2 (FAIL kind=receipt-had-no-outputhash)
 *      - actualHash === body.outputHash -> exit 0 (verdict=match)
 *      - else                       -> exit 1 (verdict=drift)
 *
 * Redaction discipline (CLI-05): the summary surfaces ONLY redacted-body
 * fields (receiptId, kid, contractVerdict, model.requested, route.providerId,
 * route.capabilityId, usage.costUsd, verdict). inputHashes are NEVER printed.
 * outputHash appears only on drift, as the diff target.
 *
 * Tested via mock argv: `runRepro(args, deps)`. `deps` is a `{ stdout, stderr,
 * exit }` injection point so tests assert without touching process globals.
 */

import { defineCommand } from "citty";

import {
  materializeReplayEnvelope,
  replayOffline,
  verifyReceipt,
  type CapabilityReceiptBody,
  type ReceiptEnvelope,
} from "lattice";

import {
  createFilesystemArtifactLoader,
  isArtifactLoaderError,
} from "../io/artifact-loader.js";
import { isKeysetLoadError, loadKeySetFromPath } from "../io/keyset-loader.js";
import {
  isReceiptLoadError,
  loadReceiptByIdOrPath,
} from "../io/receipt-loader.js";

export interface ReproDeps {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
}

const defaultDeps: ReproDeps = {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
  exit: (code) => {
    process.exit(code);
  },
};

export interface RunReproArgs {
  readonly target: string;
  readonly key?: string;
  readonly fixtures?: string;
  /** Test-only knob (cwd-independent receipt resolution). NOT exposed via citty args. */
  readonly receiptsDir?: string;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readErrorKind(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const v = value as { kind?: unknown };
    if (typeof v.kind === "string") return v.kind;
  }
  return "unknown";
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null) {
    const v = value as { message?: unknown };
    if (typeof v.message === "string") return v.message;
  }
  return String(value);
}

function printSummary(
  body: CapabilityReceiptBody,
  verdict: "match" | "drift",
  deps: ReproDeps,
  diff?: { expected: string; actual: string },
): void {
  // Order is stable so downstream scripts can grep. Every field below is
  // already redacted by Phase 9 before signing — printing it does NOT leak
  // anything the signer didn't already commit to.
  deps.stdout(`receiptId=${body.receiptId}`);
  deps.stdout(`kid=${body.kid}`);
  deps.stdout(`contractVerdict=${body.contractVerdict}`);
  deps.stdout(`model.requested=${body.model.requested}`);
  deps.stdout(`route.providerId=${body.route.providerId}`);
  deps.stdout(`route.capabilityId=${body.route.capabilityId}`);
  deps.stdout(`usage.costUsd=${body.usage.costUsd ?? "null"}`);
  deps.stdout(`verdict=${verdict}`);
  if (verdict === "drift" && diff !== undefined) {
    deps.stdout(`expected.outputHash=${diff.expected.slice(0, 200)}`);
    deps.stdout(`actual.outputHash=${diff.actual.slice(0, 200)}`);
  }
}

/**
 * Testable handler — pure with respect to `deps`. All output goes through
 * `deps.stdout/stderr/exit`; the function returns void after `deps.exit` is
 * called.
 */
export async function runRepro(
  args: RunReproArgs,
  deps: ReproDeps = defaultDeps,
): Promise<void> {
  // Stage 1: load receipt.
  let envelope: ReceiptEnvelope;
  try {
    const loaded = await loadReceiptByIdOrPath(
      args.target,
      args.receiptsDir !== undefined ? { receiptsDir: args.receiptsDir } : {},
    );
    envelope = loaded.envelope;
  } catch (err) {
    const reason = isReceiptLoadError(err)
      ? `${err.kind} at ${err.resolvedPath}: ${err.message}`
      : readErrorMessage(err);
    deps.stderr(`FAIL kind=receipt-load-failed reason=${reason}`);
    deps.exit(2);
    return;
  }

  // Stage 2: load keyset.
  let keySet;
  try {
    keySet = await loadKeySetFromPath(args.key);
  } catch (err) {
    const reason = isKeysetLoadError(err)
      ? `${err.kind} at ${err.path}: ${err.message}`
      : readErrorMessage(err);
    deps.stderr(`FAIL kind=keyset-load-failed reason=${reason}`);
    deps.exit(2);
    return;
  }

  // Stage 3: build the filesystem artifact loader (pure; no I/O until called).
  const fixturesDir = args.fixtures ?? ".lattice/fixtures";
  const artifactLoader = createFilesystemArtifactLoader(fixturesDir);

  // Stage 4: materialize. Phase 10's materializer verifies FIRST — a tampered
  // receipt never touches artifactLoader. Loader-thrown ArtifactLoaderError
  // values get re-wrapped by materialize as MaterializationError
  // { kind: "artifact-load-failed", message }.
  let envelopeReplay;
  try {
    envelopeReplay = await materializeReplayEnvelope(envelope, {
      artifactLoader,
      keySet,
    });
  } catch (err) {
    // err may be:
    //   - MaterializationError { kind: verify-failed | artifact-load-failed | envelope-malformed }
    //   - ArtifactLoaderError { kind: invalid-hash, ... } (if hash-gate fired
    //     before fs touch — but materialize wraps this to artifact-load-failed
    //     in practice; we handle both for defensive completeness)
    const kind = isArtifactLoaderError(err) ? err.kind : readErrorKind(err);
    const reason = readErrorMessage(err);
    deps.stderr(`FAIL kind=${kind} reason=${reason}`);
    deps.exit(2);
    return;
  }

  // Stage 5: obtain typed body for the summary. We re-run verifyReceipt
  // because materializeReplayEnvelope verifies internally but does not expose
  // the verified body to callers. Ed25519 verify is microsecond-level —
  // acceptable for a CLI. Re-using the public surface keeps CLI-06 intact
  // (no private imports from lattice/src/*).
  const verifyResult = await verifyReceipt(envelope, keySet);
  if (!verifyResult.ok) {
    // Unreachable in practice (materialize already verified). Defensive.
    deps.stderr(
      `FAIL kind=verify-failed reason=${verifyResult.error.message}`,
    );
    deps.exit(2);
    return;
  }
  const body = verifyResult.body;

  // Stage 6: replay.
  const result = await replayOffline(envelopeReplay);
  if (!result.ok) {
    const reason = `${result.error.kind}: ${result.error.message ?? ""}`;
    deps.stderr(`FAIL kind=replay-failed reason=${reason}`);
    deps.exit(2);
    return;
  }

  // Stage 7: compare outputHash.
  if (body.outputHash === null) {
    deps.stderr(
      `FAIL kind=receipt-had-no-outputhash reason=Receipt has contractVerdict=${body.contractVerdict} and no recorded outputHash to diff against.`,
    );
    deps.exit(2);
    return;
  }

  // Recompute hash the same way Phase 9-04 commits to it:
  //   fingerprintArtifactValue(outputs) -> sha256(JSON.stringify(outputs))
  // We replicate the formula inline rather than importing the private
  // helper, preserving the CLI-06 public-export boundary.
  const canonical = JSON.stringify(result.outputs);
  const actualHash = await sha256Hex(canonical);

  if (actualHash === body.outputHash) {
    printSummary(body, "match", deps);
    deps.exit(0);
    return;
  }
  printSummary(body, "drift", deps, {
    expected: body.outputHash,
    actual: actualHash,
  });
  deps.exit(1);
}

export default defineCommand({
  meta: {
    name: "repro",
    description:
      "Verify a receipt, materialize a replay envelope from disk, replay it offline, and diff against the recorded outputHash.",
  },
  args: {
    target: {
      type: "positional",
      required: true,
      description:
        "Receipt id (resolved against .lattice/receipts/<id>.json) or a path containing '/' or ending in '.json'.",
    },
    key: {
      type: "string",
      description:
        "Path to the keyset JSON file (default: ~/.lattice/keyset.json).",
    },
    fixtures: {
      type: "string",
      description:
        "Path to the fixtures directory containing <sha256>.bin artifact bodies (default: .lattice/fixtures/).",
    },
  },
  async run({ args }) {
    // exactOptionalPropertyTypes: conditionally spread optional fields so
    // citty's `string | undefined` parsed args don't reach RunReproArgs's
    // `?: string` slots as explicit `undefined`.
    const callArgs: RunReproArgs = {
      target: args.target,
      ...(args.key !== undefined ? { key: args.key } : {}),
      ...(args.fixtures !== undefined ? { fixtures: args.fixtures } : {}),
    };
    await runRepro(callArgs);
  },
});
