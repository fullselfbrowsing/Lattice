import { defineCommand } from "citty";

import {
  diffReceiptFiles,
  isReceiptDiffError,
  type ReceiptDiffOptions,
  type ReceiptDiffReport,
} from "../receipt/diff.js";

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

export default defineCommand({
  meta: {
    name: "receipt",
    description: "Inspect and compare signed capability receipts.",
  },
  subCommands: {
    diff: diffCommand,
  },
});
