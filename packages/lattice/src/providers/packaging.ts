import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import type { PolicySpec } from "../policy/policy.js";
import type {
  ProviderPackagedArtifactPlan,
  ProviderPackagedArtifactReferencePlan,
  ProviderPackagedArtifactRequestPlan,
  ProviderPackagingPlan,
  SelectedRoute,
} from "../plan/plan.js";
import type { ProviderTransportMode } from "./provider.js";

const MEDIA_INLINE_LIMIT_BYTES = 100 * 1024 * 1024;
const PDF_INLINE_LIMIT_BYTES = 50 * 1024 * 1024;

export interface ProviderPackagingResult {
  readonly plan: ProviderPackagingPlan;
  readonly packagedArtifacts: readonly ArtifactRef[];
  readonly blocked: readonly string[];
}

export function packageArtifactsForProvider(input: {
  readonly artifacts: readonly ArtifactInput[];
  readonly route?: SelectedRoute;
  readonly policy?: PolicySpec;
}): ProviderPackagingResult {
  const route = input.route;

  if (route === undefined) {
    return {
      plan: {
        providerId: "none",
        modelId: "none",
        artifacts: [],
        warnings: ["No selected route; provider packaging skipped."],
      },
      packagedArtifacts: [],
      blocked: [],
    };
  }

  const packaged: ProviderPackagedArtifactPlan[] = [];
  const packagedArtifacts: ArtifactRef[] = [];
  const warnings: string[] = [];
  const blocked: string[] = [];

  for (const inputArtifact of input.artifacts) {
    const choice = chooseTransport(inputArtifact, route, input.policy);

    if (choice.blocked !== undefined) {
      blocked.push(choice.blocked);
      warnings.push(...choice.warnings, choice.blocked);
      continue;
    }

    packaged.push({
      artifactId: inputArtifact.id,
      transport: choice.transport,
      ...(inputArtifact.mediaType !== undefined ? { mediaType: inputArtifact.mediaType } : {}),
      lineageTransform: "provider-packaging",
      providerRequest: choice.providerRequest,
      warnings: choice.warnings,
    });

    const transformMetadata = {
      providerId: route.providerId,
      modelId: route.modelId,
      transport: choice.transport,
      providerRequest: choice.providerRequest,
    };

    packagedArtifacts.push(
      toArtifactRef(
        artifact.derive({
          id: `${inputArtifact.id}:packaged:${route.providerId}:${route.modelId}`,
          kind: inputArtifact.kind,
          source: choice.transport === "provider-upload" || choice.transport === "file-id"
            ? "provider-upload"
            : "generated",
          parents: [inputArtifact],
          transform: {
            kind: "provider-packaging",
            name: `${route.providerId}:${choice.transport}`,
            metadata: transformMetadata,
          },
          metadata: transformMetadata,
          ...(inputArtifact.mediaType !== undefined ? { mediaType: inputArtifact.mediaType } : {}),
          privacy: inputArtifact.privacy,
        }),
      ),
    );
  }

  return {
    plan: {
      providerId: route.providerId,
      modelId: route.modelId,
      artifacts: packaged,
      warnings,
    },
    packagedArtifacts,
    blocked,
  };
}

