"use client";

import { useEffect, useRef } from "react";
import { POSE, type NormalizedLandmark } from "@/lib/pose/types";
import { TONE_COLORS } from "@/lib/pose/thresholds";

interface CoachOverlayProps {
  landmarks: NormalizedLandmark[] | null;
  exerciseId: string;
  // Form-check-side awareness so we draw the right reference line.
  configuredSide: "left" | "right" | null;
  // True when the user is in position and form is currently good.
  inPosition: boolean;
  goodForm: boolean;
  width: number;
  height: number;
  mirror?: boolean;
}

export function CoachOverlay({
  landmarks,
  exerciseId,
  configuredSide,
  inPosition,
  goodForm,
  width,
  height,
  mirror = true,
}: CoachOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!landmarks) return;

    const px = (x: number) => (mirror ? (1 - x) * width : x * width);
    const py = (y: number) => y * height;

    const tone = !inPosition
      ? "rgba(184, 174, 164, 0.7)" // ink-tertiary, neutral
      : goodForm
        ? TONE_COLORS.within
        : TONE_COLORS.monitor;

    if (exerciseId === "side_plank_convex_thoracic_side_down") {
      drawSidePlankGuides(ctx, landmarks, configuredSide, px, py, tone);
    } else if (exerciseId === "hip_bridge_pelvic_press_down") {
      drawHipBridgeGuides(ctx, landmarks, configuredSide, px, py, tone);
    } else if (exerciseId === "bird_dog_asymmetric_hold") {
      drawBirdDogGuides(ctx, landmarks, configuredSide, px, py, tone);
    } else if (exerciseId === "lunge_pelvic_tilt_back_leg_tiptoe") {
      drawLungeGuides(ctx, landmarks, px, py, tone);
    } else if (exerciseId === "t_stretch_neutral_spine") {
      drawTStretchGuides(ctx, landmarks, px, py, tone);
    } else {
      drawJointDots(ctx, landmarks, px, py);
    }
  }, [landmarks, exerciseId, configuredSide, inPosition, goodForm, width, height, mirror]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

function drawSidePlankGuides(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  side: "left" | "right" | null,
  px: (x: number) => number,
  py: (y: number) => number,
  tone: string,
) {
  const isRight = side === "right";
  const shoulder = lms[isRight ? POSE.RIGHT_SHOULDER : POSE.LEFT_SHOULDER];
  const hip = lms[isRight ? POSE.RIGHT_HIP : POSE.LEFT_HIP];
  const ankle = lms[isRight ? POSE.RIGHT_ANKLE : POSE.LEFT_ANKLE];
  const upShoulder = lms[isRight ? POSE.LEFT_SHOULDER : POSE.RIGHT_SHOULDER];

  if (!shoulder || !hip || !ankle) return;

  // Ideal line: dashed white between shoulder and ankle.
  ctx.save();
  ctx.strokeStyle = "rgba(255, 252, 247, 0.55)";
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px(shoulder.x), py(shoulder.y));
  ctx.lineTo(px(ankle.x), py(ankle.y));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Actual line: shoulder → hip → ankle, colored by form.
  ctx.save();
  ctx.shadowColor = tone;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(px(shoulder.x), py(shoulder.y));
  ctx.lineTo(px(hip.x), py(hip.y));
  ctx.lineTo(px(ankle.x), py(ankle.y));
  ctx.stroke();
  ctx.restore();

  // Joint dots
  for (const lm of [shoulder, hip, ankle]) {
    drawDot(ctx, px(lm.x), py(lm.y), tone);
  }
  if (upShoulder?.visibility && upShoulder.visibility > 0.3) {
    drawDot(ctx, px(upShoulder.x), py(upShoulder.y), "rgba(255, 252, 247, 0.85)");
  }
}

