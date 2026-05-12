/**
 * Work-inbox showcase (v1.1) entry point.
 *
 * Orchestrates the three contract scenarios that prove v1.1 end-to-end:
 *   1. success           — RunSuccess + signed receipt
 *   2. tripwire          — inv.noPII fires, RunFailure tripwire-violated
 *   3. no-contract-match — sub-cent budget, RunFailure no-contract-match
 *
 * Scenarios run sequentially (NOT in parallel) so the receipts dir
 * grows in deterministic order — the Plan 13-02 integration test will
 * depend on this ordering.
 *
 * Final stdout is a copy-pastable next-step block referencing the
 * actual generated paths and the success receipt id, so a reader can
 * paste a `lattice verify`, `lattice repro`, or `lattice eval` command
 * without rewriting placeholders.
 */

import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createShowcase } from "./setup.mjs";

const ctx = await createShowcase();

const successResult = await (await import("./scenarios/success.mjs")).run(ctx);
process.stdout.write(
  `scenario=${successResult.scenario} receiptId=${successResult.receiptId} verdict=${successResult.verdict}\n`,
);

const tripwireResult = await (await import("./scenarios/tripwire.mjs")).run(ctx);
process.stdout.write(
  `scenario=${tripwireResult.scenario} receiptId=${tripwireResult.receiptId} verdict=${tripwireResult.verdict}\n`,
);

const refusalResult = await (await import("./scenarios/no-contract-match.mjs")).run(ctx);
process.stdout.write(
  `scenario=${refusalResult.scenario} receiptId=${refusalResult.receiptId} verdict=${refusalResult.verdict}\n`,
);

const qualityFloorResult = await (await import("./scenarios/quality-floor.mjs")).run(ctx);
process.stdout.write(
  `scenario=${qualityFloorResult.scenario} receiptId=${qualityFloorResult.receiptId} verdict=${qualityFloorResult.verdict} contractHash=${qualityFloorResult.contractHash}\n`,
);

// Print paths relative to the repo root so copy-paste works from cwd.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const relPath = (absPath) => relative(repoRoot, absPath);

const receiptsDirRel = relPath(ctx.receiptsDir);
const fixturesDirRel = relPath(ctx.fixturesDir);
const sidecarsDirRel = relPath(ctx.sidecarsDir);
const keysetPathRel = relPath(ctx.keysetPath);
const successReceiptPathRel = `${receiptsDirRel}/${successResult.receiptId}.json`;
const qualityFloorReceiptPathRel = `${receiptsDirRel}/${qualityFloorResult.receiptId}.json`;

process.stdout.write(`\nWrote 4 receipts to ${receiptsDirRel}/.\n`);
process.stdout.write(`Wrote 4 sidecars to ${sidecarsDirRel}/.\n`);
process.stdout.write("Next steps (run from repo root):\n");
process.stdout.write(
  `  pnpm --filter lattice-cli exec lattice verify ${successReceiptPathRel} --key ${keysetPathRel}\n`,
);
process.stdout.write(
  `  pnpm --filter lattice-cli exec lattice repro ${qualityFloorReceiptPathRel} --key ${keysetPathRel} --fixtures ${fixturesDirRel} --sidecar-dir ${sidecarsDirRel}\n`,
);
process.stdout.write(
  `  pnpm --filter lattice-cli exec lattice eval --fixtures ${receiptsDirRel} --key ${keysetPathRel} --artifacts ${fixturesDirRel} --sidecar-dir ${sidecarsDirRel} --baseline ${relPath(ctx.baselinePath)} --init-baseline\n`,
);
