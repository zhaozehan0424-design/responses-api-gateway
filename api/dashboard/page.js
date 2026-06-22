const { signDiscordApiKey } = require("../../lib/discord-auth");
const {
  getDiscordAccount,
  isDiscordUserRegistered,
  saveDiscordAccount,
} = require("../../lib/discord-registration");
const {
  clearUserSessionCookie,
  getUserSession,
} = require("../../lib/discord-session");
const {
  getAccessForKey,
  getAllowedEndpoints,
  getAllowedModels,
  getBudgetUsd,
  getCallLogs,
  getKeySpendUsd,
  getMaxInputTokens,
  getMaxOutputTokens,
  getRpmLimit,
} = require("../../lib/gateway-config");
const { BRAND } = require("../../lib/brand");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("allow", "GET");
    res.end("Method not allowed");
    return;
  }

  const requestUrl = new URL(req.url || "/", getOrigin(req));
  if (requestUrl.searchParams.get("logout") === "1") {
    res.statusCode = 303;
    res.setHeader("set-cookie", clearUserSessionCookie(req));
    res.setHeader("location", "/");
    res.end();
    return;
  }

  const session = getUserSession(req);
  if (!session) {
    sendHtml(res, 401, loginRequiredPage());
    return;
  }

  const registered = await isDiscordUserRegistered(session.sub);
  if (!registered) {
    res.setHeader("set-cookie", clearUserSessionCookie(req));
    sendHtml(res, 403, loginRequiredPage("This account is not in the current registration list. Please register again while slots are open."));
    return;
  }

  let account = await getDiscordAccount(session.sub);
  if (!account) {
    account = await saveDiscordAccount(session.sub, {
      id: session.sub,
      username: session.username || "",
      globalName: session.global_name || "",
      groupName: session.group || "guest",
      guildId: session.guild_id || "",
      resourceChannelId: session.resource_channel_id || "",
    });
  }

  if (!account.apiKey) {
    account = await saveDiscordAccount(session.sub, {
      ...account,
      apiKey: createApiKey(account),
      keyIssuedAt: new Date().toISOString(),
    });
  }

  const access = account.apiKey ? await getAccessForKey(account.apiKey) : null;
  const usage = await buildDashboardUsage(account, access);

  sendHtml(res, 200, dashboardPage({
    account,
    access,
    usage,
    baseUrl: `${getOrigin(req)}/v1`,
    registrationLimit: Number(process.env.DISCORD_REGISTRATION_LIMIT || 20),
    rpmLimit: access ? getRpmLimit(access) : Number(process.env.RPM_LIMIT || 4),
    budgetUsd: usage.budgetUsd,
    maxInputTokens: access ? getMaxInputTokens(access) : account.maxInputTokens ?? 0,
    maxOutputTokens: access ? getMaxOutputTokens(access) : account.maxOutputTokens ?? 0,
  }));
};

function createApiKey(account) {
  const secret = process.env.DISCORD_KEY_SECRET || process.env.SESSION_SECRET || "";
  if (!secret) return "";

  const now = Math.floor(Date.now() / 1000);
  const ttlDays = Number(process.env.DISCORD_KEY_TTL_DAYS || 30);
  const ttlSeconds = ttlDays > 0 ? Math.floor(ttlDays * 24 * 60 * 60) : 0;
  return signDiscordApiKey({
    sub: account.id,
    username: account.username || "",
    global_name: account.globalName || account.global_name || "",
    group: account.groupName || account.group || "guest",
    ...(account.guildId ? { guild_id: account.guildId } : {}),
    ...(account.resourceChannelId ? { resource_channel_id: account.resourceChannelId } : {}),
    iat: now,
    ...(ttlSeconds > 0 ? { exp: now + ttlSeconds } : {}),
  }, secret);
}