function drawHipBridgeGuides(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  pressDown: "left" | "right" | null,
  px: (x: number) => number,
  py: (y: number) => number,
  tone: string,
) {
  const lHip = lms[POSE.LEFT_HIP];
  const rHip = lms[POSE.RIGHT_HIP];
  const lKnee = lms[POSE.LEFT_KNEE];
  const rKnee = lms[POSE.RIGHT_KNEE];
  if (!lHip || !rHip) return;

  ctx.save();

  // Hip line — emphasizes evenness L vs R.
  ctx.shadowColor = tone;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px(lHip.x), py(lHip.y));
  ctx.lineTo(px(rHip.x), py(rHip.y));
  ctx.stroke();

  // Knee line in lighter tone.
  if (lKnee?.visibility && rKnee?.visibility) {
    ctx.shadowBlur = 6;
    ctx.strokeStyle = "rgba(255, 252, 247, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(lKnee.x), py(lKnee.y));
    ctx.lineTo(px(rKnee.x), py(rKnee.y));
    ctx.stroke();
  }

  ctx.restore();

  // Highlight the press-down side hip with a small ring.
  if (pressDown) {
    const target = pressDown === "left" ? lHip : rHip;
    ctx.save();
    ctx.strokeStyle = "rgba(127, 167, 138, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(target.x), py(target.y), 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const lm of [lHip, rHip, lKnee, rKnee].filter(Boolean) as NormalizedLandmark[]) {
    drawDot(ctx, px(lm.x), py(lm.y), tone);
  }
}

function drawBirdDogGuides(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  cuedArmSide: "left" | "right" | null,
  px: (x: number) => number,
  py: (y: number) => number,
  tone: string,
) {
  const lShoulder = lms[POSE.LEFT_SHOULDER];
  const rShoulder = lms[POSE.RIGHT_SHOULDER];
  const lHip = lms[POSE.LEFT_HIP];
  const rHip = lms[POSE.RIGHT_HIP];
  if (!lShoulder || !rShoulder || !lHip || !rHip) return;

  ctx.save();

  // Shoulder + hip lines — they should be parallel (no spine rotation).
  ctx.shadowColor = tone;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px(lShoulder.x), py(lShoulder.y));
  ctx.lineTo(px(rShoulder.x), py(rShoulder.y));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px(lHip.x), py(lHip.y));
  ctx.lineTo(px(rHip.x), py(rHip.y));
  ctx.stroke();

  // Highlight the cued arm side if present.
  if (cuedArmSide) {
    const targetShoulder = cuedArmSide === "left" ? lShoulder : rShoulder;
    ctx.shadowColor = "rgba(127, 167, 138, 0.85)";
    ctx.strokeStyle = "rgba(127, 167, 138, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(targetShoulder.x), py(targetShoulder.y), 14, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  for (const lm of [lShoulder, rShoulder, lHip, rHip]) {
    drawDot(ctx, px(lm.x), py(lm.y), tone);
  }

  // Wrists + ankles dimmer — for context.
  for (const idx of [
    POSE.LEFT_WRIST,
    POSE.RIGHT_WRIST,
    POSE.LEFT_ANKLE,
    POSE.RIGHT_ANKLE,
  ]) {
    const lm = lms[idx];
    if (lm?.visibility && lm.visibility > 0.4) {
      drawDot(ctx, px(lm.x), py(lm.y), "rgba(255, 252, 247, 0.7)");
    }
  }
}

