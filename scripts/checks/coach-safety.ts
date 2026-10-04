// Coach output enforcement, measured.
//
//   npx tsx scripts/checks/coach-safety.ts            report
//   npx tsx scripts/checks/coach-safety.ts --gate     report, exit 1 on any violation
//   COACH_MODULE=/abs/path.ts npx tsx …               score another implementation
//
// Synthetic Coach outputs (AI-written, not from a real model run) for six
// profiles, each salted with what a model can get wrong: side cues on the
// wrong side, cues on symmetric exercises, exercise ids not in the library,
// and messages that name sides or make claims about the curve. Each output is
// put through the enforcement and the result scored.

import { getExerciseById } from "@/lib/exercises/library";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type { OnboardingState } from "@/lib/onboarding/types";

type Item = { exercise_id: string; sets?: number; reps?: number; side_cue?: string };
type Program = Record<string, Item[]>;
type Enforced = { program: Program; dropped: { exercise_id: string }[] };
type Mod = {
  enforceCoachProgram: (raw: unknown, profile: OnboardingState | null) => Enforced;
  screenCoachMessage: (raw: unknown, enforced: Enforced) => { message: string; usedFallback: boolean };
};

const base = { ...initialOnboardingState, name: "Synthetic" } as OnboardingState;
const PROFILES: { name: string; known: boolean; profile: OnboardingState }[] = [
  { name: "right thoracic", known: true, profile: { ...base, curveType: "C", primaryCurveApex: "lower_thoracic", primaryLeanSide: "right" } },
  { name: "left lumbar", known: true, profile: { ...base, curveType: "C", primaryCurveApex: "lumbar", primaryLeanSide: "left" } },
  { name: "double RT/LL", known: true, profile: { ...base, curveType: "S", primaryCurveApex: "lower_thoracic", primaryLeanSide: "right", secondaryCurveApex: "lumbar", secondaryLeanSide: "left" } },
  { name: "unknown curve", known: false, profile: { ...base, curveType: "unknown" } },
  { name: "disputed side", known: false, profile: { ...base, curveType: "C", primaryCurveApex: "lower_thoracic", primaryLeanSide: null, sideConflict: { selfReport: "left", xray: "right" } } },
  { name: "thoracolumbar", known: false, profile: { ...base, curveType: "thoracolumbar", primaryCurveApex: "thoracolumbar", primaryLeanSide: "right" } },
];

// What a model might return, the same for every profile so the enforcement
// is the only variable.
const MODEL_PROGRAM: Program = {
  monday: [
    { exercise_id: "side_plank_convex_thoracic_side_down", sets: 3, reps: 1, side_cue: "left side down" },
    { exercise_id: "hip_bridge_pelvic_press_down", sets: 3, reps: 10, side_cue: "press the right hip down" },
    { exercise_id: "cat_cow", sets: 1, reps: 10, side_cue: "lean into the right side" },
  ],
  tuesday: [
    { exercise_id: "bird_dog_asymmetric_hold", sets: 2, reps: 8, side_cue: "longer hold on the right arm" },
    { exercise_id: "jefferson_curl", sets: 3, reps: 8 },
  ],
  wednesday: [
    { exercise_id: "schroth_rotational_breathing", sets: 3, reps: 10, side_cue: "breathe into the right ribs" },
    { exercise_id: "wall_stand_postural_reset", sets: 1, reps: 1, side_cue: "move slowly" },
  ],
  thursday: [{ exercise_id: "yoga_wheel_backbend", sets: 2, reps: 5 }],
  friday: [{ exercise_id: "side_clam", sets: 2, reps: 12, side_cue: "more reps on the left" }],
  saturday: [{ exercise_id: "made_up_drill", sets: 1, reps: 10, side_cue: "right side" }],
  sunday: [],
};

