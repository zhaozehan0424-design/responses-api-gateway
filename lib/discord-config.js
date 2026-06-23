const DISCORD_ID_PATTERN = /^\d{5,30}$/;
const GROUP_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const CALLBACK_PATH = "/api/auth/discord/callback";

function getDiscordOAuthConfig(req) {
  const errors = [];
  const origin = getRequestOrigin(req);
  const clientId = stringEnv("DISCORD_CLIENT_ID");
  const clientSecret = stringEnv("DISCORD_CLIENT_SECRET");
  const keySecret = stringEnv("DISCORD_KEY_SECRET") || stringEnv("SESSION_SECRET");
  const allowedGuildId = stringEnv("DISCORD_ALLOWED_GUILD_ID");
  const resourceChannelId = stringEnv("DISCORD_RESOURCE_CHANNEL_ID");
  const allowedRoleIds = csvEnv("DISCORD_ALLOWED_ROLE_IDS");
  const roleGroupMap = jsonObjectEnv("DISCORD_ROLE_GROUP_MAP_JSON", errors) || {};
  const groupUserMap = jsonObjectEnv("DISCORD_GROUP_USER_MAP_JSON", errors) || {};
  const blockedUserIds = csvEnv("DISCORD_BLOCKED_USER_IDS");
  const botToken = stringEnv("DISCORD_BOT_TOKEN");
  const defaultGroup = stringEnv("DISCORD_DEFAULT_GROUP") || "guest";
  const keyTtlDays = numberEnv("DISCORD_KEY_TTL_DAYS", 30, errors, { min: 0 });
  const redirectUri = resolveRedirectUri(req, origin, errors);

  requireEnv("DISCORD_CLIENT_ID", clientId, errors);
  requireEnv("DISCORD_CLIENT_SECRET", clientSecret, errors);
  requireEnv("DISCORD_KEY_SECRET or SESSION_SECRET", keySecret, errors);

  validateDiscordId("DISCORD_CLIENT_ID", clientId, errors);
  validateDiscordId("DISCORD_ALLOWED_GUILD_ID", allowedGuildId, errors);
  validateDiscordId("DISCORD_RESOURCE_CHANNEL_ID", resourceChannelId, errors);
  validateDiscordIdList("DISCORD_ALLOWED_ROLE_IDS", allowedRoleIds, errors);
  validateDiscordIdList("DISCORD_BLOCKED_USER_IDS", blockedUserIds, errors);
  validateDiscordIdMapKeys("DISCORD_ROLE_GROUP_MAP_JSON", roleGroupMap, errors);
  validateDiscordIdMapKeys("DISCORD_GROUP_USER_MAP_JSON", groupUserMap, errors);
  validateGroupName("DISCORD_DEFAULT_GROUP", defaultGroup, errors);
  validateGroupMapValues("DISCORD_ROLE_GROUP_MAP_JSON", roleGroupMap, errors);
  validateGroupMapValues("DISCORD_GROUP_USER_MAP_JSON", groupUserMap, errors);

  const advancedGateEnabled =
    Boolean(resourceChannelId) ||
    allowedRoleIds.length > 0 ||
    Object.keys(roleGroupMap).length > 0;

  if (advancedGateEnabled && !allowedGuildId) {
    errors.push("DISCORD_ALLOWED_GUILD_ID is required when role, role-to-group, or resource-area checks are enabled.");
  }

  if (advancedGateEnabled && !botToken) {
    errors.push("DISCORD_BOT_TOKEN is required to verify Discord roles, role-to-group mapping, or resource-area access.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      statusCode: 500,
      message: formatConfigErrors(errors),
      errors,
    };
  }

  return {
    ok: true,
    clientId,
    clientSecret,
    keySecret,
    redirectUri,
    allowedGuildId,
    resourceChannelId,
    botToken,
    allowedRoleIds,
    roleGroupMap,
    blockedUserIds: new Set(blockedUserIds),
    defaultGroup,
    groupUserMap,
    keyTtlDays,
  };
}

