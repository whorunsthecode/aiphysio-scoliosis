// One-off synthetic seed for the multi-agent demo.
//
// Generates ~6 weeks of plausible scoliosis session history for the spec
// test profile (S-curve, right thoracic / left lumbar, all four segments
// shifted left). Plants three patterns the Tier 1 analysis layers should
// find:
//
//   1. Lumbar pain spikes 2 days after sessions where the right hip
//      flexor stretch was skipped — Pearson correlation strong + lagged.
//   2. Pelvic rotation drift starting around week 3, then plateauing
//      → cascade prediction should activate "pelvic_rotation" stage.
//   3. Shoulder differential creeps up after badminton sessions
//      (occasional, week 2 + week 5).
//
// Adherence pattern: mostly consistent, with one bad week (week 4) where
// only 2 sessions get logged.
//
// Run with: npx tsx scripts/seed-synthetic.ts
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
// Without those it writes to localStorage… except this is a Node script with
// no browser, so it errors clearly instead of silently doing nothing.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Profile (upsert the demo profile) ─────────────────────────────
const PROFILE_FIELDS = {
  name: "Karmen (synthetic demo)",
  curve_type: "S",
  severity: "mild",
  primary_curve_apex: "lower_thoracic",
  primary_curve_convex_side: "right",
  secondary_curve_apex: "lumbar",
  secondary_curve_convex_side: "left",
  segment_i_shift: "left",
  segment_ii_shift: "left",
  segment_iii_shift: "left",
  segment_iv_shift: "left",
  one_sided_sport: "badminton",
  one_sided_sport_frequency: "weekly",
  daily_sitting_hours: "8_to_12",
  bag_carrying_side: "right",
  sleep_position: "right",
};

