const assert = require("node:assert/strict");

process.env.UPSTREAM_API_BASE = "https://upstream.test/v1";
process.env.UPSTREAM_API_KEY = "sk-upstream-test";
process.env.DOWNSTREAM_API_KEYS = "sk-smoke-valid";
process.env.MODEL_ALLOWLIST = "claude-haiku-4-5-20251001,claude-sonnet-4-6";
process.env.RPM_LIMIT = "0";
process.env.DEFAULT_KEY_BUDGET_USD = "0";
process.env.CALL_LOG_LIMIT = "50";

const modelsHandler = require("../api/v1/models");
const responsesHandler = require("../api/v1/responses");
const chatHandler = require("../api/v1/chat/completions");
const { clearCallLogs, getCallLogs } = require("../lib/gateway-config");

const validKey = "sk-smoke-valid";
const model = "claude-haiku-4-5-20251001";

async function main() {
  await clearCallLogs();

  await testModelsSuccess();
  await testInvalidKey();
  await testResponsesSuccess();
  await testChatCompletionsSuccess();
  await testDisallowedModel();

  const logs = await getCallLogs(20);
  assert.ok(logs.some((log) => log.endpoint === "models" && log.statusCode === 200), "models call should be logged");
  assert.ok(logs.some((log) => log.endpoint === "responses" && log.statusCode === 200), "responses call should be logged");
  assert.ok(logs.some((log) => log.endpoint === "chat.completions" && log.statusCode === 200), "chat call should be logged");
  assert.ok(logs.some((log) => log.errorCode === "invalid_api_key"), "invalid key should be logged");
  assert.ok(logs.some((log) => log.errorCode === "model_not_allowed"), "disallowed model should be logged");

  console.log("smoke_tests_ok=true");
}

async function testModelsSuccess() {
  const response = await invoke(modelsHandler, {
    method: "GET",
    url: "/api/v1/models",
    headers: authHeaders(validKey),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.object, "list");
  assert.ok(response.body.data.some((item) => item.id === model));
}

async function testInvalidKey() {
  const response = await invoke(modelsHandler, {
    method: "GET",
    url: "/api/v1/models",
    headers: authHeaders("sk-smoke-invalid"),
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error.code, "invalid_api_key");
}

async function testResponsesSuccess() {
  const upstreamCalls = [];
  await withMockFetch(async (url, options) => {
    upstreamCalls.push({ url, options });
    return jsonResponse(200, {
      id: "resp_smoke",
      object: "response",
      model,
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "OK" }] }],
      usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
    });
  }, async () => {
    const response = await invoke(responsesHandler, {
      method: "POST",
      url: "/api/v1/responses",
      headers: { ...authHeaders(validKey), "content-type": "application/json" },
      body: { model, input: "Reply with OK only.", max_output_tokens: 8 },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.id, "resp_smoke");
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].url, "https://upstream.test/v1/responses");
    assert.equal(upstreamCalls[0].options.headers.authorization, "Bearer sk-upstream-test");
  });
}

async function testChatCompletionsSuccess() {
  const upstreamCalls = [];
  await withMockFetch(async (url, options) => {
    upstreamCalls.push({ url, options });
    return jsonResponse(200, {
      id: "chatcmpl_smoke",
      object: "chat.completion",
      model,
      choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    });
  }, async () => {
    const response = await invoke(chatHandler, {
      method: "POST",
      url: "/api/v1/chat/completions",
      headers: { ...authHeaders(validKey), "content-type": "application/json" },
      body: { model, messages: [{ role: "user", content: "Reply with OK only." }], max_tokens: 8 },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.id, "chatcmpl_smoke");
    assert.equal(upstreamCalls.length, 1);
    assert.equal(upstreamCalls[0].url, "https://upstream.test/v1/chat/completions");
  });
}

async function testDisallowedModel() {
  const response = await invoke(responsesHandler, {
    method: "POST",
    url: "/api/v1/responses",
    headers: { ...authHeaders(validKey), "content-type": "application/json" },
    body: { model: "not-allowed-model", input: "No upstream call should happen." },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, "model_not_allowed");
}

function authHeaders(key) {
  return {
    authorization: `Bearer ${key}`,
    "user-agent": "node-smoke-tests",
  };
}

async function withMockFetch(mock, callback) {
  const originalFetch = global.fetch;
  global.fetch = mock;
  try {
    await callback();
  } finally {
    global.fetch = originalFetch;
  }
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function invoke(handler, request) {
  return new Promise((resolve, reject) => {
    const response = createMockResponse(resolve);
    Promise.resolve(handler(createMockRequest(request), response)).catch(reject);
  });
}

function createMockRequest({ method, url, headers = {}, body = undefined }) {
  return {
    method,
    url,
    headers: normalizeHeaders(headers),
    body,
  };
}

function normalizeHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function createMockResponse(resolve) {
  const response = {
    statusCode: 200,
    headers: {},
    payload: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      this.ended = true;
      resolve(normalizeResponse(this));
      return this;
    },
    send(payload) {
      this.payload = payload;
      this.ended = true;
      resolve(normalizeResponse(this));
      return this;
    },
    end(payload = "") {
      this.payload = payload;
      this.ended = true;
      resolve(normalizeResponse(this));
      return this;
    },
    write() {},
    on() {},
    flushHeaders() {},
  };
  return response;
}

function normalizeResponse(response) {
  const body = parseBody(response.payload);
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body,
    rawBody: response.payload,
  };
}

function parseBody(payload) {
  if (payload === undefined || payload === null || payload === "") return null;
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(String(payload));
  } catch {
    return payload;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
