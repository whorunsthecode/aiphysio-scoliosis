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
// This is a pre-filter, not the screen, and it is not clinically validated.
// It leans over-inclusive (a false positive costs one "see someone" reply; a
// false negative costs far more), but a filter that fires on "a wee bit
// stiff" or "pain 2/10" teaches people to ignore it, so ordinary words are
// only matched in the context that makes them a symptom.
//
// Measured against a synthetic, AI-written set in
// scripts/checks/prefilter-eval.ts. Any change here should be run against it
// and reviewed by a clinician before it ships.

export type PrefilterHit = {
  // Rule id from lib/safety/redFlags.ts, or a chat-only trigger id
  // (chest_pain, self_harm, radiating_or_neuro_symptoms,
  // severe_or_new_intense_pain).
  ruleId: string;
  // The phrase that matched, for the log.
  matched: string;
  // Whether this warrants same-day or emergency care (the reply says so).
  emergency: boolean;
};

type Matcher = RegExp | ((text: string) => { index: number; text: string } | null);

type Trigger = {
  ruleId: string;
  emergency: boolean;
  patterns: Matcher[];
  // Self-harm language is answered even when negated ("i'm not going to kill
  // myself, but…"): talking about it at all warrants the support reply.
  ignoreNegation?: boolean;
};

// Severe-pain threshold on a 0–10 scale. Unchanged from the previous pattern,
// which fired on 8, 9 and 10. Needs clinical review: selectProgram already
// treats 7 as "skip exercises that load this region".
export const SEVERE_PAIN_SCORE = 8;

// Body parts that make a sensation word ("numb", "tingling", "burning",
// "can't feel") a physical symptom rather than a mood. Without one of these in
// the same clause, "I feel numb about work" is not a red flag.
const BODY =
  "legs?|foot|feet|toes?|ankles?|calf|calves|shins?|knees?|thighs?|hips?|bum|buttocks?|butt|groin|arms?|hands?|fingers?|wrists?|elbows?|shoulders?|neck|back|spine|face|lips?|chin|cheeks?";

// The saddle region, as the screening question words it (sit-bones, inner
// thighs) plus the anatomical terms people use for it.
const SADDLE = "saddle|sit[- ]?bones?|inner thighs?|groin|between (?:my|the) legs|perineum|genitals?";

const SENSATION = "numb\\w*|tingl\\w*|pins and needles|no feeling|can'?t feel|cannot feel|burning (?:pain|sensation|feeling)";

// One clause: stops at sentence punctuation so a body word in the next
// sentence ("burning the midnight oil, back's fine") does not count.
const CLAUSE = "[^,.;!?]";

function clauseRe(a: string, b: string, span = 40): RegExp {
  return new RegExp(`\\b(?:${a})\\b${CLAUSE}{0,${span}}\\b(?:${b})\\b|\\b(?:${b})\\b${CLAUSE}{0,${span}}\\b(?:${a})\\b`, "i");
}

// Units that turn a number into a count, not a pain score: "10 reps",
// "8 sets", "10 minutes".
const COUNT_UNIT =
  /^\s*(?:x\b|reps?\b|sets?\b|times\b|mins?\b|minutes?\b|secs?\b|seconds?\b|hours?\b|hrs?\b|days?\b|kg\b|lbs?\b|am\b|pm\b|%|:|\.\d)/i;

