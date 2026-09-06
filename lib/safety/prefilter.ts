// Deterministic red-flag pre-filter for free-text messages.
//
// The chat model's system prompt has a "safety floor" that tells it to stop
// and call flag_safety on certain symptoms. A prompt is not a guarantee: a
// model under a 600-token budget, mid-tool-call, can and occasionally will
// answer "try cat-cow" to "can't feel my legs". So the same triggers are
// matched here first, in code, before the model sees the message. On a hit
// the model is not consulted at all — a fixed template goes back, and the
// message is logged as a safety flag.
//
// This is a pre-filter, not the screen. It is deliberately over-inclusive
// (a false positive costs one "see someone" reply; a false negative costs
// far more) and it maps onto the same rule ids the questionnaire feeds, so
// the flag lands in the same place a screening "yes" would.

export type PrefilterHit = {
  // Rule id from lib/safety/redFlags.ts, or a chat-only trigger id.
  ruleId: string;
  // The phrase that matched, for the log.
  matched: string;
  // Whether this warrants same-day care (the reply says so).
  emergency: boolean;
};

type Trigger = { ruleId: string; emergency: boolean; patterns: RegExp[] };

const TRIGGERS: Trigger[] = [
  {
    ruleId: "cauda_equina",
    emergency: true,
    patterns: [
      /\b(bladder|bowel|wee|pee|poo|incontinen|leak(ing|ed)?\s+(urine|wee|pee))\b/i,
      /\b(can'?t|cannot|couldn'?t|unable to)\s+(pee|wee|go to the toilet|empty)/i,
      /\b(saddle|sit[- ]?bones?|inner thighs?|groin|between (my|the) legs)\b.*\b(numb\w*|tingl\w*|pins|dead|no feeling)/i,
      /\b(numb\w*|tingl\w*|pins|dead|no feeling)\b.*\b(saddle|sit[- ]?bones?|inner thighs?|groin|between (my|the) legs)/i,
    ],
  },
  {
    ruleId: "progressive_neuro_deficit",
    emergency: true,
    patterns: [
      /\b(can'?t|cannot|couldn'?t)\s+(feel|move)\s+(my\s+)?(legs?|feet|foot)\b/i,
      /\b(legs?|foot|feet)\b.*\b(giv(e|ing) (way|out)|buckl|drag(ging)?|catching|weaker|weakness|getting weak)/i,
      /\b(weak(ness)?|weaker)\b.*\b(legs?|feet|foot)\b/i,
      /\b(foot|feet)\s*drop\b/i,
      /\b(trouble|hard|difficult(y)?)\s+walking\b/i,
    ],
  },
  {
    ruleId: "radiating_or_neuro_symptoms",
    emergency: false,
    patterns: [
      /\b(shoot(ing|s)?|radiat(ing|es)?|travel(ling|s)?|runs?|going)\s+(pain\s+)?(down|into)\s+(my\s+)?((left|right|both|one)\s+)?(leg|legs|foot|feet|arm|arms|hand|hands|calf|thigh|buttock|bum)\b/i,
      /\b(numb(ness)?|tingl(ing|es|y)|pins and needles|burning|can'?t feel)\b/i,
      /\bsciatic/i,
    ],
  },
  {
    ruleId: "night_pain_unrelieved",
    emergency: false,
    patterns: [
      /\b(wakes? me|woke me|waking me|can'?t sleep (because|from|with) (the )?pain|pain (at|in the) night)\b/i,
    ],
  },
  {
    ruleId: "systemic_illness",
    emergency: false,
    patterns: [
      /\b(fever|feverish|temperature of|chills|night sweats)\b/i,
      /\b(los(t|ing) weight|weight loss)\b/i,
    ],
  },
  {
    ruleId: "significant_trauma",
    emergency: false,
    patterns: [
      /\b(fell|fall|crash|accident|hit by|knocked|tackled|car (crash|accident))\b/i,
    ],
  },
  {
    ruleId: "neuro_axis_soft_signs",
    emergency: false,
    patterns: [
      /\bheadache\b.*\b(cough|sneez|strain|bend)/i,
      /\b(cough|sneez|strain)\w*\b.*\bheadache/i,
      /\bhands?\b.*\b(clumsy|dropping things|weak|numb)/i,
    ],
  },
  {
    ruleId: "severe_or_new_intense_pain",
    emergency: false,
    patterns: [
      /\b(sharp|stabbing|excruciating|unbearable|agony|agonising|agonizing|worst pain)\b/i,
      /\b(10|9|8)\s*(\/|out of)\s*10\b/i,
      /\bpain\b.*\b(10|9|8)\b/i,
    ],
  },
];

// Negations that turn a match into a non-match. Kept tiny and conservative:
// "no numbness" should pass; "not sure if it's numb" should still flag.
const NEGATED = /\b(no|not|never|without|isn'?t|aren'?t|haven'?t|hasn'?t|don'?t have)\s+(any\s+)?(more\s+)?$/i;

function isNegated(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 24), index);
  return NEGATED.test(before);
}

export function prefilterRedFlags(text: string): PrefilterHit[] {
  const hits: PrefilterHit[] = [];
  const seen = new Set<string>();
  for (const t of TRIGGERS) {
    for (const p of t.patterns) {
      const m = p.exec(text);
      if (!m) continue;
      if (isNegated(text, m.index)) continue;
      if (seen.has(t.ruleId)) break;
      seen.add(t.ruleId);
      hits.push({ ruleId: t.ruleId, matched: m[0], emergency: t.emergency });
      break;
    }
  }
  return hits.sort((a, b) => Number(b.emergency) - Number(a.emergency));
}

// The fixed reply. No model involved, so it cannot drift, cannot append an
// exercise, and cannot be talked out of. Deliberately in the companion's
// voice — a safety stop should not read like a legal notice.
export function safetyReplyFor(hits: PrefilterHit[]): string {
  const emergency = hits.some((h) => h.emergency);
  if (emergency) {
    return (
      "that's a today thing, not a stretch-it-out thing. " +
      "changes in bladder or bowel control, numbness around your sit-bones, or legs that are getting weaker need someone to look at you today — an emergency department if it's getting worse, your doctor if not. " +
      "i've logged what you said so it's in your notes. no exercises from me until you've been seen."
    );
  }
  return (
    "that sounds like a see-someone day, not a stretch-it-out day. " +
    "what you're describing isn't something to push through — message your physio or doctor if you can. " +
    "i've logged this so it's in your notes, and i'm not going to suggest movement on top of it."
  );
}
