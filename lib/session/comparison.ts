// Session-end comparison: change bands per Add 3.
//
// For each measurement we have mean + std from both scans. The "noise" of
// the change is the combined uncertainty. We classify the delta as:
//
//   none        |delta| < 1× combined std    "no meaningful change"
//   small       1× to 2× combined std        "small improvement|shift"
//   noticeable  2× to 4× combined std        "noticeable improvement|shift"
//   significant > 4× combined std            "significant improvement|shift —
//                                              worth bringing up with your physio"

import type { PostureSnapshot } from "@/lib/pose/stats";

export type ChangeBand = "none" | "small" | "noticeable" | "significant";
export type ChangeDirection = "improved" | "drifted" | "neutral";

export type Comparison = {
  label: string;
  initialMean: number;
  finalMean: number;
  delta: number; // final − initial
  combinedStd: number;
  band: ChangeBand;
  direction: ChangeDirection;
  copy: string;
};

const BAND_THRESHOLDS = { small: 1, noticeable: 2, significant: 4 } as const;

export function classifyChange(
  delta: number,
  combinedStd: number,
): ChangeBand {
  const abs = Math.abs(delta);
  // Always use a small floor so near-zero std doesn't make every change "significant".
  const std = Math.max(combinedStd, 1);
  if (abs < std * BAND_THRESHOLDS.small) return "none";
  if (abs < std * BAND_THRESHOLDS.noticeable) return "small";
  if (abs < std * BAND_THRESHOLDS.significant) return "noticeable";
  return "significant";
}

function bandPhrase(direction: ChangeDirection, band: ChangeBand): string {
  if (direction === "neutral" || band === "none") return "no meaningful change";
  const verb = direction === "improved" ? "improvement" : "shift";
  if (band === "small") return `small ${verb}`;
  if (band === "noticeable") return `noticeable ${verb}`;
  return `significant ${verb} — worth bringing up with your physio`;
}

// For a deviation measurement (shoulder/hip differentials, etc.), lower
// |value| is better. So "improved" means |final| < |initial|.
function compareDeviation(
  label: string,
  initialMean: number,
  finalMean: number,
  initialStd: number,
  finalStd: number,
): Comparison {
  const delta = finalMean - initialMean;
  const absImproved = Math.abs(initialMean) - Math.abs(finalMean);
  const direction: ChangeDirection =
    absImproved > 0 ? "improved" : absImproved < 0 ? "drifted" : "neutral";
  const combinedStd = Math.sqrt(initialStd ** 2 + finalStd ** 2);
  // Use the magnitude change (not signed delta) for band classification.
  const band = classifyChange(absImproved, combinedStd);
  return {
    label,
    initialMean,
    finalMean,
    delta,
    combinedStd,
    band,
    direction: band === "none" ? "neutral" : direction,
    copy: bandPhrase(band === "none" ? "neutral" : direction, band),
  };
}

// For a score (higher is better), "improved" means final > initial.
function compareScore(
  label: string,
  initialMean: number,
  finalMean: number,
  initialStd: number,
  finalStd: number,
): Comparison {
  const delta = finalMean - initialMean;
  const direction: ChangeDirection =
    delta > 0 ? "improved" : delta < 0 ? "drifted" : "neutral";
  const combinedStd = Math.sqrt(initialStd ** 2 + finalStd ** 2);
  const band = classifyChange(delta, combinedStd);
  return {
    label,
    initialMean,
    finalMean,
    delta,
    combinedStd,
    band,
    direction: band === "none" ? "neutral" : direction,
    copy: bandPhrase(band === "none" ? "neutral" : direction, band),
  };
}

export function compareScans(
  initial: PostureSnapshot | null,
  final: PostureSnapshot | null,
): Comparison[] {
  if (!initial || !final) return [];

  return [
    compareDeviation(
      "Shoulder differential",
      initial.measurements.shoulderDiffMm,
      final.measurements.shoulderDiffMm,
      initial.stats.shoulderDiff.std,
      final.stats.shoulderDiff.std,
    ),
    compareDeviation(
      "Hip differential",
      initial.measurements.hipDiffMm,
      final.measurements.hipDiffMm,
      initial.stats.hipDiff.std,
      final.stats.hipDiff.std,
    ),
    compareDeviation(
      "Head over pelvis",
      initial.measurements.headOffsetMm,
      final.measurements.headOffsetMm,
      initial.stats.headOffset.std,
      final.stats.headOffset.std,
    ),
    compareDeviation(
      "Pelvic rotation",
      initial.measurements.pelvicRotationMm,
      final.measurements.pelvicRotationMm,
      initial.stats.pelvicRotation.std,
      final.stats.pelvicRotation.std,
    ),
    compareDeviation(
      "Upper thoracic",
      initial.measurements.segments.upperThoracic,
      final.measurements.segments.upperThoracic,
      initial.stats.upperThoracic.std,
      final.stats.upperThoracic.std,
    ),
    compareScore(
      "Overall posture score",
      initial.measurements.overallScore,
      final.measurements.overallScore,
      // Scores don't carry their own std in the snapshot; approximate via
      // the average measurement std as a sensible proxy.
      averageStd(initial),
      averageStd(final),
    ),
  ];
}

function averageStd(s: PostureSnapshot): number {
  const stds = [
    s.stats.shoulderDiff.std,
    s.stats.hipDiff.std,
    s.stats.headOffset.std,
    s.stats.pelvicRotation.std,
  ];
  return stds.reduce((a, b) => a + b, 0) / stds.length;
}
