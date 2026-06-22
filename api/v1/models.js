const {
  config,
  enforceAccessPolicy,
  getAllowedModels,
  recordCallLog,
  requireDownstreamAuth,
  sendJson,
  setCors,
} = require("../../lib/gateway-config");

module.exports = async function handler(req, res) {
  req.gatewayStartedAt = Date.now();
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  const access = await requireDownstreamAuth(req, res);
  if (!access) return;
  if (!(await enforceAccessPolicy(req, res, "models"))) return;

  const payload = {
    object: "list",
    data: getAllowedModels(access).map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "gateway",
    })),
  };
  await recordCallLog(req, { access, endpoint: "models", statusCode: 200 });
  sendJson(res, 200, payload);
};


