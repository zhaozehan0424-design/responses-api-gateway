const fs = require("node:fs");
const path = require("node:path");
const { BRAND } = require("../../lib/brand");
const { config } = require("../../lib/gateway-config");
const {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isAdminRequest,
  isAdminToken,
} = require("../../lib/admin/auth");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    if (req.url && new URL(req.url, getOrigin(req)).searchParams.get("logout") === "1") {
      res.setHeader("set-cookie", clearAdminSessionCookie(req));
      sendHtml(res, 200, loginPage(""));
      return;
    }
    if (isAdminRequest(req)) {
      sendHtml(res, 200, adminPage());
      return;
    }
    sendHtml(res, config.adminToken ? 401 : 503, loginPage(config.adminToken ? "" : "ADMIN_TOKEN is not configured."));
    return;
  }

  if (req.method === "POST") {
    if (!config.adminToken) {
      sendHtml(res, 503, loginPage("ADMIN_TOKEN is not configured."));
      return;
    }
    const body = await readBody(req);
    const token = body.get("token") || "";
    if (!isAdminToken(token)) {
      sendHtml(res, 401, loginPage("Admin token is incorrect."));
      return;
    }
    res.statusCode = 303;
    res.setHeader("set-cookie", createAdminSessionCookie(req));
    res.setHeader("location", "/admin");
    res.end();
    return;
  }

  res.statusCode = 405;
  res.setHeader("allow", "GET, POST");
  res.end("Method not allowed");
};

function adminPage() {
  const file = path.join(__dirname, "admin.html");
  return fs.readFileSync(file, "utf8");
}

function loginPage(errorMessage) {
  const error = errorMessage
    ? `<div class="callout callout--warn"><span>!</span><span>${escapeHtml(errorMessage)}</span></div>`
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(BRAND)} - Admin Login</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <main class="card--center">
    <form class="card card--result stack" method="post" action="/admin" autocomplete="off" style="width:min(460px,calc(100vw - 32px))">
      <div class="result-hero">
        <span class="badge">Admin</span>
        <h1>Admin login</h1>
        <p class="result-sub">Enter the admin token to continue.</p>
      </div>
      ${error}
      <label>
        <span class="field-label">Admin Token</span>
        <input class="field" type="password" name="token" autocomplete="off" spellcheck="false" autofocus>
      </label>
      <button class="btn btn--primary" type="submit">Open admin panel</button>
      <a class="btn btn--ghost" href="/">Back home</a>
    </form>
  </main>
</body>
</html>`;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return new URLSearchParams(req.body);
  }
  if (typeof req.body === "string") {
    return new URLSearchParams(req.body);
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function getOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const protocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0] || (String(host).includes("localhost") ? "http" : "https");
  return `${protocol}://${String(host).split(",")[0]}`;
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
