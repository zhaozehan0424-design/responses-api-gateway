const crypto = require("node:crypto");
const { verifyDiscordApiKey } = require("./discord-auth");
const { getDiscordAccount, getDiscordRevokedAfter, isDiscordUserRegistered } = require("./discord-registration");

const DEFAULT_MODEL_PRICES_USD_PER_MTOK = {
  "claude-opus-fable": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5-20251101": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

const DEFAULT_MODEL_IDS = Object.keys(DEFAULT_MODEL_PRICES_USD_PER_MTOK);

const IMPLICIT_OUTPUT_TOKEN_LIMIT = 64_000;

const config = {
  upstreamBase: requiredEnv("UPSTREAM_API_BASE").replace(/\/+$/, ""),
  upstreamKey: requiredEnv("UPSTREAM_API_KEY"),
  downstreamKeys: csvEnv("DOWNSTREAM_API_KEYS"),
  antigravityBase: optionalBaseUrl("ANTIGRAVITY_API_BASE"),
  antigravityKey: process.env.ANTIGRAVITY_API_KEY || "",
  antigravityModelIds: csvEnv("ANTIGRAVITY_MODEL_IDS"),
  modelAllowlist: buildModelAllowlist(csvEnv("MODEL_ALLOWLIST"), csvEnv("ANTIGRAVITY_MODEL_IDS")),
  modelPrices: buildModelPrices(jsonEnv("MODEL_PRICES_JSON")),
  rpmLimit: Number(process.env.RPM_LIMIT || 4),
  groupsConfig: jsonEnv("GATEWAY_GROUPS_JSON"),
  keysConfig: jsonEnv("GATEWAY_KEYS_JSON"),
  blockedKeyHashes: csvEnv("GATEWAY_BLOCKED_KEY_HASHES"),
  defaultKeyBudgetUsd: Number(process.env.DEFAULT_KEY_BUDGET_USD || 30),
  guestExcludedModels: csvEnv("GUEST_EXCLUDED_MODELS").length > 0 ? csvEnv("GUEST_EXCLUDED_MODELS") : ["claude-opus-fable"],
  discordKeySecret: process.env.DISCORD_KEY_SECRET || process.env.SESSION_SECRET || "",
  discordDefaultGroup: process.env.DISCORD_DEFAULT_GROUP || "guest",
  discordGroupUserMap: jsonEnv("DISCORD_GROUP_USER_MAP_JSON") || {},
  discordBlockedUserIds: csvEnv("DISCORD_BLOCKED_USER_IDS"),
  discordAllowedGuildId: process.env.DISCORD_ALLOWED_GUILD_ID || "",
  discordResourceChannelId: process.env.DISCORD_RESOURCE_CHANNEL_ID || "",
  discordAllowLegacyKeys: process.env.DISCORD_ALLOW_LEGACY_KEYS !== "false",
  corsAllowOrigin: process.env.CORS_ALLOW_ORIGIN || "*",
  adminToken: process.env.ADMIN_TOKEN || "",
  callLogLimit: Number(process.env.CALL_LOG_LIMIT || 500),
  callLogKey: process.env.CALL_LOG_KEY || "gateway:call_logs",
  kvRestApiUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  kvRestApiToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
  costLedgerKeyPrefix: process.env.COST_LEDGER_KEY_PREFIX || "gateway:cost:",
  maxRequestCostUsd: Number(process.env.MAX_REQUEST_COST_USD || 0),
};

const modelSet = new Set(config.modelAllowlist);
const antigravityRawModelSet = new Set(config.antigravityModelIds);
const accessControl = buildAccessControl(config);
const discordBlockedUserSet = new Set(config.discordBlockedUserIds);
const blockedKeyHashSet = new Set(config.blockedKeyHashes);
const rateBuckets = globalThis.__gatewayRateBuckets || new Map();
globalThis.__gatewayRateBuckets = rateBuckets;
const memoryCallLogs = globalThis.__gatewayCallLogs || [];
globalThis.__gatewayCallLogs = memoryCallLogs;
const memoryCostLedger = globalThis.__gatewayCostLedger || new Map();
globalThis.__gatewayCostLedger = memoryCostLedger;

if (accessControl.keys.size === 0 && !config.discordKeySecret) {
  throw new Error("At least one downstream key or DISCORD_KEY_SECRET must be configured.");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function csvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim().replace(/^"(.*)"$/, "$1").trim())
    .filter(Boolean);
}

function optionalBaseUrl(name) {
  const value = String(process.env[name] || "").trim();
  return value ? value.replace(/\/+$/, "") : "";
}

