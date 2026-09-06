// Property checks for the ATR inclinometer measurement.
//
//   npx tsx scripts/check-atr.ts
//
// The measurement itself is simple physics, so most of what can go wrong is
// in the gating and the sign: accepting a reading taken while the person was
// still moving or not bent to level produces a number that looks clinical and
// isn't, and getting the patient-frame sign wrong from the phone's placement
// produces a curve on the wrong side.

import {
  ATR_MONITOR_DEG,
  ATR_REFERRAL_DEG,
  MAX_BEND_DEPTH_DEG,
  MAX_SD_DEG,
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

const RIGHT = { topPointedTo: "right" as const };
const LEFT = { topPointedTo: "left" as const };

console.log("\nATR inclinometer\n");

// ── capture and gating ──
{
  const ok = captureAtr("main_thoracic", window(6.4), RIGHT);
  check(
    "a steady level reading is accepted and reported as its median",
    ok.ok && Math.abs(ok.reading.deg - 6.4) < 1e-9,
    `got ${JSON.stringify(ok)}`,
  );

  const deep = captureAtr(
    "main_thoracic",
    window(6, { gamma: MAX_BEND_DEPTH_DEG + 1 }),
    RIGHT,
  );
  check(
    "a level that is not horizontal asks for the bend to be adjusted",
    !deep.ok && deep.reason === "adjust_bend",
    `got ${JSON.stringify(deep)}`,
  );

  const shallowBend = captureAtr(
    "main_thoracic",
    window(6, { gamma: MAX_BEND_DEPTH_DEG - 2 }),
    RIGHT,
  );
  check(
    "fore–aft slope within the bend band is NOT treated as a rolled phone",
    shallowBend.ok && Math.abs(shallowBend.reading.deg - 6) < 1e-9,
    `gamma is bend depth, not roll cross-talk; got ${JSON.stringify(shallowBend)}`,
  );

  const moved = captureAtr("main_thoracic", window(6, { jitter: 6 }), RIGHT);
  check(
    "movement during the reading is rejected",
    !moved.ok && moved.reason === "moved_during_reading",
    `got ${JSON.stringify(moved)}`,
  );

  const short = captureAtr("main_thoracic", window(6, { n: MIN_SAMPLES - 1 }), RIGHT);
  check(
    "too short a window is rejected",
    !short.ok && short.reason === "too_few_samples",
    `got ${JSON.stringify(short)}`,
  );

  const noSensor = captureAtr(
    "main_thoracic",
    [
      { beta: null, gamma: null },
      { beta: null, gamma: null },
    ],
    RIGHT,
  );
  check(
    "a device with no orientation sensor reports that, not zero degrees",
    !noSensor.ok && noSensor.reason === "no_sensor",
    `got ${JSON.stringify(noSensor)} — zero would read as a perfectly symmetric back`,
  );

  const breathing = captureAtr("main_thoracic", window(6, { jitter: 1 }), RIGHT);
  check(
    "breathing-scale drift is tolerated",
    breathing.ok,
    `a ±0.5° alternation (sd ≈ ${(0.5).toFixed(2)} < ${MAX_SD_DEG}) should not reject; got ${JSON.stringify(breathing)}`,
  );

  // One stray sample inside the movement band must not pull the value the
  // way a mean would (30 at 6° plus one at 8° averages 6.07°).
  const spiked = window(6, { n: 30 });
  spiked[0] = { beta: 8, gamma: 0 };
  const withSpike = captureAtr("main_thoracic", spiked, RIGHT);
  check(
    "the reported value is a median, so one stray sample does not shift it",
    withSpike.ok && Math.abs(withSpike.reading.deg - 6) < 1e-9,
    `got ${JSON.stringify(withSpike)}`,
  );

  // A genuine spike is movement, and is rejected rather than averaged away.
  const bigSpike = window(6, { n: 30 });
  bigSpike[0] = { beta: 14, gamma: 0 };
  const rejectedSpike = captureAtr("main_thoracic", bigSpike, RIGHT);
  check(
    "a large spike is treated as movement and the reading retaken",
    !rejectedSpike.ok && rejectedSpike.reason === "moved_during_reading",
    `got ${JSON.stringify(rejectedSpike)}`,
  );
}

// ── sign and zero ──
{
  const r = captureAtr("main_thoracic", window(6), RIGHT);
  const l = captureAtr("main_thoracic", window(6), LEFT);
  check(
    "the same device tilt maps to opposite patient sides depending on placement",
    r.ok && l.ok && r.reading.deg === 6 && l.reading.deg === -6,
    `right-pointed ${JSON.stringify(r)} left-pointed ${JSON.stringify(l)}`,
  );

  const zeroed = captureAtr("main_thoracic", window(6), {
    ...RIGHT,
    zeroOffsetDeg: 1.5,
  });
  check(
    "the zero offset is subtracted before the sign is applied",
    zeroed.ok && Math.abs(zeroed.reading.deg - 4.5) < 1e-9,
    `got ${JSON.stringify(zeroed)}`,
  );

  const zeroedLeft = captureAtr("main_thoracic", window(6), {
    ...LEFT,
    zeroOffsetDeg: 1.5,
  });
  check(
    "zero offset is a device-frame correction, so it does not flip with placement",
    zeroedLeft.ok && Math.abs(zeroedLeft.reading.deg - -4.5) < 1e-9,
    `got ${JSON.stringify(zeroedLeft)}`,
  );

  check(
    "placement is recorded on the reading for later audit",
    r.ok && r.reading.topPointedTo === "right" && l.ok && l.reading.topPointedTo === "left",
    "topPointedTo missing from reading",
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
    { level: "upper_thoracic", deg: 2.1, driftDeg: 0.3, samples: 20, topPointedTo: "right" },
    { level: "main_thoracic", deg: 8.3, driftDeg: 0.4, samples: 20, topPointedTo: "right" },
    { level: "lumbar", deg: -3.0, driftDeg: 0.2, samples: 20, topPointedTo: "right" },
  ]);
  check(
    "the largest-magnitude reading drives interpretation",
    s.peak?.level === "main_thoracic" && s.band === "refer" && s.side === "right",
    `peak=${s.peak?.level} band=${s.band} side=${s.side}`,
  );

  const leftPeak = summarise([
    { level: "main_thoracic", deg: 3.0, driftDeg: 0.2, samples: 20, topPointedTo: "right" },
    { level: "lumbar", deg: -9.1, driftDeg: 0.2, samples: 20, topPointedTo: "right" },
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
    "the summary never names a diagnosis",
    !CLINICAL.some((t) => allCopy.includes(t)),
    `clinical language in: ${allCopy}`,
  );

  const SCREENING = ["7°", "5°", "referral", "clinicians look", "threshold"];
  check(
    "the summary does not recite screening thresholds to an already-diagnosed user",
    !SCREENING.some((t) => allCopy.includes(t.toLowerCase())),
    `screening language in: ${allCopy}`,
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
