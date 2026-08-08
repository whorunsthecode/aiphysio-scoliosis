// Property checks for between-session repeatability and the trend gate.
//
//   npx tsx scripts/check-repeatability.ts
//
// The property that matters most: a series of pure measurement noise must not
// be called a trend. That was the failure mode of the old gate.

import {
  MIN_PAIRS_FOR_MDC,
  buildMdcTable,
  computeRepeatability,
  describeDetectionLimit,
} from "@/lib/pose/repeatability";
import { extractTrend } from "@/lib/session/trend";
import { METRICS_VERSION } from "@/lib/pose/stats";
import type { SessionState } from "@/lib/session/types";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

console.log("\nbetween-session repeatability\n");

// ── the maths ──
{
  check(
    "too few pairs yields null rather than a fabricated MDC",
    computeRepeatability([{ first: 1, second: 2 }]) === null,
    "a single pair cannot estimate a standard deviation",
  );

  // Four differences of ±2 about a mean of zero. Sample SD (n-1), which is
  // the right choice here — these pairs are a sample of possible re-setups,
  // not the population of them — so SD_diff = sqrt(16/3), not 2.
  const r = computeRepeatability([
    { first: 10, second: 12 },
    { first: 10, second: 8 },
    { first: 20, second: 22 },
    { first: 20, second: 18 },
  ]);
  const expectedSd = Math.sqrt(16 / 3);
  check(
    "SEM and MDC follow the standard test-retest identities",
    !!r &&
      Math.abs(r.sdDiff - expectedSd) < 1e-9 &&
      Math.abs(r.sem - expectedSd / Math.SQRT2) < 1e-9 &&
      Math.abs(r.mdc95 - 1.96 * expectedSd) < 1e-9,
    `got sdDiff=${r?.sdDiff.toFixed(4)} sem=${r?.sem.toFixed(4)} mdc=${r?.mdc95.toFixed(4)}, expected sdDiff=${expectedSd.toFixed(4)}`,
  );
  check(
    "MDC95 equals 2.77 x SEM",
    !!r && Math.abs(r.mdc95 - 2.77 * r.sem) < 0.01,
    `mdc=${r?.mdc95.toFixed(4)} vs 2.77*sem=${((r?.sem ?? 0) * 2.77).toFixed(4)}`,
  );
  check(
    "zero bias when differences are symmetric",
    !!r && Math.abs(r.bias) < 1e-9,
    `bias=${r?.bias}`,
  );

  const biased = computeRepeatability([
    { first: 10, second: 13 },
    { first: 12, second: 15 },
    { first: 14, second: 17 },
  ]);
  check(
    "a consistent second-scan drift shows up as bias, not noise",
    !!biased && Math.abs(biased.bias - 3) < 1e-9 && biased.sdDiff < 1e-9,
    `bias=${biased?.bias} sdDiff=${biased?.sdDiff}`,
  );

  const table = buildMdcTable({
    plenty: Array.from({ length: MIN_PAIRS_FOR_MDC }, (_, i) => ({
      first: 10,
      second: 10 + (i % 2 === 0 ? 1 : -1),
    })),
    sparse: [{ first: 1, second: 2 }],
  });
  check(
    "a measurement without enough pairs reports null, not a guess",
    typeof table.plenty === "number" && table.sparse === null,
    `got ${JSON.stringify(table)}`,
  );

  check(
    "the detection limit reads as a limitation, not an accuracy claim",
    describeDetectionLimit(4.2, "mm").includes("can't be told apart") &&
      describeDetectionLimit(null, "mm").includes("Not enough"),
    "copy should state what cannot be detected",
  );
}

// ── the gate ──
console.log("\ntrend gating\n");
{
  const DAY = 86_400_000;
  const t0 = 1_770_000_000_000; // fixed; Date.now() is unavailable in checks

  function sessionsFrom(values: number[]): SessionState[] {
    return values.map((v, i) => {
      const stats = {
        mean: v,
        std: 1.0, // small within-scan jitter, as the real pipeline reports
        cv: 0.05,
      };
      return {
        id: `s${i}`,
        startedAt: t0 + i * DAY,
        completedAt: t0 + i * DAY + 1000,
        phase: "complete",
        pain: [],
        initialScan: null,
        finalScan: {
          metricsVersion: METRICS_VERSION,
          measurements: {
            shoulderTiltDeg: 0,
            hipTiltDeg: 0,
            headOffsetRatio: 0,
            trunkShiftRatio: 0,
            shoulderDiffMm: v,
            hipDiffMm: 0,
            headOffsetMm: 0,
            segments: { cervical: 0, upperThoracic: 0, lowerThoracic: 0, lumbar: 0 },
            pelvicRotationMm: 0,
            overallScore: 80,
            confidence: 0.9,
          },
          stats: {
            shoulderDiff: stats,
            hipDiff: stats,
            headOffset: stats,
            pelvicRotation: stats,
            cervical: stats,
            upperThoracic: stats,
            lowerThoracic: stats,
            shoulderTilt: stats,
            hipTilt: stats,
            headOffsetRatio: stats,
            trunkShiftRatio: stats,
          },
          scanConfidence: "high",
          framesUsed: 90,
          bodyRotationMaxDeg: null,
          rotationVerified: false,
          meanPoseConfidence: 0.9,
        },
        program: null,
        currentExerciseIdx: 0,
        exerciseSummaries: [],
      } as unknown as SessionState;
    });
  }

  // Pure between-session noise: swings of ±6mm with no underlying trend, of
  // the magnitude a re-placed camera actually produces. The within-scan std
  // is 1.0, so the old 1.5x gate would have called this confidently.
  const noise = sessionsFrom([0, 6, -6, 5, -5, 6, -6, 4, -4, 6]);
  const withMdc = extractTrend(noise, "shoulderDiff", 12);
  check(
    "pure setup noise is not called a trend once a real MDC is known",
    withMdc.direction === "stable",
    `called "${withMdc.direction}" on noise`,
  );
  check(
    "the series reports which basis its threshold came from",
    withMdc.thresholdBasis === "measured_mdc" && withMdc.threshold === 12,
    `basis=${withMdc.thresholdBasis} threshold=${withMdc.threshold}`,
  );

  const noMdc = extractTrend(noise, "shoulderDiff");
  check(
    "without an MDC the fallback is flagged as an estimate",
    noMdc.thresholdBasis === "within_scan_estimate",
    `basis=${noMdc.thresholdBasis}`,
  );
  check(
    "the fallback is stricter than the old 1.5x within-scan gate",
    noMdc.threshold > 1.5 * 1.0,
    `threshold ${noMdc.threshold} should exceed the old 1.5mm`,
  );

  // A genuine, large, monotonic change must still be detected — a gate that
  // never fires is as useless as one that always does.
  const real = sessionsFrom([30, 27, 24, 21, 18, 15, 12, 9, 6, 3]);
  const detected = extractTrend(real, "shoulderDiff", 12);
  check(
    "a large genuine improvement is still called",
    detected.direction === "improving",
    `called "${detected.direction}" on a 27mm monotonic drop`,
  );

  const worsening = sessionsFrom([3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
  check(
    "a large genuine worsening is called as drifting",
    extractTrend(worsening, "shoulderDiff", 12).direction === "drifting",
    "monotonic worsening not detected",
  );
}

console.log(
  failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
