import { defineCommand } from "citty";

import {
  isLmStudioDiagnosticsLoadError,
  runLmStudioDiagnostics,
  type LmStudioDiagnosticsConfig,
  type LmStudioDiagnosticsDeps,
  type LmStudioDiagnosticsReport,
} from "../diagnostics/lm-studio.js";

export interface DiagnosticsDeps {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly exit: (code: number) => void;
  readonly runLmStudio?: (
    config: LmStudioDiagnosticsConfig,
    runnerDeps?: LmStudioDiagnosticsDeps,
  ) => Promise<LmStudioDiagnosticsReport>;
  readonly now?: () => string;
}

const defaultDeps: DiagnosticsDeps = {
  stdout: (line) => process.stdout.write(line + "\n"),
  stderr: (line) => process.stderr.write(line + "\n"),
  exit: (code) => {
    process.exit(code);
  },
};

export interface RunLmStudioDiagnosticsArgs {
  readonly events: string;
}

function readErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null) {
    const v = value as { message?: unknown };
    if (typeof v.message === "string") return v.message;
  }
  return String(value);
}

export async function runDiagnosticsLmStudio(
  args: RunLmStudioDiagnosticsArgs,
  deps: DiagnosticsDeps = defaultDeps,
): Promise<void> {
  const runLmStudio = deps.runLmStudio ?? runLmStudioDiagnostics;

  let report: LmStudioDiagnosticsReport;
  try {
    const runnerDeps: LmStudioDiagnosticsDeps = {
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    };
    report = await runLmStudio({ eventsPath: args.events }, runnerDeps);
  } catch (err) {
    if (isLmStudioDiagnosticsLoadError(err)) {
      deps.stderr(
        `FAIL kind=diagnostics-lm-studio-${err.kind} reason=${err.path}: ${err.message}`,
      );
      deps.exit(2);
      return;
    }
    deps.stderr(
      `FAIL kind=diagnostics-lm-studio-failed reason=${readErrorMessage(err)}`,
    );
    deps.exit(2);
    return;
  }

  deps.stderr(
    `SUMMARY total=${report.summary.total} succeeded=${report.summary.succeeded} failed=${report.summary.failed} incomplete=${report.summary.incomplete}`,
  );
  deps.stdout(JSON.stringify(report));
  deps.exit(0);
}

const lmStudioCommand = defineCommand({
  meta: {
    name: "lm-studio",
    description:
      "Summarize LM Studio provider latency tails from local Lattice run events.",
  },
  args: {
    events: {
      type: "string",
      required: true,
      description:
        "Path to a JSON array of RunEvent values or an object with events[].",
    },
  },
  async run({ args }) {
    await runDiagnosticsLmStudio({ events: args.events });
  },
});

export default defineCommand({
  meta: {
    name: "diagnostics",
    description: "Summarize local Lattice diagnostics from saved run data.",
  },
  subCommands: {
    "lm-studio": lmStudioCommand,
  },
});
