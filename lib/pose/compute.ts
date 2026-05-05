import {
  POSE,
  type NormalizedLandmark,
  type PostureMeasurements,
} from "./types";

const TORSO_LENGTH_MM = 500; // adult average shoulder-midpoint to hip-midpoint

// Convert pose landmarks (normalized image coords, 0–1) into physical-mm
// posture measurements. We anchor scale on torso length: the apparent
// vertical distance between shoulder midpoint and hip midpoint is assumed to
// be 500mm. All measurements are signed so we can show direction (positive =
// shifted to the user's right when facing the camera, but mirrored display
// makes that the user's left — UI handles direction labels).
export function computePosture(
  landmarks: NormalizedLandmark[],
): PostureMeasurements | null {
  if (!landmarks || landmarks.length < 25) return null;

  const lShoulder = landmarks[POSE.LEFT_SHOULDER];
  const rShoulder = landmarks[POSE.RIGHT_SHOULDER];
  const lHip = landmarks[POSE.LEFT_HIP];
  const rHip = landmarks[POSE.RIGHT_HIP];
  const nose = landmarks[POSE.NOSE];
  const lEar = landmarks[POSE.LEFT_EAR];
  const rEar = landmarks[POSE.RIGHT_EAR];

  if (!lShoulder || !rShoulder || !lHip || !rHip || !nose) return null;

  const shoulderMid = midpoint(lShoulder, rShoulder);
  const hipMid = midpoint(lHip, rHip);

  const torsoNormY = Math.max(0.05, hipMid.y - shoulderMid.y);
  const mmPerNorm = TORSO_LENGTH_MM / torsoNormY;

  // Signed: positive = left landmark is HIGHER on screen (smaller y) than right
  const shoulderDiffMm = (rShoulder.y - lShoulder.y) * mmPerNorm;
  const hipDiffMm = (rHip.y - lHip.y) * mmPerNorm;

  // Head over pelvis: signed lateral offset, positive = nose shifted to right
  // of hip midpoint (in image coords, before mirror)
  const headOffsetMm = (nose.x - hipMid.x) * mmPerNorm;

  // Four segment deviation from a vertical plumb line through hip midpoint.
  // We only have head, shoulder, and hip landmarks — so segments II–IV are
  // interpolated between shoulder and hip midpoints, with II nearest the
  // shoulder. Honest about the approximation in the disclaimer.
  const earMid =
    lEar && rEar ? midpoint(lEar, rEar) : { x: nose.x, y: nose.y };
  const cervicalDev = (earMid.x - hipMid.x) * mmPerNorm;
  const upperThorDev = (shoulderMid.x - hipMid.x) * mmPerNorm;
  // Lower thoracic interpolated 60% of the way from shoulder to hip
  const lowerThorXNorm = lerp(shoulderMid.x, hipMid.x, 0.6);
  const lowerThorDev = (lowerThorXNorm - hipMid.x) * mmPerNorm;
  const lumbarDev = 0; // hip midpoint is the plumb-line reference

  // Pelvic rotation proxy: difference in apparent length of left vs right
  // torso (left shoulder → left hip vs right shoulder → right hip). When the
  // pelvis rotates, one side foreshortens.
  const leftTorsoNorm = dist(lShoulder, lHip);
  const rightTorsoNorm = dist(rShoulder, rHip);
  const pelvicRotationMm = (leftTorsoNorm - rightTorsoNorm) * mmPerNorm;

  // Confidence = mean visibility of key landmarks
  const visibilities = [
    lShoulder.visibility,
    rShoulder.visibility,
    lHip.visibility,
    rHip.visibility,
    nose.visibility,
  ].filter((v): v is number => typeof v === "number");
  const confidence = visibilities.length
    ? visibilities.reduce((a, b) => a + b, 0) / visibilities.length
    : 0;

  const measurements: PostureMeasurements = {
    shoulderDiffMm,
    hipDiffMm,
    headOffsetMm,
    segments: {
      cervical: cervicalDev,
      upperThoracic: upperThorDev,
      lowerThoracic: lowerThorDev,
      lumbar: lumbarDev,
    },
    pelvicRotationMm,
    overallScore: 0, // filled below
    confidence,
  };

  measurements.overallScore = computeOverallScore(measurements);
  return measurements;
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Composite alignment score, 0–100. 0 = severe asymmetry, 100 = perfectly
// aligned. Calibrated so ~10mm total deviation ≈ 90, ~40mm ≈ 60.
function computeOverallScore(m: PostureMeasurements): number {
  const total =
    Math.abs(m.shoulderDiffMm) +
    Math.abs(m.hipDiffMm) +
    Math.abs(m.headOffsetMm) * 0.5 +
    Math.abs(m.segments.cervical) * 0.3 +
    Math.abs(m.segments.upperThoracic) * 0.6 +
    Math.abs(m.segments.lowerThoracic) * 0.4 +
    Math.abs(m.pelvicRotationMm) * 0.4;
  const score = 100 - total * 0.6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Smooth a stream of measurements with an exponential moving average so the
// UI doesn't twitch frame-to-frame. Returns the smoothed value.
export function ema(prev: number | null, next: number, alpha = 0.25): number {
  if (prev === null || !Number.isFinite(prev)) return next;
  return prev * (1 - alpha) + next * alpha;
}

// Estimate body rotation relative to the camera plane in degrees. Prefers
// 3D depth (MediaPipe's z); falls back to a 2D shoulder/hip width-ratio
// proxy when z is absent (MoveNet).
export function bodyRotationDeg(landmarks: NormalizedLandmark[]): number {
  const lShoulder = landmarks[POSE.LEFT_SHOULDER];
  const rShoulder = landmarks[POSE.RIGHT_SHOULDER];
  const lHip = landmarks[POSE.LEFT_HIP];
  const rHip = landmarks[POSE.RIGHT_HIP];
  if (!lShoulder || !rShoulder || !lHip || !rHip) return 0;

  const lShoulderZ = typeof lShoulder.z === "number" ? lShoulder.z : null;
  const rShoulderZ = typeof rShoulder.z === "number" ? rShoulder.z : null;
  const hasZ =
    lShoulderZ !== null &&
    rShoulderZ !== null &&
    (Math.abs(lShoulderZ) + Math.abs(rShoulderZ)) > 0;

  if (hasZ) {
    const xDiff = Math.abs(rShoulder.x - lShoulder.x);
    if (xDiff < 0.01) return 0;
    const zDiff = (rShoulderZ as number) - (lShoulderZ as number);
    const deg = Math.atan2(Math.abs(zDiff), xDiff) * (180 / Math.PI);
    return Math.min(90, deg);
  }

  // 2D fallback: a square torso has shoulderWidth ≈ hipWidth × ~1.05. When
  // the body rotates, the shorter side foreshortens. Convert ratio gap into
  // degrees with a calibrated scale (≈ 30° per 30% width gap).
  const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
  const hipWidth = Math.abs(rHip.x - lHip.x);
  if (shoulderWidth === 0 || hipWidth === 0) return 0;
  const ratio =
    Math.min(shoulderWidth, hipWidth) / Math.max(shoulderWidth, hipWidth);
  return Math.max(0, (1 - ratio) * 30);
}

export function smoothMeasurements(
  prev: PostureMeasurements | null,
  next: PostureMeasurements,
  alpha = 0.25,
): PostureMeasurements {
  if (!prev) return next;
  return {
    shoulderDiffMm: ema(prev.shoulderDiffMm, next.shoulderDiffMm, alpha),
    hipDiffMm: ema(prev.hipDiffMm, next.hipDiffMm, alpha),
    headOffsetMm: ema(prev.headOffsetMm, next.headOffsetMm, alpha),
    segments: {
      cervical: ema(prev.segments.cervical, next.segments.cervical, alpha),
      upperThoracic: ema(
        prev.segments.upperThoracic,
        next.segments.upperThoracic,
        alpha,
      ),
      lowerThoracic: ema(
        prev.segments.lowerThoracic,
        next.segments.lowerThoracic,
        alpha,
      ),
      lumbar: 0,
    },
    pelvicRotationMm: ema(
      prev.pelvicRotationMm,
      next.pelvicRotationMm,
      alpha,
    ),
    overallScore: ema(prev.overallScore, next.overallScore, alpha),
    confidence: ema(prev.confidence, next.confidence, alpha * 1.5),
  };
}
