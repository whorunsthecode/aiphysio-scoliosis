const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export class GroqError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GroqError";
  }
}

interface ChatJSONOptions {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function chatJSON<T = unknown>({
  system,
  user,
  model = DEFAULT_MODEL,
  temperature = 0.2,
  maxTokens = 2048,
}: ChatJSONOptions): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError("GROQ_API_KEY not configured", 503);
  }

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GroqError(`Groq API ${res.status}: ${text || res.statusText}`, res.status);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new GroqError("Groq returned no content");

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new GroqError("Groq returned non-JSON content despite JSON mode");
  }
}