// ─── Random helpers (deterministic-ish via seed) ───────────────────
let rng = mulberry32(20260504);
function r(): number {
  return rng();
}
function gauss(mean = 0, std = 1): number {
  // Box-Muller
  const u = 1 - r();
  const v = r();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Synthetic session generation ───────────────────────────────────
type DayPlan = {
  date: Date;
  weekIdx: number;
  sessionExpected: boolean;
  badmintonToday: boolean;
  skippedRightHipFlexor: boolean;
};

const NOW = new Date();
NOW.setHours(19, 30, 0, 0);

const WEEKS = 6;
const DAYS = WEEKS * 7;

function buildSchedule(): DayPlan[] {
  const days: DayPlan[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(NOW);
    date.setDate(NOW.getDate() - i);
    const weekIdx = Math.floor((DAYS - 1 - i) / 7);
    const dow = date.getDay(); // 0..6, 0 = Sunday

    // Adherence: 5–6 sessions/week typical, except week 4 (= weekIdx 3) which is bad.
    let baseChance = 0.78;
    if (weekIdx === 3) baseChance = 0.22; // bad week
    // Prefer mornings on Mon/Wed/Fri evenings on Tue/Thu/Sat
    if (dow === 0) baseChance *= 0.7; // Sundays lower

    const sessionExpected = r() < baseChance;

    // Badminton: weeks 2 and 5, on a midweek day
    const badmintonToday =
      (weekIdx === 1 && dow === 3) || (weekIdx === 4 && dow === 4);

    // Right hip flexor stretch skipped: random ~25% of sessions, slightly higher on busy days
    const skippedRightHipFlexor = sessionExpected && r() < 0.28;

    days.push({
      date,
      weekIdx,
      sessionExpected,
      badmintonToday,
      skippedRightHipFlexor,
    });
  }
  return days;
}

// ─── Posture measurement noise model ────────────────────────────────
// Baseline values for the test profile (right thoracic / left lumbar S-curve).
// Means are already at typical scoliosis-asymmetric levels; we evolve them
// over the synthetic period to plant trends.
function measurementsFor(day: DayPlan, prevPelvicTrend: number): {
  shoulderDiff: { mean: number; std: number };
  hipDiff: { mean: number; std: number };
  headOffset: { mean: number; std: number };
  pelvicRotation: { mean: number; std: number };
  segments: {
    cervical: { mean: number; std: number };
    upperThoracic: { mean: number; std: number };
    lowerThoracic: { mean: number; std: number };
  };
  overall: number;
} {
  // Pelvic rotation drift starting week 3 (planted pattern #2)
  const pelvicDrift = day.weekIdx >= 2 ? prevPelvicTrend + 0.6 : 0;

  // Shoulder differential creeps up after badminton (carry-over for ~3 days)
  const dayIdxFromStart = Math.floor(
    (day.date.getTime() - day.date.getTime()) / (24 * 3600 * 1000),
  );
  void dayIdxFromStart;

  // Tiny improving trend on segment 3 from regular practice (so charts
  // have something positive to show alongside the drift on pelvis).
  const seg3Improvement = -day.weekIdx * 0.4;

  return {
    shoulderDiff: {
      mean: -8 + gauss(0, 1.4) + (day.badmintonToday ? 4 : 0),
      std: 0.8 + r() * 0.6,
    },
    hipDiff: { mean: -3 + gauss(0, 1.0), std: 0.7 + r() * 0.5 },
    headOffset: { mean: 5 + gauss(0, 1.5), std: 1.0 + r() * 0.6 },
    pelvicRotation: {
      mean: 2 + pelvicDrift + gauss(0, 0.8),
      std: 0.6 + r() * 0.4,
    },
    segments: {
      cervical: { mean: -6 + gauss(0, 1.1), std: 0.9 + r() * 0.5 },
      upperThoracic: { mean: -10 + gauss(0, 1.2), std: 1.0 + r() * 0.5 },
      lowerThoracic: {
        mean: -4 + seg3Improvement + gauss(0, 1.1),
        std: 0.9 + r() * 0.5,
      },
    },
    overall: clamp(0, 100, 78 - pelvicDrift * 1.5 - day.weekIdx * 0.2 + gauss(0, 2.5)),
  };
}

function clamp(min: number, max: number, v: number) {
  return Math.max(min, Math.min(max, v));
}

// ─── Pain log generation (planted pattern #1) ───────────────────────
function painPointsForDay(
  day: DayPlan,
  recentSkippedHipFlexorAge: number, // -1 if not recently skipped, else days ago
): { id: string; location: string; intensity: number; type: string }[] {
  const points: { id: string; location: string; intensity: number; type: string }[] = [];

  // Pattern: lumbar pain ~2 days after a skipped right hip flexor session.
  // Confidence band: peaks at lag=2, lower at lags 1 and 3.
  if (recentSkippedHipFlexorAge >= 1 && recentSkippedHipFlexorAge <= 3) {
    const peakIntensity = recentSkippedHipFlexorAge === 2 ? 5 + r() * 1.5 : 3 + r() * 1.5;
    if (r() < 0.75) {
      points.push({
        id: randomUUID(),
        location: "lower_back",
        intensity: Math.round(peakIntensity),
        type: r() < 0.5 ? "ache" : "dull",
      });
    }
  }

  // Mid-back ache after badminton
  if (day.badmintonToday && r() < 0.6) {
    points.push({
      id: randomUUID(),
      location: "mid_back",
      intensity: 3 + Math.round(r() * 2),
      type: "ache",
    });
  }

  // Background noise — occasional neck or shoulder
  if (r() < 0.1) {
    points.push({
      id: randomUUID(),
      location: r() < 0.5 ? "neck" : "right_shoulder",
      intensity: 2 + Math.round(r() * 2),
      type: "ache",
    });
  }

  return points;
}

// ─── PostureSnapshot in the shape Phase 6 produces ──────────────────
function buildSnapshot(m: ReturnType<typeof measurementsFor>) {
  const cv = (s: { mean: number; std: number }) =>
    s.std / Math.max(Math.abs(s.mean), 5);
  const stat = (s: { mean: number; std: number }) => ({
    mean: s.mean,
    std: s.std,
    cv: cv(s),
  });
  const worstCv = Math.max(
    cv(m.shoulderDiff),
    cv(m.hipDiff),
    cv(m.headOffset),
    cv(m.pelvicRotation),
    cv(m.segments.cervical),
    cv(m.segments.upperThoracic),
    cv(m.segments.lowerThoracic),
  );
  const scanConfidence: "high" | "moderate" | "low" =
    worstCv < 0.1 ? "high" : worstCv < 0.25 ? "moderate" : "low";

  const meanStds = (
    [
      m.shoulderDiff.std,
      m.hipDiff.std,
      m.headOffset.std,
      m.pelvicRotation.std,
    ] as number[]
  ).reduce((a, b) => a + b, 0) / 4;

  // Scale-invariant metrics, derived from the mm values so the synthetic rows
  // stay internally consistent. Reference spans are the same population
  // averages the mm generator implicitly assumes.
  const SHOULDER_W_MM = 400;
  const HIP_W_MM = 320;
  const deg = (riseMm: number, spanMm: number) =>
    Math.atan2(riseMm, spanMm) * (180 / Math.PI);
  const asStat = (mean: number, std: number, ref: number) => ({
    mean,
    std,
    cv: std / Math.max(Math.abs(mean), ref),
  });

  const shoulderTilt = asStat(
    deg(m.shoulderDiff.mean, SHOULDER_W_MM),
    deg(m.shoulderDiff.std, SHOULDER_W_MM),
    1,
  );
  const hipTilt = asStat(
    deg(m.hipDiff.mean, HIP_W_MM),
    deg(m.hipDiff.std, HIP_W_MM),
    1,
  );
  const headOffsetRatio = asStat(
    m.headOffset.mean / SHOULDER_W_MM,
    m.headOffset.std / SHOULDER_W_MM,
    0.02,
  );
  const trunkShiftRatio = asStat(
    m.segments.upperThoracic.mean / SHOULDER_W_MM,
    m.segments.upperThoracic.std / SHOULDER_W_MM,
    0.02,
  );

  return {
    // Seeded rows are generated by the current pipeline's conventions, so they
    // are comparable with real v2 scans and count toward the baselines.
    metricsVersion: 2,
    measurements: {
      shoulderTiltDeg: shoulderTilt.mean,
      hipTiltDeg: hipTilt.mean,
      headOffsetRatio: headOffsetRatio.mean,
      trunkShiftRatio: trunkShiftRatio.mean,
      shoulderDiffMm: m.shoulderDiff.mean,
      hipDiffMm: m.hipDiff.mean,
      headOffsetMm: m.headOffset.mean,
      segments: {
        cervical: m.segments.cervical.mean,
        upperThoracic: m.segments.upperThoracic.mean,
        lowerThoracic: m.segments.lowerThoracic.mean,
        lumbar: 0,
      },
      pelvicRotationMm: m.pelvicRotation.mean,
      overallScore: m.overall,
      confidence: 0.78 + r() * 0.15,
    },
    stats: {
      shoulderDiff: stat(m.shoulderDiff),
      hipDiff: stat(m.hipDiff),
      headOffset: stat(m.headOffset),
      pelvicRotation: stat(m.pelvicRotation),
      cervical: stat(m.segments.cervical),
      upperThoracic: stat(m.segments.upperThoracic),
      lowerThoracic: stat(m.segments.lowerThoracic),
      shoulderTilt,
      hipTilt,
      headOffsetRatio,
      trunkShiftRatio,
    },
    scanConfidence,
    framesUsed: 90 + Math.floor(r() * 10),
    // The scan pipeline runs MoveNet, which carries no depth, so yaw is never
    // observable — synthetic rows mirror that rather than inventing a value.
    bodyRotationMaxDeg: null,
    rotationVerified: false,
    meanPoseConfidence: 0.78 + r() * 0.15,
    meanStds,
  };
}

// ─── Library exercise IDs we'll reference in exercises_completed ────
const EXERCISE_PROGRAM = [
  "hip_bridge_pelvic_press_down",
  "side_plank_convex_thoracic_side_down",
  "bird_dog_asymmetric_hold",
  "hip_flexor_stretch_stiff_side", // The "right hip flexor stretch" planted pattern
];

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("Seeding synthetic data…");

  // 1. Upsert the profile
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("name", PROFILE_FIELDS.name)
    .maybeSingle();

  let profileId: string;
  if (existing?.id) {
    profileId = existing.id;
    console.log(`  Reusing profile ${profileId}`);
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .insert(PROFILE_FIELDS)
      .select("id")
      .single();
    if (error) {
      console.error("  Profile insert failed:", error);
      process.exit(1);
    }
    profileId = data.id;
    console.log(`  Created profile ${profileId}`);
  }

  // 2. Wipe previous synthetic sessions so re-runs are idempotent
  await supabase
    .from("sessions")
    .delete()
    .eq("profile_id", profileId)
    .eq("source", "synthetic_seed");

  // 3. Build the day schedule
  const days = buildSchedule();
  let pelvicTrend = 0;
  // Track when right hip flexor stretch was last skipped
  let lastSkippedDayIdx = -10;

  const sessionRows: Record<string, unknown>[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (!day.sessionExpected) continue;

    const recentSkipped = i - lastSkippedDayIdx;
    const pain = painPointsForDay(day, recentSkipped);

    // Track skipped state
    if (day.skippedRightHipFlexor) lastSkippedDayIdx = i;

    // Update pelvic trend slowly (planted pattern #2)
    if (day.weekIdx >= 2) pelvicTrend += 0.05 + r() * 0.08;
    if (pelvicTrend > 9) pelvicTrend = 9 + gauss(0, 0.3); // plateau

    const initial = buildSnapshot(measurementsFor(day, pelvicTrend));
    // Final scan slightly closer to ideal than initial — practice helps a touch
    const final = buildSnapshot(measurementsFor(day, pelvicTrend * 0.85));
    final.measurements.shoulderDiffMm *= 0.92;
    final.measurements.hipDiffMm *= 0.92;
    final.measurements.overallScore = clamp(
      0,
      100,
      final.measurements.overallScore + 2 + r() * 2,
    );

    const startedAt = new Date(day.date);
    startedAt.setHours(7 + Math.floor(r() * 12), Math.floor(r() * 60), 0, 0);
    const completedAt = new Date(
      startedAt.getTime() + (10 + Math.floor(r() * 8)) * 60 * 1000,
    );

    const exercises = EXERCISE_PROGRAM.filter(
      (id) =>
        !(day.skippedRightHipFlexor && id === "hip_flexor_stretch_stiff_side"),
    ).map((exerciseId) => ({
      exerciseId,
      setsCompleted: 3,
      details: [
        {
          repsCompleted: 8 + Math.floor(r() * 3),
          holdSeconds:
            exerciseId === "side_plank_convex_thoracic_side_down" ? 30 : 0,
        },
      ],
    }));

    sessionRows.push({
      profile_id: profileId,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      pain_check: pain,
      initial_scan: initial,
      exercises_completed: exercises,
      final_scan: final,
      scan_confidence: initial.scanConfidence,
      source: "synthetic_seed",
      notes: null,
    });
  }

  console.log(`  Inserting ${sessionRows.length} sessions…`);
  const { error: insertErr } = await supabase
    .from("sessions")
    .insert(sessionRows);
  if (insertErr) {
    console.error("  Sessions insert failed:", insertErr);
    process.exit(1);
  }

  console.log("Done. Run Tier 1 cron jobs to compute baselines / correlations / cascade.");
}

void main();
