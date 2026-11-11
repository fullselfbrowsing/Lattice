import type { ArtifactInput } from "../artifacts/artifact.js";
import type { ProviderPackagedArtifactPlan } from "../plan/plan.js";
import type { ProviderRunRequest } from "./provider.js";

export class UnsupportedArtifactTransportError extends Error {
  readonly kind = "unsupported-artifact-transport";
  readonly reason?: string;
  readonly path?: string;

  constructor(
    readonly artifactId: string,
    readonly transport: string | undefined,
    reason?: string,
    path?: string,
  ) {
    const base = `Artifact ${artifactId} cannot be delivered using transport ${transport ?? "unspecified"}`;
    super(reason === undefined ? `${base}.` : `${base}: ${reason}.`);
    this.name = "UnsupportedArtifactTransportError";
    if (reason !== undefined) this.reason = reason;
    if (path !== undefined) this.path = path;
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
    throw new UnsupportedArtifactTransportError(
      artifact.id, transport, "URL artifacts can only be sent with the url transport");
  }
  let value: unknown = artifact.value;
  if (transport === "url") {
    value = artifactHttpUrl(artifact);
  } else if (!["inline", "json", "extracted-text", "transcript"].includes(transport)) {
    throw new UnsupportedArtifactTransportError(
      artifact.id, transport, `transport ${transport} cannot carry text content`);
  }
  const binary = binaryKind(value);
  if (binary !== undefined) {
    throw new UnsupportedArtifactTransportError(artifact.id, transport,
      `binary ${binary} content cannot be sent as text; extract the text and pass it as a string`);
  }
  let problem: JsonProblem | undefined;
  try {
    problem = findJsonProblem(value);
  } catch {
    throw new UnsupportedArtifactTransportError(
      artifact.id, transport, "the value is nested too deeply to inspect");
  }
  if (problem !== undefined) {
    throw new UnsupportedArtifactTransportError(artifact.id, transport,
      `${problem.path} is ${problem.description}, which is not plain JSON; ${problem.hint}`, problem.path);
  }
  try {
    return JSON.stringify({ artifactId: artifact.id, kind: artifact.kind, mediaType: artifact.mediaType,
      privacy: artifact.privacy, transport, ...(artifact.kind === "url" ? { url: value } : { value }) });
  } catch {
    throw new UnsupportedArtifactTransportError(
      artifact.id, transport, "the value could not be serialized as JSON");
  }
}

function binaryKind(value: unknown): "Blob" | "ArrayBuffer" | "ArrayBufferView" | undefined {
  if (isBlobLike(value)) return "Blob";
  if (value instanceof ArrayBuffer) return "ArrayBuffer";
  if (ArrayBuffer.isView(value)) return "ArrayBufferView";
  return undefined;
}

interface JsonProblem {
  readonly path: string;
  readonly description: string;
  readonly hint: string;
}

/** Appends an object key to a JSONPath-style path, using bracket notation for non-identifier keys. */
function childPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function prototypeDescription(value: object): { description: string; hint: string } {
  const hint = "convert it to a plain object or array";
  let name: unknown;
  try {
    const constructor: unknown = (Object.getPrototypeOf(value) as { constructor?: unknown } | null)?.constructor;
    name = typeof constructor === "function" ? constructor.name : undefined;
  } catch {
    name = undefined;
  }
  if (typeof name !== "string" || name.length === 0 || name === "Object") {
    return { description: "an object with a custom prototype", hint };
  }
  if (name === "Date") return { description: "a Date", hint: "convert it first, for example with toISOString()" };
  return { description: `a ${name}`, hint };
}

/** Returns the first value that is not plain JSON, or undefined when the whole value is plain JSON. */
function findJsonProblem(value: unknown, path = "$", ancestors = new Set<object>()): JsonProblem | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return undefined;
  switch (typeof value) {
    case "number":
      return Number.isFinite(value) ? undefined
        : { path, description: String(value), hint: "use null or a string" };
    case "undefined":
      return { path, description: "undefined", hint: "omit the property or use null" };
    case "bigint":
      return { path, description: "a bigint", hint: "use a string or a number" };
    case "function":
      return { path, description: "a function", hint: "remove it" };
    case "symbol":
      return { path, description: "a symbol", hint: "remove it" };
    default:
      break;
  }
  const object = value as object;
  if (ancestors.has(object)) {
    return { path, description: "a circular reference", hint: "remove the circular reference" };
  }
  const prototype: unknown = Object.getPrototypeOf(object);
  const isArray = Array.isArray(object);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    return { path, ...prototypeDescription(object) };
  }
  if (Object.getOwnPropertySymbols(object).length > 0) {
    return { path, description: "an object with symbol-keyed properties", hint: "remove the symbol-keyed properties" };
  }
  ancestors.add(object);
  try {
    const entries: [string, string][] = isArray
      ? Array.from({ length: (object as unknown[]).length }, (_, index) => [String(index), `${path}[${index}]`])
      : Object.keys(object).map((key) => [key, childPath(path, key)]);
    for (const [key, childAt] of entries) {
      let child: unknown;
      try {
        child = (object as Record<string, unknown>)[key];
      } catch {
        return { path: childAt, description: "a property that could not be read",
          hint: "make the property readable or remove it" };
      }
      const problem = findJsonProblem(child, childAt, ancestors);
      if (problem !== undefined) return problem;
    }
  } finally {
    ancestors.delete(object);
  }
  return undefined;
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
