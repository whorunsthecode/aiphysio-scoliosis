import { NextResponse } from "next/server";
import { logFailure, publicError, statusOf } from "@/lib/errors";
import { analyzeImageJSON, GeminiError } from "@/lib/gemini";
import {
  XRAY_SYSTEM_PROMPT,
  enforceLaterality,
  type XrayAnalysis,
} from "@/lib/prompts/xray";

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
        { ok: false, error: publicError("xray", 413) },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: publicError("xray", 415) },
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
        { ok: false, error: publicError("xray", 400) },
        { status: 400 },
      );
    }
    mimeType = match[1];
    imageBase64 = match[2];
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { ok: false, error: publicError("xray", 415) },
        { status: 415 },
      );
    }
    const approxBytes = (imageBase64.length * 3) / 4;
    if (approxBytes > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: publicError("xray", 413) },
        { status: 413 },
      );
    }
  } else {
    return NextResponse.json(
      { ok: false, error: publicError("xray", 400) },
      { status: 400 },
    );
  }

  try {
    const raw = await analyzeImageJSON<XrayAnalysis>({
      prompt: XRAY_SYSTEM_PROMPT,
      imageBase64,
      mimeType,
    });
    const analysis = enforceLaterality({
      ...raw,
      laterality_marker_visible: raw.laterality_marker_visible === true,
      other_observations: Array.isArray(raw.other_observations)
        ? raw.other_observations.filter((s) => typeof s === "string")
        : [],
    });
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    // Details to the log; a plain sentence to the person. A failed read
    // writes nothing, so they can retry or skip.
    logFailure("api/xray", e);
    const provider = statusOf(e);
    const status = provider === 503 || provider === 429 || provider === 504 ? provider : 502;
    return NextResponse.json(
      {
        ok: false,
        error: publicError("xray", status),
        configured: !(e instanceof GeminiError && e.status === 503),
      },
      { status },
    );
  }
}
