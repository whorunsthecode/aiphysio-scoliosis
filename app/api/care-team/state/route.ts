// Care-team admin view — single endpoint that returns everything the page
// renders, in one round-trip. Service-role read only; never exposes the key.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(SUPABASE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ ok: false, reason: "no_profile" });
  }
  const supabase = getServiceSupabase();
  const since14d = new Date(Date.now() - 14 * 86400000).toISOString();

  const [
    profile,
    program,
    notifications,
    observations,
    appointments,
    docs,
    cascade,
    correlations,
    baseline,
    messages,
    sessionsRecent,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).single(),
    supabase
      .from("weekly_programs")
      .select("*")
      .eq("profile_id", profileId)
      .order("generated_at", { ascending: false })
      .limit(2),
    supabase
      .from("notifications")
      .select("*")
      .eq("profile_id", profileId)
      .gte("sent_at", since14d)
      .order("sent_at", { ascending: false }),
    supabase
      .from("agent_observations")
      .select("*")
      .eq("profile_id", profileId)
      .gte("created_at", since14d)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("*")
      .eq("profile_id", profileId)
      .order("appointment_at", { ascending: true }),
    supabase
      .from("liaison_documents")
      .select("*")
      .eq("profile_id", profileId)
      .order("generated_at", { ascending: false }),
    supabase
      .from("cascade_predictions")
      .select("*")
      .eq("profile_id", profileId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pain_correlations")
      .select("*")
      .eq("profile_id", profileId)
      .order("correlation_strength", { ascending: false })
      .limit(8),
    supabase
      .from("personal_baselines")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("agent_messages")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sessions")
      .select("id, started_at, scan_confidence, source")
      .eq("profile_id", profileId)
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  return NextResponse.json({
    ok: true,
    profile: profile.data,
    weeklyPrograms: program.data ?? [],
    notifications: notifications.data ?? [],
    observations: observations.data ?? [],
    appointments: appointments.data ?? [],
    documents: docs.data ?? [],
    cascade: cascade.data ?? null,
    correlations: correlations.data ?? [],
    baseline: baseline.data ?? null,
    messages: messages.data ?? [],
    sessionsRecent: sessionsRecent.data ?? [],
  });
}
