// The red-flag ruleset and the screening questions that feed it.
//
// Scope note: these are the flags a home movement coach can reasonably act on
// from self-report. They are a triage prompt to see someone qualified — not a
// diagnostic instrument, and not a substitute for one. Anything that needs
// examination (reflexes, dermatomes, gait) is out of scope by construction.

import type {
  FlagHit,
  RedFlagRule,
  ScreeningAnswers,
  ScreeningQuestion,
  TriageResult,
} from "./types";

export const RED_FLAG_RULES: RedFlagRule[] = [
  // ───────────────────────────── EMERGENCY ─────────────────────────────
  {
    id: "cauda_equina",
    severity: "emergency",
    title: "Cauda equina symptom cluster",
    observation:
      "You've mentioned changes in bladder or bowel control, or numbness around your sit-bones and inner thighs.",
    why:
      "That combination needs to be assessed today, not at your next appointment — the window for treating it well is short.",
    action:
      "Go to an emergency department now. Don't wait for a GP appointment, and don't do today's exercises.",
    provenance:
      "Cauda equina syndrome is the canonical time-critical spinal red flag; urgent decompression is time-dependent.",
  },
  {
    id: "progressive_neuro_deficit",
    severity: "emergency",
    title: "Progressive neurological deficit",
    observation:
      "You've mentioned weakness in your legs that's been getting worse, or trouble walking that wasn't there before.",
    why:
      "Weakness that is progressing is different from pain, and it needs assessing quickly rather than monitored at home.",
    action:
      "Contact your doctor today, or go to an emergency department if it's worsening by the hour. Skip today's exercises.",
    provenance:
      "Progressive motor deficit is an accepted urgent-referral criterion in spinal assessment.",
  },

  // ────────────────────────────── URGENT ───────────────────────────────
  {
    id: "night_pain_unrelieved",
    severity: "urgent",
    title: "Night pain that wakes and does not settle",
    observation:
      "You've mentioned back pain that wakes you and doesn't settle when you change position.",
    why:
      "Most mechanical back pain eases when you move or shift position. Pain that doesn't is worth someone looking at properly.",
    action: "Book a GP or physiotherapist appointment in the next few days.",
    provenance:
      "Unremitting night pain is a standard red flag for non-mechanical causes.",
  },
  {
    id: "systemic_illness",
    severity: "urgent",
    title: "Back pain with fever or unexplained weight loss",
    observation:
      "You've mentioned back pain alongside a fever, or losing weight without trying.",
    why:
      "Back pain with those together points away from a purely mechanical cause, so it should be checked rather than exercised through.",
    action: "See a doctor within the next few days.",
    provenance:
      "Fever and unexplained weight loss with back pain are standard red flags for infection or malignancy.",
  },
  {
    id: "cancer_history",
    severity: "urgent",
    title: "New back pain with a history of cancer",
    observation:
      "You've mentioned a history of cancer alongside new or changed back pain.",
    why:
      "That history changes how new back pain should be investigated, and it's worth doing early.",
    action:
      "Contact whoever manages your cancer care, or your GP, in the next few days.",
    provenance:
      "Prior malignancy is among the strongest predictors of serious spinal pathology in back pain.",
  },
  {
    id: "significant_trauma",
    severity: "urgent",
    title: "Back pain following significant trauma",
    observation:
      "You've mentioned a fall or accident before this pain started.",
    why:
      "Pain that starts after an impact should be assessed before you load your spine with exercise.",
    action:
      "Get it checked before starting or resuming a programme. Hold off on today's session.",
    provenance:
      "Post-traumatic onset warrants imaging consideration before loaded exercise.",
  },

  // ────────────────────────────── REVIEW ───────────────────────────────
  {
    id: "rapid_progression",
    severity: "review",
    title: "Self-reported rapid curve progression",
    observation:
      "You've mentioned your curve has changed noticeably over a short period.",
    why:
      "Curves that move quickly are usually managed differently from stable ones, and your clinician will want to know.",
    action:
      "Mention this at your next appointment, or bring it forward if you're not booked in.",
    provenance:
      "Progression rate drives management decisions in scoliosis; ≥5° between visits is the conventional threshold.",
  },
  {
    id: "atypical_curve_pattern",
    severity: "review",
    title: "Left thoracic curve in an adolescent",
    observation:
      "Your curve pattern is one clinicians usually like to look at more closely in someone your age.",
    why:
      "It's a less common pattern, and it's standard practice to confirm nothing else is contributing.",
    action:
      "Worth confirming with your specialist that this has been looked into.",
    provenance:
      "Left thoracic curves in adolescents carry a higher association with underlying neural-axis abnormality and conventionally prompt MRI consideration.",
  },
  {
    id: "new_adult_onset",
    severity: "review",
    title: "New curve appearing in adulthood",
    observation:
      "You've mentioned this curve appeared after you'd finished growing.",
    why:
      "A curve that appears in adulthood is assessed differently from one that developed during growth.",
    action: "Worth raising with a clinician if you haven't already.",
    provenance:
      "De novo adult scoliosis has a different differential and management pathway from adolescent idiopathic scoliosis.",
  },
];

const RULES_BY_ID = new Map(RED_FLAG_RULES.map((r) => [r.id, r]));

