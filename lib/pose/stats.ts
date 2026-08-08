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

// Version of the measurement pipeline that produced a snapshot.
//
//   1 — original. Horizontal spans (head offset, segment deviations, the
//       pelvic rotation proxy) were scaled by a vertically-derived factor
//       without correcting for the frame's aspect ratio, inflating them by up
//       to 1.78x on a 16:9 camera. No scale-invariant metrics.
//   2 — aspect-corrected, and carries shoulderTiltDeg / hipTiltDeg /
//       headOffsetRatio / trunkShiftRatio.
//
// Values from different versions are on different scales and must never be
// pooled into the same mean, standard deviation, or trend line. Anything
// computing statistics across sessions filters on this — see isCurrentMetrics.
// Snapshots written before the field existed read as version 1.
export const METRICS_VERSION = 2;

export function snapshotMetricsVersion(snap: unknown): number {
  const v = (snap as { metricsVersion?: unknown } | null)?.metricsVersion;
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
}

export function isCurrentMetrics(snap: unknown): boolean {
  return snapshotMetricsVersion(snap) === METRICS_VERSION;
}

export const CV_REF_MM = 5; // floor for the CV denominator, millimetre metrics
export const CV_REF_DEG = 1; // floor for tilt angles, degrees
export const CV_REF_RATIO = 0.02; // floor for shoulder-width-fraction metrics

export type ScanConfidence = "high" | "moderate" | "low";

export type MeasurementStats = {
  mean: number;
  std: number;
  cv: number; // stabilized
};

export type PostureSnapshot = {
  // Which measurement pipeline produced this. See METRICS_VERSION.
  metricsVersion: number;
  measurements: PostureMeasurements; // means
  stats: {
    shoulderDiff: MeasurementStats;
    hipDiff: MeasurementStats;
    headOffset: MeasurementStats;
    pelvicRotation: MeasurementStats;
    cervical: MeasurementStats;
    upperThoracic: MeasurementStats;
    lowerThoracic: MeasurementStats;
    // Scale-invariant metrics — no torso-length assumption. Prefer these.
    shoulderTilt: MeasurementStats;
    hipTilt: MeasurementStats;
    headOffsetRatio: MeasurementStats;
    trunkShiftRatio: MeasurementStats;
  };
  scanConfidence: ScanConfidence;
  framesUsed: number;
  // Max yaw across frames, or null when yaw could not be measured at all
  // (any depth-free landmark source — MoveNet included). Null is NOT zero.
  bodyRotationMaxDeg: number | null;
  // False when yaw was never observable during this scan. Consumers reading
  // pelvicRotationMm, or comparing lateral offsets across sessions, must
  // check this: an unverified scan can carry ~9mm of phantom asymmetry per
  // 2° of unseen yaw at typical laptop distance.
  rotationVerified: boolean;
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

function statsOf(xs: number[], ref: number = CV_REF_MM): MeasurementStats {
  const m = mean(xs);
  const s = stdDev(xs);
  const cv = s / Math.max(Math.abs(m), ref);
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
    // null entries = yaw was not observable on that frame.
    bodyRotationsDeg: (number | null)[];
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

  const shoulderTilt = statsOf(
    frames.map((f) => f.shoulderTiltDeg),
    CV_REF_DEG,
  );
  const hipTilt = statsOf(frames.map((f) => f.hipTiltDeg), CV_REF_DEG);
  const headOffsetRatio = statsOf(
    frames.map((f) => f.headOffsetRatio),
    CV_REF_RATIO,
  );
  const trunkShiftRatio = statsOf(
    frames.map((f) => f.trunkShiftRatio),
    CV_REF_RATIO,
  );

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
    shoulderTiltDeg: shoulderTilt.mean,
    hipTiltDeg: hipTilt.mean,
    headOffsetRatio: headOffsetRatio.mean,
    trunkShiftRatio: trunkShiftRatio.mean,
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

  const observedRotations = meta.bodyRotationsDeg.filter(
    (d): d is number => typeof d === "number" && Number.isFinite(d),
  );
  const rotationVerified = observedRotations.length > 0;

  // An unverified scan cannot be trusted at "high" — yaw we never saw is
  // indistinguishable from real asymmetry in every lateral measurement.
  const cvBand = bandFromCv(worstCv);
  const scanConfidence: ScanConfidence =
    rotationVerified || cvBand !== "high" ? cvBand : "moderate";

  return {
    metricsVersion: METRICS_VERSION,
    measurements,
    stats: {
      shoulderDiff,
      hipDiff,
      headOffset,
      pelvicRotation,
      cervical,
      upperThoracic,
      lowerThoracic,
      shoulderTilt,
      hipTilt,
      headOffsetRatio,
      trunkShiftRatio,
    },
    scanConfidence,
    framesUsed: frames.length,
    bodyRotationMaxDeg: rotationVerified
      ? observedRotations.reduce((a, b) => Math.max(a, b), 0)
      : null,
    rotationVerified,
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
  // Only a measured yaw can reject a scan. When yaw is unknown the scan is
  // still kept — it is downgraded to "moderate" confidence in
  // aggregateScanFrames instead. Rejecting on an unmeasured value is what
  // locked broad-shouldered users out of the scan entirely.
  if (
    typeof snapshot.bodyRotationMaxDeg === "number" &&
    snapshot.bodyRotationMaxDeg > 5
  ) {
    return "body_rotated";
  }
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
