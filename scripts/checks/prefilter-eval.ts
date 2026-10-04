// Evaluation set for the chat red-flag pre-filter (lib/safety/prefilter.ts).
//
//   npx tsx scripts/checks/prefilter-eval.ts             full report
//   npx tsx scripts/checks/prefilter-eval.ts --dev-only  hide held-out and blind results
//   npx tsx scripts/checks/prefilter-eval.ts --gate      report, exit 1 on regression
//   npx tsx scripts/checks/prefilter-eval.ts --verbose   list every miss, all splits
//   PREFILTER_MODULE=/abs/path/prefilter.ts npx tsx …    score another version
//
// Every message below is SYNTHETIC and AI-written. None comes from a user,
// and none has been reviewed by a clinician. The set measures whether the
// patterns do what they claim on plausible phrasing; it is not evidence that
// the pre-filter is clinically adequate.
//
// Three splits:
//   dev       two thirds of `cases` (index not ≡ 2 mod 3). Patterns were
//             tuned against these.
//   held-out  the remaining third of `cases`. Not tuned against, but their
//             failures were visible once, in the report on the version before
//             the October 2026 fix, so they are not fully blind.
//   blind     `blind` below. Written before any pattern was changed and not
//             looked at until the fix was finished. The most honest estimate
//             of how the patterns generalise to new phrasing.
//
// Scoring:
//   positive case  "correct" the expected rule fired
//                  "fired"   any rule fired, so the model was bypassed
//                  "urgent"  for emergency subtypes, the emergency reply was chosen
//   negative case  a false positive is any rule firing at all

type Expect = { rule: string; emergency: boolean };
type Subtype = {
  name: string;
  expect: Expect | null; // null = negative subtype, nothing should fire
  cases: string[];
  blind: string[];
};

