const {
  buildUpstreamErrorPayload,
  buildUpstreamErrorDetails,
  buildUpstreamExceptionDetails,
  config,
  copyUpstreamHeaders,
  enforceAccessPolicy,
  isAllowedModel,
  recordCallLog,
  requireDownstreamAuth,
  sanitizeUpstreamText,
  sendJson,
  setCors,
  streamUpstreamResponse,
  getUpstreamForModel,
} = require("../../../lib/gateway-config");

module.exports = async function handler(req, res) {
  req.gatewayStartedAt = Date.now();
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  const access = await requireDownstreamAuth(req, res);
  if (!access) return;

  const body = typeof req.body === "string" ? parseJson(req.body) : req.body;
  if (!body || typeof body !== "object") {
    await recordCallLog(req, { access, endpoint: "chat.completions", statusCode: 400, errorCode: "invalid_request" });
    sendJson(res, 400, { error: { message: "Chat Completions API requires a JSON body", code: "invalid_request" } });
    return;
  }
  const invalidRequest = validateChatBody(body);
  if (invalidRequest) {
    await recordCallLog(req, { access, endpoint: "chat.completions", statusCode: 400, errorCode: "invalid_request", body });
    sendJson(res, 400, { error: { message: invalidRequest, code: "invalid_request" } });
    return;
  }

  if (typeof body.model === "string" && !isAllowedModel(body.model)) {
    await recordCallLog(req, { access, endpoint: "chat.completions", statusCode: 403, errorCode: "model_not_allowed", body });
    sendJson(res, 403, { error: { message: `Model is not allowed: ${body.model}`, code: "model_not_allowed" } });
    return;
  }
  if (!(await enforceAccessPolicy(req, res, "chat.completions", body))) return;

  try {
    const upstream = getUpstreamForModel(body.model);
    const upstreamBody = { ...body, model: upstream.model };
    const upstreamResponse = await fetch(`${upstream.base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${upstream.key}`,
        "content-type": "application/json",
        accept: req.headers.accept || (body.stream === true ? "text/event-stream" : "application/json"),
        "user-agent": "Mozilla/5.0 (compatible; Chat-Completions-Gateway/1.0)",
      },
      body: JSON.stringify(upstreamBody),
    });

    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text();
      const upstreamError = buildUpstreamErrorDetails(text, upstreamResponse.status);
      await recordCallLog(req, {
        access,
        endpoint: "chat.completions",
        statusCode: 502,
        errorCode: "upstream_request_failed",
        body,
        ...upstreamError,
      });
      sendJson(res, 502, buildUpstreamErrorPayload(text));
      return;
    }

    if (body.stream === true) {
      const streamResult = await streamUpstreamResponse(upstreamResponse, res);
      await recordCallLog(req, {
        access,
        endpoint: "chat.completions",
        statusCode: upstreamResponse.status,
        body,
        responseText: streamResult.text,
        ...(streamResult.diagnostics || {}),
      });
      return;
    }

    const text = await upstreamResponse.text();
    const record = await recordCallLog(req, { access, endpoint: "chat.completions", statusCode: upstreamResponse.status, body, responseText: text });
    if (record.errorCode === "request_cost_limit_exceeded") {
      sendJson(res, 402, {
        error: {
          message: `Request cost $${formatCost(record.costUsd)} exceeds per-request limit $${formatCost(record.maxRequestCostUsd)}`,
          code: "request_cost_limit_exceeded",
        },
      });
      return;
    }
    copyUpstreamHeaders(upstreamResponse.headers, res);
    setCors(res);
    res.status(upstreamResponse.status).send(sanitizeUpstreamText(text));
  } catch (error) {
    await recordCallLog(req, {
      access,
      endpoint: "chat.completions",
      statusCode: 502,
      errorCode: "upstream_request_failed",
      body,
      ...buildUpstreamExceptionDetails(error),
    });
    sendJson(res, 502, { error: { message: "Upstream request failed", code: "upstream_request_failed" } });
  }
};

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function validateChatBody(body) {
  if (typeof body.model !== "string" || body.model.trim() === "") return "model is required";
  if (!Array.isArray(body.messages)) return "messages must be an array";
  return "";
}

function formatCost(value) {
  return Number(value || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
}

