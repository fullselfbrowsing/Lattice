export interface SseEvent {
  readonly event?: string;
  readonly data: string;
}

export async function* readSseEvents(response: Response): AsyncIterable<SseEvent> {
  if (response.body === null) {
    yield* parseFrames(await response.text(), true).events;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseFrames(buffer, false);
      buffer = parsed.remaining;
      yield* parsed.events;
    }
  } finally {
    reader.releaseLock();
  }

  buffer += decoder.decode();
  const parsed = parseFrames(buffer, true);
  yield* parsed.events;
}

function parseFrames(
  input: string,
  flush: boolean,
): { readonly events: readonly SseEvent[]; readonly remaining: string } {
  const events: SseEvent[] = [];
  let remaining = input;

  while (true) {
    const match = /\r?\n\r?\n/u.exec(remaining);
    if (match?.index === undefined) {
      break;
    }
    const frame = remaining.slice(0, match.index);
    remaining = remaining.slice(match.index + match[0].length);
    const event = parseFrame(frame);
    if (event !== undefined) {
      events.push(event);
    }
  }

  if (flush && remaining.trim().length > 0) {
    const event = parseFrame(remaining);
    if (event !== undefined) {
      events.push(event);
    }
    remaining = "";
  }

  return { events, remaining };
}

function parseFrame(frame: string): SseEvent | undefined {
  const data: string[] = [];
  let event: string | undefined;

  for (const line of frame.split(/\r?\n/u)) {
    if (line.length === 0 || line.startsWith(":")) {
      continue;
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }

  if (data.length === 0) {
    return undefined;
  }

  return {
    ...(event !== undefined ? { event } : {}),
    data: data.join("\n"),
  };
}