const SUBTYPES: Subtype[] = [
  // ───────────────────────────── positives ─────────────────────────────
  {
    name: "chest_pain",
    expect: { rule: "chest_pain", emergency: true },
    cases: [
      "my chest hurts and it's spreading to my left arm",
      "tight crushing feeling in my chest since this morning",
      "chest pain when i was doing the bird dog",
      "pain in the middle of my chest, feels heavy",
      "having chest pains on and off today",
      "chest feels really tight and i'm short of breath",
    ],
    blind: [
      "pressure on my chest that won't go away",
      "sharp pain in my chest when i breathe in",
      "my chest is aching and my jaw hurts too",
    ],
  },
  {
    name: "self_harm",
    expect: { rule: "self_harm", emergency: true },
    cases: [
      "honestly i want to kill myself",
      "i've been thinking about ending my life",
      "i don't want to be alive anymore",
      "i keep wanting to hurt myself",
      "been self harming again",
      "everyone would be better off without me",
      "thinking about suicide a lot lately",
      "i just want to end it all",
      "i've started cutting myself again",
    ],
    blind: [
      "i want to die",
      "i'm going to hurt myself tonight",
      "i don't see the point in living anymore",
      "thinking of taking my own life",
    ],
  },
  {
    name: "bladder_bowel",
    expect: { rule: "cauda_equina", emergency: true },
    cases: [
      "having some incontinence since yesterday",
      "my bowels aren't working right and my back is killing me",
      "trouble peeing since this morning",
      "i peed myself a bit when i bent over",
      "can't tell when i need to wee anymore",
      "bladder feels weird since the weekend",
      "wet myself on the way home, never happened before",
      "lost control of my bowels this morning",
    ],
    blind: [
      "can't empty my bladder properly",
      "my bowel habits have changed and my back aches",
      "keep leaking urine since monday",
      "i can't feel when i need to pee",
    ],
  },
  {
    name: "saddle_numbness",
    expect: { rule: "cauda_equina", emergency: true },
    cases: [
      "numb around my bum and inner thighs",
      "pins and needles in my groin area",
      "can't feel anything between my legs when i wipe",
    ],
    blind: [
      "my bum has gone numb on both sides",
      "numbness around my sit bones and down my thighs",
    ],
  },
  {
    name: "leg_weakness",
    expect: { rule: "progressive_neuro_deficit", emergency: true },
    cases: [
      "my left leg keeps giving way on the stairs",
      "foot keeps catching and dragging when i walk",
      "legs getting weaker every day this week",
      "struggling to walk properly since tuesday",
      "can't lift my right foot up properly",
    ],
    blind: [
      "both legs feel weak and wobbly",
      "my knee keeps buckling and it's getting worse",
    ],
  },
  {
    name: "radiating_numbness",
    expect: { rule: "radiating_or_neuro_symptoms", emergency: false },
    cases: [
      "pain shooting down the back of my leg",
      "tingling in my toes on the right side",
      "my left hand has gone numb",
      "burning pain running down into my calf",
      "sciatica is flaring up badly",
      "numbness in my foot after the lunges",
    ],
    blind: [
      "pins and needles down my right arm",
      "numb patch on the outside of my thigh",
    ],
  },
  {
    name: "night_pain",
    expect: { rule: "night_pain_unrelieved", emergency: false },
    cases: [
      "the pain wakes me up every night",
      "can't sleep because of the pain, nothing helps",
      "it woke me at 3am again and moving didn't help",
    ],
    blind: ["the pain keeps waking me up and won't settle"],
  },
  {
    name: "systemic",
    expect: { rule: "systemic_illness", emergency: false },
    cases: [
      "running a fever and my back is aching",
      "lost a lot of weight without trying",
      "night sweats and back pain this week",
    ],
    blind: ["had chills and a temperature with this back pain"],
  },
  {
    name: "trauma",
    expect: { rule: "significant_trauma", emergency: false },
    cases: [
      "fell down the stairs and now my back hurts",
      "got tackled at football and landed on my back",
      "car accident last week, back has been sore since",
    ],
    blind: ["slipped and fell on the ice, landed on my back"],
  },
  {
    name: "neuro_axis",
    expect: { rule: "neuro_axis_soft_signs", emergency: false },
    cases: [
      "headache gets much worse when i sneeze",
      "my hands feel clumsy, keep dropping things",
      "headache every time i strain on the toilet",
    ],
    blind: ["coughing makes my headache so much worse"],
  },
  {
    name: "severe_pain_score",
    expect: { rule: "severe_or_new_intense_pain", emergency: false },
    cases: [
      "pain is 9/10 today",
      "back is at 8 out of 10",
      "excruciating pain in my lower back",
      "worst pain i've ever had",
      "my back pain is at a 9 today",
      "unbearable pain when i stand up",
    ],
    blind: ["my back is a 10 out of 10 right now", "pain level 8 today"],
  },

  // ───────────────────────────── negatives ─────────────────────────────
  {
    name: "neg_wee_pee_benign",
    expect: null,
    cases: [
      "a wee bit stiff this morning",
      "need a quick pee break then i'll finish the set",
      "did a wee walk after lunch",
      "brb toilet then bridges",
    ],
    blind: ["had a wee lie-in this morning"],
  },
  {
    name: "neg_low_pain_score",
    expect: null,
    cases: [
      "pain 2/10 today, pretty good",
      "back pain is about a 3",
      "pain was 1 out of 10 after the session",
      "neck pain 4/10, the usual",
      "pain down to 2 from 5 yesterday",
    ],
    blind: ["pain 3/10 after the walk", "back pain 1/10 and 10 minutes of walking"],
  },
  {
    name: "neg_reps_and_counts",
    expect: null,
    cases: [
      "back pain was fine, did 10 reps of bridges",
      "pain-free, managed 3x10 bird dogs",
      "held the plank for 8 sets of 10 seconds with no pain",
      "a bit of pain at the start, then 10 easy reps",
    ],
    blind: ["did 9 reps then stopped, no pain"],
  },
  {
    name: "neg_figurative_numb",
    expect: null,
    cases: [
      "i feel numb about work stuff",
      "my brain is numb from all the meetings",
      "can't feel motivated today",
      "tingling with excitement for the trip",
      "burning the midnight oil, back's fine",
    ],
    blind: ["my mind feels numb today"],
  },
  {
    name: "neg_chest_benign",
    expect: null,
    cases: [
      "chest stretch felt amazing",
      "did chest press at the gym, back felt fine",
      "opening up my chest with the doorway stretch",
    ],
    blind: ["chest day at the gym, back held up well"],
  },
  {
    name: "neg_slang",
    expect: null,
    cases: [
      "this plank is killing me lol",
      "i'm dying to try the new routine",
      "dead tired after work",
      "i hurt myself doing lunges, knee's sore",
      "killed it at the gym today",
      "my back is killing me but the stretches help",
    ],
    blind: ["this routine is killing me in a good way"],
  },
  {
    name: "neg_fell_benign",
    expect: null,
    cases: [
      "fell asleep on the sofa, neck is stiff",
      "fell behind on my exercises this week",
      "i've fallen out of the routine",
    ],
    blind: ["fell for the new stretch routine"],
  },
  {
    name: "neg_everyday",
    expect: null,
    cases: [
      "neck stiff, hip keeps cracking on the right",
      "did the bridge 3x10",
      "feel okay actually",
      "no numbness today, just stiff",
      "back's at 4, the usual ache",
      "shoulders tight after a long day at my desk",
      "what should i do for my hips today",
      "slept badly but no pain",
      "the side plank felt easier on the right",
      "my physio said to keep going with the breathing",
    ],
    blind: ["my legs are tired after the hike"],
  },
];

