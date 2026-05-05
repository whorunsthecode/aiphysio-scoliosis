// Trend extraction + weighted regression for the /progress view.
//
// Per Add 3: high-confidence measurements should count more than low-
// confidence ones. We use inverse-variance weighting (w = 1/std²) when
// computing the trend slope, with a floor on std to avoid division blow-up.

import type { SessionState } from "./types";
import type { PostureSnapshot } from "@/lib/pose/stats";

export type TrendPoint = {
  t: number; // unix ms
  sessionId: string;
  value: number; // mm or score
  std: number; // measurement uncertainty
};

export type TrendDirection = "improving" | "drifting" | "stable";

export type TrendSeries = {
  label: string;
  points: TrendPoint[];
  // For deviations, the ideal value is 0. For scores, ideal is 100.
  ideal: number;
  // "lower magnitude = better" (deviations) vs "higher value = better" (scores).
  improvementMode: "lower_magnitude" | "higher_value";
  direction: TrendDirection;
  slope: number;
  // Significant change band (slope × span) vs noise (mean std).
  changeMagnitude: number;
};

const STD_FLOOR = 0.5;

// Pull a series for one measurement key out of a list of sessions.
type SnapshotKey = keyof PostureSnapshot["stats"]; // narrow set

const MEASUREMENT_DEFS: Record<
  string,
  {
    key: SnapshotKey | "overallScore";
    valueAccessor: (snap: PostureSnapshot) => { mean: number; std: number };
    label: string;
    ideal: number;
    improvementMode: "lower_magnitude" | "higher_value";
  }
> = {
  shoulderDiff: {
    key: "shoulderDiff",
    valueAccessor: (s) => ({
      mean: s.measurements.shoulderDiffMm,
      std: s.stats.shoulderDiff.std,
    }),
    label: "Shoulder differential",
    ideal: 0,
    improvementMode: "lower_magnitude",
  },
  hipDiff: {
    key: "hipDiff",
    valueAccessor: (s) => ({
      mean: s.measurements.hipDiffMm,
      std: s.stats.hipDiff.std,
    }),
    label: "Hip differential",
    ideal: 0,
    improvementMode: "lower_magnitude",
  },
  headOffset: {
    key: "headOffset",
    valueAccessor: (s) => ({
      mean: s.measurements.headOffsetMm,
      std: s.stats.headOffset.std,
    }),
    label: "Head over pelvis",
    ideal: 0,
    improvementMode: "lower_magnitude",
  },
  pelvicRotation: {
    key: "pelvicRotation",
    valueAccessor: (s) => ({
      mean: s.measurements.pelvicRotationMm,
      std: s.stats.pelvicRotation.std,
    }),
    label: "Pelvic rotation",
    ideal: 0,
    improvementMode: "lower_magnitude",
  },
  upperThoracic: {
    key: "upperThoracic",
    valueAccessor: (s) => ({
      mean: s.measurements.segments.upperThoracic,
      std: s.stats.upperThoracic.std,
    }),
    label: "Upper thoracic",
    ideal: 0,
    improvementMode: "lower_magnitude",
  },
  lowerThoracic: {
    key: "lowerThoracic",
    valueAccessor: (s) => ({
      mean: s.measurements.segments.lowerThoracic,
      std: s.stats.lowerThoracic.std,
    }),
    label: "Lower thoracic",
    ideal: 0,
    improvementMode: "lower_magnitude",
  },
  overallScore: {
    key: "overallScore",
    valueAccessor: (s) => ({
      mean: s.measurements.overallScore,
      // Score doesn't carry its own std; approximate with mean of measurement stds.
      std:
        (s.stats.shoulderDiff.std +
          s.stats.hipDiff.std +
          s.stats.headOffset.std +
          s.stats.pelvicRotation.std) /
        4,
    }),
    label: "Overall posture score",
    ideal: 100,
    improvementMode: "higher_value",
  },
};

export type MeasurementId = keyof typeof MEASUREMENT_DEFS;

export const ALL_MEASUREMENTS: MeasurementId[] = Object.keys(
  MEASUREMENT_DEFS,
) as MeasurementId[];

// Use either the initial scan or the final scan from each session — final
// is preferred because it reflects what posture looked like *after* practice.
// Fall back to initial if final is missing.
function snapshotFor(s: SessionState): PostureSnapshot | null {
  return s.finalScan ?? s.initialScan;
}

