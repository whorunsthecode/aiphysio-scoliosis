// Between-session repeatability: how much a measurement moves when nothing
// about the person has changed.
//
// This is the number the trend engine was missing. It gated "improving" and
// "drifting" on within-scan frame jitter — the wobble across ten seconds of
// one standing — which says nothing about the error that actually dominates:
// re-placing the camera, standing slightly differently, different clothes,
// a different time of day. That error is several times larger, so the engine
// compared a real signal against the wrong denominator and would announce
// progress that was a repositioned laptop.
//
// The fix is empirical rather than modelled. Scan, walk fully away, set up
// again, re-scan. The difference between that pair is a direct sample of
// between-session error for this person, this phone, this room. Collect ten
// pairs and the statistics below fall out.
//
// Definitions follow standard test–retest convention:
//
//   SEM   = SD_diff / sqrt(2)          standard error of measurement
//   MDC95 = 1.96 * sqrt(2) * SEM       = 1.96 * SD_diff
//
// MDC95 is the threshold a change must exceed before it can be distinguished
// from measurement error at 95% confidence. Anything smaller is not a small
// change — it is no evidence of change at all, and the UI should say so.

export type ScanPair = {
  // Two scans of the same person, same day, with a full re-setup between.
  first: number;
  second: number;
  // Optional label for provenance in the report.
  at?: string;
};

export type Repeatability = {
  n: number;
  // Mean signed difference. Non-zero suggests a systematic drift between the
  // first and second scan of a pair — fatigue, warming up, or a setup habit.
  bias: number;
  sdDiff: number;
  sem: number;
  mdc95: number;
  // Bland–Altman limits of agreement.
  loaLower: number;
  loaUpper: number;
};

export const MIN_PAIRS_FOR_MDC = 5;

export function computeRepeatability(pairs: ScanPair[]): Repeatability | null {
  const diffs = pairs
    .map((p) => p.second - p.first)
    .filter((d) => Number.isFinite(d));
  if (diffs.length < 2) return null;

  const n = diffs.length;
  const bias = diffs.reduce((a, b) => a + b, 0) / n;
  // Sample SD, n-1 — these are a sample of possible re-setups, not the
  // population of them.
  const variance =
    diffs.reduce((acc, d) => acc + (d - bias) ** 2, 0) / (n - 1);
  const sdDiff = Math.sqrt(variance);
  const sem = sdDiff / Math.SQRT2;
  const mdc95 = 1.96 * sdDiff;

  return {
    n,
    bias,
    sdDiff,
    sem,
    mdc95,
    loaLower: bias - 1.96 * sdDiff,
    loaUpper: bias + 1.96 * sdDiff,
  };
}

// Per-measurement MDC, keyed by the same ids the trend engine uses. Null for
// a measurement with too few pairs to estimate one honestly.
export type MdcTable = Record<string, number | null>;

export function buildMdcTable(
  pairsByMeasurement: Record<string, ScanPair[]>,
): MdcTable {
  const out: MdcTable = {};
  for (const [key, pairs] of Object.entries(pairsByMeasurement)) {
    if (pairs.length < MIN_PAIRS_FOR_MDC) {
      out[key] = null;
      continue;
    }
    out[key] = computeRepeatability(pairs)?.mdc95 ?? null;
  }
  return out;
}

// Human-readable line for the UI. Deliberately states the limit rather than
// an accuracy claim — a limitation is honest in a way a boast is not, and no
// consumer posture app publishes one.
export function describeDetectionLimit(
  mdc: number | null,
  unit: string,
): string {
  if (mdc === null) {
    return "Not enough repeat scans yet to know what counts as a real change.";
  }
  return `Changes smaller than ${mdc.toFixed(1)}${unit} can't be told apart from measurement noise, so we won't call them.`;
}
