// Re-export the lightweight subset of MediaPipe types we use, so consumer
// modules don't have to depend on @mediapipe/tasks-vision directly.

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// Canonical landmark indices, MediaPipe Pose Landmarker numbering — 33 slots.
// MoveNet results are adapted into the same shape via lib/pose/adapter.ts
// so all downstream code (compute.ts, StickerOverlay, etc.) works either way.
export const POSE = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export type PostureMeasurements = {
  // ─────────────────── Scale-invariant metrics (preferred) ───────────────────
  //
  // These carry no torso-length assumption and no aspect-ratio dependence, so
  // they are directly comparable across sessions, devices, and camera
  // distances. Prefer them over the mm values below for anything longitudinal.
  //
  // Signed the same way as the mm fields: positive = left side higher on the
  // body / shifted to the user's right.

  // Angle of the shoulder line from horizontal, degrees.
  shoulderTiltDeg: number;
  // Angle of the hip line from horizontal, degrees.
  hipTiltDeg: number;
  // Head lateral offset from hip midpoint, as a fraction of shoulder width.
  headOffsetRatio: number;
  // Shoulder-midpoint lateral offset from hip midpoint, as a fraction of
  // shoulder width. Replaces the mm "upper thoracic" segment deviation.
  trunkShiftRatio: number;

  // ─────────────────────── Millimetre metrics (legacy) ───────────────────────
  //
  // WARNING: every value below is scaled by TORSO_LENGTH_MM / (this user's
  // true torso length). With the fixed 500mm anchor that is a systematic error
  // of roughly ±20% per user. The constant cancels for within-person trends
  // only while the user's torso length is stable — which is false for the
  // adolescent population where scoliosis progresses fastest.
  //
  // These are retained because the Tier-1 baselines, cascade models, and trend
  // engine still consume them. Treat them as within-session comparators, not
  // as absolute measurements, and do not surface them as clinical numbers.

  // Differential = signed (left - right). Positive = left side higher / shifted right.
  shoulderDiffMm: number;
  hipDiffMm: number;
  // Lateral offset of head from hip midpoint, signed. Positive = head shifted right of pelvis.
  headOffsetMm: number;
  // Per-segment lateral deviation in mm, signed.
  segments: {
    cervical: number;
    upperThoracic: number;
    lowerThoracic: number;
    lumbar: number;
  };
  // Pelvic rotation proxy: difference in left vs right hip-to-shoulder length, in mm.
  //
  // WARNING: this construct is confounded by yaw. Rotating a perfectly
  // symmetric body about its vertical axis changes left-vs-right torso
  // length by exactly this mechanism — at 0.8m from the camera, 2° of yaw
  // fabricates ~9mm. A single 2D view cannot separate "rotated symmetric
  // trunk" from "square asymmetric trunk". Only trust this field when the
  // snapshot reports rotationVerified === true, and even then treat it as
  // weak evidence.
  pelvicRotationMm: number;
  // 0–100 composite alignment score.
  overallScore: number;
  // Quality of the underlying pose (mean visibility of key landmarks, 0–1).
  confidence: number;
};
