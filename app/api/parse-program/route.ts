import { NextResponse } from "next/server";
import { chatJSON, GroqError } from "@/lib/groq";
import {
  buildParseProgramPrompts,
  type ParsedProgram,
} from "@/lib/prompts/parseProgram";
import { libraryForPrompt } from "@/lib/exercises/library";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TEXT_LEN = 8000;

export async function POST(req: Request) {
  let body: { raw_text?: string };
  try {
    body = (await req.json()) as { raw_text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = (body.raw_text ?? "").trim();
  if (!rawText) {
    return NextResponse.json(
      { error: "raw_text is required" },
      { status: 400 },
    );
  }
  if (rawText.length > MAX_TEXT_LEN) {
    return NextResponse.json(
      { error: `raw_text too long. Max ${MAX_TEXT_LEN} characters.` },
      { status: 413 },
    );
  }

  const libraryJson = JSON.stringify(libraryForPrompt(), null, 2);
  const { system, user } = buildParseProgramPrompts(rawText, libraryJson);

  try {
    const parsed = await chatJSON<ParsedProgram>({
      system,
      user,
      temperature: 0.1,
      maxTokens: 3000,
    });
    return NextResponse.json({ ok: true, parsed });
  } catch (e) {
    if (e instanceof GroqError) {
      const status = e.status === 503 ? 503 : 502;
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          configured: e.status !== 503,
        },
        { status },
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
