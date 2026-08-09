// Liaison agent — runs on demand (POST with appointmentId) or fired by the
// /api/agents/liaison/check-upcoming cron 24h before any logged appointment.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  authorizeCron,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import { buildContext, serializeContext } from "@/lib/agents/context";
import { LIAISON_SYSTEM_PROMPT } from "@/lib/agents/prompts";
import { chatJSON } from "@/lib/groq";
import { deliver } from "@/lib/messaging/deliver";

export const runtime = "nodejs";
export const maxDuration = 60;

type LiaisonOutput = {
  summary: string;
  posture_trends: string[];
  pain_patterns: string[];
  compliance: string;
  questions_for_physio: string[];
  what_is_working: string;
  telegram_intro_message: string;
};

export async function POST(req: Request) {
  return runLiaison(req, true);
}

export async function GET(req: Request) {
  return runLiaison(req, false);
}

async function runLiaison(req: Request, manual: boolean) {
  if (!manual) {
    const auth = authorizeCron(req);
    if (!auth.ok) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: auth.status },
      );
    }
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(SUPABASE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }

  const body = manual
    ? ((await req.json().catch(() => ({}))) as { appointmentId?: string })
    : { appointmentId: undefined };
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ ok: false, reason: "no_profile" });
  }

  const supabase = getServiceSupabase();

  // Resolve appointment: explicit id, else next upcoming.
  let appointment;
  if (body.appointmentId) {
    const { data } = await supabase
      .from("appointments")
      .select("id, appointment_at, notes")
      .eq("id", body.appointmentId)
      .single();
    appointment = data;
  } else {
    const { data } = await supabase
      .from("appointments")
      .select("id, appointment_at, notes")
      .eq("profile_id", profileId)
      .gte("appointment_at", new Date().toISOString())
      .order("appointment_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    appointment = data;
  }
  if (!appointment) {
    return NextResponse.json({ ok: false, reason: "no_appointment" });
  }

  const context = await buildContext(profileId, "liaison");

  // Pull observations not yet consumed in any handoff doc.
  const { data: unconsumed } = await supabase
    .from("agent_observations")
    .select("id, observation_text, category, severity, created_at")
    .eq("profile_id", profileId)
    .is("used_in_handoff_id", null)
    .order("created_at", { ascending: false });

  const userPayload = {
    context: serializeContext(context),
    appointment: {
      id: appointment.id,
      appointment_at: appointment.appointment_at,
      notes: appointment.notes,
    },
    unconsumed_observations: unconsumed ?? [],
  };

  let output: LiaisonOutput;
  try {
    output = await chatJSON<LiaisonOutput>({
      system: LIAISON_SYSTEM_PROMPT,
      user: JSON.stringify(userPayload),
      temperature: 0.2,
      maxTokens: 3000,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Trigger PDF generation. The Python function lives at /api/pdf-generate
  // and writes to Supabase Storage. We pass the JSON content; it returns the
  // storage path.
  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  let pdfStoragePath: string | null = null;
  try {
    const pdfRes = await fetch(`${baseUrl}/api/pdf-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appointmentId: appointment.id,
        content: output,
      }),
    });
    if (pdfRes.ok) {
      const pdfJson = (await pdfRes.json()) as { pdfStoragePath: string };
      pdfStoragePath = pdfJson.pdfStoragePath;
    }
  } catch {
    // PDF generation may fail in local dev (no Python). The doc still saves
    // to liaison_documents with content_summary so the UI can render it.
  }

  const { data: docRow } = await supabase
    .from("liaison_documents")
    .insert({
      profile_id: profileId,
      appointment_id: appointment.id,
      pdf_storage_path: pdfStoragePath ?? "(generation pending)",
      content_summary: output,
    })
    .select("id")
    .single();

  await Promise.all([
    supabase
      .from("appointments")
      .update({ liaison_doc_id: docRow?.id })
      .eq("id", appointment.id),
    unconsumed && unconsumed.length > 0 && docRow?.id
      ? supabase
          .from("agent_observations")
          .update({ used_in_handoff_id: docRow.id })
          .in(
            "id",
            unconsumed.map((o) => o.id),
          )
      : Promise.resolve(),
  ]);

  // Send Telegram message + (if PDF available) attach as document.
  // The handoff is an identifiable clinical document. It stays on-platform:
  // delivered to the inbox with a pointer to the stored file, never attached
  // to a consumer messaging service. deliver() enforces this regardless of
  // what any caller asks for.
  await deliver({
    supabase,
    profileId,
    agent: "liaison",
    text: output.telegram_intro_message,
    kind: "document",
    documentPath: pdfStoragePath ?? null,
  });

  await supabase.from("notifications").insert({
    profile_id: profileId,
    sent_by_agent: "liaison",
    message_text: output.telegram_intro_message,
  });

  return NextResponse.json({
    ok: true,
    appointment_id: appointment.id,
    pdf_path: pdfStoragePath,
    observations_consumed: unconsumed?.length ?? 0,
  });
}
