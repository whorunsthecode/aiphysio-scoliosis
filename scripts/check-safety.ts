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
import {
  SEVERE_PAIN_SCORE,
  painScore,
  prefilterRedFlags,
  safetyReplyFor,
  safetyReplyKind,
} from "@/lib/safety/prefilter";
import { atrSideFrom, reconcileConvexity } from "@/lib/exercises/convexity";
import { enforceLaterality, type XrayAnalysis } from "@/lib/prompts/xray";

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

  const ongoingIds = new Set(questionsFor("ongoing").map((q) => q.id));
  check(
    "the ongoing (per-session) screen still asks every emergency question",
    ["bladder_bowel_change", "saddle_numbness", "leg_weakness_progressing"].every((id) =>
      ongoingIds.has(id),
    ),
    `ongoing screen asks: ${[...ongoingIds].join(", ")}`,
  );

  const supervised = triage({ answers: { had_fusion: true } });
  check(
    "a supervised population requires a clinician's prescription without blocking",
    supervised.severity === "supervised" &&
      supervised.requiresClinicianPrescription &&
      !supervised.blocksSession &&
      !supervised.reducesSession,
    `got ${JSON.stringify({ s: supervised.severity, rx: supervised.requiresClinicianPrescription })}`,
  );

  const both = triage({ answers: { wears_brace: true, night_pain: true } });
  check(
    "urgent outranks supervised, and both behaviours apply",
    both.severity === "urgent" && both.reducesSession && both.requiresClinicianPrescription,
    `got ${JSON.stringify({ s: both.severity, r: both.reducesSession, rx: both.requiresClinicianPrescription })}`,
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

  const sideDependent = (r: ReturnType<typeof selectProgram>) =>
    r.exercises.filter(
      (e) =>
        e.exercise &&
        Object.keys(e.exercise.asymmetric_cues ?? {}).some((k) => k !== "any"),
    );

  const supervisedRes = selectProgram({
    profile,
    triage: triage({ answers: { wears_brace: true } }),
  });
  check(
    "a supervised population gets gentle symmetric work only",
    supervisedRes.exercises.length > 0 &&
      supervisedRes.exercises.every((e) => e.exercise && e.exercise.tier >= 4) &&
      sideDependent(supervisedRes).length === 0,
    `got ${supervisedRes.exercises.map((e) => `${e.exercise?.id}(t${e.exercise?.tier})`).join(", ")}`,
  );
  check(
    "…and is told to bring a prescription",
    supervisedRes.notes.some((n) => /physio|surgical|prescri/i.test(n)),
    `notes: ${JSON.stringify(supervisedRes.notes)}`,
  );

  const supervisedWithPhysio = selectProgram({
    profile,
    physioProgram: {
      exercises: [
        { name: "Side plank", sets: 3, reps: null, duration_seconds: 30 },
      ],
    } as never,
    triage: triage({ answers: { had_fusion: true } }),
  });
  check(
    "a clinician's own programme is honoured for a supervised population",
    supervisedWithPhysio.mode === "physio_cleared",
    `mode=${supervisedWithPhysio.mode}`,
  );

  const reduced = selectProgram({
    profile,
    triage: triage({ answers: { night_pain: true } }),
  });
  check(
    "an urgent flag reduces the session to at most three gentle symmetric items",
    reduced.exercises.length > 0 &&
      reduced.exercises.length <= 3 &&
      reduced.exercises.every((e) => e.exercise && e.exercise.tier >= 4) &&
      sideDependent(reduced).length === 0,
    `got ${reduced.exercises.map((e) => `${e.exercise?.id}(t${e.exercise?.tier})`).join(", ")}`,
  );
  check(
    "…and says why",
    reduced.notes.some((n) => /light|gentle/i.test(n)) && reduced.warnings.length > 0,
    `notes: ${JSON.stringify(reduced.notes)}`,
  );
}

