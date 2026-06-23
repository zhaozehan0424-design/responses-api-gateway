const assert = require("node:assert/strict");
const { getDiscordOAuthConfig } = require("../lib/discord-config");

const discordEnvNames = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_KEY_SECRET",
  "SESSION_SECRET",
  "DISCORD_REDIRECT_URI",
  "DISCORD_ALLOWED_GUILD_ID",
  "DISCORD_RESOURCE_CHANNEL_ID",
  "DISCORD_ALLOWED_ROLE_IDS",
  "DISCORD_ROLE_GROUP_MAP_JSON",
  "DISCORD_GROUP_USER_MAP_JSON",
  "DISCORD_BLOCKED_USER_IDS",
  "DISCORD_BOT_TOKEN",
  "DISCORD_DEFAULT_GROUP",
  "DISCORD_KEY_TTL_DAYS",
];

const savedEnv = Object.fromEntries(discordEnvNames.map((name) => [name, process.env[name]]));

try {
  testValidMinimalConfig();
  testMissingRequiredConfig();
  testRedirectUriValidation();
  testAdvancedGateRequiresGuildAndBot();
  testJsonValidation();
  testIdValidation();
  testLocalhostRedirectIsAllowed();
  console.log("discord_config_ok=true");
} finally {
  restoreEnv();
}

function testValidMinimalConfig() {
  resetEnv({
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "client-secret",
    DISCORD_KEY_SECRET: "signing-secret",
    DISCORD_REDIRECT_URI: "https://gateway.example.com/api/auth/discord/callback",
  });

  const config = getDiscordOAuthConfig(request());
  assert.equal(config.ok, true);
  assert.equal(config.redirectUri, "https://gateway.example.com/api/auth/discord/callback");
  assert.equal(config.defaultGroup, "guest");
  assert.equal(config.keyTtlDays, 30);
}

function testMissingRequiredConfig() {
  resetEnv({});
  const config = getDiscordOAuthConfig(request());
  assert.equal(config.ok, false);
  assert.match(config.message, /DISCORD_CLIENT_ID is required/);
  assert.match(config.message, /DISCORD_CLIENT_SECRET is required/);
  assert.match(config.message, /DISCORD_KEY_SECRET or SESSION_SECRET is required/);
}

function testRedirectUriValidation() {
  resetEnv({
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "client-secret",
    DISCORD_KEY_SECRET: "signing-secret",
    DISCORD_REDIRECT_URI: "http://gateway.example.com/wrong/callback",
  });

  const config = getDiscordOAuthConfig(request());
  assert.equal(config.ok, false);
  assert.match(config.message, /must use https/);
  assert.match(config.message, /must point to \/api\/auth\/discord\/callback/);
}

function testAdvancedGateRequiresGuildAndBot() {
  resetEnv({
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "client-secret",
    DISCORD_KEY_SECRET: "signing-secret",
    DISCORD_RESOURCE_CHANNEL_ID: "234567890123456789",
  });

  const config = getDiscordOAuthConfig(request());
  assert.equal(config.ok, false);
  assert.match(config.message, /DISCORD_ALLOWED_GUILD_ID is required/);
  assert.match(config.message, /DISCORD_BOT_TOKEN is required/);
}

function testJsonValidation() {
  resetEnv({
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "client-secret",
    DISCORD_KEY_SECRET: "signing-secret",
    DISCORD_ROLE_GROUP_MAP_JSON: "{bad-json",
  });

  const config = getDiscordOAuthConfig(request());
  assert.equal(config.ok, false);
  assert.match(config.message, /DISCORD_ROLE_GROUP_MAP_JSON must be valid JSON/);
}

function testIdValidation() {
  resetEnv({
    DISCORD_CLIENT_ID: "not-a-snowflake",
    DISCORD_CLIENT_SECRET: "client-secret",
    DISCORD_KEY_SECRET: "signing-secret",
    DISCORD_ALLOWED_ROLE_IDS: "123456789012345678,role-name",
  });

  const config = getDiscordOAuthConfig(request());
  assert.equal(config.ok, false);
  assert.match(config.message, /DISCORD_CLIENT_ID must be a Discord snowflake ID/);
  assert.match(config.message, /DISCORD_ALLOWED_ROLE_IDS must be a Discord snowflake ID/);
}

function testLocalhostRedirectIsAllowed() {
  resetEnv({
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "client-secret",
    DISCORD_KEY_SECRET: "signing-secret",
    DISCORD_REDIRECT_URI: "http://localhost:4000/api/auth/discord/callback",
  });

  const config = getDiscordOAuthConfig(request({ host: "localhost:4000", protocol: "http" }));
  assert.equal(config.ok, true);
  assert.equal(config.redirectUri, "http://localhost:4000/api/auth/discord/callback");
}

function resetEnv(values) {
  for (const name of discordEnvNames) {
    delete process.env[name];
  }
  Object.assign(process.env, values);
}

function restoreEnv() {
  for (const name of discordEnvNames) {
    if (savedEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedEnv[name];
    }
  }
}

function request(options = {}) {
  const host = options.host || "gateway.example.com";
  const protocol = options.protocol || "https";
  return {
    headers: {
      host,
      "x-forwarded-host": host,
      "x-forwarded-proto": protocol,
    },
  };
}
