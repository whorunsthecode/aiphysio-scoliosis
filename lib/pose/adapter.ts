// Adapt MoveNet's 17-keypoint output into the 33-slot MediaPipe-shaped array
// the rest of the pipeline (compute.ts, StickerOverlay) consumes. MoveNet
// returns pixel coords; we normalize to [0,1] using the source video's
// dimensions so the downstream math stays unit-agnostic.

import { POSE, type NormalizedLandmark } from "./types";
import type { MoveNetPose } from "./movenet";

// MoveNet keypoint index → MediaPipe Pose Landmarker index
const MN_TO_MP: Record<number, number> = {
  0: POSE.NOSE,
  1: POSE.LEFT_EYE,
  2: POSE.RIGHT_EYE,
  3: POSE.LEFT_EAR,
  4: POSE.RIGHT_EAR,
  5: POSE.LEFT_SHOULDER,
  6: POSE.RIGHT_SHOULDER,
  7: POSE.LEFT_ELBOW,
  8: POSE.RIGHT_ELBOW,
  9: POSE.LEFT_WRIST,
  10: POSE.RIGHT_WRIST,
  11: POSE.LEFT_HIP,
  12: POSE.RIGHT_HIP,
  13: POSE.LEFT_KNEE,
  14: POSE.RIGHT_KNEE,
  15: POSE.LEFT_ANKLE,
  16: POSE.RIGHT_ANKLE,
};

const EMPTY_LANDMARK: NormalizedLandmark = {
  x: 0,
  y: 0,
  z: 0,
  visibility: 0,
};

export function adaptMoveNetToLandmarks(
  pose: MoveNetPose | null,
  videoWidth: number,
  videoHeight: number,
): NormalizedLandmark[] | null {
  if (!pose || !pose.keypoints || videoWidth <= 0 || videoHeight <= 0) {
    return null;
  }

  // Pre-fill the full 33-slot array with empty landmarks so consumer code
  // can index any MediaPipe slot safely.
  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    ...EMPTY_LANDMARK,
  }));

  for (let i = 0; i < pose.keypoints.length; i++) {
    const kp = pose.keypoints[i];
    const targetIdx = MN_TO_MP[i];
    if (targetIdx === undefined) continue;
    landmarks[targetIdx] = {
      x: kp.x / videoWidth,
      y: kp.y / videoHeight,
      // MoveNet 2D doesn't provide z. Body rotation in compute.ts falls back
      // to the shoulder/hip width-ratio proxy when z is absent.
      z: 0,
      visibility: typeof kp.score === "number" ? kp.score : 0,
    };
  }

  return landmarks;
}
