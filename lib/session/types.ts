// Session state — owned by the orchestrator at /session.

import type { PostureSnapshot } from "@/lib/pose/stats";
import type { SessionSummary } from "@/components/exercise/ExerciseCoach";
import type { PainPoint } from "@/lib/onboarding/types";
import type { SelectionResult } from "@/lib/exercises/selectProgram";

export type SessionPhase =
  | "preparing"
  // The short ongoing red-flag screen, asked every session. The onboarding
  // answers are deliberately not held in the browser, and symptoms change;
  // an emergency answer here ends the session before any scan or exercise.
  | "safety_check"
  | "pain_check"
  | "initial_scan"
  | "program_preview"
  | "exercise"
  | "final_scan"
  | "complete";

export type SessionState = {
  id: string;
  startedAt: number;
  completedAt: number | null;
  phase: SessionPhase;
  pain: PainPoint[];
  initialScan: PostureSnapshot | null;
  finalScan: PostureSnapshot | null;
  program: SelectionResult | null;
  currentExerciseIdx: number;
  exerciseSummaries: SessionSummary[];
};

export const SESSION_PHASES: { id: SessionPhase; title: string }[] = [
  { id: "safety_check", title: "Quick safety check" },
  { id: "pain_check", title: "How you feel" },
  { id: "initial_scan", title: "Today's check-in" },
  { id: "program_preview", title: "Today's exercises" },
  { id: "exercise", title: "Practice" },
  { id: "final_scan", title: "One more check" },
  { id: "complete", title: "Done" },
];
