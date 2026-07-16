export interface ToolUseRequest {
  readonly id: string;
  readonly name: string;
  readonly args: unknown;
}

export function parseToolUseEnvelope(responseText: string): ReadonlyArray<ToolUseRequest> | null {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return null;
  }
  const candidates = extractJsonCandidates(responseText);
  for (const candidate of candidates) {
    const parsed = tryParseEnvelope(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function extractJsonCandidates(text: string): readonly string[] {
  const candidates: string[] = [];
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRegex.exec(text)) !== null) {
    const inner = fenceMatch[1];
    if (inner !== undefined) {
      candidates.push(inner.trim());
    }
  }

  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    candidates.push(text.slice(braceStart, braceEnd + 1));
  }

  candidates.push(text.trim());
  return candidates;
}

function tryParseEnvelope(jsonLike: string): ReadonlyArray<ToolUseRequest> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const envelope = parsed as Record<string, unknown>;
  const toolCalls = envelope["tool_calls"];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }
  const requests: ToolUseRequest[] = [];
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) {
      return null;
    }
    const callRecord = call as Record<string, unknown>;
    const id = callRecord["id"];
    const name = callRecord["name"];
    const args = callRecord["args"];
    if (typeof id !== "string" || typeof name !== "string") {
      return null;
    }
    requests.push({ id, name, args });
  }
  return requests;
}
