# Vercel KV / Upstash Setup

Relay Hub can run without durable storage, but production deployments should use Vercel KV or Upstash Redis for call logs, quota ledgers, and Discord registration state.

## What KV Stores

When `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set, Relay Hub stores:

- Admin call logs in a Redis list.
- Per-key or per-Discord-user quota spend in Redis string counters.
- Discord registration IDs in a Redis set.
- Discord account metadata and manual group/limit overrides in Redis hashes.
- Revocation timestamps for removed Discord users in a Redis hash.

Without KV, these records use in-memory storage. That is fine for local testing, but serverless instances can restart or scale independently, so memory state is not durable.

## Required Variables

Use either Vercel KV variable names:

```text
KV_REST_API_URL=https://your-kv-rest-url
KV_REST_API_TOKEN=your-kv-rest-token
```

or Upstash Redis REST variable names:

```text
UPSTASH_REDIS_REST_URL=https://your-upstash-rest-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
```

Relay Hub checks `KV_REST_API_URL` / `KV_REST_API_TOKEN` first, then falls back to `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

## Optional Key Names

The defaults are safe for a single Relay Hub deployment:

```text
CALL_LOG_KEY=gateway:call_logs
COST_LEDGER_KEY_PREFIX=gateway:cost:
DISCORD_REGISTRATION_KEY=gateway:discord:registered_users
DISCORD_ACCOUNT_KEY=gateway:discord:accounts
DISCORD_REVOKED_KEY=gateway:discord:revoked_after
```

Change these only when multiple Relay Hub deployments share one Redis database. Use a deployment-specific prefix, for example:

```text
CALL_LOG_KEY=relayhub:prod:call_logs
COST_LEDGER_KEY_PREFIX=relayhub:prod:cost:
DISCORD_REGISTRATION_KEY=relayhub:prod:discord:registered_users
DISCORD_ACCOUNT_KEY=relayhub:prod:discord:accounts
DISCORD_REVOKED_KEY=relayhub:prod:discord:revoked_after
```

## Vercel Setup

1. Create a Vercel KV database or connect an Upstash Redis database to the Vercel project.
2. Add the REST URL and REST token as production environment variables.
3. Redeploy the project so serverless functions receive the new variables.
4. Open `/admin` with `ADMIN_TOKEN` and refresh call logs or registrations.

PowerShell example:

```powershell
npx vercel env add KV_REST_API_URL production
npx vercel env add KV_REST_API_TOKEN production
npx vercel --prod
```

If you prefer the Upstash variable names:

```powershell
npx vercel env add UPSTASH_REDIS_REST_URL production
npx vercel env add UPSTASH_REDIS_REST_TOKEN production
npx vercel --prod
```

## Verification

After redeploying:

1. Call `GET /v1/models` with a valid downstream key.
2. Open `/admin`, refresh logs, and confirm the storage label reports `kv`.
3. If Discord login is enabled, register or log in once and refresh the registration list.
4. Restart or redeploy the project, then confirm logs, spend, and registrations remain available.

If `/admin` reports `memory`, the deployment did not receive both REST variables. Recheck the environment variable names, production scope, and latest deployment.

## Operational Notes

- Do not expose Redis REST tokens to browsers or users.
- Rotate `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN` if it is leaked.
- Keep separate key prefixes for preview and production deployments when they share one Redis database.
- Use `CALL_LOG_LIMIT` to control how many recent admin log records Relay Hub keeps.
- Use the admin UI to clear logs or reset a user quota when needed.
