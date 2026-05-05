// MoveNet Thunder via @tensorflow-models/pose-detection. Used for posture
// scans where landmark accuracy (especially on hips and pelvis) matters more
// than latency. MediaPipe is kept for real-time exercise form check.

import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";

let cached: poseDetection.PoseDetector | null = null;
let inflight: Promise<poseDetection.PoseDetector> | null = null;

export type MoveNetKeypoint = {
  x: number;
  y: number;
  score?: number;
  name?: string;
};

export type MoveNetPose = {
  keypoints: MoveNetKeypoint[];
};

export async function getMoveNetDetector(): Promise<poseDetection.PoseDetector> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    // Prefer WebGL; fall back to CPU.
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();

    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        enableSmoothing: true,
      },
    );
    cached = detector;
    inflight = null;
    return detector;
  })();

  return inflight;
}

export async function detectMoveNet(
  detector: poseDetection.PoseDetector,
  video: HTMLVideoElement,
): Promise<MoveNetPose | null> {
  const poses = await detector.estimatePoses(video, {
    maxPoses: 1,
    flipHorizontal: false,
  });
  if (!poses || poses.length === 0) return null;
  return poses[0] as MoveNetPose;
}

export function disposeMoveNet() {
  if (cached) {
    cached.dispose();
    cached = null;
  }
}
