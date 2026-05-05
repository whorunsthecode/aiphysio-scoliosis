// Frame-aggregation statistics for multi-frame posture scans.
//
// We sample posture at ~10fps for 10 seconds, then compute mean / std / CV
// per measurement. CV (coefficient of variation = std / |mean|) is the
// uncertainty signal we expose to the UI per Add 3's honesty rules.
//
// Because deviations can be near zero (good alignment), raw std/mean blows
// up. We use a stabilized denominator: CV = std / max(|mean|, REF_MM) so a
// near-zero mean with a small std reads as "small uncertainty" rather than
// "infinite uncertainty".

import type { PostureMeasurements } from "./types";

export const CV_REF_MM = 5; // floor for the CV denominator

export type ScanConfidence = "high" | "moderate" | "low";

export type MeasurementStats = {
  mean: number;
  std: number;
  cv: number; // stabilized
};

export type PostureSnapshot = {
  measurements: PostureMeasurements; // means
  stats: {
    shoulderDiff: MeasurementStats;
    hipDiff: MeasurementStats;
    headOffset: MeasurementStats;
    pelvicRotation: MeasurementStats;
    cervical: MeasurementStats;
    upperThoracic: MeasurementStats;
    lowerThoracic: MeasurementStats;
  };
  scanConfidence: ScanConfidence;
  framesUsed: number;
  bodyRotationMaxDeg: number;
  meanPoseConfidence: number;
};

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

function statsOf(xs: number[]): MeasurementStats {
  const m = mean(xs);
  const s = stdDev(xs);
  const cv = s / Math.max(Math.abs(m), CV_REF_MM);
  return { mean: m, std: s, cv };
}

// CV thresholds per Add 3:
//   high     CV < 0.10
//   moderate 0.10..0.25
//   low      > 0.25
export function bandFromCv(cv: number): ScanConfidence {
  if (cv < 0.1) return "high";
  if (cv < 0.25) return "moderate";
  return "low";
}

export function aggregateScanFrames(
  frames: PostureMeasurements[],
  meta: {
    bodyRotationsDeg: number[];
    poseConfidences: number[];
  },
): PostureSnapshot {
  const shoulderDiff = statsOf(frames.map((f) => f.shoulderDiffMm));
  const hipDiff = statsOf(frames.map((f) => f.hipDiffMm));
  const headOffset = statsOf(frames.map((f) => f.headOffsetMm));
  const pelvicRotation = statsOf(frames.map((f) => f.pelvicRotationMm));
  const cervical = statsOf(frames.map((f) => f.segments.cervical));
  const upperThoracic = statsOf(frames.map((f) => f.segments.upperThoracic));
  const lowerThoracic = statsOf(frames.map((f) => f.segments.lowerThoracic));

  // Aggregate scan confidence = worst CV across measurements.
  const worstCv = Math.max(
    shoulderDiff.cv,
    hipDiff.cv,
    headOffset.cv,
    pelvicRotation.cv,
    cervical.cv,
    upperThoracic.cv,
    lowerThoracic.cv,
  );

  // Composite score from means.
  const overallScore = mean(frames.map((f) => f.overallScore));

  const measurements: PostureMeasurements = {
    shoulderDiffMm: shoulderDiff.mean,
    hipDiffMm: hipDiff.mean,
    headOffsetMm: headOffset.mean,
    segments: {
      cervical: cervical.mean,
      upperThoracic: upperThoracic.mean,
      lowerThoracic: lowerThoracic.mean,
      lumbar: 0,
    },
    pelvicRotationMm: pelvicRotation.mean,
    overallScore,
    confidence: mean(meta.poseConfidences),
  };

  return {
    measurements,
    stats: {
      shoulderDiff,
      hipDiff,
      headOffset,
      pelvicRotation,
      cervical,
      upperThoracic,
      lowerThoracic,
    },
    scanConfidence: bandFromCv(worstCv),
    framesUsed: frames.length,
    bodyRotationMaxDeg: meta.bodyRotationsDeg.reduce(
      (a, b) => Math.max(a, b),
      0,
    ),
    meanPoseConfidence: mean(meta.poseConfidences),
  };
}

// Rejection criteria per Add 1:
//   - body rotation > 5° from camera (max across frames)
//   - mean pose-detection confidence < 0.7
//   - fewer than 30 usable frames
export type RejectionReason =
  | "tilt_drifted"
  | "body_rotated"
  | "low_pose_confidence"
  | "too_few_frames"
  | "no_pose";

export function evaluateRejection(
  snapshot: Pick<
    PostureSnapshot,
    "framesUsed" | "bodyRotationMaxDeg" | "meanPoseConfidence"
  >,
): RejectionReason | null {
  if (snapshot.framesUsed < 30) return "too_few_frames";
  if (snapshot.bodyRotationMaxDeg > 5) return "body_rotated";
  if (snapshot.meanPoseConfidence < 0.7) return "low_pose_confidence";
  return null;
}

export function rejectionAdvice(reason: RejectionReason): string {
  switch (reason) {
    case "tilt_drifted":
      return "Your camera moved during the scan. Prop it more securely and try again.";
    case "body_rotated":
      return "You were rotated relative to the camera. Stand more square-on, shoulders parallel to the screen.";
    case "low_pose_confidence":
      return "I couldn't see you clearly enough. More even light, plain background, and full torso in frame will help.";
    case "too_few_frames":
      return "I didn't get enough good frames. Stand still for the full ten seconds and try again.";
    case "no_pose":
      return "I didn't pick up a pose. Step back so your full torso and head are in the frame.";
  }
}