type Split = "dev" | "heldout" | "blind";
const SPLITS: Split[] = ["dev", "heldout", "blind"];

type Hit = { ruleId: string; emergency: boolean };
type Prefilter = (text: string) => Hit[];

type Tally = { n: number; fired: number; correct: number; urgent: number; fp: number };
const empty = (): Tally => ({ n: 0, fired: 0, correct: 0, urgent: 0, fp: 0 });
const perSplit = (): Record<Split, Tally> => ({ dev: empty(), heldout: empty(), blind: empty() });

async function loadPrefilter(): Promise<Prefilter> {
  const path = process.env.PREFILTER_MODULE;
  const mod = path ? await import(path) : await import("../../lib/safety/prefilter");
  return mod.prefilterRedFlags as Prefilter;
}

const frac = (a: number, b: number) => (b === 0 ? "—" : `${a}/${b}`).padStart(6);

// Floors and ceilings the current version must hold across all three
// splits. Raise them when the pre-filter improves; a change that falls below
// them fails `npm run check`.
const GATE = {
  positiveCorrectMin: 75, // of 78 positive cases
  emergencyUrgentMin: 43, // of 46 emergency-subtype cases
  falsePositiveMax: 0, // of 49 negative cases
};

async function main() {
  const prefilter = await loadPrefilter();
  const gate = process.argv.includes("--gate");
  const verbose = process.argv.includes("--verbose");
  const devOnly = process.argv.includes("--dev-only");
  const shown = (s: Split) => !devOnly || s === "dev";

  const bySub = new Map<string, Record<Split, Tally>>();
  const pos = perSplit();
  const neg = perSplit();
  const misses: string[] = [];

  for (const sub of SUBTYPES) {
    const rec = perSplit();
    const items: [string, Split][] = [
      ...sub.cases.map((t, i): [string, Split] => [t, i % 3 === 2 ? "heldout" : "dev"]),
      ...sub.blind.map((t): [string, Split] => [t, "blind"]),
    ];
    for (const [text, split] of items) {
      const hits = prefilter(text);
      const t = rec[split];
      t.n++;
      const report = verbose || (split === "dev" && !gate);
      if (sub.expect) {
        const fired = hits.length > 0;
        const correct = hits.some((h) => h.ruleId === sub.expect!.rule);
        const urgent = hits.some((h) => h.emergency);
        t.fired += +fired;
        t.correct += +correct;
        t.urgent += +urgent;
        pos[split].n++;
        pos[split].fired += +fired;
        pos[split].correct += +correct;
        if (sub.expect.emergency) pos[split].urgent += +urgent;
        if (!correct && report) {
          misses.push(`  MISS  [${split}] ${sub.name}: "${text}" → ${JSON.stringify(hits.map((h) => h.ruleId))}`);
        } else if (correct && sub.expect.emergency && !urgent && report) {
          misses.push(`  SOFT  [${split}] ${sub.name}: "${text}" → right rule, not the emergency reply`);
        }
      } else {
        const fp = hits.length > 0;
        t.fp += +fp;
        neg[split].n++;
        neg[split].fp += +fp;
        if (fp && report) {
          misses.push(`  FP    [${split}] ${sub.name}: "${text}" → ${JSON.stringify(hits.map((h) => h.ruleId))}`);
        }
      }
    }
    bySub.set(sub.name, rec);
  }

  const cols = (f: (t: Tally) => string, r: Record<Split, Tally>) =>
    SPLITS.map((s) => (shown(s) ? f(r[s]) : "     …")).join(" ");

  console.log(`\nchat pre-filter evaluation${process.env.PREFILTER_MODULE ? ` · ${process.env.PREFILTER_MODULE.split("/").pop()}` : ""}`);
  console.log("synthetic, AI-written messages; columns are dev / held-out / blind\n");
  console.log("positives                correct rule           emergency reply");
  for (const sub of SUBTYPES.filter((s) => s.expect)) {
    const r = bySub.get(sub.name)!;
    const em = sub.expect!.emergency
      ? cols((t) => frac(t.urgent, t.n), r)
      : "   n/a";
    console.log(`  ${sub.name.padEnd(21)} ${cols((t) => frac(t.correct, t.n), r)}   ${em}`);
  }
  console.log("\nnegatives                false positives");
  for (const sub of SUBTYPES.filter((s) => !s.expect)) {
    const r = bySub.get(sub.name)!;
    console.log(`  ${sub.name.padEnd(21)} ${cols((t) => frac(t.fp, t.n), r)}`);
  }

  const sum = (r: Record<Split, Tally>, k: keyof Tally) => SPLITS.reduce((a, s) => a + r[s][k], 0);
  const emN = SUBTYPES.filter((s) => s.expect?.emergency).reduce(
    (a, s) => a + s.cases.length + s.blind.length,
    0,
  );
  const posAll = sum(pos, "correct");
  const urgentAll = sum(pos, "urgent");
  const fpAll = sum(neg, "fp");

  console.log("\ntotals                   dev     held-out  blind     all");
  const line = (label: string, a: (s: Split) => string, all: string) =>
    console.log(`  ${label.padEnd(22)} ${SPLITS.map((s) => (shown(s) ? a(s) : "     …")).join("    ")}    ${devOnly ? "     …" : all}`);
  line("recall, correct rule", (s) => frac(pos[s].correct, pos[s].n), frac(posAll, sum(pos, "n")));
  line("recall, fired at all", (s) => frac(pos[s].fired, pos[s].n), frac(sum(pos, "fired"), sum(pos, "n")));
  line("false positives", (s) => frac(neg[s].fp, neg[s].n), frac(fpAll, sum(neg, "n")));
  if (!devOnly) console.log(`  emergency reply chosen on emergency subtypes: ${urgentAll}/${emN}`);

  if (misses.length) {
    console.log(`\n${verbose ? "every miss" : "dev misses (held-out and blind hidden; --verbose shows them)"}`);
    for (const m of misses) console.log(m);
  }

  if (gate) {
    const failures: string[] = [];
    if (posAll < GATE.positiveCorrectMin) failures.push(`recall ${posAll} < floor ${GATE.positiveCorrectMin}`);
    if (urgentAll < GATE.emergencyUrgentMin) failures.push(`emergency replies ${urgentAll} < floor ${GATE.emergencyUrgentMin}`);
    if (fpAll > GATE.falsePositiveMax) failures.push(`false positives ${fpAll} > ceiling ${GATE.falsePositiveMax}`);
    if (failures.length) {
      console.log(`\n  FAIL  pre-filter regressed: ${failures.join("; ")}\n`);
      process.exit(1);
    }
    console.log(
      `\n  PASS  pre-filter holds its floors (recall ≥ ${GATE.positiveCorrectMin}, emergency ≥ ${GATE.emergencyUrgentMin}, false positives ≤ ${GATE.falsePositiveMax})`,
    );
  }
  console.log("");
}

void main();

// A module, not a global script: other check files also declare main().
export {};
