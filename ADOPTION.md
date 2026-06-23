# Adoption and Prior Usage

Relay Hub was public-released after a small Discord community pilot and a live Vercel deployment. This page records public, privacy-preserving evidence of that prior usage.

## Prior Community Pilot

Before the first public OSS release, the maintainer deployed Relay Hub as a gateway for a Discord community pilot. Community members received downstream API keys and used the deployed gateway instead of receiving the upstream provider key directly.

Related Discord post:

- https://discord.com/channels/1134557553011998840/1513823428614946956

Redacted evidence images:

- [Discord community post](./docs/evidence/discord-community-post.png)
- [Discord locked-thread notice](./docs/evidence/discord-locked-thread.png)

The Discord link may require access to the original server and channel. The repository does not publish private Discord messages, user IDs, avatars, API keys, or raw request logs.

## Vercel Usage Evidence

The deployed Vercel project/team generated enough production traffic to trigger Vercel free-tier usage notification emails. The maintainer received usage warnings for:

- Function Invocation usage reaching 75% of the included free-tier allowance of 1,000,000 invocations.
- Edge Requests usage reaching 100% of the included free-tier allowance of 1,000,000 requests.

Redacted evidence image:

- [Vercel usage notification](./docs/evidence/vercel-usage-email.png)

The raw email screenshot is not committed because it includes personal mailbox context. The repository stores only a redacted evidence image that keeps the Vercel sender, usage thresholds, and project/team context visible.

## How Prior Usage Shaped the Project

The Discord pilot and Vercel deployment informed several maintenance decisions before the public release:

- Downstream keys keep the upstream API key server-side.
- Per-key and per-group quotas help control shared model access.
- Admin logs provide masked request metadata for operational review.
- Discord registration and dashboard flows support controlled community access.
- Vercel KV / Upstash documentation explains durable storage for production logs, spend ledgers, and registrations.

## Privacy Boundary

Public documentation intentionally avoids exposing:

- Real upstream or downstream API keys.
- Discord IDs, usernames, avatars, or private channel content.
- Raw request bodies, private logs, or account screenshots.
- Vercel tokens, admin tokens, cookies, or project secrets.
