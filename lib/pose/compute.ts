import {
  POSE,
  type NormalizedLandmark,
  type PostureMeasurements,
} from "./types";

const TORSO_LENGTH_MM = 500; // adult average shoulder-midpoint to hip-midpoint

// Convert pose landmarks into posture measurements.
//
// Two families of output (see PostureMeasurements):
//
//   Scale-invariant  — angles and shoulder-width ratios. No torso assumption,
//                      no camera-distance dependence. Use these longitudinally.
//   Millimetre       — anchored on the assumption that the apparent vertical
//                      distance between shoulder midpoint and hip midpoint is
//                      500mm. Systematically wrong by the ratio of that
//                      constant to the user's real torso length. Kept for the
//                      Tier-1 / cascade / trend consumers.
//
// `aspect` is the video's width/height. Landmark coords are normalized
// independently on each axis (x by frame width, y by frame height), so any
// quantity mixing x and y — every angle, every hypotenuse — is skewed by the
// frame's aspect ratio unless x is rescaled first. Callers must pass the real
// value; a 16:9 frame otherwise distorts angles by ~1.78x.
//
// All measurements are signed so we can show direction (positive = shifted to
// the user's right when facing the camera, but mirrored display makes that the
// user's left — UI handles direction labels).
export function computePosture(
  landmarks: NormalizedLandmark[],
  aspect: number,
): PostureMeasurements | null {
  if (!landmarks || landmarks.length < 25) return null;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;

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

  // Work in square-pixel space: rescale x by the aspect ratio so that x and y
  // share a unit. Every angle and hypotenuse below depends on this.
  const sx = (p: { x: number }) => p.x * aspect;

  const torsoNormY = Math.max(0.05, hipMid.y - shoulderMid.y);
  const mmPerNorm = TORSO_LENGTH_MM / torsoNormY;

  // ─────────────────── Scale-invariant metrics ───────────────────
  //
  // Shoulder width in square-pixel space is the normalizer: it is a single
  // horizontal span measured at one depth, so it scales with camera distance
  // exactly as the offsets do and divides out of every ratio below.
  const shoulderWidth = Math.hypot(
    sx(rShoulder) - sx(lShoulder),
    rShoulder.y - lShoulder.y,
  );
  const shoulderWidthSafe = Math.max(1e-6, shoulderWidth);

  // Signed tilt from horizontal. Sign matches the mm differentials: positive
  // when the left landmark sits higher on screen (smaller y) than the right.
  const shoulderTiltDeg =
    Math.atan2(
      rShoulder.y - lShoulder.y,
      Math.abs(sx(rShoulder) - sx(lShoulder)),
    ) *
    (180 / Math.PI);
  const hipTiltDeg =
    Math.atan2(rHip.y - lHip.y, Math.abs(sx(rHip) - sx(lHip))) *
    (180 / Math.PI);

  const headOffsetRatio = (sx(nose) - sx(hipMid)) / shoulderWidthSafe;
  const trunkShiftRatio = (sx(shoulderMid) - sx(hipMid)) / shoulderWidthSafe;

  // ─────────────────── Millimetre metrics (legacy) ───────────────────

  // Signed: positive = left landmark is HIGHER on screen (smaller y) than right
  const shoulderDiffMm = (rShoulder.y - lShoulder.y) * mmPerNorm;
  const hipDiffMm = (rHip.y - lHip.y) * mmPerNorm;

  // Head over pelvis: signed lateral offset, positive = nose shifted to right
  // of hip midpoint (in image coords, before mirror). Horizontal spans must be
  // aspect-corrected before being scaled by the vertically-derived mmPerNorm.
  const headOffsetMm = (sx(nose) - sx(hipMid)) * mmPerNorm;

  // Four segment deviation from a vertical plumb line through hip midpoint.
  // We only have head, shoulder, and hip landmarks — so segments II–IV are
  // interpolated between shoulder and hip midpoints, with II nearest the
  // shoulder. Honest about the approximation in the disclaimer.
  const earMid =
    lEar && rEar ? midpoint(lEar, rEar) : { x: nose.x, y: nose.y };
  const cervicalDev = (sx(earMid) - sx(hipMid)) * mmPerNorm;
  const upperThorDev = (sx(shoulderMid) - sx(hipMid)) * mmPerNorm;
  // Lower thoracic interpolated 60% of the way from shoulder to hip
  const lowerThorX = lerp(sx(shoulderMid), sx(hipMid), 0.6);
  const lowerThorDev = (lowerThorX - sx(hipMid)) * mmPerNorm;
  const lumbarDev = 0; // hip midpoint is the plumb-line reference

  // Pelvic rotation proxy: difference in apparent length of left vs right
  // torso (left shoulder → left hip vs right shoulder → right hip).
  //
  // This responds to a rotated pelvis — but it responds just as strongly to
  // whole-body yaw, because yaw puts one side of the torso nearer the camera
  // and perspective magnifies it. The two causes are not separable from a
  // single 2D view. Consumers must check `rotationVerified` on the snapshot
  // before attributing this to the pelvis. See PostureMeasurements.
  const leftTorsoNorm = distAspect(lShoulder, lHip, aspect);
  const rightTorsoNorm = distAspect(rShoulder, rHip, aspect);
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
    shoulderTiltDeg,
    hipTiltDeg,
    headOffsetRatio,
    trunkShiftRatio,
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

function distAspect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  aspect: number,
) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
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

