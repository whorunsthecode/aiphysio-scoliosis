// Property checks for the red-flag screen and the gate it drives.
//
//   npx tsx scripts/check-safety.ts
//
// Exits non-zero on failure. The important properties are that emergency
// flags actually stop a programme being produced, that nothing routes around
// the gate, and that the ruleset stays internally consistent as it grows.

import {
  RED_FLAG_RULES,
  SCREENING_QUESTIONS,
  handoffSummary,
  questionsFor,
  triage,
} from "@/lib/safety/redFlags";
import { selectProgram } from "@/lib/exercises/selectProgram";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type { OnboardingState } from "@/lib/onboarding/types";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

console.log("\nred-flag screening\n");

// ── ruleset integrity ──
{
  const ids = RED_FLAG_RULES.map((r) => r.id);
  check(
    "rule ids are unique",
    new Set(ids).size === ids.length,
    `duplicates in ${ids.join(", ")}`,
  );

  const ruleIds = new Set(ids);
  const dangling = SCREENING_QUESTIONS.flatMap((q) => q.flagIds).filter(
    (f) => !ruleIds.has(f),
  );
  check(
    "every screening question points at a real rule",
    dangling.length === 0,
    `dangling flagIds: ${dangling.join(", ")}`,
  );

  const missingCopy = RED_FLAG_RULES.filter(
    (r) => !r.observation || !r.why || !r.action || !r.provenance,
  );
  check(
    "every rule carries observation, rationale, action and provenance",
    missingCopy.length === 0,
    `incomplete: ${missingCopy.map((r) => r.id).join(", ")}`,
  );

  // The app must never name a condition at the user. Provenance is written
  // for a clinician and is exempt.
  const CLINICAL_TERMS = [
    "cauda equina",
    "malignancy",
    "tumour",
    "tumor",
    "metastas",
    "infection",
    "fracture",
    "syndrome",
    "saddle anaesthesia",
    "saddle anesthesia",
  ];
  const leaking = RED_FLAG_RULES.filter((r) => {
    const userFacing = `${r.observation} ${r.why} ${r.action}`.toLowerCase();
    return CLINICAL_TERMS.some((t) => userFacing.includes(t));
  });
  check(
    "user-facing copy names no conditions",
    leaking.length === 0,
    `clinical language leaked into: ${leaking.map((r) => r.id).join(", ")}`,
  );
}

// ── triage behaviour ──
{
  const none = triage({ answers: {} });
  check(
    "a clean screen produces no flags and blocks nothing",
    none.hits.length === 0 && none.severity === null && !none.blocksSession,
    `got ${JSON.stringify(none)}`,
  );

  const emergency = triage({ answers: { bladder_bowel_change: true } });
  check(
    "a bladder/bowel change escalates to emergency and blocks",
    emergency.severity === "emergency" && emergency.blocksSession,
    `got severity=${emergency.severity} blocks=${emergency.blocksSession}`,
  );

  const urgent = triage({ answers: { night_pain: true } });
  check(
    "unremitting night pain is urgent — reduces but does not block",
    urgent.severity === "urgent" &&
      !urgent.blocksSession &&
      urgent.reducesSession,
    `got severity=${urgent.severity} blocks=${urgent.blocksSession}`,
  );

  const mixed = triage({
    answers: { rapid_change: true, bladder_bowel_change: true, night_pain: true },
  });
  check(
    "highest severity wins and sorts first",
    mixed.severity === "emergency" &&
      mixed.hits[0]?.rule.severity === "emergency" &&
      mixed.hits.length === 3,
    `got severity=${mixed.severity}, ${mixed.hits.length} hits`,
  );

  const bothCauda = triage({
    answers: { bladder_bowel_change: true, saddle_numbness: true },
  });
  check(
    "two questions feeding one rule produce a single flag",
    bothCauda.hits.filter((h) => h.rule.id === "cauda_equina").length === 1,
    `got ${bothCauda.hits.length} hits`,
  );

  const atypical = triage({
    profile: {
      primaryCurveApex: "thoracic",
      primaryConvexSide: "left",
      ageYears: 14,
    },
  });
  check(
    "left thoracic curve in an adolescent is derived, not asked",
    atypical.hits.some((h) => h.rule.id === "atypical_curve_pattern"),
    "derived rule did not fire",
  );

  const adultLeftThoracic = triage({
    profile: {
      primaryCurveApex: "thoracic",
      primaryConvexSide: "left",
      ageYears: 34,
    },
  });
  check(
    "the same pattern in an adult does not fire it",
    !adultLeftThoracic.hits.some((h) => h.rule.id === "atypical_curve_pattern"),
    "derived rule fired outside the adolescent population",
  );

  check(
    "onboarding asks more than the ongoing check",
    questionsFor("onboarding").length > questionsFor("ongoing").length,
    "expected history questions to be onboarding-only",
  );
}

