// Daily program selection. Pure function — given a profile, optional posture
// scan, optional pain points, and optional physio program, returns 3–5
// exercises with reasoning. Two modes:
//
//   physio_cleared — the physio's program is the prescription. We pass it
//                    through, flagging any contraindications, and surface
//                    library suggestions as "worth asking your physio about".
//
//   self_guided    — no physio program. Build a balanced set from the library
//                    biased by curve pattern, today's scan, and today's pain.

import {
  EXERCISE_LIBRARY,
  getExerciseById,
} from "./library";
import {
  CONTRAINDICATION_RULES,
  checkSidePlankSide,
  findContraindications,
  type RuleHit,
} from "./contraindications";
import {
  deriveCurvePattern,
  deriveRegionalSides,
  inferStiffHipFlexorSide,
  sidesKnown,
  type ProfileLike,
} from "./profile";
import type { BodyRegionId, CurvePatternKey, Exercise } from "./types";
import type { OnboardingState, PainPoint } from "@/lib/onboarding/types";
import type { ParsedProgram } from "@/lib/prompts/parseProgram";
import type { PostureMeasurements } from "@/lib/pose/types";
import type { TriageResult } from "@/lib/safety/types";

const PAIN_SKIP_THRESHOLD = 7;
const PAIN_REDUCE_THRESHOLD = 5;
const TARGET_COUNT_MIN = 3;
const TARGET_COUNT_MAX = 5;

export type ProgramExercise = {
  source: "physio" | "library";
  // The library-backed exercise, when matched.
  exercise: Exercise | null;
  // Display metadata. For physio-custom items, library is null and these are
  // the only fields rendered.
  display: {
    name: string;
    description: string;
    reps?: number | null;
    sets?: number | null;
    duration_seconds?: number | null;
    side_cue?: string | null;
    // Where the side cue came from: the physio's own written instruction,
    // the library entry for the user's curve pattern, or a per-user hint.
    side_cue_source?: "physio" | "library" | "personal" | null;
  };
  // Why this was selected — short, user-facing.
  reason: string;
  // Contraindication flags (do not block; surface).
  flags: { rule: string; severity: "absolute" | "relative" | "ask_physio"; note: string }[];
  // For matched exercises, the physio's clarification (if any).
  physio_clarification?: string;
};

export type ProgramSuggestion = {
  exercise: Exercise;
  reason: string;
  side_cue?: string | null;
};

export type SelectionResult = {
  pattern: CurvePatternKey;
  mode: "physio_cleared" | "self_guided";
  exercises: ProgramExercise[];
  suggestions: ProgramSuggestion[];
  notes: string[];
  warnings: string[]; // Aggregated absolute/relative contraindication summary
};

