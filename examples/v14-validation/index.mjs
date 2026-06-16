/**
 * v1.4 validation showcase.
 *
 * Runs offline against built package output and proves the milestone's new
 * validation surfaces compose without hosted providers:
 *   - streaming runtime execution
 *   - gateway metadata through LiteLLM/OpenAI-compatible fake fetch
 *   - OpenTelemetry run-event export
 *   - streaming failure-mode behavior
 */

import {
  createAI,
  createLiteLLMProvider,
  createOtelRunEventSink,
  latticeVersion,
} from "../../packages/lattice/dist/index.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function textCapability(providerId, modelId, overrides = {}) {
  return {
    providerId,
    modelId,
    inputModalities: ["text"],
    outputModalities: ["text"],
    fileTransport: ["inline", "json"],
    contextWindow: 8192,
    structuredOutput: false,
    toolUse: false,
    streaming: true,
    latency: "interactive",
    dataPolicy: {
      privacy: ["standard"],
      supportsNoLogging: true,
      supportsNoTraining: true,
    },
    ...overrides,
  };
}

async function* streamFrom(chunks) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function createStreamingProvider() {
  const providerId = "v14-showcase-stream";
  const modelId = `${providerId}:deterministic`;
  return {
    id: providerId,
    kind: "provider-adapter",
    capabilities: [textCapability(providerId, modelId)],
    async execute() {
      return {
        rawOutputs: { answer: "buffered answer" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      };
    },
    executeStream() {
      return streamFrom([
        { kind: "text-delta", output: "answer", text: "streamed " },
        { kind: "text-delta", output: "answer", text: "answer" },
        {
          kind: "complete",
          normalizedUsage: { promptTokens: 2, completionTokens: 2, costUsd: 0 },
        },
      ]);
    },
  };
}

function createFailingStreamProvider() {
  const providerId = "v14-showcase-failure";
  const modelId = `${providerId}:deterministic`;
  return {
    id: providerId,
    kind: "provider-adapter",
    capabilities: [textCapability(providerId, modelId)],
    executeStream() {
      return (async function* failingStream() {
        yield { kind: "text-delta", output: "answer", text: "partial-secret" };
        throw new Error("offline stream failure");
      })();
    },
  };
}

function createMemoryTracer() {
  const spans = [];
  return {
    spans,
    tracer: {
      startSpan(name, options = {}) {
        const span = {
          name,
          attributes: { ...(options.attributes ?? {}) },
          events: [],
          status: undefined,
          ended: false,
          setAttributes(next) {
            Object.assign(this.attributes, next);
          },
          addEvent(eventName, attributes = {}) {
            this.events.push({ name: eventName, attributes });
          },
          setStatus(status) {
            this.status = status;
          },
          recordException(error) {
            this.exception = error;
          },
          end() {
            this.ended = true;
          },
        };
        spans.push(span);
        return span;
      },
    },
  };
}

async function runStreamingScenario() {
  const ai = createAI({ providers: [createStreamingProvider()] });
  const result = await ai.run({
    task: "Return the offline streaming answer.",
    outputs: { answer: "text" },
    policy: { stream: true },
  });

  assert(result.ok === true, "streaming scenario should succeed");
  assert(result.outputs.answer === "streamed answer", "streamed output should be collected");
  const eventKinds = (result.events ?? []).map((event) => event.kind);
  assert(eventKinds.includes("stream.start"), "streaming scenario should emit stream.start");
  assert(eventKinds.includes("stream.complete"), "streaming scenario should emit stream.complete");
  assert(!eventKinds.some((kind) => kind.startsWith("stream.delta")), "streaming should not emit per-token events");

  process.stdout.write(
    `scenario=v14-streaming ok=true output=${JSON.stringify(result.outputs.answer)} events=${eventKinds.length}\n`,
  );

  return result.events ?? [];
}

async function runGatewayScenario() {
  let requestBody;
  const fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({
      model: "gateway-observed-model",
      choices: [{ message: { content: "gateway answer" } }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const provider = createLiteLLMProvider({
    model: "gateway-requested-model",
    baseUrl: "https://offline-litellm.invalid/v1",
    apiKey: "sk-offline",
    fetch,
    gateway: {
      routeTags: ["offline", "v14"],
      providerPreferences: ["openai"],
      metadata: {
        scenario: "v14-validation",
        secretToken: "sk-redacted",
      },
      allowFallbacks: true,
    },
  });

  const ai = createAI({ providers: [provider] });
  const result = await ai.run({
    task: "Return the offline gateway answer.",
    outputs: { answer: "text" },
    policy: {
      gateway: {
        routeTags: ["runtime"],
        metadata: { requestId: "req-offline" },
      },
    },
  });

  assert(result.ok === true, "gateway scenario should succeed");
  assert(result.outputs.answer === "gateway answer", "gateway output should be returned");
  assert(result.gateway?.used === true, "gateway metadata should mark used=true");
  assert(result.gateway?.requestedModel === "gateway-requested-model", "gateway should record requested model");
  assert(result.gateway?.observedModel === "gateway-observed-model", "gateway should record observed model");
  assert(requestBody?.metadata?.lattice_gateway?.allow_fallbacks === true, "gateway policy should reach provider request");
  assert(JSON.stringify(requestBody?.metadata ?? {}).includes("sk-redacted") === false, "gateway secrets should be sanitized");

  process.stdout.write(
    `scenario=v14-gateway ok=true requested=${result.gateway.requestedModel} observed=${result.gateway.observedModel}\n`,
  );

  return result.events ?? [];
}

async function runObservabilityScenario(events) {
  const { tracer, spans } = createMemoryTracer();
  const sink = createOtelRunEventSink({ tracer });
  for (const event of events) {
    await sink(event);
  }

  const span = spans[0];
  assert(span !== undefined, "OTel sink should create a run span");
  assert(span.name === "lattice.run", "OTel sink should use the default span name");
  assert(span.ended === true, "OTel span should end on run.complete");
  assert(span.events.some((event) => event.name === "lattice.stream.start"), "OTel sink should record stream.start");
  assert(
    span.events.some((event) => event.attributes["gen_ai.request.stream"] === true),
    "OTel stream events should set gen_ai.request.stream",
  );

  process.stdout.write(
    `scenario=v14-observability ok=true spans=${spans.length} events=${span.events.length}\n`,
  );
}

async function runFailureScenario() {
  const ai = createAI({ providers: [createFailingStreamProvider()] });
  const result = await ai.run({
    task: "Fail during offline streaming.",
    outputs: { answer: "text" },
    policy: { stream: true },
  });

  assert(result.ok === false, "failure scenario should fail");
  assert(result.error.kind === "provider_execution", "failure should normalize to provider_execution");
  const eventKinds = (result.events ?? []).map((event) => event.kind);
  assert(eventKinds.includes("stream.failed"), "failure scenario should emit stream.failed");
  for (const event of result.events ?? []) {
    assert(
      JSON.stringify(event.metadata ?? {}).includes("partial-secret") === false,
      "failure events should not leak partial stream text",
    );
  }

  process.stdout.write(
    `scenario=v14-failure ok=true kind=${result.error.kind} events=${eventKinds.length}\n`,
  );
}

assert(typeof latticeVersion === "string" && latticeVersion !== "0.0.0", "built package should expose stamped latticeVersion");

const streamingEvents = await runStreamingScenario();
const gatewayEvents = await runGatewayScenario();
await runObservabilityScenario([...streamingEvents, ...gatewayEvents]);
await runFailureScenario();

process.stdout.write(`scenario=v14-package ok=true latticeVersion=${latticeVersion}\n`);
