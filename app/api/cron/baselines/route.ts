// Tier 1: rolling 30-day per-measurement baselines.
//
// Cron: nightly at 03:00 UTC (see vercel.json).
// Reads sessions in the trailing 30-day window, filters for high-confidence
// final scans, then computes mean + std per measurement.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  authorizeCron,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import { mean, stdev } from "@/lib/agents/stats";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_DAYS = 30;
const MIN_SESSIONS_FOR_BASELINE = 10;

type SessionRow = {
  id: string;
  started_at: string;
  scan_confidence: string | null;
  final_scan: unknown;
  initial_scan: unknown;
  pain_check: unknown;
};

type Snap = {
  measurements: {
    shoulderDiffMm: number;
    hipDiffMm: number;
    headOffsetMm: number;
    pelvicRotationMm: number;
    segments: { cervical: number; upperThoracic: number; lowerThoracic: number };
    overallScore: number;
  };
};

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
    return NextResponse.json({
      ok: false,
      reason: "no_profile",
    });
  }

  const supabase = getServiceSupabase();
  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, started_at, scan_confidence, final_scan, initial_scan, pain_check")
    .eq("profile_id", profileId)
    .gte("started_at", since)
    .order("started_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Prefer high/moderate confidence final scans (same fallback as the trend
  // view: final → initial when final missing).
  const usable = (sessions as SessionRow[])
    .map((s) => {
      const snap = (s.final_scan ?? s.initial_scan) as Snap | null;
      if (!snap?.measurements) return null;
      return { snap, started_at: s.started_at, conf: s.scan_confidence };
    })
    .filter((x): x is { snap: Snap; started_at: string; conf: string | null } => x !== null)
    .filter((x) => x.conf !== "low");

  if (usable.length < MIN_SESSIONS_FOR_BASELINE) {
    await supabase.from("personal_baselines").upsert({
      profile_id: profileId,
      sample_count: usable.length,
      computed_at: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      reason: "insufficient_data",
      sample_count: usable.length,
      threshold: MIN_SESSIONS_FOR_BASELINE,
    });
  }

  const shoulderVals = usable.map((u) => u.snap.measurements.shoulderDiffMm);
  const hipVals = usable.map((u) => u.snap.measurements.hipDiffMm);
  const headVals = usable.map((u) => u.snap.measurements.headOffsetMm);
  const pelvicVals = usable.map((u) => u.snap.measurements.pelvicRotationMm);
  const segIVals = usable.map((u) => u.snap.measurements.segments.cervical);
  const segIIVals = usable.map((u) => u.snap.measurements.segments.upperThoracic);
  const segIIIVals = usable.map((u) => u.snap.measurements.segments.lowerThoracic);
  const scoreVals = usable.map((u) => u.snap.measurements.overallScore);

  // Pain baseline: top regions by frequency × mean intensity.
  const { data: painSessions } = await supabase
    .from("sessions")
    .select("pain_check")
    .eq("profile_id", profileId)
    .gte("started_at", since);
  const painBaseline = aggregatePainBaseline(
    (painSessions ?? []) as { pain_check: unknown }[],
  );

  const baseline = {
    profile_id: profileId,
    shoulder_diff_mean: mean(shoulderVals),
    shoulder_diff_std: stdev(shoulderVals),
    hip_diff_mean: mean(hipVals),
    hip_diff_std: stdev(hipVals),
    head_offset_mean: mean(headVals),
    head_offset_std: stdev(headVals),
    pelvic_rotation_mean: mean(pelvicVals),
    pelvic_rotation_std: stdev(pelvicVals),
    segment_i_shift_mean: mean(segIVals),
    segment_ii_shift_mean: mean(segIIVals),
    segment_iii_shift_mean: mean(segIIIVals),
    segment_iv_shift_mean: 0,
    overall_score_mean: mean(scoreVals),
    overall_score_std: stdev(scoreVals),
    pain_baseline: painBaseline,
    sample_count: usable.length,
    computed_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("personal_baselines")
    .upsert(baseline);
  if (upsertErr) {
    return NextResponse.json(
      { ok: false, error: upsertErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sample_count: usable.length });
}

function aggregatePainBaseline(rows: { pain_check: unknown }[]) {
  const byRegion = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const points = (r.pain_check as { location: string; intensity: number }[]) ?? [];
    for (const p of points) {
      const ex = byRegion.get(p.location) ?? { sum: 0, count: 0 };
      ex.sum += p.intensity;
      ex.count += 1;
      byRegion.set(p.location, ex);
    }
  }
  return Array.from(byRegion.entries())
    .map(([location, v]) => ({
      location,
      mean_intensity: v.sum / v.count,
      report_count: v.count,
    }))
    .sort((a, b) => b.report_count - a.report_count);
}
