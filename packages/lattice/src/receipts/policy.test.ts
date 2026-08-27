import { describe, expect, it, vi } from "vitest";

import type { CreateReceiptInput } from "./receipt.js";
import type { ReceiptSigner } from "./types.js";
import {
  issueReceipt,
  issueReceiptFrom,
  preflightReceiptPolicy,
  resolveReceiptPolicy,
  type ReceiptIssuanceMode,
} from "./policy.js";

const SECRET = "private-signing-service-response";

function signer(outcome: "success" | "failure" = "success"): ReceiptSigner {
  return {
    kid: "policy-test-key",
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "stub" },
    sign: vi.fn(async () => {
      if (outcome === "failure") {
        throw new Error(SECRET);
      }
      return new Uint8Array([1, 2, 3]);
    }),
  };
}

function receiptInput(): CreateReceiptInput {
  return {
    runId: "run-policy",
    receiptId: "receipt-policy",
    issuedAt: "2026-07-16T00:00:00.000Z",
    model: { requested: "model", observed: "model" },
    route: { providerId: "provider", capabilityId: "model", attemptNumber: 1 },
    usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  };
}

describe("receipt issuance policy", () => {
  it.each([
    [undefined, false, "off"],
    [undefined, true, "best-effort"],
    ["off", false, "off"],
    ["off", true, "off"],
    ["best-effort", false, "best-effort"],
    ["best-effort", true, "best-effort"],
    ["required", false, "required"],
    ["required", true, "required"],
  ] as const)(
    "resolves mode %s with signer=%s to %s",
    (mode, withSigner, expected) => {
      const resolved = resolveReceiptPolicy({
        ...(mode === undefined ? {} : { mode }),
        ...(withSigner ? { signer: signer() } : {}),
      });
      expect(resolved.mode).toBe(expected satisfies ReceiptIssuanceMode);
      expect(resolved.signer === undefined).toBe(!withSigner);
    },
  );

  it("preflights required mode without a signer as a safe terminal error", () => {
    const outcome = preflightReceiptPolicy(resolveReceiptPolicy({ mode: "required" }));

    expect(outcome).toEqual({
      status: "failed",
      error: {
        kind: "audit",
        code: "receipt-signer-missing",
        stage: "pre-execution",
        message: "Receipt issuance requires a configured signer.",
        terminal: true,
      },
    });
  });

  it("does not call a signer when explicit off wins", async () => {
    const disabledSigner = signer();
    const outcome = await issueReceipt(
      receiptInput(),
      resolveReceiptPolicy({ mode: "off", signer: disabledSigner }),
    );

    expect(outcome).toEqual({ status: "skipped", reason: "disabled" });
    expect(disabledSigner.sign).not.toHaveBeenCalled();
  });

  it("skips best-effort issuance when no signer is available", async () => {
    await expect(
      issueReceipt(receiptInput(), resolveReceiptPolicy({ mode: "best-effort" })),
    ).resolves.toEqual({ status: "skipped", reason: "signer-unavailable" });
  });

  it.each(["best-effort", "required"] as const)(
    "returns the same bounded signing failure for %s",
    async (mode) => {
      const outcome = await issueReceipt(
        receiptInput(),
        resolveReceiptPolicy({ mode, signer: signer("failure") }),
      );

      expect(outcome).toEqual({
        status: "failed",
        error: {
          kind: "audit",
          code: "receipt-signing-failed",
          stage: "post-execution",
          message: "Receipt signing failed.",
          terminal: true,
        },
      });
      expect(JSON.stringify(outcome)).not.toContain(SECRET);
    },
  );

  it("retains an envelope only on successful issuance", async () => {
    const outcome = await issueReceipt(
      receiptInput(),
      resolveReceiptPolicy({ mode: "required", signer: signer() }),
    );

    expect(outcome.status).toBe("issued");
    if (outcome.status === "issued") {
      expect(outcome.envelope.payloadType).toBe(
        "application/vnd.lattice.receipt+json",
      );
    }
  });

  it("bounds receipt-input construction failures before they reach callers", async () => {
    const outcome = await issueReceiptFrom(
      () => {
        throw new Error(SECRET);
      },
      resolveReceiptPolicy({ mode: "required", signer: signer() }),
    );

    expect(outcome).toMatchObject({
      status: "failed",
      error: {
        kind: "audit",
        code: "receipt-signing-failed",
        stage: "post-execution",
      },
    });
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
  });
});
