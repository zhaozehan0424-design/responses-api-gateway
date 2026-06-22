const http = require("node:http");
const fs = require("node:fs");
const { Readable } = require("node:stream");

loadDotEnv();

const config = {
  upstreamBase: requiredEnv("UPSTREAM_API_BASE").replace(/\/+$/, ""),
  upstreamKey: requiredEnv("UPSTREAM_API_KEY"),
  downstreamKeys: csvEnv("DOWNSTREAM_API_KEYS"),
  modelAllowlist: csvEnv("MODEL_ALLOWLIST"),
  port: Number(process.env.PORT || 4000),
  rpmLimit: Number(process.env.RPM_LIMIT || 4),
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 20 * 1024 * 1024),
  corsAllowOrigin: process.env.CORS_ALLOW_ORIGIN || "*",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 120000),
};

const downstreamKeySet = new Set(config.downstreamKeys);
const modelSet = new Set(config.modelAllowlist);
const rateBuckets = new Map();

if (downstreamKeySet.size === 0) {
  throw new Error("DOWNSTREAM_API_KEYS must contain at least one user key.");
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/healthz") {
    sendJson(res, 200, { ok: true, service: "openai-compatible-gateway" });
    return;
  }

  const allowedRoute =
    (req.method === "GET" && requestUrl.pathname === "/v1/models") ||
    (req.method === "POST" && requestUrl.pathname === "/v1/responses") ||
    (req.method === "POST" && requestUrl.pathname === "/v1/chat/completions");

  if (!allowedRoute) {
    sendJson(res, 404, { error: { message: "Not found", code: "not_found" } });
    return;
  }

  const downstreamKey = parseBearer(req.headers.authorization);
  if (!downstreamKey || !downstreamKeySet.has(downstreamKey)) {
    sendJson(res, 401, { error: { message: "Invalid API key", code: "invalid_api_key" } });
    return;
  }

  if (isRateLimited(downstreamKey)) {
    sendJson(res, 429, { error: { message: "Rate limit exceeded", code: "rate_limit_exceeded" } });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/v1/models") {
    sendJson(res, 200, {
      object: "list",
      data: config.modelAllowlist.map((id) => ({
        id,
        object: "model",
        created: 0,
        owned_by: "gateway",
      })),
    });
    return;
  }

  let bodyBuffer;
  try {
    bodyBuffer = await readBody(req, config.maxBodyBytes);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: { message: error.message, code: error.code || "invalid_request" } });
    return;
  }

  const contentType = String(req.headers["content-type"] || "");
  let parsedBody = null;
  if (bodyBuffer.length > 0 && contentType.includes("application/json")) {
    try {
      parsedBody = JSON.parse(bodyBuffer.toString("utf8"));
      if (parsedBody && typeof parsedBody.model === "string" && modelSet.size > 0 && !modelSet.has(parsedBody.model)) {
        sendJson(res, 403, { error: { message: `Model is not allowed: ${parsedBody.model}`, code: "model_not_allowed" } });
        return;
      }
    } catch {
      sendJson(res, 400, { error: { message: "Invalid JSON body", code: "invalid_request" } });
      return;
    }
  }

  await proxyToUpstream(req, res, requestUrl, bodyBuffer);
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Gateway listening on 0.0.0.0:${config.port}`);
});

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [name, ...valueParts] = trimmed.split("=");
    if (!process.env[name]) {
      process.env[name] = valueParts.join("=");
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function csvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseBearer(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isRateLimited(key) {
  if (!Number.isFinite(config.rpmLimit) || config.rpmLimit <= 0) return false;

  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;
  const bucketKey = `${key}:${windowStart}`;
  const current = rateBuckets.get(bucketKey) || 0;

  if (current >= config.rpmLimit) return true;
  rateBuckets.set(bucketKey, current + 1);

  for (const oldKey of rateBuckets.keys()) {
    const oldWindow = Number(oldKey.split(":").at(-1));
    if (Number.isFinite(oldWindow) && oldWindow < windowStart - 60000) {
      rateBuckets.delete(oldKey);
    }
  }

  return false;
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyToUpstream(req, res, requestUrl, bodyBuffer) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  req.on("close", () => controller.abort());

  try {
    const upstreamUrl = buildUpstreamUrl(requestUrl);
    const headers = buildUpstreamHeaders(req.headers);
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (upstreamResponse.status >= 400) {
      const text = await upstreamResponse.text();
      const upstreamError = buildUpstreamErrorPayload(text);
      const responseHeaders = responseHeadersFrom(upstreamResponse.headers);
      responseHeaders["content-type"] = responseHeaders["content-type"] || "application/json; charset=utf-8";
      res.writeHead(upstreamResponse.status, responseHeaders);
      res.end(JSON.stringify(upstreamError));
      return;
    }

    res.writeHead(upstreamResponse.status, responseHeadersFrom(upstreamResponse.headers));

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(res);
  } catch (error) {
    clearTimeout(timeout);
    const status = error.name === "AbortError" ? 504 : 502;
    sendJson(res, status, {
      error: {
        message: status === 504 ? "Upstream request timed out" : "Upstream request failed",
        code: status === 504 ? "upstream_request_timed_out" : "upstream_request_failed",
      },
    });
  }
}

function buildUpstreamUrl(requestUrl) {
  const base = new URL(`${config.upstreamBase}/`);
  const basePath = base.pathname.replace(/\/+$/, "");
  let path = requestUrl.pathname;

  if (basePath.endsWith("/v1") && path.startsWith("/v1/")) {
    path = path.slice("/v1".length);
  }

  base.pathname = `${basePath}${path}`.replace(/\/{2,}/g, "/");
  base.search = requestUrl.search;
  return base;
}

function buildUpstreamHeaders(incomingHeaders) {
  const headers = {
    authorization: `Bearer ${config.upstreamKey}`,
    "user-agent": "Mozilla/5.0 (compatible; OpenAI-Compatible-Gateway/1.0)",
  };

  for (const name of ["content-type", "accept", "openai-organization", "anthropic-version", "anthropic-beta"]) {
    const value = incomingHeaders[name];
    if (value) headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }

  return headers;
}

function responseHeadersFrom(headers) {
  const allowed = [
    "content-type",
    "cache-control",
    "x-request-id",
    "request-id",
    "openai-processing-ms",
  ];
  const output = {
    "access-control-allow-origin": config.corsAllowOrigin,
    "access-control-allow-headers": "authorization,content-type,accept",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  for (const name of allowed) {
    const value = headers.get(name);
    if (value) output[name] = value;
  }

  return output;
}

function sanitizeUpstreamText(text) {
  return String(text || "")
    .split(config.upstreamBase).join("[upstream]")
    .split(config.upstreamKey).join("[upstream-key]");
}

function buildUpstreamErrorPayload(text) {
  const fallback = "Upstream request failed";
  const safeText = sanitizeUpstreamText(text).trim();
  let message = fallback;

  if (safeText) {
    try {
      const parsed = JSON.parse(safeText);
      message = parsed?.error?.message || parsed?.message || fallback;
    } catch {
      message = safeText.slice(0, 500);
    }
  }

  return { error: { message, code: "upstream_request_failed" } };
}

function setCors(res) {
  res.setHeader("access-control-allow-origin", config.corsAllowOrigin);
  res.setHeader("access-control-allow-headers", "authorization,content-type,accept");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}

function sendJson(res, statusCode, payload) {
  if (res.headersSent) return;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": config.corsAllowOrigin,
    "access-control-allow-headers": "authorization,content-type,accept",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(withErrorCode(statusCode, payload)));
}

function withErrorCode(statusCode, payload) {
  if (!payload || typeof payload !== "object" || !payload.error || typeof payload.error !== "object") {
    return payload;
  }
  if (payload.error.code) return payload;
  return {
    ...payload,
    error: {
      ...payload.error,
      code: defaultErrorCode(statusCode),
    },
  };
}

function defaultErrorCode(statusCode) {
  if (statusCode === 400) return "invalid_request";
  if (statusCode === 401) return "invalid_api_key";
  if (statusCode === 403) return "access_denied";
  if (statusCode === 404) return "not_found";
  if (statusCode === 405) return "method_not_allowed";
  if (statusCode === 429) return "rate_limit_exceeded";
  if (statusCode === 502) return "upstream_request_failed";
  if (statusCode === 504) return "upstream_request_timed_out";
  return "request_failed";
}
