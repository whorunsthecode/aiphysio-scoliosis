// Property checks for the camera-free outcome measures.
//
//   npx tsx scripts/check-outcomes.ts
//
// These carry the product's feedback loop, so the bar is the same as for the
// posture trend: never call a change that isn't there, and never miss one
// that is.

import {
  DEFAULT_GOOD_DAY_MAX_PAIN,
  PSFS_MCID_AVERAGE,
  PSFS_MCID_SINGLE,
  goodDays,
  psfsAverage,
  psfsChange,
  ratioTrend,
  sideBridgeRatio,
  type CheckIn,
} from "@/lib/outcomes/compute";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

const DAY = 86_400_000;
const T0 = 1_770_000_000_000;

console.log("\nPSFS\n");
{
  const a = {
    at: T0,
    activities: [
      { id: "1", label: "Carry my bag to work", score: 4 },
      { id: "2", label: "Sit through a lecture", score: 5 },
      { id: "3", label: "Sleep through the night", score: 6 },
    ],
  };

  check(
    "average is the mean of scored activities",
    psfsAverage(a) === 5,
    `got ${psfsAverage(a)}`,
  );

  check(
    "an entry with no activities returns null, not zero",
    psfsAverage({ at: T0, activities: [] }) === null,
    "zero would read as total disability",
  );

  check(
    "out-of-range scores are excluded rather than skewing the mean",
    psfsAverage({
      at: T0,
      activities: [
        { id: "1", label: "x", score: 6 },
        { id: "2", label: "y", score: 99 },
      ],
    }) === 6,
    "a malformed score must not become a result",
  );

  const small = psfsChange(a, {
    at: T0 + 30 * DAY,
    activities: a.activities.map((x) => ({ ...x, score: x.score + 1 })),
  });
  check(
    "a change below the MCID is not called meaningful",
    small?.delta === 1 && small?.meaningful === false,
    `delta=${small?.delta} meaningful=${small?.meaningful} (MCID is ${PSFS_MCID_AVERAGE})`,
  );

  const big = psfsChange(a, {
    at: T0 + 30 * DAY,
    activities: a.activities.map((x) => ({ ...x, score: x.score + 3 })),
  });
  check(
    "a change at or above the MCID is called",
    big?.meaningful === true,
    `delta=${big?.delta}`,
  );

  const uneven = psfsChange(a, {
    at: T0 + 30 * DAY,
    activities: [
      { id: "1", label: "Carry my bag to work", score: 9 },
      { id: "2", label: "Sit through a lecture", score: 5 },
      { id: "3", label: "Sleep through the night", score: 6 },
    ],
  });
  check(
    "one activity moving a lot is reported per-activity, not just averaged away",
    uneven?.perActivity.find((p) => p.label === "Carry my bag to work")
      ?.meaningful === true &&
      uneven?.meaningful === false,
    `single-activity MCID is ${PSFS_MCID_SINGLE}; got ${JSON.stringify(uneven?.perActivity)}`,
  );

  check(
    "activities added later are not compared against nothing",
    psfsChange(a, {
      at: T0 + DAY,
      activities: [{ id: "9", label: "Brand new activity", score: 8 }],
    })?.perActivity.length === 0,
    "an unmatched activity has no baseline to move from",
  );
}

console.log("\nside-bridge endurance\n");
{
  const ci = (l: number, r: number): CheckIn => ({
    at: T0,
    results: [
      { test: "side_bridge_left", seconds: l },
      { test: "side_bridge_right", seconds: r },
    ],
  });

  const asym = sideBridgeRatio(ci(30, 50));
  check(
    "the ratio is weaker over stronger, so it never exceeds 1",
    asym?.ratio === 0.6 && asym?.weakerSide === "left",
    `got ratio=${asym?.ratio} weaker=${asym?.weakerSide}`,
  );

  const mirrored = sideBridgeRatio(ci(50, 30));
  check(
    "a mirrored curve produces the same ratio, not its reciprocal",
    mirrored?.ratio === asym?.ratio && mirrored?.weakerSide === "right",
    `a raw left/right ratio would move oppositely for mirrored curves; got ${mirrored?.ratio}`,
  );

  check(
    "near-equal sides read as symmetric",
    sideBridgeRatio(ci(48, 50))?.symmetric === true &&
      sideBridgeRatio(ci(30, 50))?.symmetric === false,
    "symmetry band misapplied",
  );

  check(
    "a missing side yields null rather than a half-computed ratio",
    sideBridgeRatio({ at: T0, results: [{ test: "side_bridge_left", seconds: 30 }] }) ===
      null,
    "one-sided data cannot produce a ratio",
  );

  check(
    "a zero-second hold is treated as missing, not as a ratio of zero",
    sideBridgeRatio(ci(0, 40)) === null,
    "zero would report infinite asymmetry from a failed attempt",
  );

  const before = sideBridgeRatio(ci(30, 50))!;
  check(
    "converging sides read as improving",
    ratioTrend(before, sideBridgeRatio(ci(45, 50))!) === "improving",
    "ratio rose but was not called improving",
  );
  check(
    "diverging sides read as worsening",
    ratioTrend(before, sideBridgeRatio(ci(20, 50))!) === "worsening",
    "ratio fell but was not called worsening",
  );
  check(
    "small ratio movement is not called either way",
    ratioTrend(before, sideBridgeRatio(ci(32, 50))!) === "unchanged",
    "noise-scale movement should stay unchanged",
  );
}

console.log("\ngood days\n");
{
  const days = [
    { at: T0 - 1 * DAY, maxIntensity: 1 },
    { at: T0 - 2 * DAY, maxIntensity: 2 },
    { at: T0 - 3 * DAY, maxIntensity: 6 },
    { at: T0 - 4 * DAY, maxIntensity: 1 },
    { at: T0 - 40 * DAY, maxIntensity: 0 },
  ];
  const g = goodDays(days, 28, DEFAULT_GOOD_DAY_MAX_PAIN, T0);

  check(
    "days outside the window are excluded",
    g.logged === 4,
    `got ${g.logged} logged, expected 4 inside 28 days`,
  );
  check(
    "a good day is at or below the threshold",
    g.good === 3,
    `got ${g.good}, expected 3 at pain <= ${DEFAULT_GOOD_DAY_MAX_PAIN}`,
  );
  check(
    "the streak counts back from today and stops at the first bad day",
    g.currentStreak === 2,
    `got ${g.currentStreak}, expected 2`,
  );
  check(
    "no logged days yields a null fraction, not zero",
    goodDays([], 28, 2, T0).fraction === null,
    "zero would read as 'none of your days were good'",
  );
  check(
    "all-bad days yield a real zero",
    goodDays([{ at: T0 - DAY, maxIntensity: 8 }], 28, 2, T0).fraction === 0,
    "an honest zero must survive",
  );
}

console.log(
  failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