// ── the gate ──
{
  const profile = {
    name: "Test",
    curveType: "C",
    severity: "mild",
    primaryCurveApex: "lower_thoracic",
    primaryLeanSide: "right",
    secondaryCurveApex: null,
    secondaryLeanSide: null,
    segmentShifts: {
      cervical: "centered",
      upper_thoracic: "right",
      lower_thoracic: "centered",
      lumbar: "centered",
    },
    lifestyle: {},
  } as unknown as OnboardingState;

  const clean = selectProgram({ profile, triage: triage({ answers: {} }) });
  check(
    "a clean screen still produces a programme",
    clean.exercises.length > 0,
    `expected exercises, got ${clean.exercises.length}`,
  );

  const blocked = selectProgram({
    profile,
    triage: triage({ answers: { saddle_numbness: true } }),
  });
  check(
    "an emergency flag produces no exercises at all",
    blocked.exercises.length === 0 && blocked.warnings.length > 0,
    `got ${blocked.exercises.length} exercises, ${blocked.warnings.length} warnings`,
  );

  // The physio-cleared path is the one most likely to be treated as
  // authoritative, so confirm it is gated too.
  const blockedWithPhysio = selectProgram({
    profile,
    physioProgram: {
      exercises: [
        { name: "Side plank", sets: 3, reps: null, duration_seconds: 30 },
      ],
    } as never,
    triage: triage({ answers: { leg_weakness_progressing: true } }),
  });
  check(
    "a physio-prescribed programme is gated too",
    blockedWithPhysio.exercises.length === 0,
    `physio path returned ${blockedWithPhysio.exercises.length} exercises past an emergency flag`,
  );

  const noTriage = selectProgram({ profile });
  check(
    "omitting triage entirely does not block (backwards compatible)",
    noTriage.exercises.length > 0,
    "callers without a screen should still get a programme",
  );
}

// ── handoff summary ──
{
  const t = triage({ answers: { fever_or_weight_loss: true } });
  const summary = handoffSummary(t, { name: "A. Patient", when: "2026-08-08" });
  check(
    "handoff summary marks findings as self-reported and unverified",
    summary.includes("self-reported") && summary.includes("not clinical findings"),
    "summary must not read as a clinical assertion",
  );
  check(
    "handoff summary is empty when nothing fired",
    handoffSummary(triage({ answers: {} })) === "",
    "empty screen should produce no document",
  );
}


// ── unknown-curve safety ──
//
// The path a user takes when all they know is "I was told I have scoliosis".
console.log("\nunknown-curve programme\n");
{
  const unknown = {
    ...initialOnboardingState,
    name: "Unknown",
    curveType: null,
    primaryCurveApex: null,
    primaryLeanSide: null,
  } as unknown as OnboardingState;

  const known = {
    ...unknown,
    curveType: "C",
    primaryCurveApex: "lower_thoracic",
    primaryLeanSide: "right",
  } as unknown as OnboardingState;

  const uRes = selectProgram({ profile: unknown });
  const kRes = selectProgram({ profile: known });

  check(
    "an unknown curve still produces a usable programme",
    uRes.exercises.length > 0,
    `got ${uRes.exercises.length} exercises — an empty programme would just push people away`,
  );

  const sideDependent = (r: typeof uRes) =>
    r.exercises.filter(
      (e) =>
        e.exercise &&
        Object.keys(e.exercise.asymmetric_cues ?? {}).some((k) => k !== "any"),
    );

  check(
    "no side-dependent exercise is prescribed without knowing the side",
    sideDependent(uRes).length === 0,
    `prescribed ${sideDependent(uRes)
      .map((e) => e.exercise?.id)
      .join(", ")} with no known convexity — held on the wrong side these reinforce the curve`,
  );

  check(
    "a known curve does get side-specific work",
    sideDependent(kRes).length > 0,
    "withholding asymmetric work from a known curve would defeat the point of the product",
  );

  check(
    "the user is told why their programme is more conservative",
    uRes.notes.some((n) => n.toLowerCase().includes("side")),
    `notes were: ${JSON.stringify(uRes.notes)}`,
  );

  check(
    "no exercise carries a side cue when the side is unknown",
    uRes.exercises.every((e) => !e.display.side_cue?.match(/\b(left|right)\b/i)),
    "a left/right instruction with no basis is a coin flip on someone's spine",
  );
}

console.log(
  failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
