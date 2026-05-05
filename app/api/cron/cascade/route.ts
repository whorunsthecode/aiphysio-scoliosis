// Tier 1: cascade-stage activation.
//
// For the user's curve pattern, walk through the model's stages and mark
// each as "active" if its signal in recent sessions exceeds the threshold
// (personal baseline + 2σ where available, else absolute fallback).
//
// Output: a row in cascade_predictions with active stages + the next stage
// to watch.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  authorizeCron,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import { CASCADE_MODELS } from "@/lib/agents/cascade";
import { deriveCurvePattern } from "@/lib/exercises/profile";
import type { CurvePatternKey } from "@/lib/exercises/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const RECENT_DAYS = 7;

type Snap = {
  measurements: {
    shoulderDiffMm: number;
    hipDiffMm: number;
    headOffsetMm: number;
    pelvicRotationMm: number;
    segments: { cervical: number; upperThoracic: number; lowerThoracic: number };
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
    return NextResponse.json({ ok: false, reason: "no_profile" });
  }

  const supabase = getServiceSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();
  if (!profile) {
    return NextResponse.json({ ok: false, reason: "no_profile_row" });
  }

  // Derive pattern from the profile's stored fields. We pass the same shape
  // deriveCurvePattern expects (a subset of OnboardingState).
  const pattern = deriveCurvePattern({
    curveType: profile.curve_type,
    primaryCurveApex: profile.primary_curve_apex,
    primaryLeanSide: profile.primary_curve_convex_side,
    secondaryCurveApex: profile.secondary_curve_apex,
    secondaryLeanSide: profile.secondary_curve_convex_side,
    segmentShifts: {
      cervical: profile.segment_i_shift,
      upper_thoracic: profile.segment_ii_shift,
      lower_thoracic: profile.segment_iii_shift,
      lumbar: profile.segment_iv_shift,
    },
  });

  const stages = CASCADE_MODELS[pattern as CurvePatternKey] ?? [];
  if (stages.length === 0) {
    await supabase.from("cascade_predictions").insert({
      profile_id: profileId,
      curve_pattern: pattern,
      active_stages: [],
      predicted_next: [],
      reasoning: "No cascade model registered for this pattern yet.",
      computed_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, reason: "no_model_for_pattern", pattern });
  }

  // Recent sessions: average signals to see if any stage is active.
  const since = new Date(
    Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("final_scan, initial_scan, pain_check, exercises_completed")
    .eq("profile_id", profileId)
    .gte("started_at", since);

  const snaps: Snap[] = ((sessions ?? []) as { final_scan: unknown; initial_scan: unknown }[])
    .map((s) => (s.final_scan ?? s.initial_scan) as Snap | null)
    .filter((s): s is Snap => s !== null && !!s.measurements);

  if (snaps.length === 0) {
    return NextResponse.json({
      ok: true,
      reason: "no_recent_sessions",
      pattern,
    });
  }

  // Pull baseline if we have one — use mean+2σ as the personal threshold.
  const { data: baseline } = await supabase
    .from("personal_baselines")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  const recentMean = (selector: (s: Snap) => number): number =>
    snaps.reduce((a, s) => a + selector(s), 0) / snaps.length;

  const signals: Record<string, number> = {
    shoulder_diff_mm: Math.abs(recentMean((s) => s.measurements.shoulderDiffMm)),
    hip_diff_mm: Math.abs(recentMean((s) => s.measurements.hipDiffMm)),
    head_offset_mm: Math.abs(recentMean((s) => s.measurements.headOffsetMm)),
    pelvic_rotation_mm: Math.abs(recentMean((s) => s.measurements.pelvicRotationMm)),
    upper_thoracic_segment_shift: Math.abs(
      recentMean((s) => s.measurements.segments.upperThoracic),
    ),
    lower_thoracic_segment_shift: Math.abs(
      recentMean((s) => s.measurements.segments.lowerThoracic),
    ),
    cervical_segment_shift: Math.abs(
      recentMean((s) => s.measurements.segments.cervical),
    ),
    // Qualitative signals not derivable from snapshots — leave at 0 unless we
    // grow them later. Cascade still works on the quantitative ones.
    stiff_hip_flexor_logged: 0,
    scapular_form_check: 0,
    lunge_knee_collapse_form_score: 0,
  };

  const personalThreshold = (signal: string, fallbackMm: number): number => {
    if (!baseline || baseline.sample_count < 10) return fallbackMm;
    // Map signal name to baseline column.
    const baselineMap: Record<string, [number | null, number | null]> = {
      shoulder_diff_mm: [
        baseline.shoulder_diff_mean,
        baseline.shoulder_diff_std,
      ],
      hip_diff_mm: [baseline.hip_diff_mean, baseline.hip_diff_std],
      head_offset_mm: [baseline.head_offset_mean, baseline.head_offset_std],
      pelvic_rotation_mm: [
        baseline.pelvic_rotation_mean,
        baseline.pelvic_rotation_std,
      ],
    };
    const entry = baselineMap[signal];
    if (!entry || entry[0] === null || entry[1] === null) return fallbackMm;
    return Math.abs(entry[0]) + 2 * entry[1];
  };

  const activated: { stage: string; signal: string; value: number; threshold: number; description: string }[] = [];
  let firstInactiveIdx: number | null = null;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const value = signals[stage.signal] ?? 0;
    const threshold = personalThreshold(stage.signal, stage.thresholdMm);
    if (value > threshold && threshold > 0) {
      activated.push({
        stage: stage.stage,
        signal: stage.signal,
        value: Number(value.toFixed(2)),
        threshold: Number(threshold.toFixed(2)),
        description: stage.description,
      });
    } else {
      if (firstInactiveIdx === null) firstInactiveIdx = i;
    }
  }

  const predictedNext =
    firstInactiveIdx !== null && activated.length > 0
      ? [
          {
            stage: stages[firstInactiveIdx].stage,
            signal: stages[firstInactiveIdx].signal,
            description: stages[firstInactiveIdx].description,
          },
        ]
      : [];

  const reasoning = activated.length === 0
    ? `No cascade stages currently activated for ${pattern}. ${snaps.length} recent sessions all within personal range.`
    : `${activated.length} stage${activated.length === 1 ? "" : "s"} activated in the past ${RECENT_DAYS} days: ${activated.map((s) => s.stage).join(", ")}.`;

  await supabase.from("cascade_predictions").insert({
    profile_id: profileId,
    curve_pattern: pattern,
    active_stages: activated,
    predicted_next: predictedNext,
    reasoning,
    computed_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    pattern,
    active_count: activated.length,
    next: predictedNext.map((p) => p.stage),
  });
}
