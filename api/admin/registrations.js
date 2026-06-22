const {
  clearDiscordRegistrations,
  getRegistrationConfig,
  listDiscordRegistrations,
  removeDiscordRegistration,
  updateDiscordRegistrationGroup,
  updateDiscordRegistrationLimits,
} = require("../../lib/discord-registration");
const {
  config: gatewayConfig,
  getCallLogs,
  getDiscordUserSpendUsd,
  resetDiscordUserSpendUsd,
  sendJson,
  setCors,
} = require("../../lib/gateway-config");
const { isAdminRequest } = require("../../lib/admin/auth");

module.exports = async function handler(req, res) {
  setCors(res);
  res.setHeader("cache-control", "no-store, max-age=0");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!isAdminRequest(req)) {
    sendJson(res, 401, { error: { message: "Invalid admin token", code: "invalid_admin_token" } });
    return;
  }

  if (req.method === "GET") {
    const config = getRegistrationConfig();
    const registrations = await buildRegistrationPayload();
    sendJson(res, 200, {
      limit: config.limit,
      registrationKey: config.key,
      accountKey: config.accountKey,
      storage: config.kvRestApiUrl && config.kvRestApiToken ? "kv" : "memory",
      legacyKeysAllowed: process.env.DISCORD_ALLOW_LEGACY_KEYS !== "false",
      count: registrations.count,
      remaining: registrations.limit > 0 ? Math.max(0, registrations.limit - registrations.count) : null,
      users: registrations.users,
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method not allowed", code: "method_not_allowed" } });
    return;
  }

  const body = typeof req.body === "string" ? parseJson(req.body) : (req.body || {});
  if (body.action === "remove_user") {
    try {
      const result = await removeDiscordRegistration(body.userId || body.id || body.discordUserId);
      if (!result.ok) {
        sendJson(res, 400, { error: { message: result.message || "Invalid Discord user id", code: result.code || "invalid_request" } });
        return;
      }
      const registrations = await buildRegistrationPayload();
      sendJson(res, 200, {
        ok: true,
        removed: result.removed,
        userId: result.userId,
        count: registrations.count,
        limit: registrations.limit,
        users: registrations.users,
      });
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error.message || "Failed to remove Discord registration",
          code: "registration_store_failed",
        },
      });
    }
    return;
  }

  if (body.action === "update_group") {
    try {
      const result = await updateDiscordRegistrationGroup(body.userId || body.id || body.discordUserId, body.groupName || body.group);
      if (!result.ok) {
        sendJson(res, result.code === "not_found" ? 404 : 400, {
          error: { message: result.message || "Failed to update Discord user group", code: result.code || "invalid_request" },
        });
        return;
      }
      const registrations = await buildRegistrationPayload();
      sendJson(res, 200, {
        ok: true,
        user: result.user,
        count: registrations.count,
        limit: registrations.limit,
        users: registrations.users,
      });
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error.message || "Failed to update Discord user group",
          code: "registration_store_failed",
        },
      });
    }
    return;
  }

  if (body.action === "update_limits") {
    try {
      const result = await updateDiscordRegistrationLimits(body.userId || body.id || body.discordUserId, {
        budgetUsd: body.budgetUsd,
        maxInputTokens: body.maxInputTokens,
        maxOutputTokens: body.maxOutputTokens,
      });
      if (!result.ok) {
        sendJson(res, result.code === "not_found" ? 404 : 400, {
          error: { message: result.message || "Failed to update Discord user limits", code: result.code || "invalid_request" },
        });
        return;
      }
      const registrations = await buildRegistrationPayload();
      sendJson(res, 200, {
        ok: true,
        user: result.user,
        count: registrations.count,
        limit: registrations.limit,
        users: registrations.users,
      });
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error.message || "Failed to update Discord user limits",
          code: "registration_store_failed",
        },
      });
    }
    return;
  }

  if (body.action === "reset_usage") {
    try {
      const userId = String(body.userId || body.id || body.discordUserId || "").trim();
      if (!/^\d{5,}$/.test(userId)) {
        sendJson(res, 400, { error: { message: "Discord user id is required.", code: "invalid_request" } });
        return;
      }
      await resetDiscordUserSpendUsd(userId);
      const registrations = await buildRegistrationPayload();
      sendJson(res, 200, {
        ok: true,
        resetUserId: userId,
        count: registrations.count,
        limit: registrations.limit,
        users: registrations.users,
      });
    } catch (error) {
      sendJson(res, 502, {
        error: {
          message: error.message || "Failed to reset Discord user usage",
          code: "usage_store_failed",
        },
      });
    }
    return;
  }

  if (body.action !== "clear") {
    sendJson(res, 400, { error: { message: "Unsupported admin action", code: "invalid_request" } });
    return;
  }

  try {
    const result = await clearDiscordRegistrations();
    sendJson(res, 200, { ok: true, cleared: ["registered_users", "accounts"], clearedUsers: result.clearedUsers || 0 });
  } catch (error) {
    sendJson(res, 502, {
      error: {
        message: error.message || "Failed to clear Discord registrations",
        code: "registration_store_failed",
      },
    });
  }
};

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function buildRegistrationPayload() {
  const registrations = await listDiscordRegistrations();
  const logs = await safeGetLogs();
  const logSummary = summarizeLogsByDiscordUser(logs);
  const users = await Promise.all((registrations.users || []).map(async (user) => enrichRegistrationUser(user, logSummary)));
  return {
    ...registrations,
    users,
  };
}