// ── chat pre-filter ──
//
// The chat model is asked to stop on red-flag symptoms; this is the code that
// makes sure of it. Over-inclusive by design.
console.log("\nchat pre-filter\n");
{
  const mustHit: [string, string][] = [
    ["can't feel my legs properly today", "progressive_neuro_deficit"],
    ["woke up and my bladder isn't right, keep leaking", "cauda_equina"],
    ["numbness around my sit bones", "cauda_equina"],
    ["pain shooting down my left leg when i bend", "radiating_or_neuro_symptoms"],
    ["tingling in both feet", "radiating_or_neuro_symptoms"],
    ["back pain wakes me at night and won't settle", "night_pain_unrelieved"],
    ["had a fever all week and my back is bad", "systemic_illness"],
    ["fell off my bike yesterday, back hurts", "significant_trauma"],
    ["headache gets worse when i cough", "neuro_axis_soft_signs"],
    ["sharp stabbing pain, 9/10", "severe_or_new_intense_pain"],
  ];
  for (const [text, rule] of mustHit) {
    const hits = prefilterRedFlags(text);
    check(
      `flags "${text}"`,
      hits.some((h) => h.ruleId === rule),
      `expected ${rule}, got ${JSON.stringify(hits.map((h) => h.ruleId))}`,
    );
  }

  const mustPass = [
    "neck stiff, hip keeps cracking on the right",
    "did the bridge 3x10",
    "feel okay actually",
    "no numbness today, just stiff",
    "back's at 4, the usual ache",
  ];
  for (const text of mustPass) {
    const hits = prefilterRedFlags(text);
    check(
      `passes "${text}"`,
      hits.length === 0,
      `false positive: ${JSON.stringify(hits)}`,
    );
  }

  const emergencyReply = safetyReplyFor(prefilterRedFlags("can't feel my legs"));
  const urgentReply = safetyReplyFor(prefilterRedFlags("tingling in my foot"));
  const EXERCISE_WORDS = /\b(stretch|plank|bridge|cat-cow|breath|pose|reps?|sets?)\b/i;
  check(
    "the fixed safety reply never suggests an exercise",
    !EXERCISE_WORDS.test(emergencyReply.replace("stretch-it-out", "")) &&
      !EXERCISE_WORDS.test(urgentReply.replace("stretch-it-out", "")),
    `${emergencyReply}\n${urgentReply}`,
  );
  check(
    "an emergency-tier hit says 'today' and names the emergency department",
    /today/i.test(emergencyReply) && /emergency department/i.test(emergencyReply),
    emergencyReply,
  );
  check(
    "emergency hits sort first",
    prefilterRedFlags("tingling feet and my bladder's gone weird")[0]?.emergency === true,
    "ordering broken",
  );

  // Chest pain and self-harm get their own replies, which point to
  // emergency help and nothing else.
  const chestReply = safetyReplyFor(prefilterRedFlags("my chest hurts and it's spreading to my arm"));
  const selfHarmReply = safetyReplyFor(prefilterRedFlags("i want to kill myself"));
  for (const [name, reply] of [
    ["chest pain", chestReply],
    ["self-harm", selfHarmReply],
  ] as const) {
    check(
      `the ${name} reply names 999 and the emergency department`,
      /\b999\b/.test(reply) && /emergency department/i.test(reply),
      reply,
    );
    check(
      `the ${name} reply suggests no exercise`,
      !EXERCISE_WORDS.test(reply),
      reply,
    );
  }
  check(
    "self-harm outranks every other reply when both fire",
    safetyReplyKind(prefilterRedFlags("chest pain and i want to die")) === "self_harm",
    safetyReplyKind(prefilterRedFlags("chest pain and i want to die")),
  );
  check(
    "self-harm language is answered even when negated",
    safetyReplyKind(prefilterRedFlags("i'm not suicidal, just tired")) === "self_harm",
    "a mention of suicide must always get the support reply",
  );

  // Pain scores are parsed, not pattern-matched on any digit.
  const scores: [string, number | null][] = [
    ["pain 2/10", 2],
    ["pain is 9/10 today", 9],
    ["my back pain is at a 9", 9],
    ["back pain was fine, did 10 reps", null],
    ["pain 2/10 yesterday, 9/10 today", 9],
    ["held it for 8 sets of 10 seconds", null],
  ];
  for (const [text, want] of scores) {
    check(`pain score of "${text}" is ${want}`, painScore(text) === want, `got ${painScore(text)}`);
  }
  check(
    "a score below the severe threshold does not fire",
    !prefilterRedFlags(`pain ${SEVERE_PAIN_SCORE - 1}/10`).some((h) => h.ruleId === "severe_or_new_intense_pain") &&
      prefilterRedFlags(`pain ${SEVERE_PAIN_SCORE}/10`).some((h) => h.ruleId === "severe_or_new_intense_pain"),
    `threshold is ${SEVERE_PAIN_SCORE}`,
  );
}

