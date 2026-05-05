// Cron — every 6 hours. Fires Liaison for any appointment 18-30 hours from
// now that doesn't yet have a generated doc.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  authorizeCron,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: auth.status });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(SUPABASE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ ok: false, reason: "no_profile" });
  }

  const supabase = getServiceSupabase();
  const windowStart = new Date(Date.now() + 18 * 3600 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 30 * 3600 * 1000).toISOString();

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, appointment_at, liaison_doc_id")
    .eq("profile_id", profileId)
    .gte("appointment_at", windowStart)
    .lte("appointment_at", windowEnd)
    .is("liaison_doc_id", null);

  if (!appts || appts.length === 0) {
    return NextResponse.json({ ok: true, fired: 0 });
  }

  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  const results = await Promise.all(
    appts.map((a) =>
      fetch(`${baseUrl}/api/agents/liaison`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: a.id }),
      }).then((r) => r.ok),
    ),
  );

  return NextResponse.json({
    ok: true,
    fired: results.filter(Boolean).length,
    skipped: results.filter((r) => !r).length,
  });
}
