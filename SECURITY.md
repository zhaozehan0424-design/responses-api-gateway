# Security Policy

Relay Hub handles downstream API keys, upstream credentials, Discord OAuth state, quota storage, and admin logs. Please report security issues responsibly.

## Reporting

Do not open a public issue for vulnerabilities that expose secrets, bypass access control, or leak user data.

For now, report privately through the repository owner profile:

https://github.com/zhaozehan0424-design

If you open a public issue by mistake, remove secrets immediately and rotate affected credentials.

## Sensitive Data

Never commit:

- `.env` or `.env.*` files except `.env.example`
- `.vercel/`
- Vercel project IDs and org IDs
- Upstream API keys
- Discord client secrets or bot tokens
- Admin tokens
- KV / Redis REST tokens
- Logs containing request metadata tied to real users

## Supported Version

The public repository is currently pre-1.0. Security fixes should target `main` until release branches are introduced.

## Operational Recommendations

- Use server-side environment variables for upstream keys.
- Rotate downstream keys if they are pasted into screenshots, issues, or logs.
- Set `RPM_LIMIT` for any shared deployment.
- Use durable KV storage if quota enforcement must survive cold starts or redeploys.
- Keep admin logs behind a strong `ADMIN_TOKEN`.