// ── convexity cross-check ──
console.log("\nconvexity cross-check\n");
{
  const agree = reconcileConvexity([
    { source: "self_report", side: "right" },
    { source: "atr", side: "right" },
  ]);
  check("two agreeing sources keep the side", agree.side === "right" && agree.status === "agree", JSON.stringify(agree));

  const conflict = reconcileConvexity([
    { source: "self_report", side: "left" },
    { source: "xray", side: "right" },
  ]);
  check(
    "disagreeing sources set the side to unknown and explain",
    conflict.side === null && conflict.status === "conflict" && !!conflict.note && /physio/i.test(conflict.note),
    JSON.stringify(conflict),
  );

  const single = reconcileConvexity([
    { source: "self_report", side: "left" },
    { source: "atr", side: null },
  ]);
  check("a single source is used, not vetoed by a missing one", single.side === "left", JSON.stringify(single));

  check(
    "a small ATR reading does not vote",
    atrSideFrom(2.5) === null && atrSideFrom(-6) === "left" && atrSideFrom(7) === "right" && atrSideFrom(null) === null,
    "ATR vote threshold broken",
  );

  const conflictProfile = {
    ...initialOnboardingState,
    name: "C",
    curveType: "C",
    primaryCurveApex: "lower_thoracic",
    primaryLeanSide: null,
  } as unknown as OnboardingState;
  const neutral = selectProgram({ profile: conflictProfile });
  check(
    "a nulled side yields a side-neutral programme",
    neutral.exercises.every((e) => !e.display.side_cue?.match(/\b(left|right)\b/i)),
    "side cue leaked",
  );
}

// ── X-ray laterality ──
console.log("\nx-ray laterality\n");
{
  const base: XrayAnalysis = {
    is_valid_xray: true,
    validity_note: "",
    view_type: "PA",
    laterality_marker_visible: false,
    laterality_marker_note: "",
    curve_assessment: {
      curve_type: "C-curve",
      primary_curve: { apex_region: "lower_thoracic", convex_side: "right" },
      secondary_curve: { apex_region: "lumbar", convex_side: "left" },
    },
    other_observations: [],
    confidence_note: "",
  };
  const noMarker = enforceLaterality(base);
  check(
    "without a laterality marker every convex_side is forced to unclear",
    noMarker.curve_assessment.primary_curve.convex_side === "unclear" &&
      noMarker.curve_assessment.secondary_curve?.convex_side === "unclear" &&
      noMarker.curve_assessment.primary_curve.apex_region === "lower_thoracic",
    JSON.stringify(noMarker.curve_assessment),
  );
  const withMarker = enforceLaterality({ ...base, laterality_marker_visible: true });
  check(
    "with a marker the side is kept",
    withMarker.curve_assessment.primary_curve.convex_side === "right",
    JSON.stringify(withMarker.curve_assessment),
  );
  const lateral = enforceLaterality({ ...base, view_type: "lateral", laterality_marker_visible: true });
  check(
    "a lateral film cannot yield a coronal curve",
    lateral.curve_assessment.curve_type === "unclear" &&
      lateral.curve_assessment.primary_curve.apex_region === "unclear" &&
      lateral.curve_assessment.primary_curve.convex_side === "unclear",
    JSON.stringify(lateral.curve_assessment),
  );
  check(
    "the schema carries no Cobb estimate, rotation or segmental fields",
    !("estimated_cobb_range" in base.curve_assessment.primary_curve) &&
      !("segmental_shift_impression" in base.curve_assessment) &&
      !("rotation_visible" in base.curve_assessment),
    "removed fields have crept back",
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
