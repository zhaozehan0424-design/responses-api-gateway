import os
from openai import OpenAI


client = OpenAI(
    api_key=os.getenv("RELAY_HUB_KEY", "sk-user-key-1"),
    base_url=os.getenv("RELAY_HUB_BASE_URL", "https://your-domain.example/v1"),
)

models = client.models.list()
print([model.id for model in models.data])

response = client.responses.create(
    model=os.getenv("RELAY_HUB_MODEL", "claude-haiku-4-5-20251001"),
    input="Reply with OK only.",
    max_output_tokens=16,
)

print(response.output_text)