function drawLungeGuides(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  px: (x: number) => number,
  py: (y: number) => number,
  tone: string,
) {
  const lHip = lms[POSE.LEFT_HIP];
  const rHip = lms[POSE.RIGHT_HIP];
  const lKnee = lms[POSE.LEFT_KNEE];
  const rKnee = lms[POSE.RIGHT_KNEE];
  const lAnkle = lms[POSE.LEFT_ANKLE];
  const rAnkle = lms[POSE.RIGHT_ANKLE];
  if (!lHip || !rHip) return;

  ctx.save();

  // Hip line — emphasises evenness L vs R.
  ctx.shadowColor = tone;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px(lHip.x), py(lHip.y));
  ctx.lineTo(px(rHip.x), py(rHip.y));
  ctx.stroke();

  // Knee → ankle lines per leg with vertical guide for ankle.x.
  ctx.lineWidth = 2;
  for (const [knee, ankle] of [
    [lKnee, lAnkle],
    [rKnee, rAnkle],
  ] as [NormalizedLandmark | undefined, NormalizedLandmark | undefined][]) {
    if (
      !knee?.visibility ||
      !ankle?.visibility ||
      knee.visibility < 0.4 ||
      ankle.visibility < 0.4
    )
      continue;
    ctx.strokeStyle = tone;
    ctx.beginPath();
    ctx.moveTo(px(knee.x), py(knee.y));
    ctx.lineTo(px(ankle.x), py(ankle.y));
    ctx.stroke();

    // Vertical guide line from ankle up — shows where knee should track.
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(255, 252, 247, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px(ankle.x), py(ankle.y));
    ctx.lineTo(px(ankle.x), py(knee.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  for (const lm of [lHip, rHip, lKnee, rKnee, lAnkle, rAnkle]) {
    if (lm?.visibility && lm.visibility > 0.4) {
      drawDot(ctx, px(lm.x), py(lm.y), tone);
    }
  }
}

function drawTStretchGuides(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  px: (x: number) => number,
  py: (y: number) => number,
  tone: string,
) {
  const lShoulder = lms[POSE.LEFT_SHOULDER];
  const rShoulder = lms[POSE.RIGHT_SHOULDER];
  const lHip = lms[POSE.LEFT_HIP];
  const rHip = lms[POSE.RIGHT_HIP];
  const lAnkle = lms[POSE.LEFT_ANKLE];
  const rAnkle = lms[POSE.RIGHT_ANKLE];
  if (!lShoulder || !rShoulder || !lHip || !rHip) return;

  const shoulderMid = {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2,
  };
  const hipMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };

  // Identify the back ankle (the one further from the hips).
  const lDist = lAnkle ? Math.hypot(lAnkle.x - lHip.x, lAnkle.y - lHip.y) : 0;
  const rDist = rAnkle ? Math.hypot(rAnkle.x - rHip.x, rAnkle.y - rHip.y) : 0;
  const backAnkle =
    lAnkle && rAnkle ? (lDist > rDist ? lAnkle : rAnkle) : (lAnkle ?? rAnkle);

  ctx.save();

  // Body line: shoulder midpoint → hip midpoint → back ankle (the long line).
  ctx.shadowColor = tone;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = tone;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(px(shoulderMid.x), py(shoulderMid.y));
  ctx.lineTo(px(hipMid.x), py(hipMid.y));
  if (backAnkle?.visibility && backAnkle.visibility > 0.4) {
    ctx.lineTo(px(backAnkle.x), py(backAnkle.y));
  }
  ctx.stroke();

  // Hip line in lighter tone — shows rotation.
  ctx.shadowBlur = 6;
  ctx.strokeStyle = "rgba(255, 252, 247, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(lHip.x), py(lHip.y));
  ctx.lineTo(px(rHip.x), py(rHip.y));
  ctx.stroke();
  ctx.restore();

  for (const lm of [lShoulder, rShoulder, lHip, rHip].filter(Boolean) as NormalizedLandmark[]) {
    drawDot(ctx, px(lm.x), py(lm.y), tone);
  }
  if (backAnkle?.visibility && backAnkle.visibility > 0.4) {
    drawDot(ctx, px(backAnkle.x), py(backAnkle.y), tone);
  }
}

function drawJointDots(
  ctx: CanvasRenderingContext2D,
  lms: NormalizedLandmark[],
  px: (x: number) => number,
  py: (y: number) => number,
) {
  for (const idx of [
    POSE.NOSE,
    POSE.LEFT_SHOULDER,
    POSE.RIGHT_SHOULDER,
    POSE.LEFT_HIP,
    POSE.RIGHT_HIP,
  ]) {
    const lm = lms[idx];
    if (lm?.visibility && lm.visibility > 0.4) {
      drawDot(ctx, px(lm.x), py(lm.y), "rgba(255, 252, 247, 0.85)");
    }
  }
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