function buildModelAllowlist(baseModels, antigravityModels) {
  const officialModels = baseModels.length > 0 ? baseModels : DEFAULT_MODEL_IDS;
  return sortModelsForDisplay(uniqueStrings([
    ...officialModels,
    ...antigravityModels.map(toPublicAntigravityModelId),
  ]));
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function sortModelsForDisplay(models) {
  return [...models].sort((a, b) => {
    const groupDiff = getModelDisplayGroup(a) - getModelDisplayGroup(b);
    if (groupDiff !== 0) return groupDiff;
    return String(a).localeCompare(String(b), "en");
  });
}

function getModelDisplayGroup(model) {
  const id = String(model || "").toLowerCase();
  if (id.startsWith("claude-")) return 0;
  if (id.startsWith("agy-claude-")) return 1;
  if (id.includes("gemini")) return 2;
  return 3;
}

function jsonEnv(name) {
  const value = process.env[name];
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error.message}`);
  }
}

function parseBearer(value) {
  const match = String(value || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function setCors(res) {
  res.setHeader("access-control-allow-origin", config.corsAllowOrigin);
  res.setHeader("access-control-allow-headers", "authorization,content-type,accept");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(statusCode).json(withErrorCode(statusCode, payload));
}

function withErrorCode(statusCode, payload) {
  if (!payload || typeof payload !== "object" || !payload.error || typeof payload.error !== "object") {
    return payload;
  }
  if (payload.error.code) return payload;
  return {
    ...payload,
    error: {
      ...payload.error,
      code: defaultErrorCode(statusCode),
    },
  };
}

function defaultErrorCode(statusCode) {
  if (statusCode === 400) return "invalid_request";
  if (statusCode === 401) return "invalid_api_key";
  if (statusCode === 402) return "quota_exceeded";
  if (statusCode === 403) return "access_denied";
  if (statusCode === 405) return "method_not_allowed";
  if (statusCode === 429) return "rate_limit_exceeded";
  if (statusCode === 502) return "upstream_request_failed";
  if (statusCode === 504) return "upstream_request_timed_out";
  return "request_failed";
}

async function requireDownstreamAuth(req, res) {
  const downstreamKey = parseBearer(req.headers.authorization);
  const downstreamKeyHash = hashKey(downstreamKey);

  if (downstreamKeyHash && blockedKeyHashSet.has(downstreamKeyHash)) {
    await recordCallLog(req, {
      endpoint: inferEndpoint(req),
      errorCode: "access_denied",
      key: downstreamKey || "",
      statusCode: 403,
    });
    sendJson(res, 403, { error: { message: "This API key is blocked", code: "access_denied" } });
    return false;
  }

  let access = null;
  try {
    access = downstreamKey ? await getAccessForKey(downstreamKey) : null;
  } catch (error) {
    await recordCallLog(req, {
      endpoint: inferEndpoint(req),
      errorCode: "registration_store_unavailable",
      key: downstreamKey || "",
      statusCode: 503,
    });
    sendJson(res, 503, {
      error: {
        message: error.message || "Registration store is unavailable",
        code: "registration_store_unavailable",
      },
    });
    return false;
  }

  if (access && access.blocked) {
    await recordCallLog(req, {
      access,
      endpoint: inferEndpoint(req),
      errorCode: "access_denied",
      statusCode: 403,
    });
    sendJson(res, 403, { error: { message: access.message || "API key is blocked", code: "access_denied" } });
    return false;
  }

  if (!access || !access.enabled) {
    await recordCallLog(req, {
      endpoint: inferEndpoint(req),
      errorCode: "invalid_api_key",
      key: downstreamKey || "",
      statusCode: 401,
    });
    sendJson(res, 401, { error: { message: "Invalid API key", code: "invalid_api_key" } });
    return false;
  }

  const rateLimit = checkRateLimit(access);
  if (rateLimit.limited) {
    await recordCallLog(req, {
      access,
      endpoint: inferEndpoint(req),
      errorCode: "rate_limit_exceeded",
      statusCode: 429,
    });
    res.setHeader("retry-after", String(rateLimit.retryAfterSeconds));
    sendJson(res, 429, {
      error: {
        message: `Rate limit exceeded: max ${getRpmLimit(access)} requests per minute`,
        code: "rate_limit_exceeded",
      },
    });
    return false;
  }

  let quota;
  try {
    quota = await checkCostQuota(access);
  } catch (error) {
    sendJson(res, 503, {
      error: {
        message: "Quota store is unavailable",
        code: "quota_store_unavailable",
      },
    });
    return false;
  }
  if (quota.exceeded) {
    await recordCallLog(req, {
      access,
      endpoint: inferEndpoint(req),
      errorCode: "quota_exceeded",
      statusCode: 402,
      quota,
    });
    sendJson(res, 402, {
      error: {
        message: access.legacyDiscordKey
          ? `Legacy API key quota exhausted: spent $${formatUsd(quota.spentUsd)} of $${formatUsd(quota.budgetUsd)}. Please register and log in again.`
          : `Quota exceeded: spent $${formatUsd(quota.spentUsd)} of $${formatUsd(quota.budgetUsd)}`,
        code: "quota_exceeded",
      },
    });
    return false;
  }

  req.gatewayAccess = access;
  return access;
}

async function getAccessForKey(key) {
  const staticAccess = accessControl.keys.get(key);
  if (staticAccess) return staticAccess;
  return getDiscordAccessForKey(key);
}

async function getDiscordAccessForKey(key) {
  if (!config.discordKeySecret) return null;

  const payload = verifyDiscordApiKey(key, config.discordKeySecret);
  if (!payload) return null;

  const discordUserId = String(payload.sub || "");
  if (!discordUserId) return null;

  if (discordBlockedUserSet.has(discordUserId)) {
    return {
      key,
      enabled: false,
      blocked: true,
      message: "This Discord account is not allowed to use this API.",
    };
  }

  const registered = await isDiscordUserRegistered(discordUserId);
  const revokedAfter = await getDiscordRevokedAfter(discordUserId);
  if (isDiscordKeyRevoked(payload, revokedAfter)) {
    return {
      key,
      enabled: false,
      blocked: true,
      message: "This API key was revoked by an administrator. Please register again when slots are open.",
    };
  }

  const account = registered ? await getDiscordAccount(discordUserId) : null;
  const staleKey = registered && account && !isCurrentDiscordKey(payload, account);
  const missingGuildClaim = config.discordAllowedGuildId && !payload.guild_id;
  const wrongGuildClaim = config.discordAllowedGuildId && payload.guild_id && payload.guild_id !== config.discordAllowedGuildId;
  const missingResourceClaim = config.discordResourceChannelId && !payload.resource_channel_id;
  const wrongResourceClaim = config.discordResourceChannelId &&
    payload.resource_channel_id &&
    payload.resource_channel_id !== config.discordResourceChannelId;
  const legacyDiscordKey = !registered || missingGuildClaim || missingResourceClaim;

  if (wrongGuildClaim || (missingGuildClaim && !config.discordAllowLegacyKeys)) {
    return {
      key,
      enabled: false,
      blocked: true,
      message: "This API key is not valid for the required Discord server.",
    };
  }

  if (wrongResourceClaim || (missingResourceClaim && !config.discordAllowLegacyKeys)) {
    return {
      key,
      enabled: false,
      blocked: true,
      message: "This API key was not issued for the required Discord resource area. Please log in again.",
    };
  }

  if (!registered && !config.discordAllowLegacyKeys) {
    return {
      key,
      enabled: false,
      blocked: true,
      message: "This Discord account is not registered. Please register and log in again while registration is open.",
    };
  }

  if (staleKey) {
    return {
      key,
      enabled: false,
      blocked: true,
      message: "This API key is no longer current. Please log in again to get a new key.",
    };
  }

  const requestedGroupName = getDiscordGroupName(discordUserId, payload, account);
  const group = accessControl.groups.get(requestedGroupName) || accessControl.defaultGroup;
  const userLimits = getDiscordUserLimits(account);

  return {
    key,
    name: `discord:${discordUserId}`,
    groupName: group.name,
    group,
    limits: userLimits,
    enabled: true,
    registered,
    legacyDiscordKey,
    discordUser: {
      id: discordUserId,
      username: account?.username || payload.username || "",
      globalName: account?.globalName || payload.global_name || "",
      displayName: account?.displayName || account?.globalName || payload.global_name || account?.username || payload.username || discordUserId,
      avatar: account?.avatar || "",
      avatarUrl: buildDiscordAvatarUrl(discordUserId, account?.avatar || ""),
    },
  };
}

function getDiscordUserLimits(account) {
  return {
    budgetUsd: normalizeOptionalNonNegativeNumber(account?.budgetUsd),
    maxInputTokens: normalizeOptionalNonNegativeInteger(account?.maxInputTokens),
    maxOutputTokens: normalizeOptionalNonNegativeInteger(account?.maxOutputTokens),
  };
}

function isCurrentDiscordKey(payload, account) {
  const issuedAt = Date.parse(account?.keyIssuedAt || "");
  if (!Number.isFinite(issuedAt)) return true;
  const payloadIssuedAt = Number(payload?.iat || 0) * 1000;
  return payloadIssuedAt > 0 && Math.abs(payloadIssuedAt - issuedAt) < 1000;
}

function isDiscordKeyRevoked(payload, revokedAfter) {
  const revokedAt = Date.parse(revokedAfter || "");
  if (!Number.isFinite(revokedAt)) return false;
  const payloadIssuedAt = Number(payload?.iat || 0) * 1000;
  return !payloadIssuedAt || payloadIssuedAt <= revokedAt;
}

function getDiscordGroupName(discordUserId, payload, account) {
  const mappedGroup = config.discordGroupUserMap && typeof config.discordGroupUserMap === "object"
    ? config.discordGroupUserMap[discordUserId]
    : "";
  return String(mappedGroup || account?.groupName || account?.group || payload.group || config.discordDefaultGroup || accessControl.defaultGroup.name).trim();
}

function isAllowedModel(model) {
  return modelSet.size === 0 || modelSet.has(model);
}

function toPublicAntigravityModelId(model) {
  const id = String(model || "").trim();
  return id;
}

function isAntigravityModel(model) {
  const id = String(model || "").trim();
  if (!id || !config.antigravityBase || !config.antigravityKey) return false;
  return antigravityRawModelSet.has(id);
}

function getUpstreamForModel(model) {
  if (isAntigravityModel(model)) {
    return {
      base: config.antigravityBase,
      key: config.antigravityKey,
      model: String(model || ""),
      channel: "antigravity",
    };
  }
  return {
    base: config.upstreamBase,
    key: config.upstreamKey,
    model: String(model || ""),
    channel: "primary",
  };
}

function checkRateLimit(access) {
  const limit = getRpmLimit(access);
  const subjectId = getRateLimitSubjectId(access);
  if (!subjectId || !Number.isFinite(limit) || limit <= 0) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;
  const bucketKey = `${subjectId}:${windowStart}`;
  const current = rateBuckets.get(bucketKey) || 0;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + 60000 - now) / 1000));

  if (current >= limit) {
    cleanupRateBuckets(windowStart);
    return { limited: true, retryAfterSeconds };
  }

  rateBuckets.set(bucketKey, current + 1);
  cleanupRateBuckets(windowStart);
  return { limited: false, retryAfterSeconds: 0 };
}

function getRateLimitSubjectId(access) {
  return getBillingLedgerId(access) || (access?.key ? `api_key:${hashKey(access.key)}` : "");
}

function getRpmLimit(access) {
  const groupLimit = Number(access?.group?.rpmLimit ?? config.rpmLimit);
  if (Number.isFinite(groupLimit) && groupLimit >= 0) return groupLimit;
  return Number.isFinite(config.rpmLimit) && config.rpmLimit >= 0 ? config.rpmLimit : 4;
}

function cleanupRateBuckets(currentWindowStart) {
  for (const oldKey of rateBuckets.keys()) {
    const oldWindow = Number(oldKey.split(":").at(-1));
    if (Number.isFinite(oldWindow) && oldWindow < currentWindowStart - 60000) {
      rateBuckets.delete(oldKey);
    }
  }
}

function getAllowedModels(access) {
  const groupModels = access?.group?.models;
  if (Array.isArray(groupModels) && groupModels.length > 0) return groupModels;
  return config.modelAllowlist;
}

function getAllowedEndpoints(access) {
  const groupEndpoints = access?.group?.endpoints;
  if (Array.isArray(groupEndpoints) && groupEndpoints.length > 0) return groupEndpoints;
  return accessControl.defaultGroup.endpoints;
}

async function enforceAccessPolicy(req, res, endpoint, body) {
  const access = req.gatewayAccess;
  if (!access) {
    await recordCallLog(req, { endpoint, errorCode: "invalid_api_key", statusCode: 401, body });
    sendJson(res, 401, { error: { message: "Invalid API key", code: "invalid_api_key" } });
    return false;
  }

  const group = access.group || accessControl.defaultGroup;
  const allowedEndpoints = Array.isArray(group.endpoints) && group.endpoints.length > 0
    ? group.endpoints
    : accessControl.defaultGroup.endpoints;

  if (!allowedEndpoints.includes(endpoint)) {
    await recordCallLog(req, { access, endpoint, errorCode: "endpoint_not_allowed", statusCode: 403, body });
    sendJson(res, 403, {
      error: {
        message: `Endpoint is not allowed for group ${access.groupName}: ${endpoint}`,
        code: "endpoint_not_allowed",
      },
    });
    return false;
  }

  if (body && typeof body.model === "string") {
    const allowedModels = getAllowedModels(access);
    if (allowedModels.length > 0 && !allowedModels.includes(body.model)) {
      await recordCallLog(req, { access, endpoint, errorCode: "model_not_allowed", statusCode: 403, body });
      sendJson(res, 403, {
        error: {
          message: `Model is not allowed for group ${access.groupName}: ${body.model}`,
          code: "model_not_allowed",
        },
      });
      return false;
    }
  }

  if (body?.stream === true && group.allowStream === false) {
    await recordCallLog(req, { access, endpoint, errorCode: "stream_not_allowed", statusCode: 403, body });
    sendJson(res, 403, {
      error: {
        message: `Streaming is not allowed for group ${access.groupName}`,
        code: "stream_not_allowed",
      },
    });
    return false;
  }

  const maxInputTokens = getMaxInputTokens(access);
  const estimatedInputTokens = estimateInputTokens(body);
  if (maxInputTokens > 0 && estimatedInputTokens > maxInputTokens) {
    await recordCallLog(req, {
      access,
      endpoint,
      errorCode: "max_input_tokens_exceeded",
      estimatedInputTokens,
      statusCode: 403,
      body,
    });
    sendJson(res, 403, {
      error: {
        message: `Estimated input tokens exceed account limit (${estimatedInputTokens} > ${maxInputTokens})`,
        code: "max_input_tokens_exceeded",
      },
    });
    return false;
  }

  const maxOutputTokens = getMaxOutputTokens(access);
  const requestedOutputTokens = getRequestedOutputTokens(body);
  if (maxOutputTokens > 0 && requestedOutputTokens > maxOutputTokens) {
    await recordCallLog(req, { access, endpoint, errorCode: "max_output_tokens_exceeded", statusCode: 403, body });
    sendJson(res, 403, {
      error: {
        message: `Requested output tokens exceed group limit (${requestedOutputTokens} > ${maxOutputTokens})`,
        code: "max_output_tokens_exceeded",
      },
    });
    return false;
  }
  if (maxOutputTokens > 0 && requestedOutputTokens <= 0 && body && typeof body === "object") {
    setOutputTokenLimit(body, endpoint, getRequestedOutputTokenKey(body), maxOutputTokens);
  }

  const costLimit = applyRequestCostLimit(body, endpoint, group);
  if (!costLimit.ok) {
    await recordCallLog(req, {
      access,
      endpoint,
      errorCode: "request_cost_limit_exceeded",
      estimatedCostUsd: costLimit.estimatedCost.usd,
      statusCode: 402,
      body,
    });
    sendJson(res, 402, {
      error: {
        message: `Estimated request cost $${formatUsd(costLimit.estimatedCost.usd)} exceeds per-request limit $${formatUsd(costLimit.maxRequestCostUsd)}`,
        code: "request_cost_limit_exceeded",
      },
    });
    return false;
  }

  const estimatedCost = costLimit.estimatedCost;
  const maxRequestCostUsd = getMaxRequestCostUsd();
  if (maxRequestCostUsd > 0 && estimatedCost.usd > maxRequestCostUsd) {
    await recordCallLog(req, {
      access,
      endpoint,
      errorCode: "request_cost_limit_exceeded",
      estimatedCostUsd: estimatedCost.usd,
      statusCode: 402,
      body,
    });
    sendJson(res, 402, {
      error: {
        message: `Estimated request cost $${formatUsd(estimatedCost.usd)} exceeds per-request limit $${formatUsd(maxRequestCostUsd)}`,
        code: "request_cost_limit_exceeded",
      },
    });
    return false;
  }

  const reservationUsd = getQuotaReservationUsd(endpoint, body, estimatedCost);
  if (reservationUsd > 0) {
    let reservation;
    try {
      reservation = await reserveCostQuota(access, reservationUsd);
    } catch (error) {
      sendJson(res, 503, {
        error: {
          message: "Quota store is unavailable",
          code: "quota_store_unavailable",
        },
      });
      return false;
    }

    if (!reservation.ok) {
      const quota = {
        spentUsd: reservation.spentUsd,
        budgetUsd: reservation.budgetUsd,
        remainingUsd: reservation.remainingUsd,
      };
      await recordCallLog(req, {
        access,
        endpoint,
        errorCode: "quota_exceeded",
        estimatedCostUsd: estimatedCost.usd,
        statusCode: 402,
        body,
        quota,
      });
      sendJson(res, 402, {
        error: {
          message: `Quota exceeded: remaining $${formatUsd(reservation.remainingUsd)} is below the reserved request amount $${formatUsd(reservationUsd)}`,
          code: "quota_exceeded",
        },
      });
      return false;
    }

    req.gatewayCostReservation = reservation;
  }

  return true;
}

async function recordCallLog(req, details) {
  const body = details?.body && typeof details.body === "object" ? details.body : {};
  const access = details?.access || req.gatewayAccess || null;
  const rawKey = details?.key || access?.key || parseBearer(req.headers.authorization) || "";
  const logDetails = details || {};
  if (!logDetails.reservation && req.gatewayCostReservation) {
    logDetails.reservation = req.gatewayCostReservation;
  }
  const billing = await buildBillingInfo(access, body, logDetails);
  const maxRequestCostUsd = getMaxRequestCostUsd();
  const actualCostLimitExceeded = logDetails?.enforceCostLimit !== false &&
    maxRequestCostUsd > 0 &&
    billing.costUsd > maxRequestCostUsd &&
    Number(logDetails?.statusCode || 0) < 400;
  const finalStatusCode = actualCostLimitExceeded ? 402 : Number(logDetails?.statusCode || 0);
  const finalErrorCode = actualCostLimitExceeded ? "request_cost_limit_exceeded" : (logDetails?.errorCode || "");
  const record = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    durationMs: getDurationMs(req),
    method: req.method || "",
    endpoint: logDetails?.endpoint || inferEndpoint(req),
    path: getRequestPath(req),
    statusCode: finalStatusCode,
    errorCode: finalErrorCode,
    model: typeof body.model === "string" ? body.model : "",
    requestedModel: typeof body.model === "string" ? body.model : "",
    stream: body.stream === true,
    maxOutputTokens: getRequestedOutputTokens(body),
    upstreamStatus: normalizeOptionalStatusCode(logDetails?.upstreamStatus),
    upstreamErrorCode: sanitizeLogText(logDetails?.upstreamErrorCode, 120),
    upstreamErrorMessage: sanitizeLogText(logDetails?.upstreamErrorMessage, 500),
    finishReason: sanitizeLogText(logDetails?.finishReason || extractFinishReason(logDetails.responsePayload || parseJsonSafe(logDetails.responseText)), 120),
    stopReason: sanitizeLogText(logDetails?.stopReason || extractStopReason(logDetails.responsePayload || parseJsonSafe(logDetails.responseText)), 120),
    incompleteReason: sanitizeLogText(logDetails?.incompleteReason || extractIncompleteReason(logDetails.responsePayload || parseJsonSafe(logDetails.responseText)), 160),
    streamEnded: logDetails?.streamEnded === undefined ? null : Boolean(logDetails.streamEnded),
    clientClosed: logDetails?.clientClosed === undefined ? null : Boolean(logDetails.clientClosed),
    bytesSent: normalizeOptionalInteger(logDetails?.bytesSent),
    capturedBytes: normalizeOptionalInteger(logDetails?.capturedBytes),
    rpmLimit: getRpmLimit(access),
    inputTokens: billing.inputTokens,
    outputTokens: billing.outputTokens,
    totalTokens: billing.totalTokens,
    estimatedInputTokens: logDetails?.estimatedInputTokens || 0,
    priceInputUsdPerMTok: billing.priceInputUsdPerMTok,
    priceOutputUsdPerMTok: billing.priceOutputUsdPerMTok,
    costUsd: billing.costUsd,
    estimatedCostUsd: logDetails?.estimatedCostUsd || 0,
    reservedCostUsd: billing.reservedCostUsd,
    maxRequestCostUsd,
    maxInputTokenLimit: getMaxInputTokens(access),
    maxOutputTokenLimit: getMaxOutputTokens(access),
    spentUsd: billing.spentUsd,
    budgetUsd: billing.budgetUsd,
    remainingUsd: billing.remainingUsd,
    usageMissing: billing.usageMissing,
    agent: detectAgent(req),
    userAgent: truncate(String(req.headers["user-agent"] || ""), 220),
    key: maskKey(rawKey),
    keyHash: hashKey(rawKey),
    keyName: access?.name || "",
    legacyDiscordKey: Boolean(access?.legacyDiscordKey),
    billingSubjectType: getBillingSubjectType(access),
    billingSubjectId: getBillingSubjectId(access),
    group: access?.groupName || "",
    discordUser: access?.discordUser ? {
      id: access.discordUser.id || "",
      username: access.discordUser.username || "",
      globalName: access.discordUser.globalName || "",
      displayName: access.discordUser.displayName || access.discordUser.globalName || access.discordUser.username || access.discordUser.id || "",
      avatar: access.discordUser.avatar || "",
      avatarUrl: access.discordUser.avatarUrl || buildDiscordAvatarUrl(access.discordUser.id || "", access.discordUser.avatar || ""),
    } : null,
    ip: maskIp(getClientIp(req)),
  };

  appendMemoryCallLog(record);
  if (!hasKvLogging()) return record;

  try {
    await kvPipeline([
      ["LPUSH", config.callLogKey, JSON.stringify(record)],
      ["LTRIM", config.callLogKey, 0, getCallLogLimit() - 1],
    ]);
  } catch (error) {
    console.warn(error.message || "Call-log write failed");
  }
  return record;
}

async function buildBillingInfo(access, body, details) {
  const model = typeof body.model === "string" ? body.model : "";
  const usage = details.usage || extractUsage(details.responsePayload || parseJsonSafe(details.responseText));
  const price = getModelPrice(model);
  const budgetUsd = details.quota?.budgetUsd ?? getBudgetUsd(access);
  const reservation = getActiveReservation(access, details.reservation);
  let spentUsd = details.quota?.spentUsd ?? 0;
  if (!details.quota && access) {
    try {
      spentUsd = await getKeySpendUsd(access);
    } catch (error) {
      console.warn(error.message || "Cost ledger read failed");
    }
  }
  const base = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    priceInputUsdPerMTok: price.input,
    priceOutputUsdPerMTok: price.output,
    costUsd: 0,
    spentUsd,
    budgetUsd,
    remainingUsd: budgetUsd > 0 ? Math.max(0, budgetUsd - spentUsd) : null,
    usageMissing: usage.missing,
    reservedCostUsd: reservation?.amountUsd || 0,
  };

  if (!access || !model || usage.missing || Number(details.statusCode || 0) >= 400) {
    return finishBilling(base, access, reservation, 0);
  }

  const costUsd = calculateUsageCostUsd(usage, price);
  if (costUsd <= 0) return finishBilling(base, access, reservation, 0, costUsd);

  const maxRequestCostUsd = details.enforceCostLimit !== false ? getMaxRequestCostUsd() : 0;
  if (maxRequestCostUsd > 0 && costUsd > maxRequestCostUsd) {
    return finishBilling(base, access, reservation, 0, costUsd);
  }

  return finishBilling(base, access, reservation, costUsd);
}

async function finishBilling(base, access, reservation, chargeUsd, displayCostUsd = chargeUsd) {
  let spentUsd = base.spentUsd;
  try {
    if (reservation) {
      spentUsd = await finalizeCostReservation(access, reservation, chargeUsd);
    } else if (chargeUsd > 0) {
      spentUsd = await addKeySpendUsd(access, chargeUsd);
    }
  } catch (error) {
    console.warn(error.message || "Cost ledger write failed");
  }

  return {
    ...base,
    costUsd: displayCostUsd,
    spentUsd,
    remainingUsd: base.budgetUsd > 0 ? Math.max(0, base.budgetUsd - spentUsd) : null,
  };
}

function extractUsage(payload) {
  const usage = findUsage(payload);
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, missing: true };
  }

  const inputTokens = firstNumber(
    usage.input_tokens,
    usage.prompt_tokens,
    usage.inputTokens,
    usage.promptTokens
  );
  const outputTokens = firstNumber(
    usage.output_tokens,
    usage.completion_tokens,
    usage.outputTokens,
    usage.completionTokens
  );
  const totalTokens = firstNumber(
    usage.total_tokens,
    usage.totalTokens,
    inputTokens + outputTokens
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    missing: inputTokens <= 0 && outputTokens <= 0 && totalTokens <= 0,
  };
}

function findUsage(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.usage && typeof payload.usage === "object") return payload.usage;
  if (payload.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      const found = findUsage(item);
      if (found) return found;
    }
  }
  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      const found = findUsage(choice);
      if (found) return found;
    }
  }
  return null;
}

function extractFinishReason(payload) {
  const found = findFirstString(payload, [
    "finish_reason",
    "finishReason",
    "stop_reason",
    "stopReason",
  ]);
  return found || "";
}

function extractStopReason(payload) {
  const found = findFirstString(payload, [
    "stop_reason",
    "stopReason",
    "finish_reason",
    "finishReason",
  ]);
  return found || "";
}

function extractIncompleteReason(payload) {
  const found = findFirstString(payload, [
    "incomplete_reason",
    "incompleteReason",
    "reason",
  ], { onlyInsideIncomplete: true });
  if (found) return found;
  if (payload?.incomplete_details && typeof payload.incomplete_details === "object") {
    return payload.incomplete_details.reason || payload.incomplete_details.code || "";
  }
  if (payload?.incompleteDetails && typeof payload.incompleteDetails === "object") {
    return payload.incompleteDetails.reason || payload.incompleteDetails.code || "";
  }
  return "";
}

function findFirstString(value, keys, options = {}) {
  const seen = new Set();

  function visit(node, insideIncomplete) {
    if (!node || typeof node !== "object") return "";
    if (seen.has(node)) return "";
    seen.add(node);

    if (!options.onlyInsideIncomplete || insideIncomplete) {
      for (const key of keys) {
        const found = node[key];
        if (typeof found === "string" && found.trim()) return found.trim();
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (!child || typeof child !== "object") continue;
      const nextInsideIncomplete = insideIncomplete || key === "incomplete_details" || key === "incompleteDetails";
      const found = visit(child, nextInsideIncomplete);
      if (found) return found;
    }
    return "";
  }

  return visit(value, false);
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}

function calculateUsageCostUsd(usage, price) {
  const inputCost = (usage.inputTokens * price.input) / 1_000_000;
  const outputCost = (usage.outputTokens * price.output) / 1_000_000;
  return roundUsd(inputCost + outputCost);
}

function estimateRequestCostUsd(body) {
  if (!body || typeof body !== "object" || typeof body.model !== "string") {
    return { usd: 0, inputTokens: 0, outputTokens: 0 };
  }
  const price = getModelPrice(body.model);
  const inputTokens = estimateInputTokens(body);
  const outputTokens = getRequestedOutputTokens(body);
  const usd = calculateUsageCostUsd({ inputTokens, outputTokens }, price);
  return { usd, inputTokens, outputTokens };
}

function applyRequestCostLimit(body, endpoint, group) {
  const estimatedCost = estimateRequestCostUsd(body);
  const maxRequestCostUsd = getMaxRequestCostUsd();
  if (maxRequestCostUsd <= 0 || !body || typeof body !== "object" || typeof body.model !== "string") {
    return { ok: true, estimatedCost, maxRequestCostUsd };
  }

  const price = getModelPrice(body.model);
  if (price.input <= 0 && price.output <= 0) {
    return { ok: true, estimatedCost, maxRequestCostUsd };
  }

  const inputTokens = estimateInputTokens(body);
  const inputCostUsd = calculateUsageCostUsd({ inputTokens, outputTokens: 0 }, price);
  if (inputCostUsd > maxRequestCostUsd || price.output <= 0) {
    return {
      ok: inputCostUsd <= maxRequestCostUsd,
      estimatedCost: { usd: inputCostUsd, inputTokens, outputTokens: 0 },
      maxRequestCostUsd,
    };
  }

  const remainingUsd = maxRequestCostUsd - inputCostUsd;
  const costOutputTokenLimit = Math.floor((remainingUsd * 1_000_000) / price.output);
  const groupOutputTokenLimit = Number(group?.maxOutputTokens || 0);
  const outputTokenLimit = groupOutputTokenLimit > 0
    ? Math.min(costOutputTokenLimit, groupOutputTokenLimit)
    : costOutputTokenLimit;

  if (!Number.isFinite(outputTokenLimit) || outputTokenLimit <= 0) {
    return {
      ok: false,
      estimatedCost: { usd: inputCostUsd, inputTokens, outputTokens: 0 },
      maxRequestCostUsd,
    };
  }

  const requestedOutputTokens = getRequestedOutputTokens(body);
  const requestedOutputKey = getRequestedOutputTokenKey(body);
  if (requestedOutputTokens > outputTokenLimit) {
    setOutputTokenLimit(body, endpoint, requestedOutputKey, outputTokenLimit);
  } else if (requestedOutputTokens <= 0) {
    setOutputTokenLimit(body, endpoint, requestedOutputKey, Math.min(outputTokenLimit, IMPLICIT_OUTPUT_TOKEN_LIMIT));
  }

  const limitedEstimate = fitOutputLimitToCost(body, endpoint, maxRequestCostUsd, price);
  return {
    ok: limitedEstimate.usd <= maxRequestCostUsd,
    estimatedCost: limitedEstimate,
    maxRequestCostUsd,
  };
}

function fitOutputLimitToCost(body, endpoint, maxRequestCostUsd, price) {
  let estimate = estimateRequestCostUsd(body);
  if (estimate.usd <= maxRequestCostUsd || price.output <= 0) return estimate;

  const currentOutputTokens = getRequestedOutputTokens(body);
  if (currentOutputTokens <= 0) return estimate;

  const excessUsd = estimate.usd - maxRequestCostUsd;
  const reduceBy = Math.ceil((excessUsd * 1_000_000) / price.output) + 32;
  const adjustedOutputTokens = Math.max(1, currentOutputTokens - reduceBy);
  setOutputTokenLimit(body, endpoint, getRequestedOutputTokenKey(body), adjustedOutputTokens);
  return estimateRequestCostUsd(body);
}

function estimateInputTokens(body) {
  const text = JSON.stringify(body || {});
  return Math.ceil(text.length / 4);
}

function getQuotaReservationUsd(endpoint, body, estimatedCost) {
  if (endpoint !== "responses" && endpoint !== "chat.completions") return 0;
  if (!body || typeof body !== "object" || typeof body.model !== "string") return 0;
  const maxRequestCostUsd = getMaxRequestCostUsd();
  if (maxRequestCostUsd > 0) return maxRequestCostUsd;
  return Number(estimatedCost?.usd || 0) > 0 ? roundUsd(estimatedCost.usd) : 0;
}

function getMaxRequestCostUsd() {
  const value = Number(config.maxRequestCostUsd || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getModelPrice(model) {
  const explicit = config.modelPrices[model];
  if (explicit) return explicit;
  if (model.includes("fable")) return { input: 10, output: 50 };
  if (model.includes("opus")) return { input: 5, output: 25 };
  if (model.includes("sonnet")) return { input: 3, output: 15 };
  if (model.includes("haiku")) return { input: 1, output: 5 };
  if (model.includes("gemini")) return { input: 1, output: 5 };
  if (model.includes("gpt-oss")) return { input: 1, output: 5 };
  return { input: 0, output: 0 };
}

function buildModelPrices(overrides) {
  const output = { ...DEFAULT_MODEL_PRICES_USD_PER_MTOK };
  if (overrides && typeof overrides === "object") {
    for (const [model, value] of Object.entries(overrides)) {
      const input = Number(value?.input ?? value?.inputUsdPerMTok ?? value?.prompt);
      const outputPrice = Number(value?.output ?? value?.outputUsdPerMTok ?? value?.completion);
      if (model && Number.isFinite(input) && input >= 0 && Number.isFinite(outputPrice) && outputPrice >= 0) {
        output[model] = { input, output: outputPrice };
      }
    }
  }
  return output;
}

async function checkCostQuota(access) {
  const budgetUsd = getBudgetUsd(access);
  if (!access || budgetUsd <= 0) {
    return { exceeded: false, budgetUsd, spentUsd: 0, remainingUsd: null };
  }
  const spentUsd = await getKeySpendUsd(access);
  return {
    exceeded: spentUsd >= budgetUsd,
    budgetUsd,
    spentUsd,
    remainingUsd: Math.max(0, budgetUsd - spentUsd),
  };
}

async function reserveCostQuota(access, amountUsd) {
  const budgetUsd = getBudgetUsd(access);
  const amount = roundUsd(amountUsd);
  const ledgerId = getBillingLedgerId(access);
  if (!ledgerId || budgetUsd <= 0 || amount <= 0) {
    return { ok: true, amountUsd: 0, budgetUsd, spentUsd: await getKeySpendUsd(access), remainingUsd: null };
  }

  if (hasKvLogging()) {
    const script = [
      "local current = tonumber(redis.call('GET', KEYS[1]) or '0') or 0",
      "local budget = tonumber(ARGV[1]) or 0",
      "local amount = tonumber(ARGV[2]) or 0",
      "if budget > 0 and amount > 0 and current + amount > budget then return {0, current, budget - current} end",
      "if amount > 0 then current = tonumber(redis.call('INCRBYFLOAT', KEYS[1], amount)) or current end",
      "return {1, current, budget - current}",
    ].join("\n");
    const result = await kvPipeline([["EVAL", script, 1, getCostLedgerKey(access), String(budgetUsd), String(amount)]]);
    const tuple = Array.isArray(result?.[0]?.result) ? result[0].result : [];
    const ok = Number(tuple[0] || 0) === 1;
    const spentUsd = roundUsd(Number(tuple[1] || 0) || 0);
    const remainingUsd = Math.max(0, roundUsd(Number(tuple[2] || 0) || 0));
    return {
      ok,
      ledgerId,
      amountUsd: ok ? amount : 0,
      budgetUsd,
      spentUsd,
      remainingUsd,
      finalized: !ok,
    };
  }

  const current = Number(memoryCostLedger.get(ledgerId) || 0) || 0;
  if (current + amount > budgetUsd) {
    return {
      ok: false,
      ledgerId,
      amountUsd: 0,
      budgetUsd,
      spentUsd: roundUsd(current),
      remainingUsd: Math.max(0, roundUsd(budgetUsd - current)),
      finalized: true,
    };
  }

  const next = roundUsd(current + amount);
  memoryCostLedger.set(ledgerId, next);
  return {
    ok: true,
    ledgerId,
    amountUsd: amount,
    budgetUsd,
    spentUsd: next,
    remainingUsd: Math.max(0, roundUsd(budgetUsd - next)),
    finalized: false,
  };
}

function getBudgetUsd(access) {
  const userValue = access?.limits?.budgetUsd;
  if (isNonNegativeLimit(userValue)) return Number(userValue);
  const value = Number(access?.group?.budgetUsd ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getMaxInputTokens(access) {
  const userValue = access?.limits?.maxInputTokens;
  if (isNonNegativeLimit(userValue)) return Math.floor(Number(userValue));
  const value = Number(access?.group?.maxInputTokens ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function getMaxOutputTokens(access) {
  const userValue = access?.limits?.maxOutputTokens;
  if (isNonNegativeLimit(userValue)) return Math.floor(Number(userValue));
  const value = Number(access?.group?.maxOutputTokens ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isNonNegativeLimit(value) {
  if (value === undefined || value === null || value === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function normalizeOptionalNonNegativeNumber(value) {
  if (!isNonNegativeLimit(value)) return null;
  return Number(value);
}

function normalizeOptionalNonNegativeInteger(value) {
  if (!isNonNegativeLimit(value)) return null;
  return Math.floor(Number(value));
}

async function getKeySpendUsd(access) {
  const ledgerId = getBillingLedgerId(access);
  if (!ledgerId) return 0;
  if (hasKvLogging()) {
    const result = await kvPipeline([["GET", getCostLedgerKey(access)]]);
    return Number(result?.[0]?.result || 0) || 0;
  }
  return Number(memoryCostLedger.get(ledgerId) || 0) || 0;
}

async function getSpendUsdByLedgerId(ledgerId) {
  const safeLedgerId = normalizeBillingLedgerId(ledgerId);
  if (!safeLedgerId) return 0;
  if (hasKvLogging()) {
    const result = await kvPipeline([["GET", getCostLedgerKeyForLedgerId(safeLedgerId)]]);
    return Number(result?.[0]?.result || 0) || 0;
  }
  return Number(memoryCostLedger.get(safeLedgerId) || 0) || 0;
}

async function resetSpendUsdByLedgerId(ledgerId) {
  const safeLedgerId = normalizeBillingLedgerId(ledgerId);
  if (!safeLedgerId) return 0;
  memoryCostLedger.delete(safeLedgerId);
  if (hasKvLogging()) {
    await kvPipeline([["DEL", getCostLedgerKeyForLedgerId(safeLedgerId)]]);
  }
  return 0;
}

async function getDiscordUserSpendUsd(userId) {
  const id = String(userId || "").trim();
  if (!/^\d{5,}$/.test(id)) return 0;
  return getSpendUsdByLedgerId(`discord_user:${id}`);
}

async function resetDiscordUserSpendUsd(userId) {
  const id = String(userId || "").trim();
  if (!/^\d{5,}$/.test(id)) return 0;
  return resetSpendUsdByLedgerId(`discord_user:${id}`);
}

async function addKeySpendUsd(access, costUsd) {
  const ledgerId = getBillingLedgerId(access);
  if (!ledgerId || costUsd <= 0) return access ? getKeySpendUsd(access) : 0;
  return adjustKeySpendUsd(access, roundUsd(costUsd));
}

function getActiveReservation(access, reservation) {
  if (!reservation || reservation.finalized) return null;
  const ledgerId = getBillingLedgerId(access);
  if (!ledgerId || reservation.ledgerId !== ledgerId) return null;
  return reservation;
}

async function finalizeCostReservation(access, reservation, finalCostUsd) {
  const activeReservation = getActiveReservation(access, reservation);
  if (!activeReservation) return getKeySpendUsd(access);

  activeReservation.finalized = true;
  const finalCost = roundUsd(finalCostUsd);
  const delta = roundSignedUsd(finalCost - Number(activeReservation.amountUsd || 0));
  if (delta === 0) return getKeySpendUsd(access);
  return adjustKeySpendUsd(access, delta);
}

async function adjustKeySpendUsd(access, deltaUsd) {
  const ledgerId = getBillingLedgerId(access);
  if (!ledgerId || deltaUsd === 0) return access ? getKeySpendUsd(access) : 0;
  const amount = roundSignedUsd(deltaUsd);
  if (hasKvLogging()) {
    const script = [
      "local current = tonumber(redis.call('GET', KEYS[1]) or '0') or 0",
      "local delta = tonumber(ARGV[1]) or 0",
      "local next_value = current + delta",
      "if next_value < 0 then next_value = 0 end",
      "redis.call('SET', KEYS[1], tostring(next_value))",
      "return next_value",
    ].join("\n");
    const result = await kvPipeline([["EVAL", script, 1, getCostLedgerKey(access), String(amount)]]);
    return roundUsd(Number(result?.[0]?.result || 0) || 0);
  }

  const next = Math.max(0, roundUsd((Number(memoryCostLedger.get(ledgerId) || 0) || 0) + amount));
  memoryCostLedger.set(ledgerId, next);
  return next;
}

function getCostLedgerKey(access) {
  return `${config.costLedgerKeyPrefix}${getBillingLedgerId(access)}`;
}

function getCostLedgerKeyForLedgerId(ledgerId) {
  return `${config.costLedgerKeyPrefix}${ledgerId}`;
}

function normalizeBillingLedgerId(value) {
  const ledgerId = String(value || "").trim();
  if (/^discord_user:\d{5,}$/.test(ledgerId)) return ledgerId;
  if (/^api_key:[a-f0-9]{12,64}$/i.test(ledgerId)) return ledgerId;
  return "";
}

function getBillingLedgerId(access) {
  const subjectType = getBillingSubjectType(access);
  const subjectId = getBillingSubjectId(access);
  return subjectType && subjectId ? `${subjectType}:${subjectId}` : "";
}

function getBillingSubjectType(access) {
  if (access?.discordUser?.id) return "discord_user";
  if (access?.key) return "api_key";
  return "";
}

function getBillingSubjectId(access) {
  if (access?.discordUser?.id) return String(access.discordUser.id);
  if (access?.key) return hashKey(access.key);
  return "";
}

function buildDiscordAvatarUrl(id, avatar) {
  if (!id || !avatar) return "";
  const ext = String(avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(avatar)}.${ext}?size=64`;
}

