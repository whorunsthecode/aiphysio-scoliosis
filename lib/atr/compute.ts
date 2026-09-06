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
// Gamma is the fore–aft slope of the back at that level — how far the person
// has bent — and is used to guide the bend, not treated as roll (see below).
// Beta is in the device frame, so the patient-side sign depends on which way
// the phone was laid; that is recorded per reading rather than assumed.

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

// Gamma, with the phone lying across the back in portrait, is NOT roll
// cross-talk into the ATR reading. Under the W3C Z-X'-Y'' convention the
// long axis's elevation is sin(beta) regardless of gamma. Gamma is the
// fore–aft slope of the back surface at that level — i.e. how far the patient
// has bent, which is legitimately non-zero and level-dependent. It is used as
// Bunnell intended: guide the patient to bend until the level reads level.
// Readings outside this band are rejected with "adjust_bend", never "not flat".
export const MAX_BEND_DEPTH_DEG = 10;

// Movement tolerated across the sampling window, as a standard deviation
// (range is spike-sensitive; the tap that starts a reading is itself a spike).
export const MAX_SD_DEG = 0.7;

// The window must span at least one breath cycle (~4 s), and sampling should
// not start until ~1.5 s after the helper taps, because the tap tilts the phone.
export const SAMPLE_WINDOW_MS = 4000;
export const SAMPLE_DELAY_MS = 1500;

export type OrientationSample = {
  // DeviceOrientationEvent.beta — rotation about the device x-axis.
  beta: number | null;
  // DeviceOrientationEvent.gamma — roll about the device long axis.
  gamma: number | null;
};

// Which of the PATIENT's sides the phone's top (camera) end pointed toward.
// Beta is defined in the device frame — positive lifts the top edge — so the
// patient-side sign of a reading is a placement fact the sensor cannot know.
// Without this the "right up / left up" label is a coin flip between helpers.
export type TopPointedTo = "left" | "right";

export type AtrReading = {
  level: TrunkLevel;
  // Signed degrees in the PATIENT frame. Positive = the user's right side is
  // raised, which is the convention a right-convex thoracic curve produces.
  deg: number;
  // Stability across the sampling window (standard deviation).
  driftDeg: number;
  samples: number;
  topPointedTo: TopPointedTo;
};

export type AtrRejection =
  | "adjust_bend"
  | "moved_during_reading"
  | "too_few_samples"
  | "no_sensor";

export type AtrCapture =
  | { ok: true; reading: AtrReading }
  | { ok: false; reason: AtrRejection };

export const MIN_SAMPLES = 10;

export type CaptureOptions = {
  // Where the phone's camera end pointed. Required — see TopPointedTo.
  topPointedTo: TopPointedTo;
  // Beta read with the phone flat on a level surface, subtracted from every
  // reading. Consumer accelerometers carry 0.5–2° of zero offset; the Bunnell
  // protocol zero-checks the scoliometer before use for the same reason.
  zeroOffsetDeg?: number;
};

function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function sd(xs: number[]): number {
  const mean = xs.reduce((p, q) => p + q, 0) / xs.length;
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1));
}

// Reduce a window of orientation samples to one reading.
export function captureAtr(
  level: TrunkLevel,
  samples: OrientationSample[],
  opts: CaptureOptions,
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

  // Bend depth: the measured level must be roughly horizontal, as in the
  // Bunnell protocol. Out of band means "bend a little more / less", not
  // "the phone isn't flat".
  const bendDepth = median(usable.map((s) => Math.abs(s.gamma)));
  if (bendDepth > MAX_BEND_DEPTH_DEG) return { ok: false, reason: "adjust_bend" };

  const betas = usable.map((s) => s.beta);
  const spread = sd(betas);
  if (spread > MAX_SD_DEG) return { ok: false, reason: "moved_during_reading" };

  // Median, zero-corrected, then mapped into the patient frame. Positive beta
  // lifts the device's top edge; if that edge pointed to the patient's LEFT, a
  // positive beta means the left side is up — so invert.
  const deviceDeg = median(betas) - (opts.zeroOffsetDeg ?? 0);
  const deg = opts.topPointedTo === "right" ? deviceDeg : -deviceDeg;

  return {
    ok: true,
    reading: {
      level,
      deg,
      driftDeg: spread,
      samples: usable.length,
      topPointedTo: opts.topPointedTo,
    },
  };
}

// ─────────────────────────── Interpretation ───────────────────────────
//
// The 5° / 7° figures are SCREENING thresholds for undiagnosed adolescents
// (HK Student Health Service carry-forward; Bunnell referral). This product's
// users already have a diagnosis, and nearly all of them will read above 7°.
// Telling a diagnosed patient "clinicians look further at 7°" is noise at
// best and alarm at worst. So the bands are kept for context only, and the
// message a user actually sees is about CHANGE against their own baseline,
// gated on a measured MDC — the only honest use of a home ATR series.

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

  const message = `Your highest reading is ${mag}° at the ${peak.level.replace("_", " ")} level. On its own that number doesn't tell you much — you already know you have a curve. What matters is whether it changes against your own readings over time, and I'll only call a change once I've measured how repeatable your setup is.`;

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
