// Lazy-load MediaPipe Pose Landmarker. The WASM and model assets are pulled
// from CDNs at runtime so we don't bloat the bundle. Cached singleton — the
// model takes a few seconds to download on first use.

import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerOptions,
} from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const MODEL_URLS = {
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
} as const;

let cachedLandmarker: PoseLandmarker | null = null;
let inflight: Promise<PoseLandmarker> | null = null;

export async function getPoseLandmarker(
  quality: "full" | "lite" = "full",
): Promise<PoseLandmarker> {
  if (cachedLandmarker) return cachedLandmarker;
  if (inflight) return inflight;

  inflight = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options: PoseLandmarkerOptions = {
      baseOptions: {
        modelAssetPath: MODEL_URLS[quality],
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    const landmarker = await PoseLandmarker.createFromOptions(vision, options);
    cachedLandmarker = landmarker;
    inflight = null;
    return landmarker;
  })();

  return inflight;
}

export function disposeLandmarker() {
  if (cachedLandmarker) {
    cachedLandmarker.close();
    cachedLandmarker = null;
  }
}