async function enrichRegistrationUser(user, logSummary) {
  const id = String(user?.id || "");
  const groupName = String(user?.groupName || "guest");
  const group = getGroupConfig(groupName);
  const budgetUsd = firstLimit(user?.budgetUsd, group?.budgetUsd, gatewayConfig.defaultKeyBudgetUsd, 30);
  const maxInputTokens = firstLimit(user?.maxInputTokens, group?.maxInputTokens, 0);
  const maxOutputTokens = firstLimit(user?.maxOutputTokens, group?.maxOutputTokens, 0);
  const rpmLimit = firstLimit(null, group?.rpmLimit, gatewayConfig.rpmLimit, 4);
  const spentUsd = await safeGetSpend(id);
  const usage = logSummary[id] || emptyUsageSummary();

  return {
    ...user,
    effective: {
      groupName,
      budgetUsd,
      spentUsd,
      remainingUsd: budgetUsd > 0 ? Math.max(0, roundUsd(budgetUsd - spentUsd)) : null,
      rpmLimit,
      maxInputTokens,
      maxOutputTokens,
      requestCount: usage.requestCount,
      successCount: usage.successCount,
      errorCount: usage.errorCount,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      pageCostUsd: roundUsd(usage.pageCostUsd),
      lastCallAt: usage.lastCallAt,
      lastModel: usage.lastModel,
      lastEndpoint: usage.lastEndpoint,
      lastStatusCode: usage.lastStatusCode,
      agents: Object.keys(usage.agents).sort(),
      models: topEntries(usage.models),
    },
  };
}

async function safeGetLogs() {
  try {
    return await getCallLogs(Math.min(Number(gatewayConfig.callLogLimit || 500), 1000));
  } catch {
    return [];
  }
}

async function safeGetSpend(userId) {
  try {
    return roundUsd(await getDiscordUserSpendUsd(userId));
  } catch {
    return 0;
  }
}

function summarizeLogsByDiscordUser(logs) {
  const output = {};
  for (const log of Array.isArray(logs) ? logs : []) {
    const id = String(log?.billingSubjectType === "discord_user" ? log.billingSubjectId : log?.discordUser?.id || "");
    if (!id) continue;
    if (!output[id]) output[id] = emptyUsageSummary();
    const item = output[id];
    const statusCode = Number(log.statusCode || 0);
    item.requestCount += 1;
    item.successCount += statusCode >= 200 && statusCode < 400 ? 1 : 0;
    item.errorCount += statusCode >= 400 ? 1 : 0;
    item.inputTokens += Number(log.inputTokens || 0) || 0;
    item.outputTokens += Number(log.outputTokens || 0) || 0;
    item.totalTokens += Number(log.totalTokens || 0) || 0;
    item.pageCostUsd += Number(log.costUsd || 0) || 0;
    addCount(item.agents, log.agent || "Unknown");
    if (log.model) addCount(item.models, log.model);
    if (!item.lastCallAt || String(log.time || "").localeCompare(String(item.lastCallAt)) > 0) {
      item.lastCallAt = log.time || "";
      item.lastModel = log.model || "";
      item.lastEndpoint = log.endpoint || "";
      item.lastStatusCode = statusCode || 0;
    }
  }
  return output;
}

function emptyUsageSummary() {
  return {
    requestCount: 0,
    successCount: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    pageCostUsd: 0,
    lastCallAt: "",
    lastModel: "",
    lastEndpoint: "",
    lastStatusCode: 0,
    agents: {},
    models: {},
  };
}

function getGroupConfig(groupName) {
  const groups = gatewayConfig.groupsConfig && typeof gatewayConfig.groupsConfig === "object"
    ? gatewayConfig.groupsConfig
    : {};
  return groups[groupName] || {};
}

function firstLimit(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}

function addCount(map, value) {
  const key = String(value || "").trim();
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function topEntries(map) {
  return Object.entries(map || {})
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => (right.count - left.count) || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function roundUsd(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number * 1000000) / 1000000;
}


