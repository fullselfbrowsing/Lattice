import canonicalize from "canonicalize";

/** Digests are unsalted commitments, not encryption or proof of provider consumption. */
export const SHA256_HEX = /^[0-9a-f]{64}$/u;

export function executionBindingProblem(value: {
  readonly taskHash?: unknown;
  readonly policyHash?: unknown;
  readonly providerRequestHashes?: unknown;
}): string | undefined {
  for (const field of ["taskHash", "policyHash"] as const) {
    const hash = value[field];
    if (hash !== undefined && (typeof hash !== "string" || !SHA256_HEX.test(hash))) {
      return `${field} must be a lowercase SHA-256 hexadecimal digest`;
    }
  }
  const hashes = value.providerRequestHashes;
  if (hashes !== undefined && (
    !Array.isArray(hashes) || hashes.length === 0 ||
    !Array.from(hashes).every((hash: unknown) => typeof hash === "string" && SHA256_HEX.test(hash))
  )) {
    return "providerRequestHashes must be a non-empty ordered array of SHA-256 digests";
  }
  return undefined;
}

/**
 * Hash canonical JSON, including the JSON quotes of a string task.
 * This unsalted commitment does not conceal low-entropy tasks or policies.
 */
export async function hashCanonicalForReceipt(value: unknown): Promise<string> {
  const serialized = canonicalize(value);
  if (serialized === undefined) {
    throw new TypeError("Receipt binding has no canonical JSON representation");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Never advertise a complete submission list if any executed adapter omitted its callback. */
export function createRequestBindingCollector() {
  const hashes: string[] = [];
  let complete = true;
  return {
    onRequestPrepared({ bodyHash }: { readonly bodyHash: string }): void {
      if (typeof bodyHash !== "string" || !SHA256_HEX.test(bodyHash)) {
        complete = false;
        throw new TypeError("Provider submission hash must be a lowercase SHA-256 digest");
      }
      hashes.push(bodyHash);
    },
    async observe<T>(execute: () => Promise<T>): Promise<T> {
      const before = hashes.length;
      try {
        return await execute();
      } finally {
        if (hashes.length === before) complete = false;
      }
    },
    get hashes(): readonly string[] | undefined {
      return complete && hashes.length > 0 ? [...hashes] : undefined;
    },
  };
}
