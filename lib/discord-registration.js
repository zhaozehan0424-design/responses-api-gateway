const DEFAULT_REGISTRATION_LIMIT = 20;
const DEFAULT_REGISTRATION_KEY = "gateway:discord:registered_users";
const DEFAULT_ACCOUNT_KEY = "gateway:discord:accounts";
const DEFAULT_REVOKED_KEY = "gateway:discord:revoked_after";

const memoryRegistrations = globalThis.__gatewayDiscordRegistrations || new Set();
globalThis.__gatewayDiscordRegistrations = memoryRegistrations;
const memoryAccounts = globalThis.__gatewayDiscordAccounts || new Map();
globalThis.__gatewayDiscordAccounts = memoryAccounts;

function getRegistrationConfig() {
  return {
    limit: Number(process.env.DISCORD_REGISTRATION_LIMIT || DEFAULT_REGISTRATION_LIMIT),
    key: process.env.DISCORD_REGISTRATION_KEY || DEFAULT_REGISTRATION_KEY,
    accountKey: process.env.DISCORD_ACCOUNT_KEY || DEFAULT_ACCOUNT_KEY,
    revokedKey: process.env.DISCORD_REVOKED_KEY || DEFAULT_REVOKED_KEY,
    kvRestApiUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
    kvRestApiToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
  };
}

async function ensureDiscordRegistration(user, accountPatch = {}) {
  const id = String(user?.id || "").trim();
  if (!id) return { ok: false, code: "invalid_request", message: "Discord user id is required." };

  const config = getRegistrationConfig();
  const limit = getRegistrationLimit(config);
  if (limit <= 0) {
    await saveDiscordAccount(id, buildAccount(user, accountPatch));
    return { ok: true, registered: true, count: 0, limit: 0 };
  }

  if (hasKv(config)) return ensureKvRegistration(config, id, limit, user, accountPatch);
  return ensureMemoryRegistration(id, limit, user, accountPatch);
}

async function isDiscordUserRegistered(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;

  const config = getRegistrationConfig();
  const limit = getRegistrationLimit(config);
  if (limit <= 0) return true;

  if (hasKv(config)) {
    const result = await kvPipeline(config, [["SISMEMBER", config.key, id]]);
    return Number(result?.[0]?.result || 0) === 1;
  }

  return memoryRegistrations.has(id);
}

async function getDiscordAccount(userId) {
  const id = String(userId || "").trim();
  if (!id) return null;

  const config = getRegistrationConfig();
  if (hasKv(config)) {
    const result = await kvPipeline(config, [["HGET", config.accountKey, id]]);
    return parseAccount(result?.[0]?.result);
  }

  return memoryAccounts.get(id) || null;
}

async function getDiscordRevokedAfter(userId) {
  const id = String(userId || "").trim();
  if (!id) return "";

  const config = getRegistrationConfig();
  if (hasKv(config)) {
    const result = await kvPipeline(config, [["HGET", config.revokedKey, id]]);
    return String(result?.[0]?.result || "");
  }

  return String(memoryAccounts.get(`revoked:${id}`)?.revokedAfter || "");
}

async function saveDiscordAccount(userId, accountPatch = {}) {
  const id = String(userId || accountPatch?.id || "").trim();
  if (!id) return null;

  const config = getRegistrationConfig();
  const existing = await getDiscordAccount(id);
  const now = new Date().toISOString();
  const account = {
    ...(existing || {}),
    ...accountPatch,
    id,
    createdAt: existing?.createdAt || accountPatch.createdAt || now,
    updatedAt: now,
  };

  if (hasKv(config)) {
    await kvPipeline(config, [["HSET", config.accountKey, id, JSON.stringify(account)]]);
  } else {
    memoryAccounts.set(id, account);
  }
  return account;
}

async function clearDiscordRegistrations() {
  const config = getRegistrationConfig();
  const registeredIds = Array.from(memoryRegistrations);
  memoryRegistrations.clear();
  memoryAccounts.clear();
  if (hasKv(config)) {
    const existing = await listKvRegistrationIds(config);
    await kvPipeline(config, [
      ["DEL", config.key],
      ["DEL", config.accountKey],
      ...existing.map((id) => ["DEL", getDiscordCostLedgerKey(id)]),
    ]);
    return { clearedUsers: existing.length };
  }
  return { clearedUsers: registeredIds.length };
}

async function removeDiscordRegistration(userId) {
  const id = String(userId || "").trim();
  if (!id) return { ok: false, code: "invalid_request", message: "Discord user id is required." };

  const config = getRegistrationConfig();
  const revokedAfter = new Date().toISOString();
  if (hasKv(config)) {
    const result = await kvPipeline(config, [
      ["SREM", config.key, id],
      ["HDEL", config.accountKey, id],
      ["DEL", getDiscordCostLedgerKey(id)],
      ["HSET", config.revokedKey, id, revokedAfter],
    ]);
    const removed = Number(result?.[0]?.result || 0) > 0 || Number(result?.[1]?.result || 0) > 0;
    return { ok: true, userId: id, removed, revokedAfter };
  }

  const removed = memoryRegistrations.delete(id) || memoryAccounts.delete(id);
  memoryAccounts.set(`revoked:${id}`, { revokedAfter });
  return { ok: true, userId: id, removed, revokedAfter };
}

