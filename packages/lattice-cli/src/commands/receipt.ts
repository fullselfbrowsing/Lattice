import { defineCommand } from "citty";
import { verifyChain, type ReceiptEnvelope } from "@full-self-browsing/lattice";

import {
  isKeysetLoadError,
  loadKeySetFromPath,
} from "../io/keyset-loader.js";
import {
  isWalkedReceiptError,
  walkReceiptsDirectory,
} from "../io/receipt-walker.js";
import {
  diffReceiptFiles,
  isReceiptDiffError,
  type ReceiptDiffOptions,
  type ReceiptDiffReport,
} from "../receipt/diff.js";
import { buildVerifyOptions, type VerifyOptionArgs } from "../receipt/verify-options.js";

export interface ReceiptDeps {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
  readonly diffReceipts?: (options: ReceiptDiffOptions) => Promise<ReceiptDiffReport>;
}

const defaultDeps: ReceiptDeps = {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
  exit: (code) => {
    process.exit(code);
  },
};

export interface RunReceiptDiffArgs {
  readonly left: string;
  readonly right: string;
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null) {
    const v = value as { message?: unknown };
    if (typeof v.message === "string") return v.message;
  }
  return String(value);
}

export async function runReceiptDiff(
  args: RunReceiptDiffArgs,
  deps: ReceiptDeps = defaultDeps,
): Promise<void> {
  const diffReceipts = deps.diffReceipts ?? diffReceiptFiles;

  let report: ReceiptDiffReport;
  try {
    report = await diffReceipts(args);
  } catch (err) {
    if (isReceiptDiffError(err)) {
      deps.stderr(
        `FAIL kind=receipt-diff-${err.side}-${err.kind} reason=${err.path}: ${err.message}`,
      );
      deps.exit(2);
      return;
    }
    deps.stderr(
      `FAIL kind=receipt-diff-failed reason=${readErrorMessage(err)}`,
    );
    deps.exit(2);
    return;
  }

  const exitCode: 0 | 1 = report.equal ? 0 : 1;
  const finalReport: ReceiptDiffReport = { ...report, exitCode };
  deps.stderr(
    `SUMMARY equal=${String(finalReport.equal)} differences=${finalReport.differences.length}`,
  );
  deps.stdout(JSON.stringify(finalReport));
  deps.exit(exitCode);
}

const diffCommand = defineCommand({
  meta: {
    name: "diff",
    description: "Compare two receipt envelopes and report structural differences.",
  },
  args: {
    left: {
      type: "string",
      required: true,
      description: "Path to the left receipt envelope JSON.",
    },
    right: {
      type: "string",
      required: true,
      description: "Path to the right receipt envelope JSON.",
    },
  },
  async run({ args }) {
    await runReceiptDiff({ left: args.left, right: args.right });
  },
});

/**
 * `lattice receipt verify-chain <dir> [--key <keyset>] [--expect-count N]
 *                                     [--run-id ID] [--root-cid CID]
 *                                     [--min-version V] [--audience A]
 *                                     [--nonce N] [--max-age-ms MS]`
 *
 * Verifies every `*.json` receipt in `dir` as one parentReceiptCid tree via
 * `verifyChain` (issue #21 finding 3).
 *
 * Output contract, mirroring `lattice verify`:
 *   exit 0 — `OK root=<cid> links=<count>` on stdout
 *   exit 1 — `FAIL kind=<VerifyChainErrorKind> reason=<message>[ cid=<cid>]` on stderr
 *   exit 2 — `FAIL kind=keyset-load-failed|receipt-load-failed|invalid-argument reason=...`
 *
 * Redaction discipline: the success line carries only the root CID and a
 * count. Tail truncation (dropped leaf receipts) is only detectable when
 * `--expect-count` or `--root-cid` supplies an out-of-band commitment.
 */
export interface RunReceiptVerifyChainArgs extends VerifyOptionArgs {
  readonly dir: string;
  readonly key?: string;
  readonly expectCount?: number;
  readonly runId?: string;
  readonly rootCid?: string;
}