function chooseTransport(
  inputArtifact: ArtifactInput,
  route: SelectedRoute,
  policy?: PolicySpec,
): {
  readonly transport: ProviderTransportMode;
  readonly providerRequest: ProviderPackagedArtifactRequestPlan;
  readonly warnings: readonly string[];
  readonly blocked?: string;
} {
  const warnings: string[] = [];
  const preferred = preferredTransports(inputArtifact, route.providerId);

  for (const candidate of preferred) {
    const transport = candidate.transport;
    if (!route.fileTransport.includes(transport)) {
      continue;
    }

    if (
      policy?.noUpload === true &&
      (transport === "provider-upload" || transport === "file-id")
    ) {
      continue;
    }

    // noPublicUrl blocks "url" transport and also blocks "file-id" transport
    // when the referenced metadata value resolves to a public HTTP/HTTPS URL.
    // Provider-internal handles (e.g. "files/audio-123") are not public URLs and
    // are permitted. See Codex PR #12 finding P2-B.
    if (policy?.noPublicUrl === true && transport === "url") {
      continue;
    }

    if (
      policy?.noPublicUrl === true &&
      transport === "file-id" &&
      candidate.reference !== undefined &&
      candidate.reference.metadataKey !== undefined &&
      isHttpUrl(inputArtifact.metadata?.[candidate.reference.metadataKey])
    ) {
      continue;
    }

    if (
      inputArtifact.privacy === "restricted" &&
      (
        transport === "provider-upload" ||
        transport === "url" ||
        transport === "base64" ||
        transport === "file-id"
      )
    ) {
      continue;
    }

    if (transport === "base64" && mediaInlineLimitExceeded(inputArtifact)) {
      warnings.push(
        `Artifact ${inputArtifact.id} exceeds inline media limit and needs a file reference.`,
      );
      continue;
    }

    if (transport === "base64") {
      warnings.push(`Artifact ${inputArtifact.id} will be encoded as base64.`);
    }

    return {
      transport,
      providerRequest: providerRequestPlan(inputArtifact, route.providerId, transport, candidate),
      warnings,
    };
  }

  return {
    transport: "inline",
    providerRequest: providerRequestPlan(inputArtifact, route.providerId, "inline", {
      transport: "inline",
      reason: "No provider-supported transport was available.",
    }),
    warnings,
    blocked: `No policy-safe transport for artifact ${inputArtifact.id}.`,
  };
}

interface TransportCandidate {
  readonly transport: ProviderTransportMode;
  readonly reason: string;
  readonly reference?: ProviderPackagedArtifactReferencePlan;
}

function preferredTransports(
  inputArtifact: ArtifactInput,
  providerId: string,
): readonly TransportCandidate[] {
  if (isNativeMediaProvider(providerId, inputArtifact.kind)) {
    const metadataReference = providerFileReference(inputArtifact, providerId);
    const urlReference = urlReferenceForArtifact(inputArtifact);
    const candidates: TransportCandidate[] = [];

    if (metadataReference !== undefined) {
      candidates.push({
        transport: "file-id",
        reason: `Artifact ${inputArtifact.id} has provider file reference metadata.`,
        reference: metadataReference,
      });
    }
    if (urlReference !== undefined) {
      candidates.push({
        transport: "url",
        reason: `Artifact ${inputArtifact.id} has URL metadata or value.`,
        reference: urlReference,
      });
    }
    if (hasInlineMediaPayload(inputArtifact)) {
      candidates.push({
        transport: "base64",
        reason: `Artifact ${inputArtifact.id} has inline media bytes or base64 data.`,
      });
    }

    return candidates.length > 0
      ? candidates
      : [
          {
            transport: "provider-upload",
            reason: `Artifact ${inputArtifact.id} needs provider upload before native media use.`,
          },
        ];
  }

  switch (inputArtifact.kind) {
    case "text":
      return candidateList("Text artifact can be sent inline.", ["inline", "extracted-text"]);
    case "json":
    case "tool-result":
      return candidateList("JSON artifact can be sent as JSON.", ["json", "inline"]);
    case "url":
      return candidateList("URL artifact can be referenced directly.", ["url", "inline"]);
    case "document":
      return candidateList("Document artifact can be extracted or referenced.", [
        "extracted-text",
        "provider-upload",
        "base64",
        "url",
      ]);
    case "audio":
      return candidateList("Audio artifact can be transcribed or referenced.", [
        "transcript",
        "provider-upload",
        "base64",
        "url",
      ]);
    case "image":
    case "file":
    case "video":
      return candidateList("Media artifact needs provider packaging.", [
        "provider-upload",
        "base64",
        "url",
      ]);
  }
}

function candidateList(
  reason: string,
  transports: readonly ProviderTransportMode[],
): readonly TransportCandidate[] {
  return transports.map((transport) => ({ transport, reason }));
}

function isNativeMediaProvider(providerId: string, kind: ArtifactInput["kind"]): boolean {
  if (providerId === "anthropic") {
    return kind === "image";
  }

  if (providerId === "gemini") {
    return kind === "image" || kind === "audio" || kind === "video";
  }

  return false;
}

