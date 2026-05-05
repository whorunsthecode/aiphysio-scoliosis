import { NextResponse } from "next/server";
import { analyzeImageJSON, GeminiError } from "@/lib/gemini";
import { XRAY_SYSTEM_PROMPT, type XrayAnalysis } from "@/lib/prompts/xray";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export async function POST(req: Request) {
  let file: File | null = null;
  let dataUrl: string | null = null;

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } else if (contentType.includes("application/json")) {
    const body = (await req.json()) as { dataUrl?: string };
    dataUrl = body.dataUrl ?? null;
  }

  let imageBase64: string;
  let mimeType: string;

  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Max 10 MB." },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 415 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    imageBase64 = buffer.toString("base64");
    mimeType = file.type;
  } else if (dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Invalid dataUrl format" },
        { status: 400 },
      );
    }
    mimeType = match[1];
    imageBase64 = match[2];
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported mime type: ${mimeType}` },
        { status: 415 },
      );
    }
    const approxBytes = (imageBase64.length * 3) / 4;
    if (approxBytes > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Image too large. Max 10 MB." },
        { status: 413 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "No file or dataUrl provided" },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeImageJSON<XrayAnalysis>({
      prompt: XRAY_SYSTEM_PROMPT,
      imageBase64,
      mimeType,
    });
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    if (e instanceof GeminiError) {
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
