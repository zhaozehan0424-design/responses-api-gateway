# SDK Examples

Relay Hub exposes OpenAI-compatible `/v1` endpoints, so most OpenAI-compatible SDKs only need two values:

- `baseURL` / `base_url`: your deployed Relay Hub `/v1` URL
- `apiKey` / `api_key`: a downstream key generated or configured for Relay Hub

Do not use your upstream provider key in client code. The upstream key belongs in server-side Relay Hub environment variables.

## JavaScript

Install:

```bash
npm install openai
```

Run:

```bash
RELAY_HUB_BASE_URL=https://your-domain.example/v1 \
RELAY_HUB_KEY=sk-user-key-1 \
node examples/javascript-openai-sdk.mjs
```

Example source: [examples/javascript-openai-sdk.mjs](../examples/javascript-openai-sdk.mjs)

## Python

Install:

```bash
pip install openai
```

Run:

```bash
RELAY_HUB_BASE_URL=https://your-domain.example/v1 \
RELAY_HUB_KEY=sk-user-key-1 \
python examples/python-openai-sdk.py
```

Example source: [examples/python-openai-sdk.py](../examples/python-openai-sdk.py)

## Notes

- `GET /v1/models` returns the model list visible to the downstream key.
- `POST /v1/responses` is recommended for new integrations.
- `POST /v1/chat/completions` is available for older OpenAI-style clients.
- If a model is not in the key's allowlist, Relay Hub returns `model_not_allowed`.
- If the downstream key is invalid, Relay Hub returns `invalid_api_key`.
