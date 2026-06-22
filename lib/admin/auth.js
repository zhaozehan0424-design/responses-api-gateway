const crypto = require("node:crypto");
const { config } = require("../gateway-config");

const COOKIE_NAME = "gateway_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function isAdminRequest(req) {
  if (!config.adminToken) return false;
  const token = parseAdminToken(req);
  if (token && safeEqual(token, config.adminToken)) return true;
  return Boolean(verifyAdminSession(req));
}

function isAdminToken(token) {
  return Boolean(config.adminToken && token && safeEqual(token, config.adminToken));
}

function createAdminSessionCookie(req) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }));
  const signature = signatureFor(payload, config.adminToken);
  const secure = isHttps(req) ? "; Secure" : "";
  return [
    `${COOKIE_NAME}=${payload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure,
  ].filter(Boolean).join("; ");
}

function clearAdminSessionCookie(req) {
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

function verifyAdminSession(req) {
  if (!config.adminToken) return null;
  const cookie = parseCookies(req)[COOKIE_NAME];
  if (!cookie) return null;
  const [payload, signature, extra] = String(cookie).split(".");
  if (!payload || !signature || extra !== undefined) return null;
  if (!safeEqual(signature, signatureFor(payload, config.adminToken))) return null;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    const now = Math.floor(Date.now() / 1000);
    if (!data.exp || now >= Number(data.exp)) return null;
    return data;
  } catch {
    return null;
  }
}

function parseAdminToken(req) {
  const auth = String(req.headers.authorization || "");
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : String(req.headers["x-admin-token"] || "").trim();
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

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function signatureFor(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminRequest,
  isAdminToken,
};
