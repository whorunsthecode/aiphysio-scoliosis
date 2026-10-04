// Two rules that were advisory and are now enforced in code.
//
//   npx tsx scripts/checks/onboarding-and-nudges.ts
//
// 1. A physio programme with unanswered ambiguities cannot be carried
//    forward from onboarding; each flagged item is answered or left out.
// 2. Companion does not send the same nudge twice within 48 hours.

import { readFileSync } from "node:fs";
import { leaveOut, unresolvedAmbiguities } from "@/lib/onboarding/programClarifications";
import { isRepeatNudge, similarity } from "@/lib/agents/nudgeRepeat";
import type { ParsedProgram } from "@/lib/prompts/parseProgram";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

const ex = (name: string, ambiguities: string[] = []): ParsedProgram["exercises"][number] => ({
  source_text: name,
  library_match_id: null,
  is_custom: true,
  name,
  description: "",
  asymmetric_cues: null,
  physio_specific_cues: [],
  reps: null,
  sets: null,
  duration_seconds: null,
  frequency: null,
  ambiguities,
});

console.log("\nprogramme clarifications\n");
{
  const parsed: ParsedProgram = {
    exercises: [ex("Bridge"), ex("Side plank", ["which side?"]), ex("Ball thing", ["which exercise?"]), ex("Breathing")],
    lifestyle_notes: [],
    parse_note: "",
  };
  check("two flagged items are outstanding", JSON.stringify(unresolvedAmbiguities(parsed, {})) === "[1,2]", "");
  check(
    "a blank answer does not count",
    JSON.stringify(unresolvedAmbiguities(parsed, { 1: "   " })) === "[1,2]",
    "",
  );
  check(
    "answering both clears the gate",
    unresolvedAmbiguities(parsed, { 1: "right side down", 2: "the swiss ball squat" }).length === 0,
    "",
  );
  const out = leaveOut(parsed, { 1: "right side down", 3: "4 breaths" }, 2);
  check(
    "leaving one out removes it and keeps later answers on the right exercise",
    out.parsed.exercises.map((e) => e.name).join(",") === "Bridge,Side plank,Breathing" &&
      out.clarifications[1] === "right side down" &&
      out.clarifications[2] === "4 breaths" &&
      out.clarifications[3] === undefined,
    JSON.stringify(out),
  );
  check(
    "after leaving out the unanswered item, nothing is outstanding",
    unresolvedAmbiguities(out.parsed, out.clarifications).length === 0,
    "",
  );

  const step = readFileSync("components/onboarding/steps/ProgramStep.tsx", "utf8");
  check(
    "the programme step blocks Continue while anything is outstanding",
    /unresolvedAmbiguities\(/.test(step) && /nextDisabled=\{[^}]*unresolved/.test(step),
    "ProgramStep must gate on unresolvedAmbiguities",
  );
}

console.log("\nno repeat nudge within 48 hours\n");
{
  const now = Date.parse("2026-10-04T10:00:00Z");
  const sent = [
    { message_text: "Morning Karmen — did the hip-flexor stretch end up happening yesterday?", sent_at: "2026-10-03T01:00:00Z" },
    { message_text: "Five sessions this week. How are you feeling?", sent_at: "2026-10-01T01:00:00Z" },
  ];
  check(
    "the same nudge with {name} instead of the name is a repeat",
    isRepeatNudge("Morning {name} — did the hip-flexor stretch end up happening yesterday?", sent, now, "Karmen"),
    `similarity ${similarity("Morning {name} — did the hip-flexor stretch end up happening yesterday?", sent[0].message_text, "Karmen").toFixed(2)}`,
  );
  check(
    "a light rewording is still a repeat",
    isRepeatNudge("Morning {name} - did the hip flexor stretch happen yesterday?", sent, now, "Karmen"),
    `similarity ${similarity("Morning {name} - did the hip flexor stretch happen yesterday?", sent[0].message_text, "Karmen").toFixed(2)}`,
  );
  check(
    "a different nudge is not a repeat",
    !isRepeatNudge("How's the back after the long flight?", sent, now, "Karmen"),
    "",
  );
  check(
    "the same nudge outside 48 hours is allowed",
    !isRepeatNudge("Five sessions this week. How are you feeling?", sent, now, "Karmen"),
    "sent 81 hours earlier",
  );

  const route = readFileSync("app/api/agents/companion/route.ts", "utf8");
  check(
    "Companion checks for a repeat before delivering",
    /isRepeatNudge\(/.test(route) && route.indexOf("isRepeatNudge(") < route.indexOf("await deliver("),
    "the rule must be enforced before deliver()",
  );
}

console.log(failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
