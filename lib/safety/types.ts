// Red-flag screening types.
//
// A red flag is a symptom pattern that means "this is outside what a movement
// coach should be handling." The app never names a condition and never offers
// a diagnosis — it says what it noticed, why that is worth a clinician's time,
// and what to do next.
//
// Three tiers, ordered by how fast someone needs to act:
//
//   emergency — same-day assessment. Also blocks the exercise session; it is
//               not appropriate to coach someone through movement while these
//               are present.
//   urgent    — a clinician within days. Session continues, prominently
//               flagged, and the day's programme is reduced to gentle work.
//   review    — raise it at the next appointment. Nothing is blocked.
//
// Wording is deliberately plain. "Numbness around your sit-bones or inner
// thighs" beats "saddle anaesthesia" for a fourteen-year-old at 10pm.

export type FlagSeverity = "emergency" | "urgent" | "review";

export type ScreeningAnswers = Record<string, boolean | undefined>;

export type ScreeningQuestion = {
  id: string;
  // Asked in the first person, as the user would describe it.
  prompt: string;
  // Shown under the prompt when the phrasing needs grounding.
  help?: string;
  // Which flag this question feeds. One question may feed several.
  flagIds: string[];
  // Screening questions are asked at onboarding; symptom questions are also
  // offered as an ongoing "something changed" check.
  askAt: ("onboarding" | "ongoing")[];
};

export type RedFlagRule = {
  id: string;
  severity: FlagSeverity;
  // Internal label. Never shown to the user.
  title: string;
  // What the app tells the user it noticed. No condition names.
  observation: string;
  // Why it warrants attention, in one sentence, without alarming language.
  why: string;
  // The concrete next step.
  action: string;
  // Where the rule comes from, so a clinician reviewing the ruleset can
  // check it and so the reasoning is auditable.
  provenance: string;
};

export type FlagHit = {
  rule: RedFlagRule;
  // What triggered it — a screening answer id, or a derived signal.
  triggeredBy: string;
  // Free-text detail for the shareable summary, when the trigger carries one.
  detail?: string;
};

export type TriageResult = {
  hits: FlagHit[];
  // Highest severity present, or null when nothing fired.
  severity: FlagSeverity | null;
  // True when the exercise session must not proceed.
  blocksSession: boolean;
  // True when the programme should be reduced rather than blocked.
  reducesSession: boolean;
};
