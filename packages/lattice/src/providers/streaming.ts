import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import type { UsageRecord } from "../plan/plan.js";
import type { ValidatedToolCall } from "../tools/tool-call-validation.js";
import type {
  ProviderGatewayMetadata,
  ProviderRunResponse,
  ProviderStream,
  Usage,
} from "./provider.js";

export interface CollectStreamOptions {
  readonly defaultOutput?: string;
}

export async function collectStream(
  stream: ProviderStream,
  options: CollectStreamOptions = {},
): Promise<ProviderRunResponse> {
  const rawOutputs: Record<string, unknown> = {};
  const textParts = new Map<string, string[]>();
  const toolCalls: ValidatedToolCall[] = [];
  let artifactRefs: readonly (ArtifactInput | ArtifactRef)[] | undefined;
  let usage: UsageRecord | undefined;
  let normalizedUsage: Usage | undefined;
  let gateway: ProviderGatewayMetadata | undefined;
  let rawResponse: unknown;
  let rawResponseProvided = false;
  let chunkCount = 0;

  for await (const chunk of stream) {
    chunkCount += 1;

    switch (chunk.kind) {
      case "text-delta": {
        const output = chunk.output ?? options.defaultOutput ?? "text";
        const parts = textParts.get(output);
        if (parts === undefined) {
          textParts.set(output, [chunk.text]);
        } else {
          parts.push(chunk.text);
        }
        break;
      }
      case "output": {
        rawOutputs[chunk.output] = chunk.value;
        break;
      }
      case "usage": {
        if (chunk.usage !== undefined) {
          usage = chunk.usage;
        }
        if (chunk.normalizedUsage !== undefined) {
          normalizedUsage = chunk.normalizedUsage;
        }
        break;
      }
      case "gateway": {
        gateway = chunk.gateway;
        break;
      }
      case "tool-call": {
        toolCalls.push(chunk.toolCall);
        break;
      }
      case "complete": {
        if (chunk.rawOutputs !== undefined) {
          Object.assign(rawOutputs, chunk.rawOutputs);
        }
        if (chunk.artifactRefs !== undefined) {
          artifactRefs = chunk.artifactRefs;
        }
        if (chunk.usage !== undefined) {
          usage = chunk.usage;
        }
        if (chunk.normalizedUsage !== undefined) {
          normalizedUsage = chunk.normalizedUsage;
        }
        if (chunk.gateway !== undefined) {
          gateway = chunk.gateway;
        }
        if (chunk.toolCalls !== undefined) {
          toolCalls.push(...chunk.toolCalls);
        }
        if ("rawResponse" in chunk) {
          rawResponse = chunk.rawResponse;
          rawResponseProvided = true;
        }
        break;
      }
    }
  }

  for (const [output, parts] of textParts) {
    if (!(output in rawOutputs)) {
      rawOutputs[output] = parts.join("");
    }
  }

  return {
    rawOutputs,
    ...(artifactRefs !== undefined ? { artifactRefs } : {}),
    ...(usage !== undefined ? { usage } : {}),
    ...(normalizedUsage !== undefined ? { normalizedUsage } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(gateway !== undefined ? { gateway } : {}),
    rawResponse: rawResponseProvided
      ? rawResponse
      : {
          kind: "lattice-stream-summary",
          chunkCount,
          outputNames: Object.keys(rawOutputs),
        },
  };
}
