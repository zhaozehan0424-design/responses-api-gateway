# Maintenance

This document records public maintenance work for Relay Hub. It is intentionally practical: the goal is to show what changed, how it was verified, and what remains on the roadmap.

## Current Maintainer

- GitHub: `zhaozehan0424-design`
- Role: primary maintainer
- Public repo: https://github.com/zhaozehan0424-design/responses-api-gateway
- Production demo: https://responses-api-gateway.vercel.app

## Maintenance Log

### 2026-06-23

- Added public README screenshots for the landing page, docs, user dashboard, and admin call-log workflow.
- Added a launch kit with Chinese and English posts for sharing the project without asking for artificial stars.
- Tightened the README top section so visitors can understand the project value before scrolling.

### 2026-06-22

- Published the first public open-source release under the MIT license.
- Added public README, roadmap, contribution guide, security policy, issue templates, pull request template, and release notes.
- Added a public Vercel/Docker deployment surface with `.env.example`.
- Restored the production demo site and verified that the production deployment was `Ready` in Vercel.
- Added a temporary Vercel DNS patch helper for environments where `vercel.com` resolves to a TLS-broken route during CLI operations. The helper is opt-in and only affects the current Node process.

### 2026-06-21

- Redesigned the admin console into separate operational work areas for user management and call-log review.
- Reworked call logs from a wide table into a search/filter/detail workflow inspired by log-explorer tools.
- Reworked member management into a compact list with a persistent selected-user details panel.
- Preserved existing admin actions for group changes, quota edits, token caps, resets, user removal, and per-user log review.
- Verified JavaScript syntax, Vercel build, local protected admin routes, and Vercel production readiness.

### 2026-06-21

- Clarified admin-console wording for actions that are immediate versus actions that generate environment-variable commands.
- Renamed non-immediate global block actions so operators understand that deployment is required before they take effect.
- Added clearer UI feedback after adding pending blocked keys or blocked Discord IDs.

### 2026-06-21

- Kept public registration closed while increasing reserved registration capacity from 20 to 25.
- Verified that the registration endpoint still returned `403` while the site stayed open.

### 2026-06-21

- Normalized external model identifiers so `agy-*` models match the upstream `/v1/models` IDs exactly.
- Updated the model plaza, admin model selectors, and backend forwarding logic to use raw model IDs.
- Grouped displayed model lists by provider/family so Claude and Gemini variants are easier to scan.
- Verified `/v1/models` returned raw `agy-*` identifiers without the old display prefix.

## Regular Maintenance Checklist

- Keep the demo site reachable and update the README if a route changes.
- Open issues for known bugs, compatibility work, security hardening, and documentation gaps.
- Run `npm run check` before releases.
- Update `CHANGELOG.md` whenever a user-facing behavior or operator workflow changes.
- Cut small releases for meaningful maintenance batches.
- Keep `.env`, `.vercel/`, logs, generated outputs, and local secret files out of commits.

## Vercel CLI DNS Helper

Some local networks can resolve `vercel.com` to an address that fails TLS handshakes while `api.vercel.com` still works. If that happens, use the opt-in helper for a single command:

```powershell
$env:NODE_OPTIONS = "--require ./scripts/vercel-dns-patch.cjs"
npx vercel whoami
Remove-Item Env:\NODE_OPTIONS
```

Do not leave `NODE_OPTIONS` set globally. This helper is only for local maintenance commands and is not required by the deployed gateway.

## Near-Term Backlog

- Add compatibility smoke tests for `/v1/models`, `/v1/responses`, and `/v1/chat/completions`.
- Add Vercel KV / Upstash setup docs for durable logs and quota storage.
- Add screenshots for the public docs page, dashboard, and admin log view.
- Add example clients for Python and JavaScript SDK users.
- Harden Discord OAuth setup validation and admin-token handling.