export async function runReceiptVerifyChain(
  args: RunReceiptVerifyChainArgs,
  deps: ReceiptDeps = defaultDeps,
): Promise<void> {
  // Step 0: flag validation (usage errors, exit 2).
  const built = buildVerifyOptions(args);
  if (!built.ok) {
    deps.stderr(`FAIL kind=invalid-argument reason=${built.reason}`);
    deps.exit(2);
    return;
  }
  if (
    args.expectCount !== undefined &&
    (!Number.isInteger(args.expectCount) || args.expectCount < 0)
  ) {
    deps.stderr(
      "FAIL kind=invalid-argument reason=--expect-count must be a non-negative integer",
    );
    deps.exit(2);
    return;
  }

  // Step 1: keyset.
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

  // Step 2: collect every receipt in the directory. Any unreadable file is
  // a load failure: a chain verdict over a partial set would be misleading.
  const envelopes: ReceiptEnvelope[] = [];
  try {
    for await (const entry of walkReceiptsDirectory(args.dir)) {
      if (isWalkedReceiptError(entry)) {
        deps.stderr(
          `FAIL kind=receipt-load-failed reason=${entry.resolvedPath}: ${readErrorMessage(entry.error)}`,
        );
        deps.exit(2);
        return;
      }
      envelopes.push(entry.envelope);
    }
  } catch (err) {
    deps.stderr(
      `FAIL kind=receipt-load-failed reason=${args.dir}: ${readErrorMessage(err)}`,
    );
    deps.exit(2);
    return;
  }
  if (envelopes.length === 0) {
    deps.stderr(
      `FAIL kind=receipt-load-failed reason=${args.dir}: no *.json receipts found`,
    );
    deps.exit(2);
    return;
  }

  // Step 3: verify the tree.
  const result = await verifyChain(envelopes, keySet, {
    ...built.options,
    ...(args.runId !== undefined ? { expectedRunId: args.runId } : {}),
    ...(args.expectCount !== undefined ? { expectedCount: args.expectCount } : {}),
    ...(args.rootCid !== undefined ? { expectedRootCid: args.rootCid } : {}),
  });
  if (result.ok) {
    deps.stdout(`OK root=${result.rootCid} links=${result.count}`);
    deps.exit(0);
    return;
  }
  const cidSuffix = result.error.cid !== undefined ? ` cid=${result.error.cid}` : "";
  deps.stderr(`FAIL kind=${result.error.kind} reason=${result.error.message}${cidSuffix}`);
  deps.exit(1);
}

const verifyChainCommand = defineCommand({
  meta: {
    name: "verify-chain",
    description:
      "Verify a directory of receipts as one parentReceiptCid tree against a keyset.",
  },
  args: {
    dir: {
      type: "positional",
      required: true,
      description: "Directory containing receipt envelope JSON files.",
    },
    key: {
      type: "string",
      description:
        "Path to the keyset JSON file (default: ~/.lattice/keyset.json).",
    },
    "expect-count": {
      type: "string",
      description: "Expected number of receipts in the chain (detects dropped leaves).",
    },
    "run-id": {
      type: "string",
      description: "Require every receipt to carry this runId.",
    },
    "root-cid": {
      type: "string",
      description: "Require the chain root to have this CID.",
    },
    "min-version": {
      type: "string",
      description:
        "Lowest accepted receipt schema version, e.g. lattice-receipt/v1.3.",
    },
    audience: {
      type: "string",
      description: "Require every receipt's audience to equal this value.",
    },
    nonce: {
      type: "string",
      description: "Require every receipt's nonce to equal this value.",
    },
    "max-age-ms": {
      type: "string",
      description:
        "Reject receipts whose issuedAt is older than this many milliseconds.",
    },
  },
  async run({ args }) {
    const callArgs: RunReceiptVerifyChainArgs = {
      dir: args.dir,
      ...(args.key !== undefined ? { key: args.key } : {}),
      ...(args["expect-count"] !== undefined
        ? { expectCount: Number(args["expect-count"]) }
        : {}),
      ...(args["run-id"] !== undefined ? { runId: args["run-id"] } : {}),
      ...(args["root-cid"] !== undefined ? { rootCid: args["root-cid"] } : {}),
      ...(args["min-version"] !== undefined ? { minVersion: args["min-version"] } : {}),
      ...(args.audience !== undefined ? { audience: args.audience } : {}),
      ...(args.nonce !== undefined ? { nonce: args.nonce } : {}),
      ...(args["max-age-ms"] !== undefined
        ? { maxAgeMs: Number(args["max-age-ms"]) }
        : {}),
    };
    await runReceiptVerifyChain(callArgs);
  },
});

export default defineCommand({
  meta: {
    name: "receipt",
    description: "Inspect, compare, and chain-verify signed capability receipts.",
  },
  subCommands: {
    diff: diffCommand,
    "verify-chain": verifyChainCommand,
  },
});
