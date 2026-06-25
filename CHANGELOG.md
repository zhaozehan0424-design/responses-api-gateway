# Changelog

## v0.1.9 - 2026-06-25

Maintainer security audit and configuration documentation.

- Added `scripts/check-maintainer-audit.cjs` to verify sensitive files are not tracked, runtime environment variables are documented, and maintenance/security docs stay present.
- Added the maintainer audit to `npm run check` so CI covers repository hygiene alongside syntax, public repo, Discord config, and smoke checks.
- Documented the remaining runtime environment variables in `.env.example`, including secondary upstream, CORS, timeout, site switches, registration KV keys, Upstash aliases, and cost-ledger prefix settings.
- Updated maintenance notes to record the June 25 repository hygiene pass.

## v0.1.8 - 2026-06-23

Related deployed project documentation, launch-copy cleanup, and additional Vercel evidence.

- Documented the maintainer's separate Vercel-deployed Memory Palace learning project as related public deployment history.
- Linked the Memory Palace repository and live demo from the README and adoption notes.
- Clarified that Memory Palace is not counted as Relay Hub traffic or Relay Hub adoption.
- Repaired the Chinese launch-post copy in `docs/LAUNCH.md`.
- Added a cropped Vercel Fluid Active CPU 75% usage notification image to adoption evidence.
- Added related-project checks to the public repository verification script.

## v0.1.7 - 2026-06-23

Discord OAuth configuration validation.

- Added shared Discord OAuth configuration validation for login and callback routes.
- Added explicit operator-facing errors for missing variables, invalid redirect URLs, malformed JSON maps, invalid Discord IDs, and missing guild/bot settings for advanced gates.
- Added `scripts/check-discord-config.cjs` so Discord config validation is covered by `npm run check`.
- Documented the Discord Developer Portal redirect checklist in the README and `.env.example`.
- Prepared the Discord OAuth validation issue for closure.

## v0.1.6 - 2026-06-23

Adoption evidence images and CI smoke tests.

- Added redacted Discord and Vercel evidence images under `docs/evidence/`.
- Linked the evidence images from `ADOPTION.md`.
- Added smoke tests for `GET /v1/models`, `POST /v1/responses`, `POST /v1/chat/completions`, invalid keys, and disallowed models.
- Updated `npm run check` so smoke tests run in GitHub Actions without real upstream API keys.
- Prepared the endpoint smoke-test issue for closure.

## v0.1.5 - 2026-06-23

Prior usage and adoption notes.

- Added `ADOPTION.md` with privacy-preserving notes about the Discord community pilot.
- Documented Vercel usage notification evidence without committing private mailbox screenshots.
- Linked adoption notes from the README.
- Added adoption notes to public-repo checks.

## v0.1.4 - 2026-06-23

Vercel KV / Upstash deployment documentation.

- Added `docs/VERCEL_KV_UPSTASH.md` with durable-storage setup notes.
- Documented KV-backed call logs, quota ledgers, Discord registration state, and memory fallback behavior.
- Linked the KV setup guide from the README.
- Added the KV setup guide to public-repo checks.
- Prepared the Vercel KV / Upstash documentation issue for closure.

## v0.1.3 - 2026-06-23

SDK compatibility examples.

- Added JavaScript and Python OpenAI SDK examples.
- Added `docs/SDK_EXAMPLES.md` with base URL, downstream key, and error-behavior notes.
- Linked SDK examples from the README.
- Prepared the SDK examples issue for closure.

## v0.1.2 - 2026-06-23

Public launch materials and screenshots.

- Added README screenshots for the landing page, docs, user dashboard, and admin call-log workflow.
- Tightened the README opening value proposition for faster GitHub scanning.
- Added `docs/LAUNCH.md` with Chinese and English launch posts plus a sharing checklist.
- Prepared the screenshot issue for closure.

## v0.1.1 - 2026-06-23

Maintenance and public project hygiene.

- Added GitHub Actions CI for syntax and public-repo checks.
- Added `MAINTENANCE.md` with a public maintenance log and recurring checklist.
- Added suggested roadmap issue drafts for testing, deployment docs, Discord hardening, screenshots, and SDK examples.
- Kept the Vercel DNS patch helper as an explicit maintenance utility for CLI network issues.

## v0.1.0 - 2026-06-22

Initial public open-source release.

- Added OpenAI-compatible gateway endpoints for models, Responses API, and Chat Completions.
- Added downstream key support, model allowlists, rate limits, and group policy controls.
- Added optional Discord registration/login and user dashboard.
- Added admin logs with masked key metadata.
- Added Vercel and Docker deployment support.
- Added public documentation, roadmap, contribution guide, and security policy.
