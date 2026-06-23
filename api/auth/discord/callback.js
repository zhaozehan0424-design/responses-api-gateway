const { signDiscordApiKey, verifyDiscordState } = require("../../../lib/discord-auth");
const { createUserSessionCookie } = require("../../../lib/discord-session");
const {
  ensureDiscordRegistration,
  getDiscordAccount,
  isDiscordUserRegistered,
  saveDiscordAccount,
} = require("../../../lib/discord-registration");
const { BRAND } = require("../../../lib/brand");
const {
  getDiscordOAuthConfig,
  getRequestOrigin,
  isHttpsRequest,
} = require("../../../lib/discord-config");

const DISCORD_API_BASE = "https://discord.com/api/v10";
const ADMINISTRATOR = 8n;
const VIEW_CHANNEL = 1024n;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  if (isSiteClosed()) {
    sendHtml(res, 503, closedPage());
    return;
  }

  const config = getDiscordOAuthConfig(req);
  if (!config.ok) {
    sendHtml(res, config.statusCode, errorPage("Discord login is not configured", config.message));
    return;
  }

  const requestUrl = new URL(req.url || "/", getRequestOrigin(req));
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    sendHtml(res, 400, errorPage("Discord login was cancelled", oauthError));
    return;
  }

  const statePayload = verifyDiscordState(state, config.keySecret);
  const cookieNonce = parseCookies(req).discord_oauth_state;
  if (!code || !statePayload || !cookieNonce || cookieNonce !== statePayload.nonce) {
    sendHtml(res, 400, errorPage("Discord login failed", "The login state is invalid or expired. Please start again."));
    return;
  }

  const mode = statePayload.mode === "login" ? "login" : "register";
  if (mode === "register" && isRegistrationClosed()) {
    sendHtml(res, 403, errorPage("Registration is closed", "Registration is temporarily closed. Please wait for the next opening."));
    return;
  }

  try {
    const token = await exchangeCodeForToken(code, config);
    const user = await fetchDiscordUser(token.access_token);

    if (config.blockedUserIds.has(user.id)) {
      sendHtml(res, 403, errorPage("Access denied", "This Discord account is not allowed to use this API."));
      return;
    }

    let verifiedGuildId = "";
    if (config.allowedGuildId) {
      const guilds = await fetchDiscordGuilds(token.access_token);
      const isMember = guilds.some((guild) => guild.id === config.allowedGuildId);
      if (!isMember) {
        sendHtml(res, 403, errorPage("Access denied", "You must be a member of the class-brain Discord server."));
        return;
      }
      verifiedGuildId = config.allowedGuildId;
    }

    let member = null;
    if (requiresBotVerification(config)) {
      member = await fetchDiscordGuildMember(config.botToken, config.allowedGuildId, user.id);
      if (!checkAllowedRoles(member.roles || [], config.allowedRoleIds).ok) {
        sendHtml(res, 403, errorPage("Access denied", "Your Discord role is not allowed for this test."));
        return;
      }

      if (config.resourceChannelId) {
        const canViewResource = await canMemberViewResourceChannel(config, member);
        if (!canViewResource) {
          sendHtml(res, 403, errorPage("Access denied", "You need access to the public-resource area in the class-brain Discord server."));
          return;
        }
      }
    }

    const registered = await isDiscordUserRegistered(user.id);
    if (mode === "login" && !registered) {
      sendHtml(res, 403, errorPage("Account is not registered", "This Discord account has not registered yet. Please register while slots are open."));
      return;
    }

    const existingAccount = registered ? await getDiscordAccount(user.id) : null;
    const roleGroup = getRoleGroupName(member?.roles || [], config.roleGroupMap);
    const group = existingAccount?.manualGroup && existingAccount?.groupName
      ? existingAccount.groupName
      : config.groupUserMap[user.id] || roleGroup || config.defaultGroup;
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = config.keyTtlDays > 0 ? Math.floor(config.keyTtlDays * 24 * 60 * 60) : 0;
    const displayName = user.global_name || user.username || user.id;
    const expiresAt = ttlSeconds > 0 ? new Date((now + ttlSeconds) * 1000).toISOString() : null;
    const apiKey = signDiscordApiKey({
      sub: user.id,
      username: user.username || "",
      global_name: user.global_name || "",
      group,
      ...(verifiedGuildId ? { guild_id: verifiedGuildId } : {}),
      ...(config.resourceChannelId ? { resource_channel_id: config.resourceChannelId } : {}),
      iat: now,
      ...(ttlSeconds > 0 ? { exp: now + ttlSeconds } : {}),
    }, config.keySecret);

    const accountPatch = {
      id: user.id,
      username: user.username || "",
      globalName: user.global_name || "",
      avatar: user.avatar || "",
      groupName: group,
      guildId: verifiedGuildId,
      resourceChannelId: config.resourceChannelId,
      roles: member?.roles || [],
      apiKey,
      keyIssuedAt: new Date(now * 1000).toISOString(),
      keyExpiresAt: expiresAt,
    };

    let registration = { ok: true };
    if (mode === "register") {
      registration = await ensureDiscordRegistration(user, accountPatch);
      if (!registration.ok) {
        const message = registration.code === "registration_limit_exceeded"
          ? `Registration is full: ${registration.count}/${registration.limit}. More slots will open later.`
          : registration.message;
        sendHtml(res, 403, errorPage("Registration is full", message));
        return;
      }
    } else {
      await saveDiscordAccount(user.id, accountPatch);
    }

    const account = await saveDiscordAccount(user.id, {
      ...accountPatch,
      displayName,
      registrationCount: registration.count || undefined,
      registrationLimit: registration.limit || undefined,
    });

    res.setHeader("set-cookie", [
      clearStateCookie(req),
      createUserSessionCookie(req, account),
    ]);

    if (requestUrl.searchParams.get("format") === "json") {
      sendJson(res, 200, {
        ok: true,
        mode,
        dashboard_url: `${getRequestOrigin(req)}/dashboard`,
        base_url: `${getRequestOrigin(req)}/v1`,
        group,
        discord_user: {
          id: user.id,
          username: user.username || "",
          global_name: user.global_name || "",
        },
        registered: true,
        registration: registration.limit ? {
          count: registration.count,
          limit: registration.limit,
        } : null,
        expires_at: expiresAt,
      });
      return;
    }

    res.statusCode = 303;
    res.setHeader("location", "/dashboard");
    res.end();
  } catch (error) {
    sendHtml(res, 502, errorPage("Discord login failed", error.publicMessage || "Unable to complete Discord login right now."));
  }
};

