// Property checks for the ATR inclinometer measurement.
//
//   npx tsx scripts/check-atr.ts
//
// The measurement itself is simple physics, so most of what can go wrong is
// in the gating: accepting a reading taken with the phone rolled, or while
// the person was still moving, produces a number that looks clinical and
// isn't.

import {
  ATR_MONITOR_DEG,
  ATR_REFERRAL_DEG,
  MAX_ROLL_DEG,
  MIN_SAMPLES,
  bandFor,
  captureAtr,
  rotationSide,
  summarise,
  type OrientationSample,
} from "@/lib/atr/compute";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

const window = (
  beta: number,
  opts: { gamma?: number; n?: number; jitter?: number } = {},
): OrientationSample[] => {
  const n = opts.n ?? MIN_SAMPLES + 5;
  const jitter = opts.jitter ?? 0;
  return Array.from({ length: n }, (_, i) => ({
    beta: beta + (i % 2 === 0 ? jitter : -jitter) / 2,
    gamma: opts.gamma ?? 0,
  }));
};

console.log("\nATR inclinometer\n");

// ── capture and gating ──
{
  const ok = captureAtr("main_thoracic", window(6.4));
  check(
    "a steady flat reading is accepted and averaged",
    ok.ok && Math.abs(ok.reading.deg - 6.4) < 1e-9,
    `got ${JSON.stringify(ok)}`,
  );

  const rolled = captureAtr("main_thoracic", window(6, { gamma: MAX_ROLL_DEG + 1 }));
  check(
    "a rolled phone is rejected, not silently corrected",
    !rolled.ok && rolled.reason === "phone_not_flat",
    `got ${JSON.stringify(rolled)}`,
  );

  const moved = captureAtr("main_thoracic", window(6, { jitter: 6 }));
  check(
    "movement during the reading is rejected",
    !moved.ok && moved.reason === "moved_during_reading",
    `got ${JSON.stringify(moved)}`,
  );

  const short = captureAtr("main_thoracic", window(6, { n: MIN_SAMPLES - 1 }));
  check(
    "too short a window is rejected",
    !short.ok && short.reason === "too_few_samples",
    `got ${JSON.stringify(short)}`,
  );

  const noSensor = captureAtr("main_thoracic", [
    { beta: null, gamma: null },
    { beta: null, gamma: null },
  ]);
  check(
    "a device with no orientation sensor reports that, not zero degrees",
    !noSensor.ok && noSensor.reason === "no_sensor",
    `got ${JSON.stringify(noSensor)} — zero would read as a perfectly symmetric back`,
  );

  const smallDrift = captureAtr("main_thoracic", window(6, { jitter: 1 }));
  check(
    "normal breathing-scale drift is tolerated",
    smallDrift.ok,
    `a 1-degree spread should not reject a reading; got ${JSON.stringify(smallDrift)}`,
  );
}

// ── interpretation ──
{
  check(
    "thresholds match clinical convention",
    ATR_MONITOR_DEG === 5 && ATR_REFERRAL_DEG === 7,
    `got monitor=${ATR_MONITOR_DEG} refer=${ATR_REFERRAL_DEG}`,
  );
  check(
    "banding is by magnitude, so a left curve bands like a right one",
    bandFor(7.5) === "refer" &&
      bandFor(-7.5) === "refer" &&
      bandFor(5.5) === "monitor" &&
      bandFor(-5.5) === "monitor" &&
      bandFor(2) === "within" &&
      bandFor(-2) === "within",
    "signed thresholds would under-report left-convex curves",
  );
  check(
    "the referral threshold is inclusive",
    bandFor(ATR_REFERRAL_DEG) === "refer" && bandFor(ATR_MONITOR_DEG) === "monitor",
    "a reading exactly at threshold must not fall into the lower band",
  );
  check(
    "sign maps to the raised side",
    rotationSide(6) === "right" &&
      rotationSide(-6) === "left" &&
      rotationSide(0.2) === "none",
    "sign convention broken",
  );
}

// ── summary ──
{
  const s = summarise([
    { level: "upper_thoracic", deg: 2.1, driftDeg: 0.3, samples: 20 },
    { level: "main_thoracic", deg: 8.3, driftDeg: 0.4, samples: 20 },
    { level: "lumbar", deg: -3.0, driftDeg: 0.2, samples: 20 },
  ]);
  check(
    "the largest-magnitude reading drives interpretation",
    s.peak?.level === "main_thoracic" && s.band === "refer" && s.side === "right",
    `peak=${s.peak?.level} band=${s.band} side=${s.side}`,
  );

  const leftPeak = summarise([
    { level: "main_thoracic", deg: 3.0, driftDeg: 0.2, samples: 20 },
    { level: "lumbar", deg: -9.1, driftDeg: 0.2, samples: 20 },
  ]);
  check(
    "a left-convex peak is not lost to a smaller right-convex reading",
    leftPeak.peak?.level === "lumbar" && leftPeak.side === "left",
    `peak=${leftPeak.peak?.level} side=${leftPeak.side}`,
  );

  const CLINICAL = ["scoliosis", "diagnos", "curve of", "cobb", "abnormal", "deformity"];
  const allCopy = [s.message, leftPeak.message, summarise([]).message]
    .join(" ")
    .toLowerCase();
  check(
    "the summary reports a number and a threshold, never a diagnosis",
    !CLINICAL.some((t) => allCopy.includes(t)),
    `clinical language in: ${allCopy}`,
  );

  check(
    "an empty reading set does not fabricate a band",
    summarise([]).peak === null && summarise([]).side === "none",
    "empty summary must stay empty",
  );
}

console.log(
  failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
