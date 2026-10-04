import { NextResponse } from "next/server";
import { logFailure, publicError, statusOf } from "@/lib/errors";
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
    return NextResponse.json({ ok: false, error: publicError("parse", 400) }, { status: 400 });
  }

  const rawText = (body.raw_text ?? "").trim();
  if (!rawText) {
    return NextResponse.json(
      { ok: false, error: publicError("parse", 400) },
      { status: 400 },
    );
  }
  if (rawText.length > MAX_TEXT_LEN) {
    return NextResponse.json(
      { ok: false, error: `That's longer than I can read in one go. Paste up to ${MAX_TEXT_LEN.toLocaleString("en")} characters.` },
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
    logFailure("api/parse-program", e);
    const provider = statusOf(e);
    const status = provider === 503 || provider === 429 || provider === 504 ? provider : 502;
    return NextResponse.json(
      {
        ok: false,
        error: publicError("parse", status),
        configured: !(e instanceof GroqError && e.status === 503),
      },
      { status },
    );
  }
}