function providerRequestPlan(
  inputArtifact: ArtifactInput,
  providerId: string,
  transport: ProviderTransportMode,
  candidate: TransportCandidate,
): ProviderPackagedArtifactRequestPlan {
  const sourceType = providerRequestSourceType(providerId, transport);
  const shape = providerRequestShape(providerId, inputArtifact.kind, transport);

  return {
    shape,
    sourceType,
    reason: candidate.reason,
    ...(inputArtifact.mediaType !== undefined ? { mediaType: inputArtifact.mediaType } : {}),
    ...(inputArtifact.size?.bytes !== undefined ? { sizeBytes: inputArtifact.size.bytes } : {}),
    ...(candidate.reference !== undefined ? { reference: candidate.reference } : {}),
  };
}

function providerRequestSourceType(
  providerId: string,
  transport: ProviderTransportMode,
): ProviderPackagedArtifactRequestPlan["sourceType"] {
  if (providerId === "gemini" && transport === "file-id") {
    return "file-reference";
  }

  return transport;
}

function providerRequestShape(
  providerId: string,
  kind: ArtifactInput["kind"],
  transport: ProviderTransportMode,
): string {
  if (providerId === "anthropic" && kind === "image") {
    if (transport === "file-id") {
      return "anthropic:image.file";
    }
    if (transport === "url") {
      return "anthropic:image.url";
    }
    if (transport === "base64" || transport === "inline") {
      return "anthropic:image.base64";
    }
  }

  if (providerId === "gemini" && (kind === "image" || kind === "audio" || kind === "video")) {
    if (transport === "file-id" || transport === "url") {
      return "gemini:part.fileData";
    }
    if (transport === "base64" || transport === "inline") {
      return "gemini:part.inlineData";
    }
  }

  return `${providerId}:${kind}.${transport}`;
}

function providerFileReference(
  inputArtifact: ArtifactInput,
  providerId: string,
): ProviderPackagedArtifactReferencePlan | undefined {
  const metadata = inputArtifact.metadata;
  if (metadata === undefined) {
    return undefined;
  }

  if (providerId === "anthropic") {
    const metadataKey = firstStringKey(metadata, [
      "anthropicFileId",
      "providerFileId",
      "fileId",
    ]);

    return metadataKey === undefined
      ? undefined
      : { kind: "file-id", metadataKey };
  }

  if (providerId === "gemini") {
    const metadataKey = firstStringKey(metadata, [
      "geminiFileUri",
      "providerFileUri",
      "fileUri",
    ]);

    return metadataKey === undefined
      ? undefined
      : { kind: "file-uri", metadataKey };
  }

  const metadataKey = firstStringKey(metadata, ["providerFileId", "fileId"]);

  return metadataKey === undefined
    ? undefined
    : { kind: "file-id", metadataKey };
}

function urlReferenceForArtifact(
  inputArtifact: ArtifactInput,
): ProviderPackagedArtifactReferencePlan | undefined {
  if (isHttpUrl(inputArtifact.value)) {
    return { kind: "url" };
  }

  if (inputArtifact.metadata !== undefined && isHttpUrl(inputArtifact.metadata.url)) {
    return { kind: "url", metadataKey: "url" };
  }

  return undefined;
}

function hasInlineMediaPayload(inputArtifact: ArtifactInput): boolean {
  const value = inputArtifact.value;

  if (isBlobLike(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return true;
  }

  if (typeof value === "string" && value.startsWith("data:")) {
    return true;
  }

  const metadata = inputArtifact.metadata;
  return metadata?.encoding === "base64" || typeof metadata?.base64Data === "string";
}

function mediaInlineLimitExceeded(inputArtifact: ArtifactInput): boolean {
  const sizeBytes = inputArtifact.size?.bytes;
  if (sizeBytes === undefined) {
    return false;
  }

  const limit = inputArtifact.mediaType === "application/pdf"
    ? PDF_INLINE_LIMIT_BYTES
    : MEDIA_INLINE_LIMIT_BYTES;

  return sizeBytes > limit;
}

function firstStringKey(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  return keys.find((key) => typeof metadata[key] === "string" && metadata[key] !== "");
}

function isHttpUrl(value: unknown): boolean {
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