// Estimate body rotation (yaw) relative to the camera plane, in degrees.
//
// Returns null when yaw cannot be estimated at all, which is the case for any
// landmark source without depth — MoveNet in particular. Callers MUST treat
// null as "unknown", not as zero: an unverified scan can carry many
// millimetres of phantom asymmetry from yaw the app never saw.
//
// There used to be a 2D fallback here that compared shoulder width to hip
// width. It did not work. Yaw foreshortens both spans by the same cos(theta),
// so their ratio is nearly invariant to rotation — porting the formula and
// sweeping true yaw from 0° to 30° moved its output from 6.00° to 6.14°. What
// it actually measured was the subject's shoulder-to-hip build, which meant
// two failure modes at once: anyone whose shoulder and hip widths differed by
// more than 20% was permanently above the 5° rejection threshold and could
// never complete a scan, while an even-built subject stayed below it at any
// real rotation. Recovering yaw from a single 2D view needs a depth signal, a
// fiducial of known size, or a per-user calibrated reference frame. Until one
// of those exists, saying "unknown" is the honest answer.
export function bodyRotationDeg(
  landmarks: NormalizedLandmark[],
): number | null {
  const lShoulder = landmarks[POSE.LEFT_SHOULDER];
  const rShoulder = landmarks[POSE.RIGHT_SHOULDER];
  if (!lShoulder || !rShoulder) return null;

  const lShoulderZ = typeof lShoulder.z === "number" ? lShoulder.z : null;
  const rShoulderZ = typeof rShoulder.z === "number" ? rShoulder.z : null;
  const hasZ =
    lShoulderZ !== null &&
    rShoulderZ !== null &&
    Math.abs(lShoulderZ) + Math.abs(rShoulderZ) > 0;

  if (!hasZ) return null;

  const xDiff = Math.abs(rShoulder.x - lShoulder.x);
  if (xDiff < 0.01) return null;
  const zDiff = (rShoulderZ as number) - (lShoulderZ as number);
  const deg = Math.atan2(Math.abs(zDiff), xDiff) * (180 / Math.PI);
  return Math.min(90, deg);
}

export function smoothMeasurements(
  prev: PostureMeasurements | null,
  next: PostureMeasurements,
  alpha = 0.25,
): PostureMeasurements {
  if (!prev) return next;
  return {
    shoulderTiltDeg: ema(prev.shoulderTiltDeg, next.shoulderTiltDeg, alpha),
    hipTiltDeg: ema(prev.hipTiltDeg, next.hipTiltDeg, alpha),
    headOffsetRatio: ema(prev.headOffsetRatio, next.headOffsetRatio, alpha),
    trunkShiftRatio: ema(prev.trunkShiftRatio, next.trunkShiftRatio, alpha),
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
