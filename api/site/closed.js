const { BRAND } = require("../../lib/brand");

module.exports = function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    res.end("Method not allowed");
    return;
  }

  res.statusCode = 503;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(closedPage());
};

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
        <p class="result-sub">用户端页面和 Discord 登录入口已暂停开放。管理员面板和现有 API 接口未在此页面中开放。</p>
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
