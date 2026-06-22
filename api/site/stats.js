const { getRegistrationConfig, listDiscordRegistrations } = require("../../lib/discord-registration");
const { sendJson, setCors } = require("../../lib/gateway-config");

module.exports = async function handler(req, res) {
  setCors(res);
  res.setHeader("cache-control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  try {
    const config = getRegistrationConfig();
    const registrations = await listDiscordRegistrations();
    const limit = Number(config.limit || registrations.limit || 0);
    const count = Number(registrations.count || 0);
    sendJson(res, 200, {
      registered: count,
      limit,
      remaining: limit > 0 ? Math.max(0, limit - count) : null,
      registrationOpen: !isSiteClosed() && !isRegistrationClosed() && (limit <= 0 || count < limit),
      siteClosed: isSiteClosed(),
    });
  } catch (error) {
    sendJson(res, 503, {
      error: {
        message: "Site stats are temporarily unavailable",
        code: "stats_unavailable",
      },
    });
  }
};

function isRegistrationClosed() {
  return ["1", "true", "yes", "on"].includes(String(process.env.DISCORD_REGISTRATION_CLOSED || "").toLowerCase());
}

function isSiteClosed() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SITE_CLOSED || "").toLowerCase());
}
