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

export type GroqToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type GroqMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type GroqChoice = {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: GroqToolCall[];
  };
  finish_reason: string;
};

interface ChatWithToolsOptions {
  messages: GroqMessage[];
  tools?: GroqToolDef[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  toolChoice?: "auto" | "none" | "required";
}

// Plain-text chat with optional tool use. Used by the conversational
// Telegram handler. Returns the raw assistant message — caller decides
// whether to execute tool_calls and round-trip back to the model.
export async function chatWithTools({
  messages,
  tools,
  model = DEFAULT_MODEL,
  temperature = 0.4,
  maxTokens = 1024,
  toolChoice = "auto",
}: ChatWithToolsOptions): Promise<GroqChoice["message"]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new GroqError("GROQ_API_KEY not configured", 503);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GroqError(
      `Groq API ${res.status}: ${text || res.statusText}`,
      res.status,
    );
  }
  const json = (await res.json()) as { choices?: GroqChoice[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new GroqError("Groq returned no message");
  return msg;
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
