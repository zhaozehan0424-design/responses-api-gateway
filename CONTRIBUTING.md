# Contributing

Thanks for taking a look at Relay Hub. Small, focused contributions are easiest to review.

## Useful Contributions

- Deployment notes for Vercel, Docker, or other hosts.
- Client examples for OpenAI-compatible SDKs.
- Compatibility tests for `/v1/models`, `/v1/responses`, and `/v1/chat/completions`.
- Documentation fixes.
- Security hardening suggestions.
- Bug reports with request shape, response code, and sanitized logs.

## Local Setup

```powershell
Copy-Item .env.example .env
npm start
```

For Docker:

```powershell
docker compose up -d
```

## Pull Requests

Before opening a PR:

- Keep secrets out of commits.
- Do not include `.env`, `.vercel/`, `work/`, `outputs/`, logs, screenshots with keys, or local key files.
- Keep PRs scoped to one feature or fix.
- Include a short test note in the PR description.

## Bug Reports

Please include:

- Deployment target: local Node, Docker, Vercel, or other.
- Endpoint: `models`, `responses`, or `chat.completions`.
- Sanitized request body.
- HTTP status and error code.
- Whether streaming was enabled.

Never paste real API keys, Discord secrets, admin tokens, or Vercel KV tokens.