export type SelectionInput = {
  profile: ProfileLike & Pick<OnboardingState, "name">;
  scan?: PostureMeasurements | null;
  pain?: PainPoint[];
  physioProgram?: ParsedProgram | null;
  physioClarifications?: Record<number, string>;
  // Result of the red-flag screen, when one has been run. An emergency-tier
  // flag stops a programme being produced at all — see lib/safety.
  triage?: TriageResult | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────

export function selectProgram(input: SelectionInput): SelectionResult {
  const pattern = deriveCurvePattern(input.profile);

  // An emergency-tier red flag stops here, ahead of every other branch. It is
  // not appropriate to hand someone a movement programme — physio-prescribed
  // or otherwise — while they are reporting symptoms that need same-day
  // assessment. Enforcing it in the pure function rather than in the session
  // page means the library view cannot route around it either.
  if (input.triage?.blocksSession) {
    return {
      pattern,
      mode: "self_guided",
      exercises: [],
      suggestions: [],
      notes: [
        "Today's programme is paused. What you've described needs looking at before you exercise.",
      ],
      warnings: input.triage.hits
        .filter((h) => h.rule.severity === "emergency")
        .map((h) => `${h.rule.observation} ${h.rule.action}`),
    };
  }
  const sides = deriveRegionalSides(input.profile);
  const stiffHipSide = inferStiffHipFlexorSide(input.profile);
  const physio = input.physioProgram;

  const usePhysio =
    !!physio && physio.exercises && physio.exercises.length > 0;

  // A "supervised" population (post-fusion, in a brace, pregnant, fragile
  // bone, connective-tissue disorder) must not receive an algorithmically
  // chosen asymmetric programme. A clinician's prescription is honoured as
  // usual; without one they get gentle symmetric work and a clear ask.
  if (!usePhysio && input.triage?.requiresClinicianPrescription) {
    const gentle = gentleSymmetricProgramme(pattern);
    gentle.notes.unshift(
      "For your situation I'm not going to pick asymmetric exercises myself. Enter the programme your physio or surgical team gives you and I'll coach that instead.",
    );
    gentle.warnings = input.triage.hits
      .filter((h) => h.rule.severity === "supervised")
      .map((h) => `${h.rule.observation} ${h.rule.action}`);
    return gentle;
  }

  const result = usePhysio
    ? physioClearedMode({
        pattern,
        profile: input.profile,
        physio: physio!,
        clarifications: input.physioClarifications ?? {},
        pain: input.pain ?? [],
        scan: input.scan ?? null,
      })
    : selfGuidedMode({
        pattern,
        sides,
        stiffHipSide,
        profile: input.profile,
        scan: input.scan ?? null,
        pain: input.pain ?? [],
      });

  // An urgent red flag reduces the session: gentle, symmetric, no more than
  // three items, on both paths. Previously reducesSession was computed and
  // then read by nothing — the flag looked like a safety behaviour and wasn't.
  if (input.triage?.reducesSession) {
    return reduceProgramme(result, input.triage.hits);
  }
  return result;
}

// Tiers 4 and 5 are symmetric mobility and breathing — the only content safe
// to offer without knowing what a clinician would say.
const GENTLE_TIERS = new Set([4, 5]);
const REDUCED_MAX = 3;

function isGentle(e: Exercise): boolean {
  return GENTLE_TIERS.has(e.tier) && !isSideDependent(e);
}

function gentleSymmetricProgramme(pattern: CurvePatternKey): SelectionResult {
  const picked = EXERCISE_LIBRARY.filter(isGentle).slice(0, REDUCED_MAX);
  return {
    pattern,
    mode: "self_guided",
    exercises: picked.map((exercise) => ({
      source: "library",
      exercise,
      display: {
        name: exercise.name,
        description: exercise.description,
        reps: exercise.reps ?? null,
        sets: exercise.sets ?? null,
        duration_seconds: exercise.duration_seconds ?? null,
        side_cue: null,
      },
      reason: "Gentle, same-on-both-sides movement that's safe without a prescription",
      flags: [],
    })),
    suggestions: [],
    notes: [],
    warnings: [],
  };
}

function reduceProgramme(
  result: SelectionResult,
  hits: TriageResult["hits"],
): SelectionResult {
  const kept = result.exercises
    .filter((e) => e.exercise && isGentle(e.exercise))
    .slice(0, REDUCED_MAX);
  const exercises =
    kept.length > 0
      ? kept
      : gentleSymmetricProgramme(result.pattern).exercises;
  return {
    ...result,
    exercises,
    suggestions: [],
    notes: [
      "Today's session is deliberately light — gentle movement and breathing only — because of what you've told me. Get the thing you mentioned looked at, then we'll pick the full programme back up.",
      ...result.notes,
    ],
    warnings: [
      ...hits
        .filter((h) => h.rule.severity === "urgent")
        .map((h) => `${h.rule.observation} ${h.rule.action}`),
      ...result.warnings,
    ],
  };
}

// An exercise is side-dependent when the library gives it a cue for specific
// curve patterns — that cue is what tells the user which side to work. An
// exercise carrying only an "any" cue applies the same way to everyone.
function isSideDependent(e: Exercise): boolean {
  return Object.keys(e.asymmetric_cues ?? {}).some((k) => k !== "any");
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Physio-cleared mode
// ─────────────────────────────────────────────────────────────────────────

function physioClearedMode(args: {
  pattern: CurvePatternKey;
  profile: ProfileLike;
  physio: ParsedProgram;
  clarifications: Record<number, string>;
  pain: PainPoint[];
  scan: PostureMeasurements | null;
}): SelectionResult {
  const { pattern, physio, clarifications } = args;
  const sides = deriveRegionalSides(args.profile);

  const known = sidesKnown(args.profile);
  const withheldUnknown: string[] = [];
  const withheldConflict: string[] = [];

  const exercises: ProgramExercise[] = [];
  physio.exercises.forEach((pex, idx) => {
    const matched = pex.library_match_id
      ? getExerciseById(pex.library_match_id) ?? null
      : null;

    const hits = findContraindications({
      libraryId: matched?.id,
      name: pex.name,
    });

    // The physio's own written cue, and whether it names a side.
    const physioCue = pex.asymmetric_cues?.trim() || null;
    const physioNamesSide = !!physioCue && /\b(left|right)\b/i.test(physioCue);

    // Side-dependent library exercise: the side has to come from somewhere.
    // The physio writing it down counts; otherwise the user's known curve
    // pattern and the library cue for it. With neither, it is withheld
    // rather than handed over as a coin flip.
    let sideCue: string | null = null;
    let sideCueSource: ProgramExercise["display"]["side_cue_source"] = null;
    if (matched && isSideDependent(matched)) {
      if (physioNamesSide) {
        // Side plank: a physio's side that contradicts a known thoracic
        // convexity is a conflict between two sources. Withheld until a
        // clinician settles it, like every other side conflict.
        if (matched.id === "side_plank_convex_thoracic_side_down") {
          const cue = physioCue!.toLowerCase();
          const physioSide = cue.includes("right side")
            ? "right"
            : cue.includes("left side")
              ? "left"
              : null;
          if (checkSidePlankSide(physioSide, sides.thoracicConvex)) {
            withheldConflict.push(pex.name);
            return;
          }
        }
        sideCue = physioCue;
        sideCueSource = "physio";
      } else if (known && matched.asymmetric_cues[pattern]) {
        sideCue = physioCue
          ? `${matched.asymmetric_cues[pattern]} (your physio: "${physioCue}")`
          : matched.asymmetric_cues[pattern]!;
        sideCueSource = "library";
      } else {
        withheldUnknown.push(pex.name);
        return;
      }
    } else if (physioCue) {
      // Not side-dependent in the library, or the physio's own exercise:
      // their words are shown as written.
      sideCue = physioCue;
      sideCueSource = "physio";
    } else if (matched?.asymmetric_cues["any"]) {
      sideCue = matched.asymmetric_cues["any"];
      sideCueSource = "library";
    }

    exercises.push({
      source: "physio",
      exercise: matched,
      display: {
        name: pex.name,
        description: pex.description || matched?.description || "",
        reps: pex.reps ?? matched?.reps ?? null,
        sets: pex.sets ?? matched?.sets ?? null,
        duration_seconds: pex.duration_seconds ?? matched?.duration_seconds ?? null,
        side_cue: sideCue,
        side_cue_source: sideCueSource,
      },
      reason: matched
        ? "Prescribed by your physio"
        : "Custom from your physio's program",
      flags: hits.map((h) => ({
        rule: h.rule.title,
        severity: h.rule.category,
        note: h.rule.reason_user_facing,
      })),
      physio_clarification: clarifications[idx]?.trim() || undefined,
    });
  });

  // Library suggestions — exercises that fit the user's pattern but aren't
  // already in the physio program. Capped at 2.
  const physioIds = new Set(
    exercises
      .map((e) => e.exercise?.id)
      .filter((id): id is string => !!id),
  );
  const suggestions = applicableForPattern(pattern)
    .filter((e) => !physioIds.has(e.id))
    .filter((e) => e.tier <= 2)
    // A side-dependent suggestion needs the cue for this user's pattern;
    // without one it would be a suggestion with no side.
    .filter((e) => !isSideDependent(e) || (known && !!e.asymmetric_cues[pattern]))
    .slice(0, 2)
    .map<ProgramSuggestion>((exercise) => ({
      exercise,
      reason: "Worth asking your physio about as an addition",
      side_cue: exercise.asymmetric_cues[pattern] ?? null,
    }));

  const warnings = exercises
    .flatMap((ex) => ex.flags)
    .filter((f) => f.severity === "absolute")
    .map((f) => f.note);

  const notes: string[] = [];
  if (physio.parse_note) notes.push(physio.parse_note);
  if (withheldUnknown.length > 0) {
    notes.push(
      `I've left out ${listNames(withheldUnknown)} for now. ${withheldUnknown.length === 1 ? "It needs" : "They need"} to be done on one particular side, and your programme doesn't say which. Ask your physio which side, and add it to your programme or your curve details.`,
    );
  }
  if (withheldConflict.length > 0) {
    notes.push(
      `I've left out ${listNames(withheldConflict)} for now. The side in your physio's programme doesn't match the side your curve bulges toward in your profile. Check with your physio which is right.`,
    );
  }
  if (suggestions.length > 0) {
    notes.push(
      "Suggestions below are research-aligned additions — your physio's program always wins.",
    );
  }

  return {
    pattern,
    mode: "physio_cleared",
    exercises,
    suggestions,
    notes,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Self-guided mode
// ─────────────────────────────────────────────────────────────────────────

function selfGuidedMode(args: {
  pattern: CurvePatternKey;
  sides: ReturnType<typeof deriveRegionalSides>;
  stiffHipSide: ReturnType<typeof inferStiffHipFlexorSide>;
  profile: ProfileLike;
  scan: PostureMeasurements | null;
  pain: PainPoint[];
}): SelectionResult {
  const { pattern, sides, stiffHipSide, scan, pain } = args;
  const notes: string[] = [];

  const known = sidesKnown(args.profile);

  // Step 1: candidates = library, applicable, not contraindicated.
  let candidates = applicableForPattern(pattern);
  candidates = candidates.filter((e) => !exerciseContraindicated(e, sides));


  // Step 1b: when we do not know which way the curve bends, withhold every
  // exercise whose benefit depends on being done on a particular side.
  //
  // This is the most dangerous gap in the whole selection path. The side-plank
  // rule in contraindications.ts only fires when BOTH the chosen side and the
  // convex side are known — so with an unknown curve it stays silent, and a
  // side-dependent exercise would be handed over with no side guidance at all.
  // Held on the wrong side it reinforces the curve rather than opposing it.
  // A coin flip is not an acceptable default when the downside is making
  // someone's scoliosis worse, so these are withheld until the curve is known.
  if (!known) {
    const before = candidates.length;
    candidates = candidates.filter((e) => !isSideDependent(e));
    if (candidates.length < before) {
      notes.push(
        "Some exercises only help when they're done on the side your curve bends toward. Until you've told me which way that is, I'm leaving those out and sticking to work that's the same on both sides.",
      );
    }
  }

  // A side-dependent exercise is only usable with the cue for this user's
  // pattern. Bird dog's cue is written for thoracic curves; for a lumbar
  // curve it would be handed over with no side at all.
  candidates = candidates.filter((e) => !isSideDependent(e) || !!e.asymmetric_cues[pattern]);

  // Step 2: filter by pain. If a region scores >= PAIN_SKIP_THRESHOLD, skip
  // any exercise that loads that region. If >= PAIN_REDUCE_THRESHOLD, allow
  // but tier-down emphasis (handled in step 3 by tier weighting).
  const heavyPainRegions = new Set(
    pain
      .filter((p) => p.intensity >= PAIN_SKIP_THRESHOLD)
      .map((p) => p.location as BodyRegionId),
  );
  const moderatePainRegions = new Set(
    pain
      .filter(
        (p) =>
          p.intensity >= PAIN_REDUCE_THRESHOLD &&
          p.intensity < PAIN_SKIP_THRESHOLD,
      )
      .map((p) => p.location as BodyRegionId),
  );

  candidates = candidates.filter((e) => {
    const loads = e.loads_regions ?? [];
    return !loads.some((r) => heavyPainRegions.has(r));
  });

  // Step 3: pick across tiers based on today's scan + profile.
  const tierBias = pickTierBias(scan, pain.length > 0);

  // Score and pick within tier groups.
  const grouped = groupByTier(candidates);
  const picked: Exercise[] = [];
  for (const tier of tierBias) {
    const group = grouped.get(tier) ?? [];
    if (group.length === 0) continue;

    // Bias: prefer exercises whose loads_regions don't touch moderate pain.
    const sorted = [...group].sort((a, b) => {
      const aPain = (a.loads_regions ?? []).some((r) =>
        moderatePainRegions.has(r),
      )
        ? 1
        : 0;
      const bPain = (b.loads_regions ?? []).some((r) =>
        moderatePainRegions.has(r),
      )
        ? 1
        : 0;
      if (aPain !== bPain) return aPain - bPain;

      // Prefer exercises with explicit asymmetric cues for this pattern over
      // pattern="any" cues.
      const aSpecific = a.asymmetric_cues[pattern] ? 0 : 1;
      const bSpecific = b.asymmetric_cues[pattern] ? 0 : 1;
      if (aSpecific !== bSpecific) return aSpecific - bSpecific;
      return 0;
    });

    for (const ex of sorted) {
      if (picked.find((p) => p.id === ex.id)) continue;
      picked.push(ex);
      if (picked.length >= TARGET_COUNT_MAX) break;
    }
    if (picked.length >= TARGET_COUNT_MAX) break;
  }

  // Stop trimming if we're shorter than min — try to backfill with safe
  // tier-4 mobility exercises.
  if (picked.length < TARGET_COUNT_MIN) {
    const safeFill = candidates
      .filter((e) => e.tier === 4)
      .filter((e) => !picked.find((p) => p.id === e.id));
    for (const ex of safeFill) {
      picked.push(ex);
      if (picked.length >= TARGET_COUNT_MIN) break;
    }
  }

  // Step 4: build display objects with side cues and reasoning.
  const exercises: ProgramExercise[] = picked
    .slice(0, TARGET_COUNT_MAX)
    .map<ProgramExercise>((ex) => {
      const libraryCue = ex.asymmetric_cues[pattern] ?? ex.asymmetric_cues["any"] ?? null;
      // Per-user hints name a side, so they wait for the side to be known.
      const personalCue = known ? applyPersonalSideCue(ex, sides, stiffHipSide) : null;
      const sideCue = libraryCue ?? personalCue;
      const sideCueSource = libraryCue ? "library" : personalCue ? "personal" : null;
      return {
        source: "library",
        exercise: ex,
        display: {
          name: ex.name,
          description: ex.description,
          reps: ex.reps ?? null,
          sets: ex.sets ?? null,
          duration_seconds: ex.duration_seconds ?? null,
          side_cue: sideCue,
          side_cue_source: sideCueSource,
        },
        reason: explainSelfGuidedSelection(ex, scan, sides, stiffHipSide),
        flags: [],
      };
    });

  notes.push(
    !known
      ? "Self-guided mode, working from what you've told me so far. Once you know which way your curve bends, I can tailor this properly — a physio or your X-ray report will have it."
      : "Self-guided mode — these are tailored to your curve from a curated library. A physio's eye is the most valuable thing for scoliosis; consider booking a baseline assessment if you haven't.",
  );
  if (heavyPainRegions.size > 0) {
    notes.push(
      `Skipping exercises that load ${[...heavyPainRegions].join(", ")} today — those areas are flared.`,
    );
  }

  return {
    pattern,
    mode: "self_guided",
    exercises,
    suggestions: [],
    notes,
    warnings: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Selection helpers
// ─────────────────────────────────────────────────────────────────────────

function applicableForPattern(pattern: CurvePatternKey): Exercise[] {
  return EXERCISE_LIBRARY.filter(
    (e) =>
      e.applicable_patterns.includes(pattern) ||
      e.applicable_patterns.includes("any"),
  );
}

function exerciseContraindicated(
  ex: Exercise,
  _sides: ReturnType<typeof deriveRegionalSides>,
): boolean {
  // Library-encoded contraindications first.
  // (None at present — keeping the check for future entries.)
  // External rules: see CONTRAINDICATION_RULES; for self-guided selection we
  // don't auto-include any rule-flagged library items.
  return CONTRAINDICATION_RULES.some(
    (r) =>
      r.category === "absolute" &&
      r.matches.libraryIds?.includes(ex.id) === true,
  );
}

function groupByTier(exs: Exercise[]): Map<number, Exercise[]> {
  const m = new Map<number, Exercise[]>();
  for (const e of exs) {
    if (!m.has(e.tier)) m.set(e.tier, []);
    m.get(e.tier)!.push(e);
  }
  return m;
}

// Decide which tiers to draw from in order. Default mix biases toward Tier 1
// (pelvic de-rotation) + 2 (asymmetric strength) + 4 (mobility), with tiers 3
// and 5 included for variety. Today's scan and pain shift weights:
//   - shoulder/hip pronounced → bias Tier 1
//   - thoracic deviation high → bias Tier 3 + 5
//   - any heavy pain → bias toward Tiers 4+5 (gentle)
function pickTierBias(
  scan: PostureMeasurements | null,
  hasPain: boolean,
): number[] {
  if (hasPain) return [4, 5, 1, 2, 3];
  if (!scan) return [1, 2, 4, 3, 5];

  const pelvicMag =
    Math.abs(scan.shoulderDiffMm) +
    Math.abs(scan.hipDiffMm) +
    Math.abs(scan.pelvicRotationMm);
  const thoracicMag =
    Math.abs(scan.segments.upperThoracic) +
    Math.abs(scan.segments.lowerThoracic) +
    Math.abs(scan.headOffsetMm);

  if (pelvicMag > thoracicMag * 1.4) return [1, 2, 4, 3, 5];
  if (thoracicMag > pelvicMag * 1.4) return [3, 1, 5, 2, 4];
  return [1, 2, 3, 4, 5];
}

function applyPersonalSideCue(
  ex: Exercise,
  sides: ReturnType<typeof deriveRegionalSides>,
  stiffHipSide: ReturnType<typeof inferStiffHipFlexorSide>,
): string | null {
  // For exercises without a library-encoded asymmetric cue, derive a per-user
  // hint from the regional sides.
  if (ex.id === "side_lying_foam_roller_release" && stiffHipSide) {
    return `Spend more time on the ${stiffHipSide} side — it's typically stiffer for you.`;
  }
  if (ex.id === "hip_flexor_stretch_stiff_side" && stiffHipSide) {
    return `Emphasise the ${stiffHipSide} side.`;
  }
  if (ex.id === "side_clam" && sides.lumbarConcave) {
    return `Build more reps on the ${sides.lumbarConcave} side (the side that needs to wake up).`;
  }
  return null;
}

function explainSelfGuidedSelection(
  ex: Exercise,
  scan: PostureMeasurements | null,
  sides: ReturnType<typeof deriveRegionalSides>,
  stiffHipSide: ReturnType<typeof inferStiffHipFlexorSide>,
): string {
  const tierLabels: Record<number, string> = {
    1: "Pelvic de-rotation foundation",
    2: "Asymmetrically cued strength",
    3: "Schroth-adjacent corrective",
    4: "Daily mobility + reset",
    5: "Breathing into the concave side",
  };
  const base = tierLabels[ex.tier] ?? "Selected for your curve";
  if (ex.id === "side_lying_foam_roller_release" && stiffHipSide) {
    return `${base}. Stiff hip flexor ${stiffHipSide} — this loosens it.`;
  }
  if (
    scan &&
    Math.abs(scan.hipDiffMm) > 8 &&
    ex.id === "hip_bridge_pelvic_press_down"
  ) {
    return `${base}. Hip differential ${Math.abs(scan.hipDiffMm).toFixed(0)}mm today — directly addresses it.`;
  }
  if (
    ex.id === "side_plank_convex_thoracic_side_down" &&
    sides.thoracicConvex
  ) {
    return `${base}. Right setup for your thoracic curve.`;
  }
  return base;
}