// Returns the pain score the message reports, or null. An explicit "N/10" or
// "N out of 10" wins, and the highest one counts. Otherwise a number directly
// after a pain word ("pain 9", "back's at a 9", "pain level 8"), unless a
// count unit follows it.
export function painScore(text: string): number | null {
  const explicit = [...text.matchAll(/\b(\d{1,2})\s*(?:\/|out of)\s*10\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 0 && n <= 10);
  if (explicit.length) return Math.max(...explicit);

  const ctx =
    /\b(?:pain|back|neck|hip|ache|it|level|score)(?:'s)?\s+(?:(?:is|was|at|of|level|score|about|around|like|a|an|maybe)\s+)*(\d{1,2})\b/gi;
  for (const m of text.matchAll(ctx)) {
    const n = Number(m[1]);
    const after = text.slice((m.index ?? 0) + m[0].length);
    if (n > 10 || COUNT_UNIT.test(after)) continue;
    return n;
  }
  return null;
}

function severeScore(text: string): { index: number; text: string } | null {
  const s = painScore(text);
  if (s === null || s < SEVERE_PAIN_SCORE) return null;
  return { index: 0, text: `pain score ${s}` };
}

const TRIGGERS: Trigger[] = [
  {
    ruleId: "self_harm",
    emergency: true,
    ignoreNegation: true,
    patterns: [
      /\bsuicid\w*/i,
      /\bself[- ]?harm\w*/i,
      /\bkill(?:ing)?\s+myself\b(?!\s+laughing)/i,
      /\b(?:end|ending|take|taking)\s+(?:my\s+(?:own\s+)?life|it all)\b/i,
      /\b(?:want|wanna|wanting|wish|going)\s+(?:to\s+)?(?:die|be dead)\b/i,
      /\bwish\s+i\s+(?:was|were)\s+dead\b/i,
      /\b(?:don'?t|do not|no longer)\s+want\s+to\s+(?:be\s+(?:alive|here)|live|exist|wake up)\b/i,
      /\b(?:no|don'?t see the|what'?s the)\s+point\s+(?:in\s+)?(?:living|being alive|going on)\b/i,
      /\bbetter off (?:without me|dead|if i (?:was|were) (?:gone|dead))\b/i,
      // "hurt/harm/cut/burn myself" is self-harm only with intent or
      // repetition; "I hurt myself doing lunges" is an injury.
      /\b(?:want\w*|wanna|going to|gonna|think\w* (?:about|of)|urges?|tempted|feel like|keep|started|again)\b[^.;!?]{0,25}\b(?:hurt\w*|harm\w*|cut\w*|burn\w*)\s+myself\b/i,
      /\b(?:hurt\w*|harm\w*|cut\w*|burn\w*)\s+myself\s+(?:again|on purpose|deliberately)\b/i,
    ],
  },
  {
    ruleId: "chest_pain",
    emergency: true,
    patterns: [
      /\bchest\b[^,.;!?]{0,25}\b(?:pains?|hurts?|hurting|ach\w*|tight\w*|pressure|crush\w*|squeez\w*|heav\w*)\b/i,
      // "pain in my chest", "pain in the middle of my chest",
      // "tightness on the left side of my chest".
      /\b(?:pains?|tight\w*|pressure|crush\w*|squeez\w*|heav\w*|ach\w*)\b[^,.;!?]{0,25}\b(?:in|on|across|around|at)\s+(?:the\s+\w+(?:\s+\w+)?\s+of\s+)?(?:my|the)\s+chest\b/i,
      /\bheart attack\b/i,
    ],
  },
  {
    ruleId: "cauda_equina",
    emergency: true,
    patterns: [
      /\b(?:bladder|bowels?|incontinen(?:t|ce))\b/i,
      /\b(?:leak\w*|pass\w*|lost|losing)\b[^,.;!?]{0,20}\b(?:urine|stools?)\b/i,
      /\b(?:can'?t|cannot|couldn'?t|unable to|trouble|difficult(?:y)?|struggl\w*|hard to)\s+(?:to\s+)?(?:pee\w*|wee(?:ing)?|poo\w*|empty|go to the (?:toilet|loo|bathroom))\b/i,
      /\b(?:pee'?d|peeing|wee'?d|weeing|poo'?d|pooed|pooped|pooping|wet|wetting|soil(?:ed|ing))\s+(?:myself|my\s+(?:pants|trousers|knickers|underwear)|the bed)\b/i,
      /\b(?:can'?t|cannot|don'?t|didn'?t)\s+(?:tell|feel|know|notice)\s+when\s+i\s+(?:need|have)\s+to\s+(?:pee|wee|poo|go)\b/i,
      /\b(?:pee\w*|wee(?:ing)?)\b[^,.;!?]{0,20}\b(?:all the time|a lot more|more than usual|constantly|urgent\w*)\b/i,
      clauseRe(SADDLE, SENSATION),
    ],
  },
  {
    ruleId: "progressive_neuro_deficit",
    emergency: true,
    patterns: [
      /\b(?:can'?t|cannot|couldn'?t)\s+(?:feel|move)\s+(?:my\s+)?(?:legs?|feet|foot)\b/i,
      /\b(?:legs?|foot|feet)\b.*\b(?:giv(?:e|ing) (?:way|out)|buckl|drag(?:ging)?|catching|weaker|weakness|getting weak)/i,
      /\b(?:weak(?:ness)?|weaker)\b.*\b(?:legs?|feet|foot)\b/i,
      /\b(?:foot|feet)\s*drop\b/i,
      /\b(?:trouble|hard|difficult(?:y)?|struggl\w*)\s+(?:to\s+)?walk(?:ing)?\b/i,
      /\b(?:can'?t|cannot|unable to)\s+(?:lift|raise)\s+(?:my\s+)?(?:(?:left|right)\s+)?(?:leg|foot|feet|toes)\b/i,
    ],
  },
  {
    ruleId: "radiating_or_neuro_symptoms",
    emergency: false,
    patterns: [
      new RegExp(
        `\\b(?:shoot\\w*|radiat\\w*|travel\\w*|run\\w*|going|goes|spread\\w*)\\s+(?:pain\\s+)?(?:down|into)\\b${CLAUSE}{0,30}\\b(?:${BODY})\\b`,
        "i",
      ),
      clauseRe(SENSATION, BODY),
      /\bpins and needles\b/i,
      /\bsciatic\w*/i,
    ],
  },
  {
    ruleId: "night_pain_unrelieved",
    emergency: false,
    patterns: [
      /\b(?:wakes? me|woke me|waking me|can'?t sleep (?:because of|because|from|with|for) (?:the )?pain|pain (?:at|in the) night)\b/i,
    ],
  },
  {
    ruleId: "systemic_illness",
    emergency: false,
    patterns: [
      /\b(?:fever|feverish|temperature of|chills|night sweats)\b/i,
      /\b(?:los(?:t|ing)|dropp(?:ed|ing))\b[^,.;!?]{0,15}\bweight\b/i,
      /\bweight loss\b/i,
    ],
  },
  {
    ruleId: "significant_trauma",
    emergency: false,
    patterns: [
      /\b(?:fell|fall|falling)\b(?!\s+(?:asleep|behind|for|apart|short|out of|off the wagon|in love))/i,
      /\b(?:crash|accident|hit by|knocked|tackled|car (?:crash|accident))\b/i,
    ],
  },
  {
    ruleId: "neuro_axis_soft_signs",
    emergency: false,
    patterns: [
      /\bheadache\b.*\b(?:cough|sneez|strain|bend)/i,
      /\b(?:cough|sneez|strain)\w*\b.*\bheadache/i,
      /\bhands?\b.*\b(?:clumsy|dropping things|weak|numb)/i,
    ],
  },
  {
    ruleId: "severe_or_new_intense_pain",
    emergency: false,
    patterns: [
      /\b(?:sharp|stabbing|excruciating|unbearable|agony|agonising|agonizing|worst pain)\b/i,
      severeScore,
    ],
  },
];

// Negations that turn a match into a non-match. Kept tiny and conservative:
// "no numbness" should pass; "not sure if it's numb" should still flag.
const NEGATED = /\b(?:no|not|never|without|isn'?t|aren'?t|haven'?t|hasn'?t|don'?t have)\s+(?:any\s+)?(?:more\s+)?$/i;

function isNegated(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 24), index);
  return NEGATED.test(before);
}

function run(m: Matcher, text: string): { index: number; text: string } | null {
  if (typeof m === "function") return m(text);
  const r = m.exec(text);
  return r ? { index: r.index, text: r[0] } : null;
}

export function prefilterRedFlags(raw: string): PrefilterHit[] {
  const text = raw.replace(/[’‘]/g, "'");
  const hits: PrefilterHit[] = [];
  for (const t of TRIGGERS) {
    for (const p of t.patterns) {
      const m = run(p, text);
      if (!m) continue;
      if (!t.ignoreNegation && isNegated(text, m.index)) continue;
      hits.push({ ruleId: t.ruleId, matched: m.text, emergency: t.emergency });
      break;
    }
  }
  return hits.sort((a, b) => Number(b.emergency) - Number(a.emergency));
}

// ─────────────────────────────── Replies ───────────────────────────────
//
// Fixed text. No model involved, so it cannot drift, cannot append an
// exercise, and cannot be talked out of.
//
// REVIEW REQUIRED: the self-harm and chest-pain replies are new (October
// 2026) and have not been reviewed by a clinician. They point to emergency
// help and nothing else. A verified Hong Kong crisis line should be added to
// the self-harm reply before any real user sees it; none is included because
// a wrong number is worse than none.

export type SafetyReplyKind = "self_harm" | "chest_pain" | "emergency" | "urgent";

export function safetyReplyKind(hits: PrefilterHit[]): SafetyReplyKind {
  if (hits.some((h) => h.ruleId === "self_harm")) return "self_harm";
  if (hits.some((h) => h.ruleId === "chest_pain")) return "chest_pain";
  if (hits.some((h) => h.emergency)) return "emergency";
  return "urgent";
}

export function safetyReplyFor(hits: PrefilterHit[]): string {
  switch (safetyReplyKind(hits)) {
    case "self_harm":
      return (
        "I'm really glad you told me. This is more than I can help with, and you deserve support from a person right now. " +
        "If you might act on these thoughts or you don't feel safe, call 999 now (or your local emergency number if you're outside Hong Kong), or go to the nearest emergency department. " +
        "If you can, tell someone you trust how you're feeling and stay with them. I've logged this message."
      );
    case "chest_pain":
      return (
        "Chest pain needs to be checked straight away. " +
        "Call 999 now (or your local emergency number if you're outside Hong Kong), or go to the nearest emergency department. " +
        "I've logged this, and I won't suggest any exercise."
      );
    case "emergency":
      return (
        "that's a today thing, not a stretch-it-out thing. " +
        "changes in bladder or bowel control, numbness around your sit-bones, or legs that are getting weaker need someone to look at you today — an emergency department if it's getting worse, your doctor if not. " +
        "i've logged what you said so it's in your notes. no exercises from me until you've been seen."
      );
    case "urgent":
      return (
        "that sounds like a see-someone day, not a stretch-it-out day. " +
        "what you're describing isn't something to push through — message your physio or doctor if you can. " +
        "i've logged this so it's in your notes, and i'm not going to suggest movement on top of it."
      );
  }
}
