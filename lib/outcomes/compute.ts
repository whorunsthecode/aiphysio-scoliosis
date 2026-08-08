// Outcome measures that don't depend on the camera.
//
// The posture scan cannot carry the product's feedback loop — its numbers are
// dominated by setup rather than by the person, and even once that is fixed,
// external trunk asymmetry moves slowly and invisibly. Scoliosis exercise
// produces no felt short-term reward, so a product built only on that loop
// asks people to keep going on faith. Most stop.
//
// What follows is measured with a clock and a question. No projection, no
// scale anchor, no model. All three move on a two-to-four week timescale, and
// two of them are things the user can feel changing.
//
//   PSFS         three activities the patient chooses themselves
//   endurance    timed holds, with the left/right ratio as the headline
//   good days    days spent below a pain threshold they set

import { computeRepeatability, type ScanPair } from "@/lib/pose/repeatability";

// ───────────────────────────────── PSFS ─────────────────────────────────
//
// Patient-Specific Functional Scale. The patient names up to three activities
// their condition interferes with, and rates each 0–10. Because they choose
// the activities, the scale measures what actually matters to them rather
// than what is convenient to measure — which is also why it is the single
// most useful thing to ask a scoliosis patient every month.
//
// Published MCID is around 2 points on the average score and 3 points on a
// single activity. Treat those as the bar for calling a change real.

export const PSFS_MAX_ACTIVITIES = 3;
export const PSFS_MCID_AVERAGE = 2;
export const PSFS_MCID_SINGLE = 3;

export type PsfsActivity = {
  id: string;
  // In the patient's own words. "Carry my kit bag to training" beats
  // "lift objects".
  label: string;
  // 0 = unable to perform, 10 = able to perform as before the problem.
  score: number;
};

export type PsfsEntry = {
  at: number;
  activities: PsfsActivity[];
};

export function psfsAverage(entry: PsfsEntry): number | null {
  const scored = entry.activities.filter(
    (a) => Number.isFinite(a.score) && a.score >= 0 && a.score <= 10,
  );
  if (scored.length === 0) return null;
  return scored.reduce((a, b) => a + b.score, 0) / scored.length;
}

export type PsfsChange = {
  from: number;
  to: number;
  delta: number;
  // True only when the change clears the published MCID.
  meaningful: boolean;
  // Per-activity movement, since one activity improving a lot is a different
  // story from everything nudging up slightly.
  perActivity: { label: string; delta: number; meaningful: boolean }[];
};

export function psfsChange(
  earlier: PsfsEntry,
  later: PsfsEntry,
): PsfsChange | null {
  const from = psfsAverage(earlier);
  const to = psfsAverage(later);
  if (from === null || to === null) return null;

  const byLabel = new Map(earlier.activities.map((a) => [a.label, a.score]));
  const perActivity = later.activities
    .filter((a) => byLabel.has(a.label))
    .map((a) => {
      const delta = a.score - (byLabel.get(a.label) as number);
      return {
        label: a.label,
        delta,
        meaningful: Math.abs(delta) >= PSFS_MCID_SINGLE,
      };
    });

  const delta = to - from;
  return {
    from,
    to,
    delta,
    meaningful: Math.abs(delta) >= PSFS_MCID_AVERAGE,
    perActivity,
  };
}

// ─────────────────────────────── Endurance ───────────────────────────────
//
// Timed isometric holds. The side-bridge left/right ratio is the headline:
// it is a direct measure of the lateral asymmetry scoliosis produces, it is
// measured with a stopwatch rather than inferred, it responds to training on
// a timescale of weeks, and the user feels it change.
//
// Convention from trunk-endurance testing is that side-bridge endurance
// should be close to symmetric, with a ratio within roughly 0.05 of 1.0.
// Treated here as a reference band to track against rather than a diagnostic
// threshold — what matters for this product is the direction the individual's
// own ratio moves over time.

export const SIDE_BRIDGE_SYMMETRY_TOLERANCE = 0.05;