function roundUsd(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 100_000_000) / 100_000_000;
}

function roundSignedUsd(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return 0;
  return Math.round(number * 100_000_000) / 100_000_000;
}

function formatUsd(value) {
  return Number(value || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
}

function parseJsonSafe(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return parseSseJsonWithUsage(text);
  }
}

function parseSseJsonWithUsage(text) {
  let fallback = null;
  let usagePayload = null;
  let stopPayload = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      fallback = parsed;
      if (findUsage(parsed)) usagePayload = parsed;
      if (extractFinishReason(parsed) || extractStopReason(parsed) || extractIncompleteReason(parsed)) {
        stopPayload = parsed;
      }
    } catch {
      // Ignore non-JSON stream fragments.
    }
  }
  if (usagePayload && stopPayload && usagePayload !== stopPayload) {
    return { ...stopPayload, usage: findUsage(usagePayload) };
  }
  return usagePayload || stopPayload || fallback;
}

async function getCallLogs(limit) {
  const safeLimit = normalizeLogLimit(limit);
  if (hasKvLogging()) {
    const result = await kvPipeline([["LRANGE", config.callLogKey, 0, safeLimit - 1]]);
    const rows = Array.isArray(result?.[0]?.result) ? result[0].result : [];
    return rows.map(parseLogRecord).filter(Boolean);
  }
  return memoryCallLogs.slice(0, safeLimit);
}

