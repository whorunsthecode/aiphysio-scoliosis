// Angle of trunk rotation, measured with the phone as an inclinometer.
//
// In the Adams forward-bend test a clinician lays a scoliometer across the
// back, perpendicular to the spine, and reads the inclination of the
// transverse plane. A phone laid the same way reads the same angle from the
// same physics — smartphone inclinometer apps validate at ICC 0.94–0.99
// against the Bunnell scoliometer, at or above the device's own repeatability.
//
// This matters because it is everything the webcam scan is not. No scale
// anchor, so no assumed torso length. No projection, so no camera distance or
// aspect ratio. No machine learning, so no model drift. It measures a slope
// against gravity, which is the one thing a phone measures well. And it is
// the measurement clinicians already use, with a published referral threshold
// and a defined screening protocol behind it.
//
// Orientation convention: the phone lies flat across the back, portrait, long
// axis perpendicular to the spine. Raising one end of that long axis rotates
// the device about its x-axis, which DeviceOrientationEvent reports as beta.
// Rolling the phone about its long axis shows up as gamma, and means it is
// not sitting flat — that reading is rejected rather than corrected.

export type TrunkLevel = "upper_thoracic" | "main_thoracic" | "thoracolumbar" | "lumbar";

export const TRUNK_LEVELS: { id: TrunkLevel; label: string; hint: string }[] = [
  {
    id: "upper_thoracic",
    label: "Upper back",
    hint: "Just below the shoulder blades' top edge.",
  },
  {
    id: "main_thoracic",
    label: "Mid back",
    hint: "Across the widest part of the rib hump, if there is one.",
  },
  {
    id: "thoracolumbar",
    label: "Lower ribs",
    hint: "Where the ribs end and the waist begins.",
  },
  {
    id: "lumbar",
    label: "Low back",
    hint: "Level with the top of the pelvis.",
  },
];

// Degrees of roll tolerated before a reading is rejected. The phone must be
// flat on the back; a rolled phone reads a component of its own tilt as trunk
// rotation.
export const MAX_ROLL_DEG = 8;

// Movement tolerated across the sampling window.
export const MAX_DRIFT_DEG = 1.5;

export type OrientationSample = {
  // DeviceOrientationEvent.beta — rotation about the device x-axis.
  beta: number | null;
  // DeviceOrientationEvent.gamma — roll about the device long axis.
  gamma: number | null;
};

export type AtrReading = {
  level: TrunkLevel;
  // Signed degrees. Positive = the user's right side is raised, which is the
  // convention a right-convex thoracic curve produces.
  deg: number;
  // Spread across the sampling window, as a stability signal.
  driftDeg: number;
  samples: number;
};

export type AtrRejection =
  | "phone_not_flat"
  | "moved_during_reading"
  | "too_few_samples"
  | "no_sensor";

export type AtrCapture =
  | { ok: true; reading: AtrReading }
  | { ok: false; reason: AtrRejection };

export const MIN_SAMPLES = 10;

// Reduce a window of orientation samples to one reading.
export function captureAtr(
  level: TrunkLevel,
  samples: OrientationSample[],
): AtrCapture {
  const usable = samples.filter(
    (s): s is { beta: number; gamma: number } =>
      typeof s.beta === "number" &&
      typeof s.gamma === "number" &&
      Number.isFinite(s.beta) &&
      Number.isFinite(s.gamma),
  );
  if (usable.length === 0) return { ok: false, reason: "no_sensor" };
  if (usable.length < MIN_SAMPLES) return { ok: false, reason: "too_few_samples" };

  // Reject a rolled phone rather than trying to correct it: the correction
  // depends on how the phone is rolled relative to the back's surface, which
  // is not observable from the sensor alone.
  const maxRoll = usable.reduce((m, s) => Math.max(m, Math.abs(s.gamma)), 0);
  if (maxRoll > MAX_ROLL_DEG) return { ok: false, reason: "phone_not_flat" };

  const betas = usable.map((s) => s.beta);
  const drift = Math.max(...betas) - Math.min(...betas);
  if (drift > MAX_DRIFT_DEG) return { ok: false, reason: "moved_during_reading" };

  const deg = betas.reduce((a, b) => a + b, 0) / betas.length;

  return {
    ok: true,
    reading: { level, deg, driftDeg: drift, samples: usable.length },
  };
}

// ─────────────────────────── Interpretation ───────────────────────────
//
// Thresholds are the ones in clinical use, not invented here.
//
//   >= 5°  the level Hong Kong's school screening programme carries forward
//          to further assessment
//   >= 7°  the conventional Bunnell referral threshold for radiographic
//          referral
//
// The app reports the number and what the threshold is. It does not decide
// whether someone has scoliosis.

export const ATR_MONITOR_DEG = 5;
export const ATR_REFERRAL_DEG = 7;

export type AtrBand = "within" | "monitor" | "refer";

export function bandFor(deg: number): AtrBand {
  const mag = Math.abs(deg);
  if (mag >= ATR_REFERRAL_DEG) return "refer";
  if (mag >= ATR_MONITOR_DEG) return "monitor";
  return "within";
}

export function rotationSide(deg: number): "left" | "right" | "none" {
  if (Math.abs(deg) < 1) return "none";
  return deg > 0 ? "right" : "left";
}

export type AtrSummary = {
  readings: AtrReading[];
  // The largest-magnitude reading — the one that drives interpretation, as
  // in the clinical test.
  peak: AtrReading | null;
  band: AtrBand;
  side: "left" | "right" | "none";
  // What to tell the user. Never a diagnosis.
  message: string;
};

export function summarise(readings: AtrReading[]): AtrSummary {
  if (readings.length === 0) {
    return {
      readings,
      peak: null,
      band: "within",
      side: "none",
      message: "No readings yet.",
    };
  }

  const peak = readings.reduce((best, r) =>
    Math.abs(r.deg) > Math.abs(best.deg) ? r : best,
  );
  const band = bandFor(peak.deg);
  const side = rotationSide(peak.deg);
  const mag = Math.abs(peak.deg).toFixed(1);

  const message =
    band === "refer"
      ? `Your highest reading is ${mag}°. Clinicians usually look further at anything from ${ATR_REFERRAL_DEG}° upward, so this is worth showing to yours.`
      : band === "monitor"
        ? `Your highest reading is ${mag}°. That's in the range worth keeping an eye on — track it and mention it at your next appointment.`
        : `Your highest reading is ${mag}°, below the ${ATR_MONITOR_DEG}° mark clinicians typically follow up on.`;

  return { readings, peak, band, side, message };
}

// Paired readings for the repeatability study — same physics as the posture
// scan, but a far better-behaved measurement, so the MDC should be much
// tighter. Worth measuring rather than assuming.
export function atrPairsFrom(
  sessions: { readings: AtrReading[] }[],
  level: TrunkLevel,
): { first: number; second: number }[] {
  const pairs: { first: number; second: number }[] = [];
  for (const s of sessions) {
    const atLevel = s.readings.filter((r) => r.level === level);
    for (let i = 0; i + 1 < atLevel.length; i += 2) {
      pairs.push({ first: atLevel[i].deg, second: atLevel[i + 1].deg });
    }
  }
  return pairs;
}
