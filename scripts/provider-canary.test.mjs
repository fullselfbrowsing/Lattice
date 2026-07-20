import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";

import {
  preparePackedProviderCanary,
  removePreparedProviderCanary,
  runPreparedProviderCanary,
} from "./run-provider-canary.mjs";
import {
  CANARY_LIMITS,
  CANARY_PROMPT,
  createSanitizedReport,
  parseCanaryConfiguration,
} from "./provider-canary-core.mjs";

const SECRET_SENTINEL = "sk-provider-canary-secret-sentinel";
const OUTPUT_SENTINEL = "PROVIDER_OUTPUT_SENTINEL_MUST_NOT_BE_RETAINED";
const ERROR_SENTINEL = "PROVIDER_RAW_ERROR_SENTINEL_MUST_NOT_BE_RETAINED";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

let prepared;
let runPackedCanary;

before(async () => {
  prepared = await preparePackedProviderCanary();
  const consumer = await import(
    `${pathToFileURL(prepared.consumerProgram).href}?test=${Date.now()}`
  );
  runPackedCanary = consumer.runProviderCanary;
});

after(async () => {
  if (prepared !== undefined) {
    await removePreparedProviderCanary(prepared);
  }
});

describe("packed provider canary", () => {
  test("uses each native wire shape once and retains only bounded evidence", async () => {
    await withServer(passHandler, async ({ baseUrl, requests, errors }) => {
      const environment = completeEnvironment(baseUrl);
      const { report, exitCode } = await runPreparedProviderCanary(
        prepared,
        environment,
      );

      assert.equal(exitCode, 0);
      assert.equal(requests.length, 3);
      assert.deepEqual(
        report.families.map(({ family, status, transportCount }) => ({
          family,
          status,
          transportCount,
        })),
        [
          { family: "openai-compatible", status: "passed", transportCount: 1 },
          { family: "anthropic", status: "passed", transportCount: 1 },
          { family: "gemini", status: "passed", transportCount: 1 },
        ],
      );
      assert.equal(report.families[2].usage.outputTokens, 3);
      assert.ok(report.families.every((record) => record.receiptVerified));
      assert.deepEqual(errors, []);
      assertSanitized(report);
    });
  });

  test("missing and invalid configuration is not-run before network access", async () => {
    await withServer(passHandler, async ({ baseUrl, requests }) => {
      const missing = await runPackedCanary({
        environment: { LATTICE_PROVIDER_CANARY_COMMIT: COMMIT },
      });
      assert.deepEqual(
        missing.families.map(({ status, code, transportCount }) => ({
          status,
          code,
          transportCount,
        })),
        [
          { status: "not-run", code: "missing-model", transportCount: 0 },
          { status: "not-run", code: "missing-model", transportCount: 0 },
          { status: "not-run", code: "missing-model", transportCount: 0 },
        ],
      );

      const invalidEnvironment = completeEnvironment(baseUrl);
      invalidEnvironment.LATTICE_CANARY_OPENAI_BASE_URL = "https://user:secret@example.com";
      invalidEnvironment.LATTICE_CANARY_ANTHROPIC_INPUT_PRICE_PER_1K_USD = "-1";
      invalidEnvironment.LATTICE_CANARY_GEMINI_MAX_SPEND_USD = "0.03";
      const invalid = await runPackedCanary({ environment: invalidEnvironment });
      assert.deepEqual(
        invalid.families.map(({ status, code, transportCount }) => ({
          status,
          code,
          transportCount,
        })),
        [
          { status: "not-run", code: "invalid-base-url", transportCount: 0 },
          { status: "not-run", code: "invalid-pricing", transportCount: 0 },
          { status: "not-run", code: "invalid-spend-cap", transportCount: 0 },
        ],
      );
      assert.equal(requests.length, 0);
    });
  });

  test("401 and 500 attempts fail without retaining raw provider errors", async () => {
    await withServer(
      async (request, response) => {
        if (request.url.startsWith("/openai/")) {
          json(response, 401, { error: ERROR_SENTINEL });
          return;
        }
        if (request.url.startsWith("/anthropic/")) {
          json(response, 500, { error: ERROR_SENTINEL });
          return;
        }
        await passHandler(request, response);
      },
      async ({ baseUrl, requests }) => {
        const report = await runPackedCanary({
          environment: completeEnvironment(baseUrl),
        });
        assert.deepEqual(
          report.families.map(({ status, code }) => ({ status, code })),
          [
            { status: "failed", code: "provider-http-error" },
            { status: "failed", code: "provider-http-error" },
            { status: "passed", code: "ok" },
          ],
        );
        assert.equal(requests.length, 3);
        assertSanitized(report);
      },
    );
  });

  test("aborts a hanging provider within the configured test deadline", async () => {
    await withServer(
      async (_request, _response) => {},
      async ({ baseUrl, requests }) => {
        const environment = oneFamilyEnvironment("OPENAI", baseUrl);
        const report = await runPackedCanary({
          environment,
          timeoutMs: 50,
        });
        assert.equal(report.families[0].status, "failed");
        assert.equal(report.families[0].code, "transport-timeout");
        assert.equal(report.families[0].transportCount, 1);
        assert.equal(requests.length, 1);
        assertSanitized(report);
      },
    );
  });

  test("rejects a second transport invocation", async () => {
    await withServer(passHandler, async ({ baseUrl, requests }) => {
      const environment = oneFamilyEnvironment("OPENAI", baseUrl);
      const report = await runPackedCanary({
        environment,
        decorateFetch(countedFetch, family) {
          if (family !== "openai-compatible") return countedFetch;
          return async (...args) => {
            await countedFetch(...args);
            return countedFetch(...args);
          };
        },
      });
      assert.equal(report.families[0].status, "failed");
      assert.equal(report.families[0].code, "transport-limit-exceeded");
      assert.equal(report.families[0].transportCount, 2);
      assert.equal(requests.length, 1);
      assertSanitized(report);
    });
  });

  test("fails closed on usage ceilings and reported overspend", async () => {
    let scenario = "usage";
    await withServer(
      async (request, response) => {
        const body = await readRequestBody(request);
        if (scenario === "usage") {
          openAIResponse(response, {
            prompt_tokens: CANARY_LIMITS.maxInputTokens + 1,
            completion_tokens: 1,
            total_tokens: CANARY_LIMITS.maxInputTokens + 2,
          });
        } else {
          openAIResponse(response, {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
            costUsd: 0.015,
          });
        }
        assert.equal(body.max_tokens, CANARY_LIMITS.maxOutputTokens);
      },
      async ({ baseUrl }) => {
        const environment = oneFamilyEnvironment("OPENAI", baseUrl);
        const usageReport = await runPackedCanary({ environment });
        assert.equal(usageReport.families[0].code, "usage-limit-exceeded");

        scenario = "overspend";
        const spendReport = await runPackedCanary({ environment });
        assert.equal(spendReport.families[0].code, "spend-limit-exceeded");
        assertSanitized(usageReport);
        assertSanitized(spendReport);
      },
    );
  });

  test("classifies malformed provider JSON without retaining parser details", async () => {
    await withServer(
      async (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(`{"error":"${ERROR_SENTINEL}"`);
      },
      async ({ baseUrl }) => {
        const report = await runPackedCanary({
          environment: oneFamilyEnvironment("OPENAI", baseUrl),
        });
        assert.equal(report.families[0].status, "failed");
        assert.equal(report.families[0].code, "response-malformed");
        assertSanitized(report);
      },
    );
  });
});

