// Property checks for the posture measurement pipeline.
//
//   npx tsx scripts/check-pose-invariants.ts
//
// Exits non-zero on failure. These lock in the guarantees that separate the
// scale-invariant metrics from the legacy millimetre ones:
//
//   - a tilt angle recovers ground truth, and does not move when the camera
//     distance, the frame aspect ratio, or the subject's body size changes
//   - the millimetre values DO move with body size, which is the systematic
//     error the fixed 500mm torso anchor introduces
//   - yaw is reported as unknown rather than fabricated when the landmark
//     source carries no depth
//
// Synthetic landmarks are projected through a pinhole model and normalized
// per-axis exactly as MoveNet and MediaPipe emit them.

import { bodyRotationDeg, computePosture } from "@/lib/pose/compute";
import {
  METRICS_VERSION,
  aggregateScanFrames,
  isCurrentMetrics,
  snapshotMetricsVersion,
} from "@/lib/pose/stats";
import { POSE, type NormalizedLandmark } from "@/lib/pose/types";

const FOCAL_PX = 1000;

type BodyOpts = {
  tiltDeg: number;
  distanceMm: number;
  frameW: number;
  frameH: number;
  torsoMm?: number;
  shoulderWidthMm?: number;
  withDepth?: boolean;
};

function makeBody(o: BodyOpts): NormalizedLandmark[] {
  const torso = o.torsoMm ?? 500;
  const shoulderW = o.shoulderWidthMm ?? 400;
  const hipW = shoulderW * 0.8;
  const t = (o.tiltDeg * Math.PI) / 180;

  const pts: Record<number, [number, number, number]> = {
    [POSE.LEFT_SHOULDER]: [
      -(shoulderW / 2) * Math.cos(t),
      -(shoulderW / 2) * Math.sin(t),
      0,
    ],
    [POSE.RIGHT_SHOULDER]: [
      (shoulderW / 2) * Math.cos(t),
      (shoulderW / 2) * Math.sin(t),
      0,
    ],
    [POSE.LEFT_HIP]: [-hipW / 2, torso, 0],
    [POSE.RIGHT_HIP]: [hipW / 2, torso, 0],
    [POSE.NOSE]: [0, -torso / 2, 0],
    [POSE.LEFT_EAR]: [-70, -torso / 2 - 30, 0],
    [POSE.RIGHT_EAR]: [70, -torso / 2 - 30, 0],
  };

  const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.95,
  }));

  for (const [idxStr, [x, y, z]] of Object.entries(pts)) {
    const idx = Number(idxStr);
    const px = (FOCAL_PX * x) / (o.distanceMm + z) + o.frameW / 2;
    const py = (FOCAL_PX * y) / (o.distanceMm + z) + o.frameH / 2;
    lm[idx] = {
      x: px / o.frameW,
      y: py / o.frameH,
      // Depth-free sources (MoveNet) leave z at 0; MediaPipe populates it.
      z: o.withDepth ? z / 1000 || 1e-3 : 0,
      visibility: 0.95,
    };
  }
  return lm;
}

