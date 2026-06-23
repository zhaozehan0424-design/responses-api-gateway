import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.RELAY_HUB_KEY || "sk-user-key-1",
  baseURL: process.env.RELAY_HUB_BASE_URL || "https://your-domain.example/v1",
});

const models = await client.models.list();
console.log(models.data.map((model) => model.id));

const response = await client.responses.create({
  model: process.env.RELAY_HUB_MODEL || "claude-haiku-4-5-20251001",
  input: "Reply with OK only.",
  max_output_tokens: 16,
});

console.log(response.output_text);