test("configuration parser rejects projected spend above the family cap", () => {
  const environment = oneFamilyEnvironment("OPENAI", "http://127.0.0.1:1");
  environment.LATTICE_CANARY_OPENAI_INPUT_PRICE_PER_1K_USD = "0.01";
  environment.LATTICE_CANARY_OPENAI_MAX_SPEND_USD = "0.005";
  const [openAI] = parseCanaryConfiguration(environment);
  assert.equal(openAI.status, "not-run");
  assert.equal(openAI.record.code, "projected-spend-exceeds-cap");
});

test("sanitized report projection discards unapproved fields", () => {
  const report = createSanitizedReport({
    packageVersion: "1.6.0",
    commit: COMMIT,
    records: [
      {
        family: "openai-compatible",
        status: "failed",
        code: "transport-failed",
        configuredModel: "openai-test",
        transportCount: 1,
        receiptVerified: false,
        credential: SECRET_SENTINEL,
        prompt: CANARY_PROMPT,
        output: OUTPUT_SENTINEL,
        rawError: ERROR_SENTINEL,
        baseUrl: "https://example.test?key=secret",
      },
    ],
  });
  assert.deepEqual(Object.keys(report.families[0]).sort(), [
    "code",
    "configuredModel",
    "family",
    "receiptVerified",
    "status",
    "transportCount",
  ]);
  assertSanitized(report);
});

