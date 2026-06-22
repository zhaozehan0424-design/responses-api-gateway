const { signDiscordState } = require("../../../lib/discord-auth");
const { BRAND } = require("../../../lib/brand");

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  if (isSiteClosed()) {
    sendHtml(res, 503, closedPage());
    return;
  }

  const config = getDiscordConfig(req);
  if (!config.ok) {
    sendHtml(res, config.statusCode, errorPage("Discord login is not configured", config.message));
    return;
  }

  const requestUrl = new URL(req.url || "/", getOrigin(req));
  const mode = requestUrl.searchParams.get("mode") === "login" ? "login" : "register";
  if (mode === "register" && isRegistrationClosed()) {
    sendHtml(res, 403, errorPage("Registration is closed", "Registration is temporarily closed. Please wait for the next opening."));
    return;
  }

  const state = signDiscordState(config.keySecret, { mode });
  const statePayload = parseStatePayload(state);
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  const scopes = ["identify"];
  if (config.allowedGuildId) scopes.push("guilds");

  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);

  res.setHeader("set-cookie", buildStateCookie(req, statePayload.nonce, 10 * 60));
  res.statusCode = 302;
  res.setHeader("location", authorizeUrl.toString());
  res.end();
};

function getDiscordConfig(req) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const keySecret = process.env.DISCORD_KEY_SECRET || process.env.SESSION_SECRET;

  if (!clientId || !clientSecret || !keySecret) {
    return {
      ok: false,
      statusCode: 500,
      message: "Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and DISCORD_KEY_SECRET or SESSION_SECRET.",
    };
  }

  return {
    ok: true,
    clientId,
    clientSecret,
    keySecret,
    allowedGuildId: process.env.DISCORD_ALLOWED_GUILD_ID || "",
    redirectUri: process.env.DISCORD_REDIRECT_URI || `${getOrigin(req)}/api/auth/discord/callback`,
  };
}

function parseStatePayload(state) {
  const encodedPayload = state.split(".")[0];
  return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
}

function buildStateCookie(req, nonce, maxAge) {
  const secure = isHttps(req) ? "; Secure" : "";
  return [
    `discord_oauth_state=${encodeURIComponent(nonce)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    secure,
  ].filter(Boolean).join("; ");
}

function getOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const protocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0] || (String(host).includes("localhost") ? "http" : "https");
  return `${protocol}://${String(host).split(",")[0]}`;
}

function isHttps(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0];
  return protocol === "https" || (!protocol && !String(req.headers.host || "").includes("localhost"));
}

function isRegistrationClosed() {
  return ["1", "true", "yes", "on"].includes(String(process.env.DISCORD_REGISTRATION_CLOSED || "").toLowerCase());
}

function isSiteClosed() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SITE_CLOSED || "").toLowerCase());
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
}

function errorPage(title, message) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(BRAND)} - ${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <main class="card--center">
    <div class="card card--result stack" style="width:min(560px,calc(100vw - 32px))">
      <div>
        <span class="badge badge--danger">Discord login unavailable</span>
        <h1 style="margin-top:12px">${escapeHtml(title)}</h1>
        <p style="margin:0">${escapeHtml(message)}</p>
      </div>
      <div class="hero-actions" style="margin-top:4px">
        <a class="btn btn--ghost" href="/">Back home</a>
      </div>
    </div>
  </main>
</body>
</html>`;
}

function closedPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(BRAND)} - Site Closed</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <main class="card--center">
    <div class="card card--result stack" style="width:min(560px,calc(100vw - 32px))">
      <div class="result-hero">
        <span class="badge badge--danger">Closed</span>
        <h1>网站暂时关闭</h1>
        <p class="result-sub">用户端页面和 Discord 登录入口已暂停开放。</p>
      </div>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
