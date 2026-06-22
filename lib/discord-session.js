const {
  signPayload,
  verifySignedPayload,
} = require("./discord-auth");

const COOKIE_NAME = "gateway_user_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret() {
  return process.env.DISCORD_KEY_SECRET || process.env.SESSION_SECRET || "";
}

function createUserSessionCookie(req, account) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("DISCORD_KEY_SECRET or SESSION_SECRET is required");

  const now = Math.floor(Date.now() / 1000);
  const token = signPayload({
    sub: String(account.id || ""),
    username: account.username || "",
    global_name: account.globalName || account.global_name || "",
    group: account.groupName || account.group || "guest",
    guild_id: account.guildId || "",
    resource_channel_id: account.resourceChannelId || "",
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }, secret);
  const secure = isHttps(req) ? "; Secure" : "";

  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure,
  ].filter(Boolean).join("; ");
}

function clearUserSessionCookie(req) {
  const secure = isHttps(req) ? "; Secure" : "";
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure,
  ].filter(Boolean).join("; ");
}

function getUserSession(req) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const token = parseCookies(req)[COOKIE_NAME];
  const payload = verifySignedPayload(token, secret);
  if (!payload || !payload.sub) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload.exp) > 0 && now >= Number(payload.exp)) return null;
  return payload;
}

function parseCookies(req) {
  const output = {};
  const cookieHeader = String(req.headers.cookie || "");
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name) continue;
    output[name] = decodeURIComponent(valueParts.join("="));
  }
  return output;
}

function isHttps(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0];
  return protocol === "https" || (!protocol && !String(req.headers.host || "").includes("localhost"));
}

module.exports = {
  clearUserSessionCookie,
  createUserSessionCookie,
  getUserSession,
};