async function updateDiscordRegistrationGroup(userId, groupName) {
  const id = String(userId || "").trim();
  const group = String(groupName || "").trim();
  if (!id) return { ok: false, code: "invalid_request", message: "Discord user id is required." };
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(group)) {
    return { ok: false, code: "invalid_request", message: "Group name is invalid." };
  }

  const registered = await isDiscordUserRegistered(id);
  if (!registered) {
    return { ok: false, code: "not_found", message: "Discord user is not registered." };
  }

  const account = await saveDiscordAccount(id, { groupName: group, group, manualGroup: true });
  return { ok: true, user: sanitizeAccount(account, id) };
}

async function updateDiscordRegistrationLimits(userId, limits = {}) {
  const id = String(userId || "").trim();
  if (!id) return { ok: false, code: "invalid_request", message: "Discord user id is required." };

  const parsed = {
    budgetUsd: parseOptionalLimit(limits.budgetUsd),
    maxInputTokens: parseOptionalLimit(limits.maxInputTokens, { integer: true }),
    maxOutputTokens: parseOptionalLimit(limits.maxOutputTokens, { integer: true }),
  };
  for (const [field, result] of Object.entries(parsed)) {
    if (!result.ok) {
      return { ok: false, code: "invalid_request", message: `${field} must be a non-negative number or empty.` };
    }
  }

  const registered = await isDiscordUserRegistered(id);
  if (!registered) {
    return { ok: false, code: "not_found", message: "Discord user is not registered." };
  }

  const hasManualLimits = Object.values(parsed).some((result) => result.value !== null);
  const account = await saveDiscordAccount(id, {
    budgetUsd: parsed.budgetUsd.value,
    maxInputTokens: parsed.maxInputTokens.value,
    maxOutputTokens: parsed.maxOutputTokens.value,
    manualLimits: hasManualLimits,
  });
  return { ok: true, user: sanitizeAccount(account, id) };
}

async function listDiscordRegistrations() {
  const config = getRegistrationConfig();
  const limit = getRegistrationLimit(config);
  if (hasKv(config)) return listKvRegistrations(config, limit);

  const users = Array.from(memoryRegistrations)
    .map((id) => sanitizeAccount(memoryAccounts.get(id) || { id }, id))
    .sort(sortAccounts);
  return {
    limit,
    count: users.length,
    storage: "memory",
    registrationKey: config.key,
    accountKey: config.accountKey,
    users,
  };
}

async function listKvRegistrations(config, limit) {
  const [ids, accountMap] = await readKvRegistrationData(config);
  const users = ids
    .map((id) => sanitizeAccount(accountMap[id] || { id }, id))
    .sort(sortAccounts);

  return {
    limit,
    count: ids.length,
    storage: "kv",
    registrationKey: config.key,
    accountKey: config.accountKey,
    users,
  };
}

async function listKvRegistrationIds(config) {
  const [ids] = await readKvRegistrationData(config);
  return ids;
}

async function readKvRegistrationData(config) {
  const result = await kvPipeline(config, [
    ["SMEMBERS", config.key],
    ["HGETALL", config.accountKey],
  ]);
  const ids = normalizeStringList(result?.[0]?.result);
  const accountMap = parseAccountMap(result?.[1]?.result);
  return [ids, accountMap];
}

async function ensureKvRegistration(config, id, limit, user, accountPatch) {
  const registration = await reserveKvRegistrationSlot(config, id, limit);
  if (!registration.ok) return limitExceeded(registration.count, limit);
  await saveDiscordAccount(id, buildAccount(user, accountPatch));
  return {
    ok: true,
    registered: true,
    added: registration.added,
    count: registration.count,
    limit,
  };
}

async function reserveKvRegistrationSlot(config, id, limit) {
  const script = [
    "local is_member = redis.call('SISMEMBER', KEYS[1], ARGV[1])",
    "local count = tonumber(redis.call('SCARD', KEYS[1])) or 0",
    "if is_member == 1 then return {1, 0, count} end",
    "local limit = tonumber(ARGV[2]) or 0",
    "if count >= limit then return {0, 0, count} end",
    "redis.call('SADD', KEYS[1], ARGV[1])",
    "return {1, 1, count + 1}",
  ].join("\n");
  const result = await kvPipeline(config, [["EVAL", script, 1, config.key, id, String(limit)]]);
  const tuple = Array.isArray(result?.[0]?.result) ? result[0].result : [];
  return {
    ok: Number(tuple[0] || 0) === 1,
    added: Number(tuple[1] || 0) === 1,
    count: Number(tuple[2] || 0) || 0,
  };
}

