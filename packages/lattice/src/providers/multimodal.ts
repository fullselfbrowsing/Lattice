import type { ArtifactInput } from "../artifacts/artifact.js";
import type { ProviderPackagedArtifactPlan } from "../plan/plan.js";
import type { ProviderRunRequest } from "./provider.js";

export class UnsupportedArtifactTransportError extends Error {
  readonly kind = "unsupported-artifact-transport";

  constructor(readonly artifactId: string, readonly transport: string | undefined) {
    super(`Artifact ${artifactId} cannot be delivered using transport ${transport ?? "unspecified"}.`);
    this.name = "UnsupportedArtifactTransportError";
  }
}

/** Infer only a directly representable transport when no packaging plan was supplied. */
export function resolvedArtifactTransport(request: ProviderRunRequest, artifact: ArtifactInput): string {
  const planned = packagedPlanForArtifact(request, artifact.id)?.transport;
  if (planned !== undefined) return planned;
  if (artifact.kind === "json" || artifact.kind === "tool-result") return "json";
  if (artifact.kind !== "text" && artifactHttpUrl(artifact) !== undefined) return "url";
  return "inline";
}

/** Serialize non-media artifacts without losing unsupported values through JSON.stringify. */
export function artifactText(request: ProviderRunRequest, artifact: ArtifactInput): string {
  const transport = resolvedArtifactTransport(request, artifact);
  if (artifact.kind === "url" && transport !== "url") {
    throw new UnsupportedArtifactTransportError(artifact.id, transport);
  }
  let value: unknown = artifact.value;
  if (transport === "url") {
    value = artifactHttpUrl(artifact);
  } else if (!["inline", "json", "extracted-text", "transcript"].includes(transport)) {
    throw new UnsupportedArtifactTransportError(artifact.id, transport);
  }
  try {
    if (!isJsonValue(value)) throw new UnsupportedArtifactTransportError(artifact.id, transport);
    return JSON.stringify({ artifactId: artifact.id, kind: artifact.kind, mediaType: artifact.mediaType,
      privacy: artifact.privacy, transport, ...(artifact.kind === "url" ? { url: value } : { value }) });
  } catch {
    throw new UnsupportedArtifactTransportError(artifact.id, transport);
  }
}

function isJsonValue(value: unknown, parents = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || parents.has(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  parents.add(value);
  const children = Array.isArray(value) ? Array.from(value) : Object.values(value);
  const valid = children.every((child) => isJsonValue(child, parents));
  parents.delete(value);
  return valid;
}

export function packagedPlanForArtifact(
  request: ProviderRunRequest,
  artifactId: string,
): ProviderPackagedArtifactPlan | undefined {
  return request.providerPackaging?.artifacts.find((item) => item.artifactId === artifactId) ??
    request.plan?.providerPackaging?.artifacts.find((item) => item.artifactId === artifactId);
}

export function metadataString(
  artifact: ArtifactInput,
  keys: readonly string[],
): string | undefined {
  const metadata = artifact.metadata;
  if (metadata === undefined) {
    return undefined;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export function artifactHttpUrl(artifact: ArtifactInput): string | undefined {
  if (isHttpUrl(artifact.value)) {
    return artifact.value;
  }

  const url = metadataString(artifact, ["url"]);
  return isHttpUrl(url) ? url : undefined;
}

export function anthropicFileId(artifact: ArtifactInput): string | undefined {
  return metadataString(artifact, ["anthropicFileId", "providerFileId", "fileId"]);
}

export function geminiFileUri(artifact: ArtifactInput): string | undefined {
  return metadataString(artifact, ["geminiFileUri", "providerFileUri", "fileUri"]);
}

export function mediaTypeForArtifact(
  artifact: ArtifactInput,
  fallback: string,
): string {
  if (artifact.mediaType !== undefined) {
    return artifact.mediaType;
  }

  if (typeof artifact.value === "string") {
    const dataUrl = parseDataUrl(artifact.value);
    if (dataUrl?.mediaType !== undefined) {
      return dataUrl.mediaType;
    }
  }

  return fallback;
}

export async function artifactBase64Data(
  artifact: ArtifactInput,
): Promise<string | undefined> {
  const metadataData = metadataString(artifact, ["base64Data"]);
  if (metadataData !== undefined) {
    return metadataData;
  }

  const value = artifact.value;
  if (typeof value === "string") {
    const dataUrl = parseDataUrl(value);
    if (dataUrl !== undefined) {
      return dataUrl.data;
    }

    if (artifact.metadata?.encoding === "base64") {
      return value;
    }
  }

  if (isBlobLike(value)) {
    return bufferToBase64(await value.arrayBuffer());
  }

  if (value instanceof ArrayBuffer) {
    return bufferToBase64(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("base64");
  }

  return undefined;
}

export function parseDataUrl(value: string): {
  readonly mediaType?: string;
  readonly data: string;
} | undefined {
  const match = /^data:([^;,]+)?;base64,(.*)$/su.exec(value);
  if (match === null) {
    return undefined;
  }

  const mediaType = match[1];
  const data = match[2] ?? "";

  return {
    ...(mediaType !== undefined && mediaType.length > 0 ? { mediaType } : {}),
    data,
  };
}

function bufferToBase64(value: ArrayBuffer): string {
  return Buffer.from(value).toString("base64");
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isBlobLike(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}