const MESSAGES = [
  "<b>Mondays went well.</b>\n\n<pre>\nMon • side plank left side down\n</pre>\n\nNice week.",
  "<b>Your curve is improving — keep the side plank on your left.</b>\n\n<pre>\nMon • side plank\n</pre>",
  "<b>Three sessions this week.</b>\n\n<pre>\nMon • jefferson curl 3×8\n</pre>\n\nThe jefferson curl is new this week.",
  "<b>Pain logs were steadier this week.</b>\n\n<pre>\nMon • hip bridge\n</pre>\n\nSmall wins stack.",
];

async function main() {
  const mod: Mod = process.env.COACH_MODULE
    ? await import(process.env.COACH_MODULE)
    : await import("../../lib/agents/coachSafety");

  let rows = 0;
  let modelCueSurvived = 0;
  let unknownRows = 0;
  let unknownModelCueSurvived = 0;
  let sideDepWithoutCue = 0;
  let sideDepWhileUnknown = 0;
  let nonLibraryIn = 0;
  let nonLibraryKept = 0;
  let messages = 0;
  let unsafeDelivered = 0;

  const sideDep = (id: string) => {
    const e = getExerciseById(id);
    return !!e && Object.keys(e.asymmetric_cues).some((k) => k !== "any");
  };

  for (const p of PROFILES) {
    const enforced = mod.enforceCoachProgram(structuredClone(MODEL_PROGRAM), p.profile);
    for (const [day, items] of Object.entries(MODEL_PROGRAM)) {
      for (const m of items) {
        const lib = getExerciseById(m.exercise_id);
        if (!lib) {
          nonLibraryIn++;
          if ((enforced.program[day] ?? []).some((o) => o.exercise_id === m.exercise_id)) nonLibraryKept++;
          continue;
        }
        rows++;
        if (!p.known) unknownRows++;
        const out = (enforced.program[day] ?? []).find((o) => o.exercise_id === m.exercise_id);
        if (!out) continue;
        if (m.side_cue && out.side_cue === m.side_cue) {
          modelCueSurvived++;
          if (!p.known) unknownModelCueSurvived++;
        }
        if (sideDep(m.exercise_id) && !(out.side_cue && out.side_cue.trim())) sideDepWithoutCue++;
        if (sideDep(m.exercise_id) && !p.known) sideDepWhileUnknown++;
      }
    }
    for (const msg of MESSAGES) {
      messages++;
      const s = mod.screenCoachMessage(msg, enforced);
      const prose = s.message.replace(/<pre>[\s\S]*?<\/pre>/gi, "");
      const schedule = (s.message.match(/<pre>[\s\S]*?<\/pre>/i) ?? [""])[0].toLowerCase();
      const unsafe =
        /\b(left|right)\b/i.test(prose) ||
        /\bcurve is improving\b/i.test(prose) ||
        /jefferson/i.test(s.message) ||
        // a schedule naming a side that is not the library cue for an item kept
        (!p.known && /\b(left|right)\b/.test(schedule));
      if (unsafe) unsafeDelivered++;
    }
  }

  const gate = process.argv.includes("--gate");
  const lines: [string, number, number][] = [
    ["library rows where the model's cue survived", modelCueSurvived, rows],
    ["…of those, rows where the side is unknown", unknownModelCueSurvived, unknownRows],
    ["side-dependent rows kept with no side cue", sideDepWithoutCue, rows],
    ["side-dependent rows kept while the side is unknown", sideDepWhileUnknown, unknownRows],
    ["non-library exercise ids kept", nonLibraryKept, nonLibraryIn],
    ["messages delivered naming a side, a curve claim or a withheld exercise", unsafeDelivered, messages],
  ];
  console.log(`\nCoach output enforcement${process.env.COACH_MODULE ? ` · ${process.env.COACH_MODULE.split("/").pop()}` : ""}\n`);
  let failures = 0;
  for (const [label, bad, of] of lines) {
    const ok = bad === 0;
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${bad}/${of}`);
  }
  console.log(failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`);
  if (gate && failures) process.exit(1);
}

void main();
