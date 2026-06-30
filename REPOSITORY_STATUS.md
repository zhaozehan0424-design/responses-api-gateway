# Repository Status

Last reviewed: 2026-06-30
Maintainer: @zhaozehan0424-design
Repository: `zhaozehan0424-design/responses-api-gateway`
Project type: Node.js/Vercel gateway
Current public version: v0.1.10

## Purpose

OpenAI-compatible gateway with downstream keys, quotas, Discord registration, admin logs, and Vercel/Docker deployment support.

## Current Health

- Public source is present with README, license, changelog, maintenance notes, security policy, contribution guide, issue templates, PR template, and CI workflow.
- CI is configured through `.github/workflows/ci.yml`.
- Sensitive runtime files are intentionally excluded from the public repository where applicable.
- The repository is ready for routine public maintenance and small external contributions.

## Latest Local Verification

- `npm run check -> syntax_ok=31, public_repo_ok=true, maintainer_audit_ok=true, discord_config_ok=true, smoke_tests_ok=true`

## Runtime / Deployment Notes

Node.js 22.x, Vercel serverless or local Docker/Node deployment.

## Maintenance Cadence

Review security-sensitive configuration and public adoption evidence after every feature change.

## Next Useful Improvements

- Keep screenshots, examples, and README commands in sync with real behavior.
- Add regression tests before changing core behavior.
- Convert repeated user questions or setup friction into documentation updates.
- Review open issues and pull requests before each release tag.
