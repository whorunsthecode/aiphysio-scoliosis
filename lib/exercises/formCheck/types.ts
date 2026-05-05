// Form-check stateful detectors. Each exercise gets its own implementation
// of `FormCheck` — the coach calls `process(landmarks, now)` once per frame
// and acts on the returned events. The detector owns its own internal state
// (rep counter, position state, compensation timers).

import type { NormalizedLandmark } from "@/lib/pose/types";
import type { Side } from "@/lib/onboarding/types";

export type CompensationSeverity = "minor" | "major";

export type FormCheckEvent =
  | { type: "rep_started" }
  | { type: "rep_completed"; rep: number }
  | { type: "hold_started" }
  | { type: "hold_progress"; secondsHeld: number }
  | { type: "hold_lost"; reason: string }
  | { type: "set_complete" }
  | {
      type: "compensation";
      id: string;
      severity: CompensationSeverity;
      phrase: string;
    }
  | { type: "form_excellent" }
  | { type: "out_of_position"; reason: string };

export type FormCheckState = {
  inPosition: boolean;
  // Reps-based exercises
  repsCompleted: number;
  targetReps?: number;
  // Hold-based exercises
  holdSeconds: number;
  targetHoldSeconds?: number;
  setComplete: boolean;
  // Live compensation snapshots — { id, phrase, durationMs, severity }
  activeCompensations: ActiveCompensation[];
};

export type ActiveCompensation = {
  id: string;
  phrase: string;
  severity: CompensationSeverity;
  durationMs: number;
};

export interface FormCheck {
  readonly exerciseId: string;
  readonly mode: "reps" | "hold";

  // Configure side per the user's curve pattern. Some exercises (side plank)
  // require a specific side; the coach checks contraindications before
  // calling this. Others can be no-op.
  configureSide(side: Side): void;

  // Per-frame: returns events that occurred this frame. Side effects
  // (rep counter increment, hold time accumulation) update internal state.
  process(landmarks: NormalizedLandmark[] | null, nowMs: number): FormCheckEvent[];

  // Snapshot for UI rendering (cheap; called every render).
  getState(): FormCheckState;

  // Reset internal state for a new set.
  resetForNewSet(): void;
}

// Compensation timing rules per spec:
//   trigger when a compensation persists for >= 2s
//   suppress repeat firings of same id for 5s after last trigger
export const COMPENSATION_TRIGGER_MS = 2_000;
export const COMPENSATION_REFRACTORY_MS = 5_000;

// Voice scheduler rules (max 1 spoken correction per 5s, prioritize highest
// severity / most recent).
export const VOICE_THROTTLE_MS = 5_000;
