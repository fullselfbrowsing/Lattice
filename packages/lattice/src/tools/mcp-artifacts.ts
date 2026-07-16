import {
  artifact,
  type ArtifactInput,
  type ArtifactOptions,
  type ArtifactPrivacy,
  type ArtifactToolResultOptions,
} from "../artifacts/artifact.js";

export interface McpResourceArtifactInput {
  readonly uri: string;
  readonly name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly text?: string;
  readonly blob?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface McpPromptMessage {
  readonly role?: string;
  readonly content: unknown;
}

export interface McpPromptArtifactInput {
  readonly name: string;
  readonly description?: string;
  readonly arguments?: Record<string, unknown>;
  readonly messages?: readonly McpPromptMessage[];
  readonly metadata?: Record<string, unknown>;
}

export interface McpToolResultArtifactInput {
  readonly toolName: string;
  readonly callId?: string;
  readonly content: unknown;
  readonly isError?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface McpArtifactOptions {
  readonly id?: string;
  readonly label?: string;
  readonly mediaType?: string;
  readonly metadata?: Record<string, unknown>;
  readonly privacy?: ArtifactPrivacy;
}

export function mcpResourceArtifact(
  input: McpResourceArtifactInput,
  options: McpArtifactOptions = {},
): ArtifactInput {
  const label = options.label ?? input.title ?? input.name ?? input.uri;
  const metadata = createMetadata(options.metadata, {
    kind: "resource",
    uri: input.uri,
    name: input.name,
    title: input.title,
    description: input.description,
    mimeType: input.mimeType,
    hasText: input.text !== undefined,
    hasBlob: input.blob !== undefined,
    metadata: input.metadata,
  });
  const artifactOptions = createArtifactOptions({
    options,
    label,
    metadata,
    mediaType: options.mediaType ?? input.mimeType ?? "text/plain",
  });

  if (input.text !== undefined) {
    return artifact.text(input.text, artifactOptions);
  }

  return artifact.json(
    compactObject({
      uri: input.uri,
      name: input.name,
      title: input.title,
      description: input.description,
      mimeType: input.mimeType,
      blob: input.blob,
      metadata: input.metadata,
    }),
    createArtifactOptions({
      options,
      label,
      metadata,
      mediaType: options.mediaType ?? "application/vnd.modelcontextprotocol.resource+json",
    }),
  );
}

export function mcpPromptArtifact(
  input: McpPromptArtifactInput,
  options: McpArtifactOptions = {},
): ArtifactInput {
  const metadata = createMetadata(options.metadata, {
    kind: "prompt",
    name: input.name,
    description: input.description,
    metadata: input.metadata,
  });

  return artifact.json(
    compactObject({
      name: input.name,
      description: input.description,
      arguments: input.arguments,
      messages: input.messages,
      metadata: input.metadata,
    }),
    createArtifactOptions({
      options,
      label: options.label ?? input.name,
      metadata,
      mediaType: options.mediaType ?? "application/vnd.modelcontextprotocol.prompt+json",
    }),
  );
}

export function mcpToolResultArtifact(
  input: McpToolResultArtifactInput,
  options: McpArtifactOptions = {},
): ArtifactInput {
  const metadata = createMetadata(options.metadata, {
    kind: "tool-result",
    toolName: input.toolName,
    callId: input.callId,
    isError: input.isError,
    metadata: input.metadata,
  });
  const toolOptions: ArtifactToolResultOptions = {
    toolName: input.toolName,
    ...(input.callId !== undefined ? { callId: input.callId } : {}),
    ...createArtifactOptions({
      options,
      label: options.label ?? input.toolName,
      metadata,
      mediaType: options.mediaType ?? "application/json",
    }),
  };

  return artifact.toolResult(
    compactObject({
      content: input.content,
      isError: input.isError,
      metadata: input.metadata,
    }),
    toolOptions,
  );
}

function createArtifactOptions(input: {
  readonly options: McpArtifactOptions;
  readonly label: string;
  readonly metadata: Record<string, unknown>;
  readonly mediaType: string;
}): ArtifactOptions {
  return {
    ...(input.options.id !== undefined ? { id: input.options.id } : {}),
    label: input.label,
    mediaType: input.mediaType,
    metadata: input.metadata,
    ...(input.options.privacy !== undefined ? { privacy: input.options.privacy } : {}),
  };
}

function createMetadata(
  optionMetadata: Record<string, unknown> | undefined,
  mcp: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...optionMetadata,
    mcp: compactObject(mcp),
  };
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
