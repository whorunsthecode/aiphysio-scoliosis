// Property check: no side-dependent work, and no left/right instruction,
// unless the side is actually known.
//
//   npx tsx scripts/checks/side-safety.ts            report
//   npx tsx scripts/checks/side-safety.ts --gate     report, exit 1 on any violation
//
// Generates randomised profiles (seeded, so runs are reproducible) across
// every selection mode — self-guided, physio-cleared, urgent-reduced,
// supervised — and asserts the same rule in all of them:
//
//   1. If the curve's side is unknown or the sources conflict, no
//      side-dependent library exercise is prescribed or suggested, and no
//      cue says "left" or "right" — unless that cue is the physio's own
//      written instruction for that exercise.
//   2. Whatever the side status, a side-dependent exercise is never handed
//      over without a side cue.
//   3. A physio's stated side that contradicts a known convex side (side
//      plank) is withheld, not shown with a warning.
//   4. An emergency red flag still produces no exercises.
//
// "Known" is defined here, independently of the production helpers, so the
// check can score older versions of selectProgram too.

import { selectProgram } from "@/lib/exercises/selectProgram";
import { EXERCISE_LIBRARY } from "@/lib/exercises/library";
import { triage } from "@/lib/safety/redFlags";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type { ApexRegion, CurveType, OnboardingState, Side } from "@/lib/onboarding/types";
import type { ParsedProgram } from "@/lib/prompts/parseProgram";

// ─────────────────────────── seeded randomness ───────────────────────────
let seed = 0x5eed;
function rand(): number {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

const SIDES: (Side | null)[] = ["left", "right", null];
const APEXES: (ApexRegion | null)[] = ["upper_thoracic", "lower_thoracic", "thoracolumbar", "lumbar", "cervical", null];
const CURVES: (CurveType | null)[] = ["S", "C", "thoracolumbar", "unknown", null];
const SHIFTS = ["left", "right", "centered", null] as const;

const isThoracic = (a: ApexRegion | null) => a === "upper_thoracic" || a === "lower_thoracic";
const isLumbar = (a: ApexRegion | null) => a === "lumbar";

// Independent definition of "the side is known well enough to cue".
function sideKnown(p: OnboardingState): boolean {
  if (p.curveType === "thoracolumbar") return false; // no library cue exists for it
  if (p.curveType === "S") {
    const pairs = [
      [p.primaryCurveApex, p.primaryLeanSide],
      [p.secondaryCurveApex, p.secondaryLeanSide],
    ] as const;
    const thor = pairs.find(([a]) => isThoracic(a));
    const lum = pairs.find(([a]) => isLumbar(a));
    // Both curves located, both sides given, and opposite — otherwise the
    // two sides are missing or contradict each other.
    return !!thor && !!lum && !!thor[1] && !!lum[1] && thor[1] !== lum[1];
  }
  return (isThoracic(p.primaryCurveApex) || isLumbar(p.primaryCurveApex)) && !!p.primaryLeanSide;
}

const sideDependent = new Set(
  EXERCISE_LIBRARY.filter((e) => Object.keys(e.asymmetric_cues ?? {}).some((k) => k !== "any")).map((e) => e.id),
);
const LR = /\b(left|right)\b/i;

function randomProfile(): OnboardingState {
  const curveType = pick(CURVES);
  const sideConflict = rand() < 0.1;
  return {
    ...initialOnboardingState,
    name: "Synthetic",
    curveType,
    severity: pick(["mild", "moderate", "unknown", null] as const),
    primaryCurveApex: pick(APEXES),
    // A disputed side is stored as null with sideConflict set (XrayStep).
    primaryLeanSide: sideConflict ? null : pick(SIDES),
    secondaryCurveApex: curveType === "S" ? pick(APEXES) : null,
    secondaryLeanSide: curveType === "S" ? pick(SIDES) : null,
    sideConflict: sideConflict ? { selfReport: "left", xray: "right" } : null,
    segmentShifts: {
      cervical: pick(SHIFTS),
      upper_thoracic: pick(SHIFTS),
      lower_thoracic: pick(SHIFTS),
      lumbar: pick(SHIFTS),
    },
  } as OnboardingState;
}

function randomPhysio(): ParsedProgram {
  const n = 1 + Math.floor(rand() * 4);
  const exercises: ParsedProgram["exercises"] = [];
  const used = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (rand() < 0.2) {
      exercises.push({
        source_text: "custom",
        library_match_id: null,
        is_custom: true,
        name: `Physio's own corrective ${i + 1}`,
        description: "",
        asymmetric_cues: pick([null, "shift ribs to the left", "breathe into the concave side"]),
        physio_specific_cues: [],
        reps: null,
        sets: null,
        duration_seconds: null,
        frequency: null,
        ambiguities: [],
      });
      continue;
    }
    const ex = pick(EXERCISE_LIBRARY);
    if (used.has(ex.id)) continue; // names must be unique to trace each cue
    used.add(ex.id);
    exercises.push({
      source_text: ex.name,
      library_match_id: ex.id,
      is_custom: false,
      name: ex.name,
      description: "",
      asymmetric_cues: pick([null, null, "right side down", "left side down", "hold longer on the weak side"]),
      physio_specific_cues: [],
      reps: null,
      sets: 3,
      duration_seconds: null,
      frequency: null,
      ambiguities: [],
    });
  }
  return { exercises, lifestyle_notes: [], parse_note: "" };
}

