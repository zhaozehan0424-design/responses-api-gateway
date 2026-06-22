const {
  clearCallLogs,
  config,
  getCallLogs,
  getCallLogStorage,
  sendJson,
  setCors,
} = require("../../lib/gateway-config");
const { isAdminRequest } = require("../../lib/admin/auth");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  if (!isAdminRequest(req)) {
    const status = config.adminToken ? 401 : 503;
    const code = config.adminToken ? "invalid_admin_token" : "admin_not_configured";
    const message = config.adminToken ? "Invalid admin token" : "ADMIN_TOKEN is not configured";
    sendJson(res, status, { error: { message, code } });
    return;
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? parseJson(req.body) : (req.body || {});
    if (body.action !== "clear") {
      sendJson(res, 400, { error: { message: "Unsupported admin action", code: "invalid_request" } });
      return;
    }
    try {
      await clearCallLogs();
      sendJson(res, 200, { ok: true, storage: getCallLogStorage() });
    } catch (error) {
      sendJson(res, 502, { error: { message: error.message || "Failed to clear call logs", code: "call_log_store_failed" } });
    }
    return;
  }

  const limit = Number(req.query?.limit || 100);
  try {
    const logs = await getCallLogs(limit);
    sendJson(res, 200, {
      object: "list",
      storage: getCallLogStorage(),
      data: logs,
    });
  } catch (error) {
    sendJson(res, 502, { error: { message: error.message || "Failed to read call logs", code: "call_log_store_failed" } });
  }
};

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}


