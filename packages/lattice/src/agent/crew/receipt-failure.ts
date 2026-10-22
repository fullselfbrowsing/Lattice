/**
 * One rule for every receipt a crew fails to mint, shared by the
 * dispatcher (child completion receipts) and runAgentCrew (crew-start,
 * root completion, and crew-close receipts).
 */

import { STEP_TRANSITION_EVENT_NAME } from "../../contract/checkpoint.js";
import { ReceiptSigningError } from "../../results/errors.js";
import type { ReceiptSignerErrorMode } from "../../runtime/config.js";
import type { TracerLike } from "../../tracing/tracing.js";

/**
 * Report a failed crew receipt mint and apply `receipts.onSignerError`.
 *
 * The tracer always receives a `step.transition` event carrying
 * `mintError`, in both modes. Under `"throw"` this then raises
 * `ReceiptSigningError`. Under `"flag"` it returns the one-line detail that
 * the caller collects into `CrewResult.receiptError`.
 *
 * `consequence` is appended to the detail and should say what the missing
 * receipt does to the chain, starting with "; ".
 */
export function reportCrewMintFailure(input: {
  readonly runId: string;
  readonly stepName: string;
  readonly error: unknown;
  readonly consequence: string;
  readonly onSignerError: ReceiptSignerErrorMode;
  readonly tracer?: TracerLike;
}): string {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  input.tracer?.event?.(STEP_TRANSITION_EVENT_NAME, {
    runId: input.runId,
    stepName: input.stepName,
    mintError: message,
  });
  const detail = `${input.stepName} receipt was not minted: ${message}${input.consequence}`;
  if (input.onSignerError === "throw") {
    throw new ReceiptSigningError(input.runId, detail, { cause: input.error });
  }
  return detail;
}
