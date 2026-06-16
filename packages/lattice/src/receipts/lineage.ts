import canonicalize from "canonicalize";

import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import type { ArtifactLineage, ArtifactParentRef } from "../artifacts/lineage.js";

type LineageArtifact = ArtifactInput | ArtifactRef | ArtifactParentRef;
type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const encoder = new TextEncoder();
const LEAF_DOMAIN = encoder.encode("lattice-lineage-leaf-v1:");
const NODE_DOMAIN = encoder.encode("lattice-lineage-node-v1:");

/**
 * Compute a deterministic descriptor-only merkle root for artifact lineage.
 *
 * The root commits to `ArtifactRef` descriptors and nested lineage graphs, not
 * raw artifact values. Returns undefined when no lineage metadata exists.
 */
export async function computeArtifactLineageMerkleRoot(
  artifacts: readonly LineageArtifact[],
): Promise<string | undefined> {
  const leaves = artifacts
    .filter((artifact) => artifact.lineage !== undefined)
    .map((artifact) => canonicalLineageLeaf(artifact));

  if (leaves.length === 0) return undefined;

  let level = (await Promise.all(
    leaves.map((leaf) => sha256(concatBytes(LEAF_DOMAIN, leaf))),
  )).sort(compareBytes);

  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(await sha256(concatBytes(NODE_DOMAIN, left, right)));
    }
    level = next.sort(compareBytes);
  }

  return `sha256:${bytesToHex(level[0]!)}`;
}

function canonicalLineageLeaf(artifact: LineageArtifact): Uint8Array {
  const sanitized = sanitizeArtifactRef(artifact);
  const json = canonicalize(sanitized);
  if (json === undefined) {
    throw new Error(
      "computeArtifactLineageMerkleRoot: lineage descriptor is not canonicalizable.",
    );
  }
  return encoder.encode(json);
}

function sanitizeArtifactRef(input: LineageArtifact): JsonValue {
  const ref = toArtifactRef(input as ArtifactInput | ArtifactRef);
  return compactObject({
    id: ref.id,
    kind: ref.kind,
    source: ref.source,
    privacy: ref.privacy,
    mediaType: ref.mediaType,
    label: ref.label,
    metadata: sanitizeUnknown(ref.metadata),
    size: sanitizeUnknown(ref.size),
    fingerprint: sanitizeUnknown(ref.fingerprint),
    storage: sanitizeUnknown(ref.storage),
    lineage:
      ref.lineage !== undefined ? sanitizeLineage(ref.lineage) : undefined,
  });
}

function sanitizeLineage(lineage: ArtifactLineage): JsonValue {
  const parents = lineage.parents
    .map((parent) => sanitizeArtifactRef(parent))
    .sort(compareCanonicalJson);

  return compactObject({
    parents,
    transform: compactObject({
      kind: lineage.transform.kind,
      name: lineage.transform.name,
      metadata: sanitizeUnknown(lineage.transform.metadata),
    }),
  });
}

function sanitizeUnknown(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : undefined;
    case "bigint":
      return value.toString();
    case "object": {
      if (Array.isArray(value)) {
        return value
          .map((item) => sanitizeUnknown(item))
          .filter((item): item is JsonValue => item !== undefined);
      }
      const out: Record<string, JsonValue> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        const child = sanitizeUnknown((value as Record<string, unknown>)[key]);
        if (child !== undefined) out[key] = child;
      }
      return out;
    }
    default:
      return undefined;
  }
}

function compactObject(
  input: Record<string, JsonValue | undefined>,
): { readonly [key: string]: JsonValue } {
  const out: Record<string, JsonValue> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function compareCanonicalJson(a: JsonValue, b: JsonValue): number {
  const aJson = canonicalize(a) ?? "";
  const bJson = canonicalize(b) ?? "";
  return aJson.localeCompare(bJson);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    toArrayBuffer(bytes),
  );
  return new Uint8Array(digest);
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  return bytesToHex(a).localeCompare(bytesToHex(b));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}
