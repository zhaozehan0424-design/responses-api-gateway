# Relay Hub

This project runs a thin OpenAI-compatible gateway in front of the upstream API.
Users call your gateway URL and their own downstream keys; the real upstream base URL
and upstream key stay server-side in `.env`.

## Start

```powershell
docker compose up -d
```

The local base URL is:

```text
http://localhost:4000/v1
```

Local health check:

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:4000/healthz"
```

## Deploy To Vercel

Set these environment variables in Vercel:

```text
UPSTREAM_API_BASE=https://api.example.com/v1
UPSTREAM_API_KEY=your-real-upstream-key
DOWNSTREAM_API_KEYS=sk-user-key-1,sk-user-key-2
MODEL_ALLOWLIST=claude-opus-fable,claude-opus-4-5-20251101,claude-opus-4-6,claude-opus-4-7,claude-opus-4-8,claude-sonnet-4-6,claude-sonnet-4-5-20250929,claude-haiku-4-5-20251001
RPM_LIMIT=4
DEFAULT_KEY_BUDGET_USD=30
GUEST_EXCLUDED_MODELS=claude-opus-fable
```

Deploy:

```powershell
npx vercel --prod
```

Give users:

```text
base_url: https://responses-api-gateway.vercel.app/v1
api_key: let users copy it from /dashboard after registration/login
```

## Create a downstream key

Generate a random key:

```powershell
$key = "sk-" + (([guid]::NewGuid().ToString("N")) + ([guid]::NewGuid().ToString("N"))).Substring(0,32)
$key
```

Add it to `DOWNSTREAM_API_KEYS` in `.env`. Multiple keys are comma-separated:

```text
DOWNSTREAM_API_KEYS=sk-user-key-1,sk-user-key-2
```

Then restart:

```powershell
docker compose up -d --build
```

Give users this shape:

```text
base_url: http://your-domain-or-server:4000/v1
api_key: one-of-your-downstream-keys
```

## Test a key

Responses API:

```powershell
$userKey = (Get-Content .env | Where-Object { $_ -like "DOWNSTREAM_API_KEYS=*" }).Split("=",2)[1].Split(",")[0]
$body = @{
  model = "claude-haiku-4-5-20251001"
  input = "Reply with OK only."
  max_output_tokens = 3
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/v1/responses" `
  -Headers @{ Authorization = "Bearer $userKey" } `
  -ContentType "application/json" `
  -Body $body
```

Chat Completions API:

```powershell
$userKey = (Get-Content .env | Where-Object { $_ -like "DOWNSTREAM_API_KEYS=*" }).Split("=",2)[1].Split(",")[0]
$body = @{
  model = "claude-haiku-4-5-20251001"
  messages = @(@{ role = "user"; content = "Reply with OK only." })
  max_tokens = 3
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/v1/chat/completions" `
  -Headers @{ Authorization = "Bearer $userKey" } `
  -ContentType "application/json" `
  -Body $body
```

The gateway exposes `GET /v1/models`, `POST /v1/responses`, and
`POST /v1/chat/completions` to downstream users.

## Settings

`MODEL_ALLOWLIST` controls which model names users can call.
`MODEL_PRICES_JSON` optionally overrides model prices. Prices are USD per
million input/output tokens. Defaults are Opus 4.x `$5/$25`, Sonnet 4.x
`$3/$15`, Haiku 4.5 `$1/$5`, and Fable `$10/$50`.
`DEFAULT_KEY_BUDGET_USD` controls the default Discord guest quota. The built-in
`guest` group can use every allowlisted model except models in
`GUEST_EXCLUDED_MODELS` and has a `$30` budget by default.
`RPM_LIMIT` is a simple per-key requests-per-minute limit. The recommended
public-site value is `4`, meaning each API key can make at most 4 requests per
minute before receiving `rate_limit_exceeded`.
`MAX_REQUEST_COST_USD` is optional and defaults to `0` (disabled). The normal
budget ledger is still enforced by Discord user or key quota.
`MAX_BODY_BYTES` limits upload size.
`ADMIN_TOKEN` enables the call-log viewer on `/admin`. Logs mask API keys and
store only metadata such as time, group, endpoint, model, user agent, status,
and token limits. For Vercel production, configure `KV_REST_API_URL` and
`KV_REST_API_TOKEN` from Vercel KV / Upstash Redis if you want durable logs;
without KV, logs are in memory and can disappear on cold starts or redeploys.
`GATEWAY_BLOCKED_KEY_HASHES` blocks specific keys by the short key hash shown in
the admin call logs, without storing or exposing the raw key.

## Identity Groups

Leave these unset to keep the current `DOWNSTREAM_API_KEYS` behavior. Add them
when you want per-key groups.

```text
GATEWAY_GROUPS_JSON={
  "guest": {
    "models": ["claude-haiku-4-5-20251001"],
    "endpoints": ["models", "chat.completions"],
    "allowStream": false,
    "rpmLimit": 4,
    "maxInputTokens": 0,
    "maxOutputTokens": 300,
    "budgetUsd": 30
  },
  "trusted": {
    "models": ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"],
    "endpoints": ["models", "responses", "chat.completions"],
    "allowStream": true,
    "rpmLimit": 4,
    "maxInputTokens": 0,
    "maxOutputTokens": 1200,
    "budgetUsd": 30
  }
}

GATEWAY_KEYS_JSON={
  "sk-user-guest": { "name": "guest user", "group": "guest", "enabled": true },
  "sk-user-trusted": { "name": "trusted user", "group": "trusted", "enabled": true },
  "sk-disabled-user": { "name": "disabled user", "group": "guest", "enabled": false }
}
```

Group fields:

```text
models           Models visible in /v1/models and allowed in requests.
endpoints        Allowed endpoints: models, responses, chat.completions.
allowStream      Whether stream=true is allowed.
rpmLimit         Per-key requests per minute for this group. 0 means unlimited.
maxInputTokens   Approximate request-body input token cap. 0 means unlimited.
maxOutputTokens  Maximum max_tokens / max_output_tokens / max_completion_tokens.
budgetUsd        Per-key or per-Discord-user USD quota for this group. 0 means unlimited.
```

Admin users can override `budgetUsd`, `maxInputTokens`, and `maxOutputTokens`
for a single registered Discord account from `/admin`. Empty member fields
inherit the group value; `0` explicitly disables that member-level limit.

## Discord Registration And Login

Discord login is optional. When enabled, users should register or log in and
then copy their API key from the user dashboard:

```text
Register: https://your-domain.example/api/auth/discord/login?mode=register
Login:    https://your-domain.example/api/auth/discord/login?mode=login
Panel:    https://your-domain.example/dashboard
```

The OAuth callback no longer shows a one-time "get key" page. It creates or
restores a site account, writes a signed session cookie, and redirects to
`/dashboard`.

Existing old `sk-dc-...` keys can stay usable while
`DISCORD_ALLOW_LEGACY_KEYS=true`. They continue to spend the same per-Discord
user quota. When their quota is exhausted, the API returns `quota_exceeded` and
the user must register/login under the new account system.

The `sk-dc-...` key is signed by your server. Users cannot edit the embedded
Discord id, server claim, resource-area claim, or group without invalidating the
key.

Create a Discord application, add this redirect URI in the Discord Developer
Portal, then set these Vercel environment variables:

```text
DISCORD_CLIENT_ID=your-discord-application-client-id
DISCORD_CLIENT_SECRET=your-discord-application-client-secret
DISCORD_KEY_SECRET=replace-with-a-long-random-secret
DISCORD_REDIRECT_URI=https://your-domain.example/api/auth/discord/callback
DISCORD_DEFAULT_GROUP=guest
DISCORD_KEY_TTL_DAYS=30
DISCORD_REGISTRATION_LIMIT=20
DISCORD_ALLOW_LEGACY_KEYS=true
```

Class-brain community and resource-area controls:

```text
DISCORD_ALLOWED_GUILD_ID=required-discord-server-id
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_RESOURCE_CHANNEL_ID=class-brain-public-resource-channel-or-category-id
DISCORD_ALLOWED_ROLE_IDS=role-id-1,role-id-2
DISCORD_ROLE_GROUP_MAP_JSON={"role-id-1":"guest","role-id-2":"trusted"}
DISCORD_GROUP_USER_MAP_JSON={"123456789012345678":"trusted"}
DISCORD_BLOCKED_USER_IDS=123456789012345678,234567890123456789
```

If `DISCORD_ALLOWED_GUILD_ID` is set, only members of that Discord server can
register or log in. To restrict access to a class-brain "公益站资源区" channel or
category, set `DISCORD_BOT_TOKEN` and `DISCORD_RESOURCE_CHANNEL_ID`; the bot must
be in the server and able to read member/channel metadata. If
`DISCORD_ALLOWED_ROLE_IDS` is set, only users with one of those roles can enter.
If `DISCORD_ROLE_GROUP_MAP_JSON` maps a role id to a gateway group, users with
that role receive the mapped group. `DISCORD_GROUP_USER_MAP_JSON` can still
override a specific Discord user id.

To reset the test registration counter, delete these two KV keys:

```text
gateway:discord:registered_users
gateway:discord:accounts
```

Do not delete the cost ledger keys (`gateway:cost:*`) if old keys should keep
their remaining quota history.

### Discord Setup Checklist

1. In Discord Developer Portal, create or open your application.
2. Add the redirect URI: `https://your-domain.example/api/auth/discord/callback`.
3. Create a bot for the application and invite it to the class-brain server.
4. Give the bot enough permission to read member metadata and the resource-area
   channel/category permission overwrites.
5. In Discord, enable Developer Mode, then copy the server ID and the "公益站资源区"
   channel/category ID.
6. Put those IDs into Vercel as `DISCORD_ALLOWED_GUILD_ID` and
   `DISCORD_RESOURCE_CHANNEL_ID`.
7. Put the bot token into Vercel as `DISCORD_BOT_TOKEN`.
8. Set `DISCORD_REGISTRATION_LIMIT=20`.
9. Keep `DISCORD_ALLOW_LEGACY_KEYS=true` until old keys have naturally used
   their remaining quota.

## Stop

```powershell
docker compose down
```