export type EnduranceTest =
  | "side_bridge_left"
  | "side_bridge_right"
  | "sorensen"
  | "single_leg_balance_left"
  | "single_leg_balance_right";

export type EnduranceResult = {
  test: EnduranceTest;
  seconds: number;
  // Stopped because form broke rather than because the muscle failed — worth
  // recording, since the two mean different things.
  endedOnForm?: boolean;
};

export type CheckIn = {
  at: number;
  results: EnduranceResult[];
};

function secondsFor(c: CheckIn, test: EnduranceTest): number | null {
  const r = c.results.find((x) => x.test === test);
  return r && Number.isFinite(r.seconds) && r.seconds > 0 ? r.seconds : null;
}

export type SideBridgeRatio = {
  left: number;
  right: number;
  // Always weaker ÷ stronger, so the value sits in (0, 1] regardless of which
  // side is weaker. A raw left/right ratio would move in opposite directions
  // for two users with mirrored curves.
  ratio: number;
  weakerSide: "left" | "right" | "neither";
  symmetric: boolean;
};

export function sideBridgeRatio(c: CheckIn): SideBridgeRatio | null {
  const left = secondsFor(c, "side_bridge_left");
  const right = secondsFor(c, "side_bridge_right");
  if (left === null || right === null) return null;

  const ratio = Math.min(left, right) / Math.max(left, right);
  const weakerSide =
    left === right ? "neither" : left < right ? "left" : "right";

  return {
    left,
    right,
    ratio,
    weakerSide,
    symmetric: 1 - ratio <= SIDE_BRIDGE_SYMMETRY_TOLERANCE,
  };
}

// Endurance is noisy — motivation, sleep and time of day all move it — so the
// same rule applies as to posture: establish what counts as a real change
// before calling one. Reuses the repeatability maths rather than duplicating
// it, since the statistics are identical.
export function enduranceMdc(pairs: ScanPair[]): number | null {
  return computeRepeatability(pairs)?.mdc95 ?? null;
}

export type RatioTrend = "improving" | "worsening" | "unchanged";

export function ratioTrend(
  earlier: SideBridgeRatio,
  later: SideBridgeRatio,
  // Minimum ratio movement worth calling. Default is deliberately coarse
  // until a real per-user MDC exists.
  minChange = 0.08,
): RatioTrend {
  const delta = later.ratio - earlier.ratio;
  if (Math.abs(delta) < minChange) return "unchanged";
  // Ratio rising = the two sides are converging = more symmetric.
  return delta > 0 ? "improving" : "worsening";
}

// ─────────────────────────────── Good days ───────────────────────────────
//
// The simplest honest measure in the product, and possibly the most
// motivating: how many days recently were low-pain ones. It needs no
// equipment, it is what people actually care about, and unlike a posture
// score it cannot be produced by a moved camera.

export const DEFAULT_GOOD_DAY_MAX_PAIN = 2;

export type DayPain = { at: number; maxIntensity: number };

export type GoodDays = {
  good: number;
  logged: number;
  // Null when nothing was logged — distinct from zero good days, which is a
  // real and much worse answer.
  fraction: number | null;
  currentStreak: number;
};

export function goodDays(
  days: DayPain[],
  windowDays = 28,
  threshold = DEFAULT_GOOD_DAY_MAX_PAIN,
  now = 0,
): GoodDays {
  const cutoff = now - windowDays * 86_400_000;
  const inWindow = days
    .filter((d) => d.at >= cutoff)
    .sort((a, b) => b.at - a.at); // newest first

  const good = inWindow.filter((d) => d.maxIntensity <= threshold).length;

  let currentStreak = 0;
  for (const d of inWindow) {
    if (d.maxIntensity <= threshold) currentStreak++;
    else break;
  }

  return {
    good,
    logged: inWindow.length,
    fraction: inWindow.length ? good / inWindow.length : null,
    currentStreak,
  };
}
