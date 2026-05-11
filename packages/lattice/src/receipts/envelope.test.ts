import { describe, expect, it } from "vitest";

import {
  PAYLOAD_TYPE,
  base64Decode,
  base64Encode,
  buildPae,
  decodeEnvelope,
  encodeEnvelope,
  type ReceiptEnvelope_Local,
} from "./envelope.js";

describe("envelope.ts — PAYLOAD_TYPE constant", () => {
  it("equals the exact DSSE payload type string for receipts", () => {
    expect(PAYLOAD_TYPE).toBe("application/vnd.lattice.receipt+json");
  });
});

describe("envelope.ts — base64Encode / base64Decode", () => {
  it("round-trips arbitrary bytes including 0 and high values", () => {
    const original = new Uint8Array([0, 1, 2, 255, 254, 128]);
    const encoded = base64Encode(original);
    const decoded = base64Decode(encoded);
    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i += 1) {
      expect(decoded[i]).toBe(original[i]);
    }
  });

  it("round-trips an empty Uint8Array", () => {
    const empty = new Uint8Array(0);
    const encoded = base64Encode(empty);
    const decoded = base64Decode(encoded);
    expect(encoded).toBe("");
    expect(decoded.length).toBe(0);
  });
});

describe("envelope.ts — buildPae (DSSE v1.0 PAE)", () => {
  it("matches the DSSE v1.0 byte-for-byte fixture for payload=e30= and PAYLOAD_TYPE", () => {
    const payloadType = "application/vnd.lattice.receipt+json"; // 36 chars
    const payloadBase64 = "e30="; // 4 chars; base64("{}")
    const pae = buildPae(payloadType, payloadBase64);
    const decoded = new TextDecoder().decode(pae);
    // Expected: "DSSEv1 " + len(payloadType) + " " + payloadType + " " + len(payload) + " " + payload
    // payloadType length = 36, payload length = 4
    expect(decoded).toBe(
      "DSSEv1 36 application/vnd.lattice.receipt+json 4 e30=",
    );
  });

  it("serializes ASCII length without zero-padding for length 1000", () => {
    const longPayload = "a".repeat(1000);
    const pae = buildPae("text/plain", longPayload);
    const decoded = new TextDecoder().decode(pae);
    expect(decoded.startsWith("DSSEv1 10 text/plain 1000 ")).toBe(true);
  });

  it("serializes ASCII length 1 as the literal '1'", () => {
    const pae = buildPae("t", "a");
    const decoded = new TextDecoder().decode(pae);
    expect(decoded).toBe("DSSEv1 1 t 1 a");
  });
});

describe("envelope.ts — encodeEnvelope", () => {
  it("produces a structurally-valid envelope with base64 payload + signatures", () => {
    const payloadBytes = new Uint8Array([0x7b, 0x7d]); // "{}"
    const sigBytes = new Uint8Array(64).fill(0x42);
    const expectedSigB64 = Buffer.from(sigBytes).toString("base64");

    const env = encodeEnvelope({
      payloadBytes,
      signatures: [{ keyid: "k1", sig: sigBytes }],
    });

    expect(env.payloadType).toBe(PAYLOAD_TYPE);
    expect(env.payload).toBe("e30=");
    expect(env.signatures.length).toBe(1);
    expect(env.signatures[0]?.keyid).toBe("k1");
    expect(env.signatures[0]?.sig).toBe(expectedSigB64);
  });

  it("handles an empty signatures array", () => {
    const env = encodeEnvelope({
      payloadBytes: new Uint8Array([1, 2, 3]),
      signatures: [],
    });
    expect(env.signatures).toEqual([]);
  });
});

describe("envelope.ts — encode / decode round-trip", () => {
  it("preserves payload bytes and signature bytes byte-for-byte across encode→decode", () => {
    const payloadBytes = crypto.getRandomValues(new Uint8Array(128));
    const sigBytes = crypto.getRandomValues(new Uint8Array(64));

    const env = encodeEnvelope({
      payloadBytes,
      signatures: [{ keyid: "kid-xyz", sig: sigBytes }],
    });

    const decoded = decodeEnvelope(env);
    expect(decoded.payloadType).toBe(PAYLOAD_TYPE);
    expect(decoded.payloadBytes.length).toBe(128);
    for (let i = 0; i < 128; i += 1) {
      expect(decoded.payloadBytes[i]).toBe(payloadBytes[i]);
    }
    expect(decoded.signatures.length).toBe(1);
    expect(decoded.signatures[0]?.keyid).toBe("kid-xyz");
    expect(decoded.signatures[0]?.sig.length).toBe(64);
    for (let i = 0; i < 64; i += 1) {
      expect(decoded.signatures[0]?.sig[i]).toBe(sigBytes[i]);
    }
  });
});

describe("envelope.ts — decodeEnvelope payloadType validation", () => {
  it("throws when payloadType is not the receipt PAYLOAD_TYPE", () => {
    const bad = {
      payloadType: "application/json",
      payload: "e30=",
      signatures: [],
    } as unknown as ReceiptEnvelope_Local;
    expect(() => decodeEnvelope(bad)).toThrowError(
      /envelope payloadType mismatch/,
    );
  });
});

describe("envelope.ts — encode determinism", () => {
  it("produces byte-equal JSON.stringify outputs for identical inputs across 50 iterations", () => {
    for (let iter = 0; iter < 50; iter += 1) {
      const payloadBytes = crypto.getRandomValues(new Uint8Array(32));
      const sigBytes = crypto.getRandomValues(new Uint8Array(64));
      const input = {
        payloadBytes,
        signatures: [{ keyid: "k", sig: sigBytes }],
      };
      const first = JSON.stringify(encodeEnvelope(input));
      const second = JSON.stringify(encodeEnvelope(input));
      expect(first).toBe(second);
    }
  });
});
