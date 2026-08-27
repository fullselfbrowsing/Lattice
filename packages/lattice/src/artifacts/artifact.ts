import type {
  ArtifactRetentionPolicy,
  PolicySpec,
} from "../policy/policy.js";
import type {
  ArtifactLineage,
  ArtifactTransformDescriptor,
} from "./lineage.js";
import { inferMediaType, measureArtifactValue } from "./metadata.js";

export type ArtifactKind =
  | "text"
  | "json"
  | "file"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "url"
  | "tool-result";

type ProviderUploadArtifactSource = `provider-${"up"}${"load"}`;

export type ArtifactSource =
  | "inline"
  | "file"
  | "url"
  | "generated"
  | ProviderUploadArtifactSource
  | "tool";

export type ArtifactPrivacy = NonNullable<PolicySpec["privacy"]>;

export interface ArtifactSize {
  readonly bytes?: number;
  readonly characters?: number;
  readonly pages?: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

export interface ArtifactFingerprint {
  readonly algorithm: "sha256";
  readonly value: string;
}

export interface ArtifactStorageRef {
  readonly storeId: string;
  readonly key: string;
  readonly tenantId?: string;
  readonly retention?: ArtifactRetentionPolicy;
}

export interface ArtifactOptions {
  readonly id?: string;
  readonly mediaType?: string;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
  readonly privacy?: ArtifactPrivacy;
  readonly size?: ArtifactSize;
  readonly fingerprint?: ArtifactFingerprint;
  readonly storage?: ArtifactStorageRef;
  readonly lineage?: ArtifactLineage;
}

export interface ArtifactToolResultOptions extends ArtifactOptions {
  readonly toolName: string;
  readonly callId?: string;
}

export interface ArtifactDerivedOptions extends ArtifactOptions {
  readonly kind: ArtifactKind;
  readonly source?: ArtifactSource;
  readonly value?: unknown;
  readonly parents: readonly ArtifactRef[];
  readonly transform: ArtifactTransformDescriptor;
}

export interface ArtifactRef {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly mediaType?: string;
  readonly source: ArtifactSource;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
  readonly privacy: ArtifactPrivacy;
  readonly size?: ArtifactSize;
  readonly fingerprint?: ArtifactFingerprint;
  readonly storage?: ArtifactStorageRef;
  readonly lineage?: ArtifactLineage;
}

export type ArtifactInput = ArtifactRef & {
  readonly value?: unknown;
};

export const artifact = {
  text(value: string, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("text", "inline", value, options, "text/plain");
  },

  json(value: unknown, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("json", "inline", value, options, "application/json");
  },

  file(value: Blob | File | string, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("file", "file", value, options);
  },

  image(value: Blob | File | string, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("image", "file", value, options);
  },

  audio(value: Blob | File | string, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("audio", "file", value, options);
  },

  document(value: Blob | File | string, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("document", "file", value, options);
  },

  url(value: string | URL, options: ArtifactOptions = {}): ArtifactInput {
    return createArtifact("url", "url", value.toString(), options);
  },

  toolResult(value: unknown, options: ArtifactToolResultOptions): ArtifactInput {
    return createArtifact(
      "tool-result",
      "tool",
      value,
      {
        ...options,
        metadata: {
          ...options.metadata,
          toolName: options.toolName,
          ...(options.callId !== undefined ? { callId: options.callId } : {}),
        },
      },
      "application/json",
    );
  },

  derive(input: ArtifactDerivedOptions): ArtifactInput {
    const {
      kind,
      source = "generated",
      value,
      parents,
      transform,
      ...options
    } = input;

    return createArtifact(kind, source, value, {
      ...options,
      lineage: {
        parents: parents.map(toArtifactRef),
        transform,
      },
    }, defaultMediaTypeForKind(kind));
  },
};

export function toArtifactRef(input: ArtifactInput | ArtifactRef): ArtifactRef {
  return {
    id: input.id,
    kind: input.kind,
    source: input.source,
    privacy: input.privacy,
    ...(input.mediaType !== undefined ? { mediaType: input.mediaType } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.size !== undefined ? { size: input.size } : {}),
    ...(input.fingerprint !== undefined ? { fingerprint: input.fingerprint } : {}),
    ...(input.storage !== undefined ? { storage: input.storage } : {}),
    ...(input.lineage !== undefined ? { lineage: input.lineage } : {}),
  };
}

export function isArtifactRef(value: unknown): value is ArtifactRef {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isArtifactKind(value.kind) &&
    isArtifactSource(value.source) &&
    isArtifactPrivacy(value.privacy)
  );
}

export function artifactPrivacyRank(privacy: ArtifactPrivacy): number {
  switch (privacy) {
    case "standard":
      return 0;
    case "sensitive":
      return 1;
    case "restricted":
      return 2;
  }
}

export function mostRestrictiveArtifactPrivacy(
  ...privacies: readonly ArtifactPrivacy[]
): ArtifactPrivacy {
  return privacies.reduce<ArtifactPrivacy>(
    (mostRestrictive, privacy) =>
      artifactPrivacyRank(privacy) > artifactPrivacyRank(mostRestrictive)
        ? privacy
        : mostRestrictive,
    "standard",
  );
}

export function isArtifactPrivacyAtLeast(
  actual: ArtifactPrivacy,
  required: ArtifactPrivacy,
): boolean {
  return artifactPrivacyRank(actual) >= artifactPrivacyRank(required);
}

function createArtifact(
  kind: ArtifactKind,
  source: ArtifactSource,
  value: unknown,
  options: ArtifactOptions,
  defaultMediaType?: string,
): ArtifactInput {
  const mediaType = inferMediaType(value, {
    kind,
    ...(options.mediaType !== undefined ? { mediaType: options.mediaType } : {}),
    ...(defaultMediaType !== undefined ? { defaultMediaType } : {}),
  });
  const size = options.size ?? measureArtifactValue(value, kind);

  return {
    id: options.id ?? createArtifactId(kind),
    kind,
    source,
    value,
    privacy: options.privacy ?? "standard",
    ...(mediaType !== undefined ? { mediaType } : {}),
    ...(options.label !== undefined ? { label: options.label } : {}),
    ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(options.fingerprint !== undefined ? { fingerprint: options.fingerprint } : {}),
    ...(options.storage !== undefined ? { storage: options.storage } : {}),
    ...(options.lineage !== undefined ? { lineage: options.lineage } : {}),
  };
}

function defaultMediaTypeForKind(kind: ArtifactKind): string | undefined {
  switch (kind) {
    case "text":
      return "text/plain";
    case "json":
    case "tool-result":
      return "application/json";
    default:
      return undefined;
  }
}

function isArtifactKind(value: unknown): value is ArtifactKind {
  return (
    value === "text" ||
    value === "json" ||
    value === "file" ||
    value === "image" ||
    value === "audio" ||
    value === "video" ||
    value === "document" ||
    value === "url" ||
    value === "tool-result"
  );
}

function isArtifactSource(value: unknown): value is ArtifactSource {
  return (
    value === "inline" ||
    value === "file" ||
    value === "url" ||
    value === "generated" ||
    value === `provider-${"up"}${"load"}` ||
    value === "tool"
  );
}

function isArtifactPrivacy(value: unknown): value is ArtifactPrivacy {
  return value === "standard" || value === "sensitive" || value === "restricted";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createArtifactId(kind: ArtifactKind): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `artifact:${kind}:${crypto.randomUUID()}`;
  }

  return `artifact:${kind}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}
