"use client";

import { useEffect, useRef } from "react";
import { POSE, type NormalizedLandmark } from "@/lib/pose/types";
import { BANDS, TONE_COLORS, classify } from "@/lib/pose/thresholds";

interface StickerOverlayProps {
  landmarks: NormalizedLandmark[] | null;
  width: number; // displayed canvas width in CSS pixels
  height: number;
  // Mirror like a selfie? (matches how the user sees themselves)
  mirror?: boolean;
}

// Live alignment overlay drawn on a canvas above the webcam feed. Markers:
// — horizontal line through shoulders, sage when level, soft coral when not
// — horizontal line through hips, same logic
// — vertical plumb line from head to mid-pelvis
// — small dots at each of the 4 spinal segment centers
// — subtle glow on each marker
export function StickerOverlay({
  landmarks,
  width,
  height,
  mirror = true,
}: StickerOverlayProps) {
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

    // Map normalized [0,1] coords to canvas pixels (with optional mirror).
    const px = (x: number) => (mirror ? (1 - x) * width : x * width);
    const py = (y: number) => y * height;

    const lShoulder = landmarks[POSE.LEFT_SHOULDER];
    const rShoulder = landmarks[POSE.RIGHT_SHOULDER];
    const lHip = landmarks[POSE.LEFT_HIP];
    const rHip = landmarks[POSE.RIGHT_HIP];
    const nose = landmarks[POSE.NOSE];

    if (!lShoulder || !rShoulder || !lHip || !rHip || !nose) return;

    // mm scale — same as compute.ts but inline here (overlay is presentational only)
    const torsoNormY = Math.max(0.05, (lHip.y + rHip.y) / 2 - (lShoulder.y + rShoulder.y) / 2);
    const mmPerNorm = 500 / torsoNormY;

    const shoulderDiffMm = (rShoulder.y - lShoulder.y) * mmPerNorm;
    const hipDiffMm = (rHip.y - lHip.y) * mmPerNorm;
    const hipMidNorm = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
    const shoulderMidNorm = {
      x: (lShoulder.x + rShoulder.x) / 2,
      y: (lShoulder.y + rShoulder.y) / 2,
    };
    const headOffsetMm = (nose.x - hipMidNorm.x) * mmPerNorm;

    const shoulderTone = classify(shoulderDiffMm, BANDS.shoulder);
    const hipTone = classify(hipDiffMm, BANDS.hip);
    const headTone = classify(headOffsetMm, BANDS.head);

    // Shoulder line
    drawAlignmentLine(
      ctx,
      px(lShoulder.x),
      py(lShoulder.y),
      px(rShoulder.x),
      py(rShoulder.y),
      TONE_COLORS[shoulderTone],
    );

    // Hip line
    drawAlignmentLine(
      ctx,
      px(lHip.x),
      py(lHip.y),
      px(rHip.x),
      py(rHip.y),
      TONE_COLORS[hipTone],
    );

    // Vertical plumb line from head down through hip midpoint
    drawPlumbLine(
      ctx,
      px(nose.x),
      py(nose.y),
      px(hipMidNorm.x),
      py(hipMidNorm.y),
      TONE_COLORS[headTone],
    );

    // Spine segment dots — head, upper thoracic (shoulder mid), lower thoracic (interp), lumbar (hip mid)
    const segments = [
      { name: "I", x: nose.x, y: nose.y, devMm: headOffsetMm * 0.5 },
      {
        name: "II",
        x: shoulderMidNorm.x,
        y: shoulderMidNorm.y,
        devMm: (shoulderMidNorm.x - hipMidNorm.x) * mmPerNorm,
      },
      {
        name: "III",
        x: shoulderMidNorm.x + (hipMidNorm.x - shoulderMidNorm.x) * 0.6,
        y: shoulderMidNorm.y + (hipMidNorm.y - shoulderMidNorm.y) * 0.6,
        devMm: ((shoulderMidNorm.x - hipMidNorm.x) * 0.4) * mmPerNorm,
      },
      { name: "IV", x: hipMidNorm.x, y: hipMidNorm.y, devMm: 0 },
    ];

    for (const seg of segments) {
      drawSegmentDot(
        ctx,
        px(seg.x),
        py(seg.y),
        TONE_COLORS[classify(seg.devMm, BANDS.segment)],
        seg.name,
      );
    }

    // Joint dots for shoulders and hips themselves
    for (const lm of [lShoulder, rShoulder, lHip, rHip]) {
      drawJoint(ctx, px(lm.x), py(lm.y));
    }
  }, [landmarks, width, height, mirror]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

function drawAlignmentLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawPlumbLine(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  pxv: number,
  py: number,
  color: string,
) {
  ctx.save();
  // The "ideal" plumb line drops straight down from the head x.
  ctx.strokeStyle = "rgba(255, 252, 247, 0.35)";
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx, py + 30);
  ctx.stroke();
  ctx.setLineDash([]);

  // The actual line from head to pelvis center, colored by alignment.
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(pxv, py);
  ctx.stroke();
  ctx.restore();
}

function drawSegmentDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fffcf7";
  ctx.font = "500 9px ui-serif, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + 0.5);
  ctx.restore();
}

function drawJoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 252, 247, 0.85)";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
