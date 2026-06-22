const crypto = require("node:crypto");

const DISCORD_KEY_PREFIX = "sk-dc-";
const DEFAULT_STATE_TTL_SECONDS = 10 * 60;

function base64UrlEncode(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return input.toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function signPayload(payload, secret) {
  if (!secret) throw new Error("A signing secret is required");
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signatureFor(encodedPayload, secret)}`;
}

function verifySignedPayload(token, secret) {
  if (!secret || typeof token !== "string") return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expected = signatureFor(encodedPayload, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
}

function signDiscordApiKey(payload, secret) {
  return `${DISCORD_KEY_PREFIX}${signPayload(payload, secret)}`;
}

function verifyDiscordApiKey(key, secret) {
  if (typeof key !== "string" || !key.startsWith(DISCORD_KEY_PREFIX)) return null;

  const payload = verifySignedPayload(key.slice(DISCORD_KEY_PREFIX.length), secret);
  if (!payload || !payload.sub) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload.exp) > 0 && now >= Number(payload.exp)) return null;

  return payload;
}

function signDiscordState(secret, extraPayload = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    nonce: crypto.randomBytes(18).toString("base64url"),
    iat: now,
    exp: now + DEFAULT_STATE_TTL_SECONDS,
    ...extraPayload,
  }, secret);
}

function verifyDiscordState(state, secret) {
  const payload = verifySignedPayload(state, secret);
  if (!payload || !payload.nonce) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload.exp) > 0 && now >= Number(payload.exp)) return null;

  return payload;
}

function signatureFor(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  DISCORD_KEY_PREFIX,
  base64UrlDecode,
  base64UrlEncode,
  signDiscordApiKey,
  signDiscordState,
  signPayload,
  verifyDiscordApiKey,
  verifyDiscordState,
  verifySignedPayload,
};
