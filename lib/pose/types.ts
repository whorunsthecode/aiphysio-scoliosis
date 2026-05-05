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
  pelvicRotationMm: number;
  // 0–100 composite alignment score.
  overallScore: number;
  // Quality of the underlying pose (mean visibility of key landmarks, 0–1).
  confidence: number;
};