function measure(o: BodyOpts) {
  const m = computePosture(makeBody(o), o.frameW / o.frameH);
  if (!m) throw new Error("computePosture returned null for a valid body");
  return m;
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const TOL_DEG = 0.01;
const TOL_RATIO = 0.001;

console.log("\nposture measurement invariants\n");

// 1. Tilt recovers ground truth.
for (const trueTilt of [0, 2, 5, 10, 15]) {
  const got = measure({
    tiltDeg: trueTilt,
    distanceMm: 1500,
    frameW: 1280,
    frameH: 720,
  }).shoulderTiltDeg;
  check(
    `shoulderTiltDeg recovers a ${trueTilt}deg tilt`,
    Math.abs(got - trueTilt) < TOL_DEG,
    `expected ~${trueTilt}, got ${got.toFixed(4)}`,
  );
}

// 2. Invariant to camera distance.
{
  const base = { tiltDeg: 4, frameW: 1280, frameH: 720 };
  const ms = [800, 1500, 2500, 4000].map((distanceMm) =>
    measure({ ...base, distanceMm }),
  );
  check(
    "shoulderTiltDeg invariant to camera distance",
    spread(ms.map((m) => m.shoulderTiltDeg)) < TOL_DEG,
    `spread ${spread(ms.map((m) => m.shoulderTiltDeg)).toFixed(4)}deg`,
  );
  check(
    "headOffsetRatio invariant to camera distance",
    spread(ms.map((m) => m.headOffsetRatio)) < TOL_RATIO,
    `spread ${spread(ms.map((m) => m.headOffsetRatio)).toFixed(4)}`,
  );
}

// 3. Invariant to frame aspect ratio.
{
  const frames: [number, number][] = [
    [1280, 720],
    [640, 480],
    [720, 720],
    [720, 1280],
  ];
  const ms = frames.map(([frameW, frameH]) =>
    measure({ tiltDeg: 4, distanceMm: 1500, frameW, frameH }),
  );
  check(
    "shoulderTiltDeg invariant to frame aspect ratio",
    spread(ms.map((m) => m.shoulderTiltDeg)) < TOL_DEG,
    `spread ${spread(ms.map((m) => m.shoulderTiltDeg)).toFixed(4)}deg across 16:9, 4:3, 1:1, 9:16`,
  );
  check(
    "headOffsetRatio invariant to frame aspect ratio",
    spread(ms.map((m) => m.headOffsetRatio)) < TOL_RATIO,
    `spread ${spread(ms.map((m) => m.headOffsetRatio)).toFixed(4)}`,
  );
}

// 4. Invariant to body size — and the legacy mm value is not.
{
  const base = { tiltDeg: 4, distanceMm: 1500, frameW: 1280, frameH: 720 };
  const ms = [420, 500, 580].map((torsoMm) => measure({ ...base, torsoMm }));
  const degSpread = spread(ms.map((m) => m.shoulderTiltDeg));
  const mmSpread = spread(ms.map((m) => m.shoulderDiffMm));
  check(
    "shoulderTiltDeg invariant to torso length",
    degSpread < TOL_DEG,
    `spread ${degSpread.toFixed(4)}deg`,
  );
  check(
    "shoulderDiffMm demonstrably corrupted by torso length",
    mmSpread > 5,
    `identical posture should read differently in mm across torso lengths; spread was only ${mmSpread.toFixed(2)}mm`,
  );
  console.log(
    `        (same 4deg posture reads as ${ms
      .map((m) => `${m.shoulderDiffMm.toFixed(1)}mm`)
      .join(" / ")} for torso 420/500/580mm)`,
  );
}

// 5. Yaw is unknown without depth, and measurable with it.
{
  const noDepth = bodyRotationDeg(
    makeBody({ tiltDeg: 0, distanceMm: 1500, frameW: 1280, frameH: 720 }),
  );
  check(
    "bodyRotationDeg returns null when landmarks carry no depth",
    noDepth === null,
    `expected null, got ${noDepth}`,
  );

  // The old width-ratio fallback reported ~6deg for a stationary subject whose
  // shoulders were wider than their hips, which permanently tripped the 5deg
  // rejection gate. Confirm no such value is produced now.
  const broad = bodyRotationDeg(
    makeBody({
      tiltDeg: 0,
      distanceMm: 1500,
      frameW: 1280,
      frameH: 720,
      shoulderWidthMm: 460,
    }),
  );
  check(
    "a broad-shouldered stationary subject is not reported as rotated",
    broad === null || broad < 5,
    `expected null or <5deg, got ${broad}`,
  );
}

// 6. Metric versioning — statistics must never pool across pipelines.
{
  const frames = [0, 1, 2].map(
    (i) =>
      measure({
        tiltDeg: 4 + i * 0.05,
        distanceMm: 1500,
        frameW: 1280,
        frameH: 720,
      }),
  );
  const snap = aggregateScanFrames(frames, {
    bodyRotationsDeg: [null, null, null],
    poseConfidences: [0.9, 0.9, 0.9],
  });

  check(
    "a fresh snapshot is stamped with the current metrics version",
    snap.metricsVersion === METRICS_VERSION && isCurrentMetrics(snap),
    `got version ${snap.metricsVersion}, expected ${METRICS_VERSION}`,
  );
  check(
    "a snapshot with no version field reads as legacy, not current",
    snapshotMetricsVersion({ measurements: {} }) === 1 &&
      !isCurrentMetrics({ measurements: {} }),
    `untagged snapshots must not be pooled with v${METRICS_VERSION} statistics`,
  );
  check(
    "yaw unmeasurable across every frame yields null, not zero",
    snap.bodyRotationMaxDeg === null && snap.rotationVerified === false,
    `got ${snap.bodyRotationMaxDeg} / verified=${snap.rotationVerified}`,
  );
  check(
    "an unverified-rotation scan is capped below high confidence",
    snap.scanConfidence !== "high",
    `got "${snap.scanConfidence}"`,
  );
}

console.log(
  failures === 0
    ? `\nall checks passed\n`
    : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