function dashboardPage({ account, access, usage, baseUrl, registrationLimit, rpmLimit, budgetUsd, maxInputTokens, maxOutputTokens }) {
  const displayName = account.displayName || account.globalName || account.username || account.id;
  const allowedModels = access ? getAllowedModels(access) : [];
  const allowedEndpoints = access ? getAllowedEndpoints(access) : [];
  const effectiveGroup = access?.groupName || account.groupName || "guest";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(BRAND)} - Dashboard</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">
  <script src="/assets/config.js"></script>
  <script src="/assets/ui.js" defer></script>
</head>
<body>
  <header class="site-header">
    <div class="container nav">
      <a class="brand" href="/" aria-label="Back home">
        <img src="/favicon.svg" alt="" width="26" height="26">
        <span>${escapeHtml(BRAND)}</span>
      </a>
      <nav class="nav-links" aria-label="User navigation">
        <a href="/docs">Docs</a>
        <a href="/dashboard?logout=1">Log out</a>
      </nav>
    </div>
  </header>

  <main class="container section dashboard-shell">
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h1>${escapeHtml(displayName)}</h1>
        <p class="muted">Your Discord account has passed the class-brain community check. API access follows your current gateway group.</p>
      </div>
      <span class="badge badge--ok">Signed in</span>
    </section>

    <div class="callout callout--warn" style="margin-bottom:24px">
      <span class="model-mark model-mark--claude" aria-hidden="true">
        <img src="/assets/claude-ai-symbol.svg" alt="" loading="lazy" decoding="async">
      </span>
      <div>
        <strong>Model availability:</strong>
        Due to related U.S. government policy, model <code class="inline-code">claude-opus-fable</code> is temporarily unavailable. Recovery time will be announced later.
      </div>
    </div>

    <section class="dashboard-grid">
      <div class="card card--pad-lg dashboard-card">
        <div class="cred-panel__head">
          <h2 class="cred-panel__title">API credentials</h2>
          <span class="cred-panel__hint">Do not share publicly</span>
        </div>

        <label class="field-label" for="base-url">Base URL</label>
        <div class="copy-row">
          <input id="base-url" class="field" readonly value="${escapeHtml(baseUrl)}">
          <button class="copy-btn" type="button" data-copy="#base-url" aria-label="Copy Base URL">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="copy-label">Copy</span>
          </button>
        </div>

        <div class="field-head">
          <label class="field-label" for="api-key">API Key</label>
          <button class="copy-btn" type="button" data-copy="#api-key" aria-label="Copy API Key">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="copy-label">Copy</span>
          </button>
        </div>
        <textarea id="api-key" class="field" readonly>${escapeHtml(account.apiKey || "")}</textarea>
      </div>

      <aside class="card card--pad-lg dashboard-card">
        <h2 class="result-subhead">Account access</h2>
        <dl class="info-grid">
          <dt>Discord ID</dt><dd>${escapeHtml(account.id)}</dd>
          <dt>Group</dt><dd>${escapeHtml(effectiveGroup)}</dd>
          <dt>Budget</dt><dd>${escapeHtml(formatUsd(budgetUsd))} USD per Discord account</dd>
          <dt>Used</dt><dd>${escapeHtml(formatUsd(usage.spentUsd))} USD</dd>
          <dt>Remaining</dt><dd>${escapeHtml(formatRemainingUsd(usage.remainingUsd, budgetUsd))}</dd>
          <dt>Rate</dt><dd>${escapeHtml(rpmLimit)} requests per minute</dd>
          <dt>Input limit</dt><dd>${escapeHtml(formatTokenLimit(maxInputTokens))}</dd>
          <dt>Output limit</dt><dd>${escapeHtml(formatTokenLimit(maxOutputTokens))}</dd>
          <dt>Endpoints</dt><dd>${escapeHtml(formatList(allowedEndpoints, "No endpoint"))}</dd>
          <dt>Models</dt><dd>${escapeHtml(formatList(allowedModels, "No model"))}</dd>
          <dt>Server</dt><dd>${account.guildId ? "Class-brain server verified" : "No server gate configured"}</dd>
          <dt>Resource area</dt><dd>${account.resourceChannelId ? "Public-resource area verified" : "No resource-area gate configured"}</dd>
          <dt>Key expiry</dt><dd>${escapeHtml(formatExpiry(account.keyExpiresAt))}</dd>
        </dl>
      </aside>
    </section>

    <section class="dashboard-usage-grid">
      <div class="dashboard-stat">
        <span>Used</span>
        <strong>${escapeHtml(formatUsd(usage.spentUsd))}</strong>
        <small>USD charged to this Discord account</small>
      </div>
      <div class="dashboard-stat">
        <span>Remaining</span>
        <strong>${escapeHtml(formatRemainingUsd(usage.remainingUsd, budgetUsd))}</strong>
        <small>${budgetUsd > 0 ? "Available before quota_exceeded" : "No explicit budget cap"}</small>
      </div>
      <div class="dashboard-stat">
        <span>Requests</span>
        <strong>${escapeHtml(String(usage.summary.total))}</strong>
        <small>${escapeHtml(String(usage.summary.success))} successful / ${escapeHtml(String(usage.summary.errors))} errors</small>
      </div>
      <div class="dashboard-stat">
        <span>Tokens</span>
        <strong>${escapeHtml(formatNumber(usage.summary.totalTokens))}</strong>
        <small>${escapeHtml(formatNumber(usage.summary.inputTokens))} in / ${escapeHtml(formatNumber(usage.summary.outputTokens))} out</small>
      </div>
    </section>

    <section class="card card--pad-lg dashboard-card dashboard-log-card">
      <div class="field-head">
        <div>
          <p class="eyebrow">Usage</p>
          <h2>Recent calls</h2>
          <p class="muted">Only requests billed to your Discord account are shown here. Failed requests are included when they reached the gateway.</p>
        </div>
      </div>
      <div class="table-wrap dashboard-log-wrap">
        <table class="table dashboard-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Endpoint</th>
              <th>Model</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            ${renderUserLogs(usage.logs)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="callout usage-rules" style="margin-top:24px">
      <span class="callout-icon" aria-hidden="true">!</span>
      <div>
        <strong>Usage rules:</strong>
        <ul>
          <li>Do not publicly share this site, Base URL, or API Key.</li>
          <li>Do not abuse keys through high-frequency requests, resale, bulk registration, or bypassing group limits.</li>
          <li>Do not connect keys to Codex, Claude Code, Cline, Roo Code, or similar coding workflows. Normal chat, translation, summaries, and roleplay are not affected.</li>
        </ul>
      </div>
    </section>
  </main>
  <script>document.addEventListener("DOMContentLoaded", function(){ if (window.GW) GW.bindCopyButtons(document); });</script>
</body>
</html>`;
}

async function buildDashboardUsage(account, access) {
  const budgetUsd = access ? getBudgetUsd(access) : Number(account.budgetUsd ?? process.env.DEFAULT_KEY_BUDGET_USD ?? 30);
  let spentUsd = 0;
  try {
    spentUsd = access ? await getKeySpendUsd(access) : 0;
  } catch {
    spentUsd = 0;
  }

  const logs = await getUserLogs(account.id);
  const summary = logs.reduce((acc, log) => {
    const statusCode = Number(log.statusCode || 0);
    acc.total += 1;
    acc.success += statusCode >= 200 && statusCode < 400 ? 1 : 0;
    acc.errors += statusCode >= 400 ? 1 : 0;
    acc.costUsd += Number(log.costUsd || 0) || 0;
    acc.inputTokens += Number(log.inputTokens || 0) || 0;
    acc.outputTokens += Number(log.outputTokens || 0) || 0;
    acc.totalTokens += Number(log.totalTokens || 0) || 0;
    return acc;
  }, { total: 0, success: 0, errors: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });

  return {
    budgetUsd,
    spentUsd,
    remainingUsd: budgetUsd > 0 ? Math.max(0, budgetUsd - spentUsd) : null,
    logs,
    summary,
  };
}

async function getUserLogs(userId) {
  const id = String(userId || "");
  if (!id) return [];
  try {
    const logs = await getCallLogs(500);
    return logs
      .filter((log) => {
        const billedToUser = log?.billingSubjectType === "discord_user" && String(log.billingSubjectId || "") === id;
        const legacyDiscordUser = String(log?.discordUser?.id || "") === id;
        return billedToUser || legacyDiscordUser;
      })
      .slice(0, 50);
  } catch {
    return [];
  }
}

function renderUserLogs(logs) {
  if (!logs.length) {
    return '<tr><td colspan="6" class="muted">No calls recorded for this account yet.</td></tr>';
  }
  return logs.map((log) => {
    const statusCode = Number(log.statusCode || 0);
    const statusClass = statusCode >= 200 && statusCode < 400 ? "ok" : statusCode === 429 ? "warn" : "bad";
    return '<tr>' +
      '<td><div class="log-time"><strong>' + escapeHtml(formatDate(log.time)) + '</strong><span>' + escapeHtml(formatTimeOnly(log.time)) + '</span></div></td>' +
      '<td><span class="log-chip log-chip--endpoint">' + escapeHtml(log.endpoint || "-") + '</span></td>' +
      '<td><div class="log-model-cell"><code title="' + escapeAttr(log.model || "-") + '">' + escapeHtml(log.model || formatLogModelFallback(log)) + '</code></div></td>' +
      '<td><span class="log-status-badge log-status-badge--' + statusClass + '">' + escapeHtml(String(log.statusCode || "-")) + '</span><div class="log-subtle">' + escapeHtml(log.errorCode || "ok") + '</div></td>' +
      '<td><div class="rank-metrics">' +
        '<span class="rank-metric rank-metric--current"><b>本次</b><code>$' + escapeHtml(formatUsd(log.costUsd || 0)) + '</code></span>' +
        (isFiniteNumber(log.remainingUsd) ? '<span class="rank-metric rank-metric--money"><b>剩余</b><code>$' + escapeHtml(formatUsd(log.remainingUsd)) + '</code></span>' : '') +
      '</div></td>' +
      '<td><div class="rank-metrics">' +
        '<span class="rank-metric"><b>in</b><code>' + escapeHtml(formatNumber(log.inputTokens || 0)) + '</code></span>' +
        '<span class="rank-metric"><b>out</b><code>' + escapeHtml(formatNumber(log.outputTokens || 0)) + '</code></span>' +
      '</div></td>' +
      '</tr>';
  }).join("");
}

function loginRequiredPage(message) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(BRAND)} - Login</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
  <main class="card--center">
    <div class="card card--result stack" style="width:min(520px,calc(100vw - 32px))">
      <div class="result-hero">
        <span class="badge">Account</span>
        <h1>Please log in</h1>
        <p class="result-sub">${escapeHtml(message || "Log in to open your dashboard.")}</p>
      </div>
      <div class="result-actions">
        <a class="btn btn--discord" href="/api/auth/discord/login?mode=login">Log in</a>
        <a class="btn btn--ghost" href="/api/auth/discord/login?mode=register">Register</a>
        <a class="btn btn--ghost" href="/">Back home</a>
      </div>
    </div>
  </main>
</body>
</html>`;
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

function formatExpiry(value) {
  if (!value) return "Configured by login policy";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function formatUsd(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function formatRemainingUsd(value, budgetUsd) {
  if (!(Number(budgetUsd || 0) > 0)) return "Unlimited";
  return `${formatUsd(value)} USD`;
}

function formatTokenLimit(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "No explicit limit";
  return `${Math.floor(number)} tokens`;
}

function formatList(items, emptyLabel) {
  if (!Array.isArray(items) || items.length === 0) return emptyLabel;
  return items.join(", ");
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-US");
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", { hour12: false });
}

function formatTimeOnly(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatLogModelFallback(log) {
  if (log.endpoint === "models") return "模型列表";
  if (Number(log.statusCode || 0) === 401) return "未鉴权";
  return "未记录";
}

function isFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
