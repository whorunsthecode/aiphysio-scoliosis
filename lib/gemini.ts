// gemini-2.0-flash returns "limit: 0" on free tier in some regions (HK, EEA,
// UK, CH). gemini-2.0-flash-lite is the lightweight tier that has broader
// free-tier availability. Both support multimodal vision + JSON mode.
const DEFAULT_MODEL = "gemini-2.0-flash-lite";
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export class GeminiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "GeminiError";
  }
}

interface AnalyzeImageOptions {
  prompt: string;
  imageBase64: string;
  mimeType: string;
  model?: string;
  temperature?: number;
}

export async function analyzeImageJSON<T = unknown>({
  prompt,
  imageBase64,
  mimeType,
  model = DEFAULT_MODEL,
  temperature = 0.2,
}: AnalyzeImageOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError("GEMINI_API_KEY not configured", 503);
  }

  const url = `${ENDPOINT(model)}?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GeminiError(
      `Gemini API ${res.status}: ${text || res.statusText}`,
      res.status,
    );
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError("Gemini returned no content");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError("Gemini returned non-JSON content despite JSON mode");
  }
}