async function exchangeCodeForToken(code, config) {
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = new Error("Discord token exchange failed");
    error.publicMessage = "Discord rejected the login callback. Check the redirect URI in your Discord application.";
    throw error;
  }

  return response.json();
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = new Error("Discord user fetch failed");
    error.publicMessage = "Discord login succeeded, but the account profile could not be read.";
    throw error;
  }

  return response.json();
}

async function fetchDiscordGuilds(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = new Error("Discord guild fetch failed");
    error.publicMessage = "Discord login succeeded, but server membership could not be checked.";
    throw error;
  }

  return response.json();
}

async function fetchDiscordGuildMember(botToken, guildId, userId) {
  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
    headers: { authorization: `Bot ${botToken}` },
  });

  if (!response.ok) {
    const error = new Error(`Discord member fetch failed: ${response.status}`);
    error.publicMessage = "Discord login succeeded, but your community membership could not be verified.";
    throw error;
  }

  return response.json();
}

async function fetchDiscordChannel(botToken, channelId) {
  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}`, {
    headers: { authorization: `Bot ${botToken}` },
  });

  if (!response.ok) {
    const error = new Error(`Discord channel fetch failed: ${response.status}`);
    error.publicMessage = "The resource area could not be verified. Check DISCORD_RESOURCE_CHANNEL_ID and bot permissions.";
    throw error;
  }

  return response.json();
}

async function fetchDiscordGuildRoles(botToken, guildId) {
  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
    headers: { authorization: `Bot ${botToken}` },
  });

  if (!response.ok) {
    const error = new Error(`Discord role fetch failed: ${response.status}`);
    error.publicMessage = "Role permissions could not be verified. Check the bot permissions.";
    throw error;
  }

  return response.json();
}

async function canMemberViewResourceChannel(config, member) {
  const channel = await fetchDiscordChannel(config.botToken, config.resourceChannelId);
  const roles = await fetchDiscordGuildRoles(config.botToken, config.allowedGuildId);
  const base = getBaseViewPermission(config.allowedGuildId, member.roles || [], roles);
  if (base.admin) return true;

  const channels = [];
  if (channel.parent_id) {
    try {
      channels.push(await fetchDiscordChannel(config.botToken, channel.parent_id));
    } catch {
      // Direct channel overwrites can still decide access.
    }
  }
  channels.push(channel);
  return channels.reduce((canView, item) => applyChannelOverwrites(canView, item, member, config.allowedGuildId), base.canView);
}

function getBaseViewPermission(guildId, memberRoleIds, guildRoles) {
  const userRoleIds = new Set([String(guildId), ...(memberRoleIds || []).map(String)]);
  let permissions = 0n;
  for (const role of Array.isArray(guildRoles) ? guildRoles : []) {
    if (userRoleIds.has(String(role.id))) permissions |= permissionsBigInt(role.permissions);
  }
  return {
    admin: (permissions & ADMINISTRATOR) === ADMINISTRATOR,
    canView: (permissions & VIEW_CHANNEL) === VIEW_CHANNEL,
  };
}

function applyChannelOverwrites(initialCanView, channel, member, guildId) {
  const overwrites = Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [];
  const roles = new Set([guildId, ...(member.roles || []).map(String)]);
  let canView = initialCanView;

  const everyone = overwrites.find((overwrite) => String(overwrite.id) === String(guildId) && String(overwrite.type) === "0");
  canView = applyOverwrite(canView, everyone);

  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of overwrites) {
    if (String(overwrite.type) !== "0" || !roles.has(String(overwrite.id)) || String(overwrite.id) === String(guildId)) continue;
    roleDeny |= permissionsBigInt(overwrite.deny);
    roleAllow |= permissionsBigInt(overwrite.allow);
  }
  if ((roleDeny & VIEW_CHANNEL) === VIEW_CHANNEL) canView = false;
  if ((roleAllow & VIEW_CHANNEL) === VIEW_CHANNEL) canView = true;

  const memberOverwrite = overwrites.find((overwrite) => String(overwrite.id) === String(member.user?.id || member.user_id || "") && String(overwrite.type) === "1");
  return applyOverwrite(canView, memberOverwrite);
}

function applyOverwrite(current, overwrite) {
  if (!overwrite) return current;
  const deny = permissionsBigInt(overwrite.deny);
  const allow = permissionsBigInt(overwrite.allow);
  if ((deny & VIEW_CHANNEL) === VIEW_CHANNEL) return false;
  if ((allow & VIEW_CHANNEL) === VIEW_CHANNEL) return true;
  return current;
}

function permissionsBigInt(value) {
  try {
    return BigInt(String(value || "0"));
  } catch {
    return 0n;
  }
}

function checkAllowedRoles(memberRoles, allowedRoleIds) {
  if (!allowedRoleIds.length) return { ok: true };
  const roles = new Set((memberRoles || []).map(String));
  return { ok: allowedRoleIds.some((roleId) => roles.has(String(roleId))) };
}

function getRoleGroupName(memberRoles, roleGroupMap) {
  const roles = new Set((memberRoles || []).map(String));
  for (const [roleId, groupName] of Object.entries(roleGroupMap || {})) {
    if (roles.has(String(roleId)) && String(groupName || "").trim()) return String(groupName).trim();
  }
  return "";
}

function requiresBotVerification(config) {
  return Boolean(
    config.botToken &&
    (config.resourceChannelId || config.allowedRoleIds.length > 0 || Object.keys(config.roleGroupMap || {}).length > 0)
  );
}

function isRegistrationClosed() {
  return ["1", "true", "yes", "on"].includes(String(process.env.DISCORD_REGISTRATION_CLOSED || "").toLowerCase());
}

function isSiteClosed() {
  return ["1", "true", "yes", "on"].includes(String(process.env.SITE_CLOSED || "").toLowerCase());
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

function clearStateCookie(req) {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  return [
    "discord_oauth_state=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure,
  ].filter(Boolean).join("; ");
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
    <div class="card card--result stack" style="width:min(520px,calc(100vw - 32px))">
      <div class="result-hero">
        <div class="result-x" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </div>
        <span class="badge badge--danger">Login not completed</span>
        <h1>${escapeHtml(title)}</h1>
        <p class="result-sub">${escapeHtml(message)}</p>
      </div>
      <div class="result-actions">
        <a class="btn btn--discord" href="/api/auth/discord/login?mode=register">Register</a>
        <a class="btn btn--ghost" href="/api/auth/discord/login?mode=login">Log in</a>
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
