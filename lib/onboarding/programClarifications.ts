// Ambiguities the parser flagged in a physio's programme must be answered,
// or the exercise left out, before the programme is used.
//
// In physio_cleared mode the parsed programme is the prescription: what it
// says is what the user is coached through. An ambiguity left unanswered
// ("side plank, bad side"; "the one with the ball") becomes an instruction
// nobody gave. So onboarding cannot continue with one outstanding.

import type { ParsedProgram } from "@/lib/prompts/parseProgram";

// Indices of flagged exercises that have no answer yet.
export function unresolvedAmbiguities(
  parsed: ParsedProgram | null,
  clarifications: Record<number, string>,
): number[] {
  if (!parsed) return [];
  return parsed.exercises
    .map((e, i) => (e.ambiguities?.length > 0 && !clarifications[i]?.trim() ? i : -1))
    .filter((i) => i >= 0);
}

// Remove one exercise and keep the remaining answers attached to the right
// exercises: clarifications are keyed by index, so later ones shift down.
export function leaveOut(
  parsed: ParsedProgram,
  clarifications: Record<number, string>,
  idx: number,
): { parsed: ParsedProgram; clarifications: Record<number, string> } {
  const exercises = parsed.exercises.filter((_, i) => i !== idx);
  const next: Record<number, string> = {};
  for (const [k, v] of Object.entries(clarifications)) {
    const i = Number(k);
    if (i < idx) next[i] = v;
    else if (i > idx) next[i - 1] = v;
  }
  return { parsed: { ...parsed, exercises }, clarifications: next };
}
