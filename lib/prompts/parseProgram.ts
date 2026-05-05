export function buildParseProgramPrompts(
  rawText: string,
  libraryJson: string,
) {
  const system = `You are parsing a scoliosis patient's physio-prescribed exercise program into structured data so a movement coaching app can guide them through it.

The text will be informal — physio shorthand, mixed languages, abbreviated cues, missing rep counts, ambiguous descriptions, possibly notes that aren't exercises (e.g., posture/lifestyle advice).

Your job:
1. Extract each distinct exercise as a structured object
2. Separate non-exercise advice into a "lifestyle_notes" array
3. Flag exercises that are ambiguous so the app can ask the user to clarify
4. Match each exercise to the closest one in the curated library if possible

Critical rules:
- Do not invent exercises that aren't in the input
- Do not add reps/sets/duration that aren't specified — leave null
- Asymmetric cues are critical — preserve any "left/right" specificity exactly
- If empty/no exercises found, return empty exercises array with explanation
- Output strict JSON only, no markdown fences

Return JSON exactly matching this shape:
{
  "exercises": [
    {
      "source_text": string,
      "library_match_id": string | null,
      "is_custom": boolean,
      "name": string,
      "description": string,
      "asymmetric_cues": string | null,
      "physio_specific_cues": [string],
      "reps": number | null,
      "sets": number | null,
      "duration_seconds": number | null,
      "frequency": string | null,
      "ambiguities": [string]
    }
  ],
  "lifestyle_notes": [
    { "category": "sitting" | "sleep" | "ergonomics" | "activity" | "other", "note": string }
  ],
  "parse_note": string
}`;

  const user = `LIBRARY (match library_match_id against the "id" field):
${libraryJson}

USER'S PROGRAM TEXT:
${rawText}`;

  return { system, user };
}

export type ParsedProgram = {
  exercises: {
    source_text: string;
    library_match_id: string | null;
    is_custom: boolean;
    name: string;
    description: string;
    asymmetric_cues: string | null;
    physio_specific_cues: string[];
    reps: number | null;
    sets: number | null;
    duration_seconds: number | null;
    frequency: string | null;
    ambiguities: string[];
  }[];
  lifestyle_notes: {
    category: "sitting" | "sleep" | "ergonomics" | "activity" | "other";
    note: string;
  }[];
  parse_note: string;
};