test("provider workflow is scheduled/manual, protected, read-only, and SHA-pinned", async () => {
  const workflow = await readFile(".github/workflows/provider-canary.yml", "utf8");
  assert.match(workflow, /^on:\n  schedule:/mu);
  assert.match(workflow, /^  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s+(?:pull_request|push):/mu);
  assert.match(workflow, /^permissions:\n  contents: read/mu);
  assert.match(workflow, /^concurrency:\n  group: provider-canary\n  cancel-in-progress: false/mu);
  assert.match(workflow, /^    environment: provider-canary$/mu);
  assert.match(workflow, /API_KEY: \$\{\{ secrets\./u);
  assert.match(workflow, /MODEL: \$\{\{ vars\./u);
  assert.match(workflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/u);
  const actionRefs = [...workflow.matchAll(/^\s+uses:\s+[^@\s]+@([^\s]+)$/gmu)];
  assert.ok(actionRefs.length >= 4);
  for (const [, reference] of actionRefs) {
    assert.match(reference, /^[a-f0-9]{40}$/u);
  }
});

function completeEnvironment(baseUrl) {
  return {
    LATTICE_PROVIDER_CANARY_COMMIT: COMMIT,
    ...familyEnvironment("OPENAI", `${baseUrl}/openai/v1`),
    ...familyEnvironment("ANTHROPIC", `${baseUrl}/anthropic`),
    ...familyEnvironment("GEMINI", `${baseUrl}/gemini`),
  };
}

function oneFamilyEnvironment(prefix, baseUrl) {
  return {
    LATTICE_PROVIDER_CANARY_COMMIT: COMMIT,
    ...familyEnvironment(prefix, familyBaseUrl(prefix, baseUrl)),
  };
}

function familyBaseUrl(prefix, baseUrl) {
  if (baseUrl.includes(`/${prefix.toLowerCase()}`)) return baseUrl;
  if (prefix === "OPENAI") return `${baseUrl}/openai/v1`;
  if (prefix === "ANTHROPIC") return `${baseUrl}/anthropic`;
  return `${baseUrl}/gemini`;
}

function familyEnvironment(prefix, baseUrl) {
  const model =
    prefix === "OPENAI"
      ? "openai-test"
      : prefix === "ANTHROPIC"
        ? "claude-test"
        : "gemini-test";
  return {
    [`LATTICE_CANARY_${prefix}_MODEL`]: model,
    [`LATTICE_CANARY_${prefix}_API_KEY`]: SECRET_SENTINEL,
    [`LATTICE_CANARY_${prefix}_BASE_URL`]: baseUrl,
    [`LATTICE_CANARY_${prefix}_INPUT_PRICE_PER_1K_USD`]: "0.001",
    [`LATTICE_CANARY_${prefix}_OUTPUT_PRICE_PER_1K_USD`]: "0.002",
    [`LATTICE_CANARY_${prefix}_MAX_SPEND_USD`]: "0.01",
  };
}

async function withServer(handler, run) {
  const requests = [];
  const errors = [];
  const server = createServer(async (request, response) => {
    requests.push(request.url ?? "");
    try {
      await handler(request, response);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (!response.headersSent) {
        json(response, 500, { error: ERROR_SENTINEL });
      } else {
        response.destroy();
      }
    }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run({
      baseUrl: `http://127.0.0.1:${address.port}`,
      requests,
      errors,
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function passHandler(request, response) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const body = await readRequestBody(request);
  if (url.pathname === "/openai/v1/chat/completions") {
    assert.equal(request.headers.authorization, `Bearer ${SECRET_SENTINEL}`);
    assert.equal(body.model, "openai-test");
    assert.equal(body.max_tokens, CANARY_LIMITS.maxOutputTokens);
    openAIResponse(response, {
      prompt_tokens: 5,
      completion_tokens: 2,
      total_tokens: 7,
    });
    return;
  }
  if (url.pathname === "/anthropic/v1/messages") {
    assert.equal(request.headers["x-api-key"], SECRET_SENTINEL);
    assert.equal(body.model, "claude-test");
    assert.equal(body.max_tokens, CANARY_LIMITS.maxOutputTokens);
    json(response, 200, {
      id: "msg-canary",
      model: "claude-observed",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: OUTPUT_SENTINEL }],
      stop_reason: "end_turn",
      usage: { input_tokens: 5, output_tokens: 2 },
    });
    return;
  }
  if (url.pathname === "/gemini/v1beta/models/gemini-test:generateContent") {
    assert.equal(url.searchParams.get("key"), SECRET_SENTINEL);
    assert.equal(body.generationConfig.maxOutputTokens, CANARY_LIMITS.maxOutputTokens);
    json(response, 200, {
      responseId: "gemini-canary",
      modelVersion: "gemini-observed",
      candidates: [
        {
          content: { parts: [{ text: OUTPUT_SENTINEL }], role: "model" },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 2,
        totalTokenCount: 8,
      },
    });
    return;
  }
  json(response, 404, { error: ERROR_SENTINEL });
}

function openAIResponse(response, usage) {
  json(response, 200, {
    id: "chatcmpl-canary",
    model: "openai-observed",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: OUTPUT_SENTINEL },
        finish_reason: "stop",
      },
    ],
    usage,
  });
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function assertSanitized(report) {
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(SECRET_SENTINEL), "u"));
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(CANARY_PROMPT), "u"));
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(OUTPUT_SENTINEL), "u"));
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(ERROR_SENTINEL), "u"));
  assert.doesNotMatch(
    serialized,
    /"(?:baseUrl|credential|headers|prompt|output|rawError|receiptPayload)":/u,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
