# Roadmap

Relay Hub is early as a public open-source project. The current focus is making the gateway easier to deploy, safer to operate, and simpler to verify.

## v0.1.x

- Publish clean public documentation and deployment examples.
- Add smoke tests for `GET /v1/models`, `POST /v1/responses`, and `POST /v1/chat/completions`.
- Document Vercel KV / Upstash setup for durable quota and log storage.
- Add screenshots for the public docs page, dashboard, and admin log view.
- Improve error-code examples for common client failures.

## v0.2.x

- Add automated compatibility tests for streaming Responses and Chat Completions.
- Add a minimal GitHub Actions workflow for linting and smoke tests.
- Add deployment templates for Vercel and Docker Compose.
- Harden Discord OAuth setup validation and admin-token handling.
- Add examples for popular OpenAI-compatible SDKs and agent tools.

## Later

- Multi-upstream routing by model prefix.
- Safer key rotation helpers.
- Exportable usage reports.
- Optional public status page.
- More fine-grained admin roles.

## Good First Issues

- Add a screenshot to the README.
- Add a Python client example.
- Add an SDK compatibility report.
- Improve `.env.example` comments for first-time deployers.
- Add tests for invalid API key and rate limit responses.
