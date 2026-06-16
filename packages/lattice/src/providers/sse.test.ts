import { describe, expect, it } from "vitest";

import { readSseEvents } from "./sse.js";

const encoder = new TextEncoder();

function streamResponse(chunks: readonly string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

async function collectEvents(chunks: readonly string[]) {
  const events = [];
  for await (const event of readSseEvents(streamResponse(chunks))) {
    events.push(event);
  }
  return events;
}

describe("readSseEvents", () => {
  it("split frames across chunks", async () => {
    await expect(
      collectEvents(["event: message\ndata: he", "llo\n\n"]),
    ).resolves.toEqual([{ event: "message", data: "hello" }]);
  });

  it("ignores comments", async () => {
    await expect(
      collectEvents([": keep-alive\n\ndata: hello\n\n"]),
    ).resolves.toEqual([{ data: "hello" }]);
  });

  it("joins multiple data lines", async () => {
    await expect(
      collectEvents(["data: hello\ndata: world\n\n"]),
    ).resolves.toEqual([{ data: "hello\nworld" }]);
  });

  it("preserves event names", async () => {
    await expect(
      collectEvents(["event: content_block_delta\ndata: {}\n\n"]),
    ).resolves.toEqual([{ event: "content_block_delta", data: "{}" }]);
  });
});