export function getRedFlagRule(id: string): RedFlagRule | undefined {
  return RULES_BY_ID.get(id);
}

// ─────────────────────────── Screening questions ───────────────────────────
//
// Phrased so a "yes" is always the answer that raises a flag. Mixing polarity
// is how screening instruments end up with false negatives from people
// answering quickly.

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  {
    id: "bladder_bowel_change",
    prompt: "Have you noticed any change in bladder or bowel control?",
    help: "Including needing to go far more urgently, or not being able to tell when you need to.",
    flagIds: ["cauda_equina"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "saddle_numbness",
    prompt: "Any numbness or pins and needles around your sit-bones or inner thighs?",
    flagIds: ["cauda_equina"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "leg_weakness_progressing",
    prompt: "Has weakness in your legs been getting worse recently?",
    help: "Things like your foot catching on steps, or a leg giving way.",
    flagIds: ["progressive_neuro_deficit"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "night_pain",
    prompt: "Does back pain wake you at night and stay when you change position?",
    flagIds: ["night_pain_unrelieved"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "fever_or_weight_loss",
    prompt: "Any fever, or weight loss you can't account for?",
    flagIds: ["systemic_illness"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "cancer_history",
    prompt: "Have you ever been treated for cancer?",
    flagIds: ["cancer_history"],
    askAt: ["onboarding"],
  },
  {
    id: "recent_trauma",
    prompt: "Did this pain start after a fall or an accident?",
    flagIds: ["significant_trauma"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "rapid_change",
    prompt: "Has your curve changed noticeably in the last few months?",
    flagIds: ["rapid_progression"],
    askAt: ["onboarding", "ongoing"],
  },
  {
    id: "adult_onset",
    prompt: "Did your curve first appear after you'd finished growing?",
    flagIds: ["new_adult_onset"],
    askAt: ["onboarding"],
  },
];

export function questionsFor(
  stage: "onboarding" | "ongoing",
): ScreeningQuestion[] {
  return SCREENING_QUESTIONS.filter((q) => q.askAt.includes(stage));
}

// ────────────────────────────── Evaluation ──────────────────────────────

export type TriageInput = {
  answers?: ScreeningAnswers;
  // Curve context, used only for the atypical-pattern rule.
  profile?: {
    primaryCurveApex?: string | null;
    primaryConvexSide?: string | null;
    ageYears?: number | null;
  } | null;
};

const SEVERITY_ORDER = { emergency: 3, urgent: 2, review: 1 } as const;

export function triage(input: TriageInput): TriageResult {
  const hits: FlagHit[] = [];
  const seen = new Set<string>();

  const answers = input.answers ?? {};
  for (const q of SCREENING_QUESTIONS) {
    if (answers[q.id] !== true) continue;
    for (const flagId of q.flagIds) {
      if (seen.has(flagId)) continue;
      const rule = RULES_BY_ID.get(flagId);
      if (!rule) continue;
      seen.add(flagId);
      hits.push({ rule, triggeredBy: q.id });
    }
  }

  // Left thoracic curve in a skeletally immature patient. Derived rather than
  // asked, because the user already gave us the curve pattern at onboarding
  // and asking them to self-assess "is my pattern unusual" would be absurd.
  const p = input.profile;
  if (
    p &&
    !seen.has("atypical_curve_pattern") &&
    typeof p.ageYears === "number" &&
    p.ageYears < 18 &&
    p.primaryConvexSide === "left" &&
    (p.primaryCurveApex ?? "").toLowerCase().includes("thoracic")
  ) {
    const rule = RULES_BY_ID.get("atypical_curve_pattern");
    if (rule) {
      seen.add(rule.id);
      hits.push({
        rule,
        triggeredBy: "derived:curve_pattern",
        detail: `Left-convex ${p.primaryCurveApex} curve, age ${p.ageYears}`,
      });
    }
  }

  hits.sort(
    (a, b) => SEVERITY_ORDER[b.rule.severity] - SEVERITY_ORDER[a.rule.severity],
  );

  const severity = hits.length ? hits[0].rule.severity : null;
  return {
    hits,
    severity,
    blocksSession: severity === "emergency",
    reducesSession: severity === "urgent",
  };
}

// A plain-text summary the user can hand to a clinician. Deliberately states
// what was self-reported rather than asserting anything clinical.
export function handoffSummary(
  result: TriageResult,
  opts: { name?: string | null; when?: string } = {},
): string {
  if (!result.hits.length) return "";
  const lines: string[] = [];
  lines.push("Self-reported symptom screen — Balance");
  if (opts.name) lines.push(`Name: ${opts.name}`);
  if (opts.when) lines.push(`Date: ${opts.when}`);
  lines.push("");
  lines.push(
    "The following were reported by the user in a home exercise app. These are self-reported answers to a screening questionnaire, not clinical findings, and have not been examined or verified.",
  );
  lines.push("");
  for (const h of result.hits) {
    lines.push(`[${h.rule.severity.toUpperCase()}] ${h.rule.title}`);
    lines.push(`  Reported: ${h.rule.observation}`);
    if (h.detail) lines.push(`  Detail: ${h.detail}`);
    lines.push(`  Basis: ${h.rule.provenance}`);
    lines.push("");
  }
  return lines.join("\n");
}