function resolveRedirectUri(req, origin, errors) {
  const explicit = stringEnv("DISCORD_REDIRECT_URI");
  const redirectUri = explicit || `${origin}${CALLBACK_PATH}`;
  let parsed;

  try {
    parsed = new URL(redirectUri);
  } catch {
    errors.push("DISCORD_REDIRECT_URI must be an absolute URL such as https://your-domain.example/api/auth/discord/callback.");
    return redirectUri;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    errors.push("DISCORD_REDIRECT_URI must use http:// for localhost or https:// for production.");
  }

  if (parsed.protocol === "http:" && !isLocalhost(parsed.hostname)) {
    errors.push("DISCORD_REDIRECT_URI must use https:// unless it points to localhost for local testing.");
  }

  if (parsed.pathname.replace(/\/+$/, "") !== CALLBACK_PATH) {
    errors.push(`DISCORD_REDIRECT_URI must point to ${CALLBACK_PATH}. Add the exact same URL in the Discord Developer Portal OAuth2 redirects.`);
  }

  const requestHost = new URL(origin).host;
  if (explicit && parsed.host !== requestHost && !isLocalhost(parsed.hostname) && !isLocalhost(requestHost.split(":")[0])) {
    errors.push(`DISCORD_REDIRECT_URI host (${parsed.host}) differs from the request host (${requestHost}). Set it to the exact public deployment URL registered in Discord.`);
  }

  return parsed.toString();
}

function getRequestOrigin(req) {
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host || "localhost";
  const protocol = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0] || (String(host).includes("localhost") ? "http" : "https");
  return `${protocol}://${String(host).split(",")[0]}`;
}

function isHttpsRequest(req) {
  const protocol = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0];
  return protocol === "https" || (!protocol && !String(req?.headers?.host || "").includes("localhost"));
}

function formatConfigErrors(errors) {
  const unique = Array.from(new Set(errors.map((error) => String(error || "").trim()).filter(Boolean)));
  return `Discord OAuth configuration error: ${unique.join(" ")}`;
}

function requireEnv(name, value, errors) {
  if (!value) errors.push(`${name} is required.`);
}

function stringEnv(name) {
  return String(process.env[name] || "").trim();
}

function csvEnv(name) {
  return stringEnv(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function jsonObjectEnv(name, errors) {
  const value = stringEnv(name);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`${name} must be a JSON object.`);
      return null;
    }
    return parsed;
  } catch (error) {
    errors.push(`${name} must be valid JSON: ${error.message}`);
    return null;
  }
}

function numberEnv(name, fallback, errors, options = {}) {
  const value = stringEnv(name);
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    errors.push(`${name} must be a number.`);
    return fallback;
  }
  if (options.min !== undefined && number < options.min) {
    errors.push(`${name} must be greater than or equal to ${options.min}.`);
    return fallback;
  }
  return number;
}

function validateDiscordId(name, value, errors) {
  if (value && !DISCORD_ID_PATTERN.test(value)) {
    errors.push(`${name} must be a Discord snowflake ID containing only digits.`);
  }
}

function validateDiscordIdList(name, values, errors) {
  for (const value of values) {
    validateDiscordId(name, value, errors);
  }
}

function validateDiscordIdMapKeys(name, value, errors) {
  for (const key of Object.keys(value || {})) {
    validateDiscordId(name, key, errors);
  }
}

function validateGroupName(name, value, errors) {
  if (value && !GROUP_NAME_PATTERN.test(String(value))) {
    errors.push(`${name} must be 1-64 characters using letters, numbers, dots, underscores, or hyphens.`);
  }
}

function validateGroupMapValues(name, value, errors) {
  for (const groupName of Object.values(value || {})) {
    validateGroupName(name, groupName, errors);
  }
}

function isLocalhost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(String(hostname || "").toLowerCase());
}

module.exports = {
  CALLBACK_PATH,
  getDiscordOAuthConfig,
  getRequestOrigin,
  isHttpsRequest,
};