export function extractTrend(
  sessions: SessionState[],
  measurementId: MeasurementId,
): TrendSeries {
  const def = MEASUREMENT_DEFS[measurementId];
  const points: TrendPoint[] = sessions
    .map((s) => {
      const snap = snapshotFor(s);
      if (!snap) return null;
      const v = def.valueAccessor(snap);
      return {
        t: s.startedAt,
        sessionId: s.id,
        value: v.mean,
        std: Math.max(STD_FLOOR, v.std),
      };
    })
    .filter((p): p is TrendPoint => p !== null)
    .sort((a, b) => a.t - b.t);

  const { slope, changeMagnitude } = weightedSlope(points);

  let direction: TrendDirection = "stable";
  if (points.length >= 2) {
    const meanStd =
      points.reduce((a, p) => a + p.std, 0) / points.length;
    const totalChange = slope * (points[points.length - 1].t - points[0].t);
    const totalChangeMm = Math.abs(totalChange);
    if (totalChangeMm > meanStd * 1.5) {
      // Determine direction relative to "improvement"
      const startMag =
        def.improvementMode === "lower_magnitude"
          ? Math.abs(points[0].value)
          : points[0].value;
      const endMag =
        def.improvementMode === "lower_magnitude"
          ? Math.abs(points[points.length - 1].value)
          : points[points.length - 1].value;
      const improved =
        def.improvementMode === "lower_magnitude"
          ? endMag < startMag
          : endMag > startMag;
      direction = improved ? "improving" : "drifting";
    }
  }

  return {
    label: def.label,
    points,
    ideal: def.ideal,
    improvementMode: def.improvementMode,
    direction,
    slope,
    changeMagnitude,
  };
}

function weightedSlope(points: TrendPoint[]): {
  slope: number;
  intercept: number;
  changeMagnitude: number;
} {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.value ?? 0, changeMagnitude: 0 };
  }
  // Weights = 1 / std² (inverse-variance).
  const weights = points.map((p) => 1 / (p.std * p.std));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const xMean =
    points.reduce((a, p, i) => a + p.t * weights[i], 0) / sumW;
  const yMean =
    points.reduce((a, p, i) => a + p.value * weights[i], 0) / sumW;
  let num = 0;
  let den = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].t - xMean;
    const dy = points[i].value - yMean;
    num += weights[i] * dx * dy;
    den += weights[i] * dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const span = points[points.length - 1].t - points[0].t;
  const changeMagnitude = Math.abs(slope * span);
  return { slope, intercept, changeMagnitude };
}

// Aggregate stats for a list of sessions.
export type SessionWeekStats = {
  sessionsThisWeek: number;
  activeDays: number;
  avgExercisesPerSession: number;
  totalSets: number;
  totalMinutes: number;
};

export function weekStats(sessions: SessionState[]): SessionWeekStats {
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = sessions.filter((s) => s.startedAt >= oneWeekAgo);
  const sessionsThisWeek = recent.length;
  const activeDays = new Set(
    recent.map((s) => new Date(s.startedAt).toDateString()),
  ).size;
  const totalExercises = recent.reduce(
    (a, s) => a + s.exerciseSummaries.length,
    0,
  );
  const avgExercisesPerSession =
    sessionsThisWeek === 0 ? 0 : totalExercises / sessionsThisWeek;
  const totalSets = recent.reduce(
    (a, s) =>
      a + s.exerciseSummaries.reduce((b, e) => b + e.setsCompleted, 0),
    0,
  );
  const totalMinutes = Math.round(
    recent.reduce(
      (a, s) =>
        a + (s.completedAt ? (s.completedAt - s.startedAt) / 60_000 : 0),
      0,
    ),
  );
  return {
    sessionsThisWeek,
    activeDays,
    avgExercisesPerSession,
    totalSets,
    totalMinutes,
  };
}

// Aggregate pain points across recent sessions, by region.
export type PainAggregate = Record<
  string,
  { meanIntensity: number; daysReported: number }
>;

export function aggregatePain(sessions: SessionState[]): PainAggregate {
  const byRegion = new Map<string, { sum: number; count: number; days: Set<string> }>();
  for (const s of sessions) {
    for (const p of s.pain) {
      const day = new Date(s.startedAt).toDateString();
      const ex = byRegion.get(p.location) ?? {
        sum: 0,
        count: 0,
        days: new Set<string>(),
      };
      ex.sum += p.intensity;
      ex.count += 1;
      ex.days.add(day);
      byRegion.set(p.location, ex);
    }
  }
  const out: PainAggregate = {};
  for (const [loc, agg] of byRegion.entries()) {
    out[loc] = {
      meanIntensity: agg.sum / Math.max(1, agg.count),
      daysReported: agg.days.size,
    };
  }
  return out;
}
