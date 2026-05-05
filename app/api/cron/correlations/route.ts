// Tier 1: pain ↔ behavior correlations across configurable time lags.
//
// The first pattern we look for is the planted seed pattern: lumbar pain
// intensity vs. whether the right hip flexor stretch was skipped N days
// prior. We check lags 0..3.
//
// Output: rows in pain_correlations sorted by |strength| desc, with bootstrap
// 95% CI so consumers can filter by confidence.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  authorizeCron,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import {
  bootstrapCorrelationCI,
  daysBetween,
  pearson,
  startOfDay,
} from "@/lib/agents/stats";

export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_DAYS = 60;
const MIN_PAIRS = 8;
const LAGS = [0, 1, 2, 3];

type PainPoint = { location: string; intensity: number };
type ExerciseDone = { exerciseId: string };

type SessionRow = {
  started_at: string;
  pain_check: unknown;
  exercises_completed: unknown;
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
    return NextResponse.json({ ok: false, reason: "no_profile" });
  }

  const supabase = getServiceSupabase();
  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("sessions")
    .select("started_at, pain_check, exercises_completed")
    .eq("profile_id", profileId)
    .gte("started_at", since)
    .order("started_at", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const sessions = (data as SessionRow[]).map((s) => ({
    date: startOfDay(new Date(s.started_at)),
    pain: (s.pain_check as PainPoint[]) ?? [],
    exercises: ((s.exercises_completed as ExerciseDone[]) ?? []).map(
      (e) => e.exerciseId,
    ),
  }));

  if (sessions.length < MIN_PAIRS) {
    return NextResponse.json({
      ok: true,
      reason: "insufficient_data",
      sessions_in_window: sessions.length,
      min_required: MIN_PAIRS,
    });
  }

  // Pairs we measure. Each pair: (subject behavior on day D, object pain on day D+lag).
  const PAIRS: { subject: string; subjectExerciseId: string; object: string; objectRegion: string }[] = [
    {
      subject: "right_hip_flexor_stretch_skipped",
      subjectExerciseId: "hip_flexor_stretch_stiff_side",
      object: "lumbar_pain_intensity",
      objectRegion: "lower_back",
    },
    {
      subject: "side_plank_skipped",
      subjectExerciseId: "side_plank_convex_thoracic_side_down",
      object: "mid_back_pain_intensity",
      objectRegion: "mid_back",
    },
    {
      subject: "hip_bridge_skipped",
      subjectExerciseId: "hip_bridge_pelvic_press_down",
      object: "lumbar_pain_intensity",
      objectRegion: "lower_back",
    },
    {
      subject: "bird_dog_skipped",
      subjectExerciseId: "bird_dog_asymmetric_hold",
      object: "upper_back_pain_intensity",
      objectRegion: "upper_back",
    },
  ];

  // Build a daily map: date string → { skipped: Set<exerciseId>, painByRegion }.
  const byDay = new Map<
    string,
    { skipped: Set<string>; painByRegion: Map<string, number> }
  >();
  for (const s of sessions) {
    const key = s.date.toISOString();
    const completedSet = new Set(s.exercises);
    const skipped = new Set<string>();
    for (const p of PAIRS) {
      if (!completedSet.has(p.subjectExerciseId)) skipped.add(p.subjectExerciseId);
    }
    const painByRegion = new Map<string, number>();
    for (const point of s.pain) {
      const cur = painByRegion.get(point.location) ?? 0;
      painByRegion.set(point.location, Math.max(cur, point.intensity));
    }
    byDay.set(key, { skipped, painByRegion });
  }

  const dayKeys = Array.from(byDay.keys()).sort();
  const correlations: {
    subject: string;
    object: string;
    lag_days: number;
    correlation_strength: number;
    confidence_low: number;
    confidence_high: number;
    evidence_count: number;
  }[] = [];

  for (const pair of PAIRS) {
    for (const lag of LAGS) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < dayKeys.length; i++) {
        const subject = byDay.get(dayKeys[i])!;
        const targetDate = new Date(dayKeys[i]);
        targetDate.setDate(targetDate.getDate() + lag);
        const targetKey = targetDate.toISOString();
        const object = byDay.get(targetKey);
        if (!object) continue;
        const skippedNum = subject.skipped.has(pair.subjectExerciseId) ? 1 : 0;
        const painNum = object.painByRegion.get(pair.objectRegion) ?? 0;
        xs.push(skippedNum);
        ys.push(painNum);
      }
      if (xs.length < MIN_PAIRS) continue;
      // Need some variance in both axes.
      if (new Set(xs).size < 2 || new Set(ys).size < 2) continue;

      const r = pearson(xs, ys);
      if (Math.abs(r) < 0.1) continue;
      const ci = bootstrapCorrelationCI(xs, ys, 500);

      correlations.push({
        subject: pair.subject,
        object: pair.object,
        lag_days: lag,
        correlation_strength: r,
        confidence_low: ci[0],
        confidence_high: ci[1],
        evidence_count: xs.length,
      });
    }
  }

  // Wipe previous correlations for this profile and re-insert.
  await supabase.from("pain_correlations").delete().eq("profile_id", profileId);
  if (correlations.length > 0) {
    await supabase.from("pain_correlations").insert(
      correlations.map((c) => ({
        profile_id: profileId,
        ...c,
        last_computed: new Date().toISOString(),
      })),
    );
  }

  // Compute lifestyle ↔ posture correlation if we have sport flags.
  // (Stub for v1 — extends naturally; same shape.)

  // Examine days following badminton flag — out of scope for v1, this comment
  // documents future direction.

  return NextResponse.json({
    ok: true,
    correlations_found: correlations.length,
    days_in_window: dayKeys.length,
  });
}