async function clearCallLogs() {
  memoryCallLogs.length = 0;
  if (hasKvLogging()) {
    await kvPipeline([["DEL", config.callLogKey]]);
  }
}

function getCallLogStorage() {
  return hasKvLogging() ? "kv" : "memory";
}

function appendMemoryCallLog(record) {
  memoryCallLogs.unshift(record);
  const limit = getCallLogLimit();
  if (memoryCallLogs.length > limit) memoryCallLogs.length = limit;
}

function hasKvLogging() {
  return Boolean(config.kvRestApiUrl && config.kvRestApiToken);
}

async function kvPipeline(commands) {
  const response = await fetch(`${config.kvRestApiUrl.replace(/\/+$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.kvRestApiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!response.ok) {
    throw new Error(`KV logging request failed: ${response.status}`);
  }
  return response.json();
}

function parseLogRecord(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeLogLimit(limit) {
  const value = Number(limit || 100);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(Math.floor(value), getCallLogLimit());
}

function getCallLogLimit() {
  if (!Number.isFinite(config.callLogLimit) || config.callLogLimit <= 0) return 500;
  return Math.min(Math.floor(config.callLogLimit), 2000);
}

function getDurationMs(req) {
  const startedAt = Number(req.gatewayStartedAt || 0);
  return startedAt > 0 ? Math.max(0, Date.now() - startedAt) : 0;
}

function inferEndpoint(req) {
  const pathname = getRequestPath(req);
  if (pathname.endsWith("/models")) return "models";
  if (pathname.endsWith("/responses")) return "responses";
  if (pathname.endsWith("/chat/completions")) return "chat.completions";
  return pathname || "unknown";
}

function getRequestPath(req) {
  try {
    return new URL(req.url || "/", "https://gateway.local").pathname;
  } catch {
    return String(req.url || "");
  }
}

function detectAgent(req) {
  const source = [
    req.headers["x-gateway-agent"],
    req.headers["user-agent"],
    req.headers["x-stainless-package-version"],
    req.headers["x-stainless-lang"],
  ].filter(Boolean).join(" ").toLowerCase();

  if (source.includes("codex")) return "Codex";
  if (source.includes("claude-code") || source.includes("claude code")) return "Claude Code";
  if (source.includes("cline")) return "Cline";
  if (source.includes("roo-code") || source.includes("roo code")) return "Roo Code";
  if (source.includes("sillytavern")) return "SillyTavern";
  if (source.includes("chatbox")) return "Chatbox";
  if (source.includes("openai")) return "OpenAI SDK";
  if (source.includes("python")) return "Python";
  if (source.includes("node")) return "Node.js";
  if (source.includes("curl")) return "cURL";
  return "Unknown";
}

function maskKey(key) {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 12) return `${value.slice(0, 3)}...`;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function hashKey(key) {
  const value = String(key || "");
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.headers["x-real-ip"] || "");
}

function maskIp(ip) {
  const value = String(ip || "");
  if (!value) return "";
  if (value.includes(".")) {
    const parts = value.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  if (value.includes(":")) return `${value.split(":").slice(0, 3).join(":")}:...`;
  return value;
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function getRequestedOutputTokens(body) {
  if (!body || typeof body !== "object") return 0;
  let maxTokens = 0;
  for (const key of ["max_output_tokens", "max_tokens", "max_completion_tokens"]) {
    const value = Number(body[key]);
    if (Number.isFinite(value) && value > 0) maxTokens = Math.max(maxTokens, value);
  }
  return maxTokens;
}

function getRequestedOutputTokenKey(body) {
  if (!body || typeof body !== "object") return "";
  for (const key of ["max_output_tokens", "max_tokens", "max_completion_tokens"]) {
    const value = Number(body[key]);
    if (Number.isFinite(value) && value > 0) return key;
  }
  return "";
}

function setOutputTokenLimit(body, endpoint, requestedOutputKey, outputTokenLimit) {
  if (!body || typeof body !== "object") return;
  const safeLimit = Math.max(1, Math.floor(outputTokenLimit));
  let hasOutputTokenKey = false;
  for (const key of ["max_output_tokens", "max_tokens", "max_completion_tokens"]) {
    const value = Number(body[key]);
    if (Number.isFinite(value) && value > 0) {
      hasOutputTokenKey = true;
      if (value > safeLimit) body[key] = safeLimit;
    }
  }
  if (!hasOutputTokenKey) {
    const key = requestedOutputKey || getDefaultOutputTokenKey(endpoint);
    body[key] = safeLimit;
  }
}

function getDefaultOutputTokenKey(endpoint) {
  if (endpoint === "chat.completions") return "max_tokens";
  return "max_output_tokens";
}

function buildAccessControl(runtimeConfig) {
  const defaultGroup = {
    name: "legacy",
    models: runtimeConfig.modelAllowlist,
    endpoints: ["models", "responses", "chat.completions"],
    allowStream: true,
    rpmLimit: runtimeConfig.rpmLimit,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    budgetUsd: Number.isFinite(runtimeConfig.defaultKeyBudgetUsd) && runtimeConfig.defaultKeyBudgetUsd > 0
      ? runtimeConfig.defaultKeyBudgetUsd
      : 30,
  };
  const guestGroup = {
    name: "guest",
    models: runtimeConfig.modelAllowlist.filter((model) => !runtimeConfig.guestExcludedModels.includes(model)),
    endpoints: ["models", "responses", "chat.completions"],
    allowStream: true,
    rpmLimit: runtimeConfig.rpmLimit,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    budgetUsd: Number.isFinite(runtimeConfig.defaultKeyBudgetUsd) && runtimeConfig.defaultKeyBudgetUsd > 0
      ? runtimeConfig.defaultKeyBudgetUsd
      : 30,
  };

  const groups = new Map();
  groups.set(defaultGroup.name, defaultGroup);
  groups.set(guestGroup.name, guestGroup);

  if (runtimeConfig.groupsConfig && typeof runtimeConfig.groupsConfig === "object") {
    for (const [name, group] of Object.entries(runtimeConfig.groupsConfig)) {
      groups.set(name, normalizeGroup(name, group, groups.get(name) || defaultGroup));
    }
  }

  const keys = new Map();
  for (const key of runtimeConfig.downstreamKeys) {
    keys.set(key, {
      key,
      name: "legacy",
      groupName: defaultGroup.name,
      group: defaultGroup,
      enabled: true,
    });
  }

  if (runtimeConfig.keysConfig && typeof runtimeConfig.keysConfig === "object") {
    for (const [key, value] of Object.entries(runtimeConfig.keysConfig)) {
      const record = typeof value === "string" ? { group: value } : (value || {});
      const groupName = record.group || defaultGroup.name;
      const group = groups.get(groupName) || defaultGroup;
      keys.set(key, {
        key,
        name: record.name || key.slice(0, 12),
        groupName,
        group,
        enabled: record.enabled !== false,
      });
    }
  }

  return { defaultGroup, groups, keys };
}

function normalizeGroup(name, group, fallback) {
  const value = group && typeof group === "object" ? group : {};
  return {
    name,
    models: normalizeStringArray(value.models, fallback.models),
    endpoints: normalizeStringArray(value.endpoints, fallback.endpoints),
    allowStream: value.allowStream ?? fallback.allowStream,
    rpmLimit: Number(value.rpmLimit ?? fallback.rpmLimit ?? config.rpmLimit),
    maxInputTokens: Number(value.maxInputTokens || fallback.maxInputTokens || 0),
    maxOutputTokens: Number(value.maxOutputTokens || fallback.maxOutputTokens || 0),
    budgetUsd: Number(value.budgetUsd ?? fallback.budgetUsd ?? 0),
  };
}

function normalizeStringArray(value, fallback) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return Array.isArray(fallback) ? fallback : [];
}

function sanitizeUpstreamText(text) {
  let output = String(text || "");
  output = replaceIfPresent(output, config.upstreamBase, "[upstream]");
  output = replaceIfPresent(output, config.upstreamKey, "[upstream-key]");
  output = replaceIfPresent(output, config.antigravityBase, "[antigravity-upstream]");
  output = replaceIfPresent(output, config.antigravityKey, "[antigravity-key]");
  return output;
}

function replaceIfPresent(value, needle, replacement) {
  return needle ? value.split(needle).join(replacement) : value;
}

function buildUpstreamErrorPayload(text) {
  const details = buildUpstreamErrorDetails(text);
  return { error: { message: details.upstreamErrorMessage || "Upstream request failed", code: "upstream_request_failed" } };
}

function buildUpstreamErrorDetails(text, statusCode = 0) {
  const fallback = "Upstream request failed";
  const safeText = sanitizeUpstreamText(text).trim();
  let message = fallback;
  let code = "";

  if (safeText) {
    try {
      const parsed = JSON.parse(safeText);
      const error = parsed?.error && typeof parsed.error === "object" ? parsed.error : {};
      message = error.message || parsed?.message || fallback;
      code = error.code || error.type || parsed?.code || parsed?.type || "";
    } catch {
      message = safeText.slice(0, 500);
    }
  }

  return {
    upstreamStatus: normalizeOptionalStatusCode(statusCode),
    upstreamErrorCode: sanitizeLogText(code, 120),
    upstreamErrorMessage: sanitizeLogText(message, 500),
  };
}

function buildUpstreamExceptionDetails(error) {
  const name = sanitizeLogText(error?.name || "fetch_error", 120);
  const message = sanitizeLogText(error?.message || "Upstream request failed", 500);
  return {
    upstreamStatus: 0,
    upstreamErrorCode: name,
    upstreamErrorMessage: message,
  };
}

function normalizeOptionalStatusCode(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function normalizeOptionalInteger(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function sanitizeLogText(value, maxLength) {
  return truncate(sanitizeUpstreamText(String(value || "")).replace(/\s+/g, " ").trim(), maxLength);
}

function copyUpstreamHeaders(upstreamHeaders, res) {
  for (const name of ["content-type", "cache-control", "x-request-id", "request-id"]) {
    const value = upstreamHeaders.get(name);
    if (value) res.setHeader(name, value);
  }
}

async function streamUpstreamResponse(upstreamResponse, res) {
  const capturedChunks = [];
  let capturedBytes = 0;
  let bytesSent = 0;
  let clientClosed = false;
  let streamEnded = false;
  const captureLimitBytes = 1024 * 1024;

  res.on?.("close", () => {
    clientClosed = !streamEnded;
  });

  function capture(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (capturedBytes >= captureLimitBytes) return;
    const slice = buffer.subarray(0, captureLimitBytes - capturedBytes);
    capturedBytes += slice.length;
    capturedChunks.push(slice);
  }

  copyUpstreamHeaders(upstreamResponse.headers, res);
  setCors(res);
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("x-accel-buffering", "no");
  res.status(upstreamResponse.status);

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  if (!upstreamResponse.body) {
    streamEnded = true;
    res.end();
    return {
      text: "",
      diagnostics: { streamEnded, clientClosed, bytesSent, capturedBytes },
    };
  }

  const reader = upstreamResponse.body.getReader?.();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        capture(chunk);
        bytesSent += chunk.length;
        res.write(chunk);
      }
    }
    streamEnded = true;
    res.end();
    return {
      text: Buffer.concat(capturedChunks).toString("utf8"),
      diagnostics: { streamEnded, clientClosed, bytesSent, capturedBytes },
    };
  }

  for await (const chunk of upstreamResponse.body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    capture(buffer);
    bytesSent += buffer.length;
    res.write(buffer);
  }
  streamEnded = true;
  res.end();
  return {
    text: Buffer.concat(capturedChunks).toString("utf8"),
    diagnostics: { streamEnded, clientClosed, bytesSent, capturedBytes },
  };
}

module.exports = {
  buildUpstreamErrorPayload,
  buildUpstreamErrorDetails,
  buildUpstreamExceptionDetails,
  config,
  copyUpstreamHeaders,
  clearCallLogs,
  enforceAccessPolicy,
  getAllowedModels,
  getAllowedEndpoints,
  getAccessForKey,
  getBudgetUsd,
  getCallLogs,
  getCallLogStorage,
  getDiscordUserSpendUsd,
  getKeySpendUsd,
  getMaxInputTokens,
  getMaxOutputTokens,
  getRpmLimit,
  getUpstreamForModel,
  isAllowedModel,
  recordCallLog,
  requireDownstreamAuth,
  resetDiscordUserSpendUsd,
  sanitizeUpstreamText,
  sendJson,
  setCors,
  streamUpstreamResponse,
};
