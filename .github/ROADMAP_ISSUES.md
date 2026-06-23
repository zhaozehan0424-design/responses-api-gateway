# Suggested Roadmap Issues

Use these as public GitHub issues when the repo is ready for ongoing triage.

## Add CI smoke tests for OpenAI-compatible endpoints

Add automated smoke tests for:

- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/chat/completions`
- invalid downstream API keys
- disallowed models

Acceptance criteria:

- Tests run in GitHub Actions.
- Tests do not require real upstream API keys.
- Failure output is clear enough for contributors.

Labels: `testing`, `good first issue`

## Document Vercel KV / Upstash setup

Write setup docs for durable quota and admin log storage.

Acceptance criteria:

- Include required environment variables.
- Explain local fallback behavior.
- Add a verification checklist for deployed projects.

Labels: `documentation`, `deployment`

## Harden Discord OAuth configuration validation

Improve startup/runtime validation for Discord registration settings.

Acceptance criteria:

- Missing required Discord variables return clear operator-facing errors.
- Misconfigured redirect URI is easy to diagnose.
- Docs include the expected Discord application settings.

Labels: `security`, `discord`, `enhancement`

## Add screenshots for public docs and admin workflows

Add current screenshots to the README or docs.

Acceptance criteria:

- Public docs page screenshot.
- User dashboard screenshot.
- Admin log/detail workflow screenshot with sensitive data masked.

Labels: `documentation`

## Add SDK compatibility examples

Add examples for popular OpenAI-compatible SDKs.

Acceptance criteria:

- JavaScript example.
- Python example.
- Notes for setting `baseURL` / `base_url`.
- Examples use placeholder downstream keys only.

Labels: `examples`, `good first issue`