type Counter = { profiles: number; withViolation: number };
const counters: Record<string, Counter> = {};
const examples: Record<string, string> = {};
function tally(name: string, violated: boolean, example: () => string) {
  const c = (counters[name] ??= { profiles: 0, withViolation: 0 });
  c.profiles++;
  if (violated) {
    c.withViolation++;
    examples[name] ??= example();
  }
}

const N = 600;
const TRIAGES = [
  () => triage({ answers: {} }),
  () => triage({ answers: { night_pain: true } }), // urgent → reduced
  () => triage({ answers: { wears_brace: true } }), // supervised
  () => null,
];

for (let i = 0; i < N; i++) {
  const profile = randomProfile();
  const physio = rand() < 0.5 ? randomPhysio() : null;
  const tri = pick(TRIAGES)();
  const known = sideKnown(profile);
  const result = selectProgram({ profile, physioProgram: physio, triage: tri, pain: [] });
  const mode = result.mode === "physio_cleared" ? "physio" : "self_guided";
  const tag = `${mode}, side ${known ? "known" : "unknown"}`;

  const physioCueFor = (name: string) =>
    physio?.exercises.find((e) => e.name === name)?.asymmetric_cues ?? null;

  if (!known) {
    // 1a. side-dependent library items, other than ones whose side the physio wrote down
    const badItems = result.exercises.filter((e) => {
      if (!e.exercise || !sideDependent.has(e.exercise.id)) return false;
      const physioCue = e.source === "physio" ? physioCueFor(e.display.name) : null;
      return !(physioCue && LR.test(physioCue));
    });
    tally(`${tag}: side-dependent exercise prescribed`, badItems.length > 0, () =>
      `${badItems.map((e) => e.exercise?.id).join(", ")} for ${JSON.stringify({ c: profile.curveType, a: profile.primaryCurveApex, s: profile.primaryLeanSide, a2: profile.secondaryCurveApex, s2: profile.secondaryLeanSide })}`,
    );
    // 1b. side-dependent suggestions
    const badSugg = result.suggestions.filter((s) => sideDependent.has(s.exercise.id));
    if (mode === "physio")
      tally(`${tag}: side-dependent suggestion`, badSugg.length > 0, () => badSugg.map((s) => s.exercise.id).join(", "));
    // 1c. any left/right cue not written by the physio
    const lrCues = [
      ...result.exercises
        .filter((e) => e.display.side_cue && LR.test(e.display.side_cue))
        .filter((e) => !(e.source === "physio" && physioCueFor(e.display.name) === e.display.side_cue))
        .map((e) => `${e.exercise?.id ?? e.display.name}: "${e.display.side_cue}"`),
      ...result.suggestions.filter((s) => s.side_cue && LR.test(s.side_cue)).map((s) => `${s.exercise.id}: "${s.side_cue}"`),
    ];
    tally(`${tag}: left/right cue not from the physio`, lrCues.length > 0, () => lrCues.join("; "));
  }

  // 2. side-dependent work never ships without a side cue
  const uncued = result.exercises.filter(
    (e) => e.exercise && sideDependent.has(e.exercise.id) && !(e.display.side_cue && e.display.side_cue.trim()),
  );
  tally(`${tag}: side-dependent exercise with no side cue`, uncued.length > 0, () =>
    `${uncued.map((e) => e.exercise?.id).join(", ")} for ${JSON.stringify({ c: profile.curveType, a: profile.primaryCurveApex, s: profile.primaryLeanSide, a2: profile.secondaryCurveApex, s2: profile.secondaryLeanSide })}`,
  );

  // 3. physio side plank on the side opposite a known thoracic convexity
  if (mode === "physio" && known) {
    const thorSide =
      [
        [profile.primaryCurveApex, profile.primaryLeanSide],
        [profile.secondaryCurveApex, profile.secondaryLeanSide],
      ].find(([a]) => isThoracic(a as ApexRegion | null))?.[1] ?? null;
    const wrong = result.exercises.filter((e) => {
      if (e.exercise?.id !== "side_plank_convex_thoracic_side_down" || !thorSide) return false;
      const cue = (e.display.side_cue ?? "").toLowerCase();
      const opposite = thorSide === "left" ? "right" : "left";
      return cue.includes(`${opposite} side`);
    });
    tally(`physio, side known: side plank on the side opposite the curve`, wrong.length > 0, () =>
      wrong.map((e) => e.display.side_cue).join("; "),
    );
  }
}

// 4. emergency still yields nothing, whatever the profile
let emergencyLeaks = 0;
for (let i = 0; i < 100; i++) {
  const r = selectProgram({
    profile: randomProfile(),
    physioProgram: rand() < 0.5 ? randomPhysio() : null,
    triage: triage({ answers: { saddle_numbness: true } }),
  });
  if (r.exercises.length || r.suggestions.length) emergencyLeaks++;
}

const gate = process.argv.includes("--gate");
console.log(`\nside safety · ${N} randomised profiles (seeded) + 100 emergency profiles\n`);
let failures = 0;
for (const [name, c] of Object.entries(counters).sort()) {
  const ok = c.withViolation === 0;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}: ${c.withViolation}/${c.profiles}`);
  if (!ok) console.log(`        e.g. ${examples[name]}`);
}
console.log(`  ${emergencyLeaks === 0 ? "PASS" : "FAIL"}  emergency red flag: profiles with any exercise or suggestion: ${emergencyLeaks}/100`);
if (emergencyLeaks) failures++;

console.log(failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`);
if (gate && failures) process.exit(1);
