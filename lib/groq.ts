const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// Default per-call timeout. Routes run with maxDuration = 30s, and the chat
// handler makes two calls in a row, so one call must never be able to use
// the whole budget. On timeout the call rejects with status 504 and the
// caller writes nothing, exactly as for any other failed call.
export const MODEL_TIMEOUT_MS = 12_000;

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
  timeoutMs?: number;
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
  timeoutMs?: number;
}

// fetch with a deadline covering the response body as well as the headers.
async function postJSON(body: unknown, apiKey: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GroqError(`Groq API ${res.status}: ${text || res.statusText}`, res.status);
    }
    return await res.json();
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new GroqError(`Groq call timed out after ${timeoutMs}ms`, 504);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
  timeoutMs = MODEL_TIMEOUT_MS,
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

  const json = (await postJSON(body, apiKey, timeoutMs)) as { choices?: GroqChoice[] };
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
  timeoutMs = MODEL_TIMEOUT_MS,
}: ChatJSONOptions): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqError("GROQ_API_KEY not configured", 503);
  }

  const json = (await postJSON(
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature,
      max_tokens: maxTokens,
    },
    apiKey,
    timeoutMs,
  )) as {
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