function ensureMemoryRegistration(id, limit, user, accountPatch) {
  if (memoryRegistrations.has(id)) {
    saveMemoryAccount(id, buildAccount(user, accountPatch));
    return { ok: true, registered: true, count: memoryRegistrations.size, limit };
  }
  if (memoryRegistrations.size >= limit) return limitExceeded(memoryRegistrations.size, limit);
  memoryRegistrations.add(id);
  saveMemoryAccount(id, buildAccount(user, accountPatch));
  return { ok: true, registered: true, added: true, count: memoryRegistrations.size, limit };
}

function saveMemoryAccount(id, accountPatch) {
  const now = new Date().toISOString();
  const existing = memoryAccounts.get(id) || {};
  memoryAccounts.set(id, {
    ...existing,
    ...accountPatch,
    id,
    createdAt: existing.createdAt || accountPatch.createdAt || now,
    updatedAt: now,
  });
}

function buildAccount(user, patch) {
  return {
    id: String(user?.id || patch?.id || ""),
    username: String(user?.username || patch?.username || ""),
    globalName: String(user?.global_name || user?.globalName || patch?.globalName || ""),
    avatar: String(user?.avatar || patch?.avatar || ""),
    ...patch,
  };
}

function limitExceeded(count, limit) {
  return {
    ok: false,
    code: "registration_limit_exceeded",
    message: `Registration limit reached: ${Math.min(count, limit)}/${limit} users are already registered.`,
    count: Math.min(count, limit),
    limit,
  };
}

function getRegistrationLimit(config) {
  const limit = Number(config.limit);
  return Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_REGISTRATION_LIMIT;
}

function hasKv(config) {
  return Boolean(config.kvRestApiUrl && config.kvRestApiToken);
}

function parseAccount(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseAccountMap(value) {
  const output = {};
  if (!value) return output;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 2) {
      const id = String(value[index] || "").trim();
      if (!id) continue;
      output[id] = parseAccount(value[index + 1]) || { id };
    }
    return output;
  }

  if (typeof value === "object") {
    for (const [id, account] of Object.entries(value)) {
      const safeId = String(id || "").trim();
      if (!safeId) continue;
      output[safeId] = parseAccount(account) || { id: safeId };
    }
  }
  return output;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function sanitizeAccount(account, fallbackId) {
  const id = String(account?.id || fallbackId || "").trim();
  const avatar = String(account?.avatar || "");
  return {
    id,
    username: String(account?.username || ""),
    globalName: String(account?.globalName || account?.global_name || ""),
    displayName: String(account?.displayName || account?.globalName || account?.global_name || account?.username || id),
    avatar,
    avatarUrl: buildDiscordAvatarUrl(id, avatar),
    groupName: String(account?.groupName || account?.group || ""),
    manualGroup: Boolean(account?.manualGroup),
    guildId: String(account?.guildId || account?.guild_id || ""),
    resourceChannelId: String(account?.resourceChannelId || account?.resource_channel_id || ""),
    roles: Array.isArray(account?.roles) ? account.roles.map((role) => String(role)) : [],
    budgetUsd: normalizeOptionalLimit(account?.budgetUsd),
    maxInputTokens: normalizeOptionalLimit(account?.maxInputTokens, { integer: true }),
    maxOutputTokens: normalizeOptionalLimit(account?.maxOutputTokens, { integer: true }),
    manualLimits: Boolean(account?.manualLimits),
    createdAt: String(account?.createdAt || ""),
    updatedAt: String(account?.updatedAt || ""),
    keyIssuedAt: String(account?.keyIssuedAt || ""),
    keyExpiresAt: account?.keyExpiresAt ? String(account.keyExpiresAt) : "",
  };
}

function parseOptionalLimit(value, options = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return { ok: true, value: null };
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return { ok: false, value: null };
  return { ok: true, value: options.integer ? Math.floor(number) : roundUsd(number) };
}

function normalizeOptionalLimit(value, options = {}) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return options.integer ? Math.floor(number) : roundUsd(number);
}

function roundUsd(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function buildDiscordAvatarUrl(id, avatar) {
  if (!id || !avatar) return "";
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(id)}/${encodeURIComponent(avatar)}.${ext}?size=64`;
}

function getDiscordCostLedgerKey(id) {
  return `${process.env.COST_LEDGER_KEY_PREFIX || "gateway:cost:"}discord_user:${id}`;
}

function sortAccounts(left, right) {
  const leftTime = left.createdAt || left.updatedAt || "";
  const rightTime = right.createdAt || right.updatedAt || "";
  return String(leftTime).localeCompare(String(rightTime)) || String(left.id).localeCompare(String(right.id));
}

async function kvPipeline(config, commands) {
  const response = await fetch(`${config.kvRestApiUrl.replace(/\/+$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.kvRestApiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!response.ok) {
    throw new Error(`Discord registration store request failed: ${response.status}`);
  }
  return response.json();
}

module.exports = {
  clearDiscordRegistrations,
  DEFAULT_REGISTRATION_KEY,
  ensureDiscordRegistration,
  getDiscordAccount,
  getDiscordRevokedAfter,
  getRegistrationConfig,
  isDiscordUserRegistered,
  listDiscordRegistrations,
  removeDiscordRegistration,
  saveDiscordAccount,
  updateDiscordRegistrationGroup,
  updateDiscordRegistrationLimits,
};
