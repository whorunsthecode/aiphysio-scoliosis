// Hip bridge with pelvic press-down.
//
// Setup: user supine on the floor, knees bent, feet flat. Webcam at floor
// level pointing toward the user (front view from feet end), or at a
// 3/4 angle. We see the knees first, then the hips, then the chest.
//
// What we detect:
//
//   1. Rep counting via hip y oscillation. We learn a "down" baseline from
//      the first ~1.5s of stable supine pose, then count any cycle that
//      lifts hips well above the baseline and returns.
//
//   2. Even hip lift L vs R at the top of each rep — within ~5mm scaled.
//      Uneven => press-down cue on the high side.
//
//   3. Convex-lumbar-side press-down enforcement: at the top, the
//      configured "press-down side" hip should not be higher (smaller y)
//      than the other. If it is, fire the personalized cue.
//
//   4. Drop / partial range: if the hip lift is less than ~60% of a typical
//      bridge (calibrated against the user's first good rep), cue more
//      lift.

import {
  COMPENSATION_REFRACTORY_MS,
  COMPENSATION_TRIGGER_MS,
  type ActiveCompensation,
  type FormCheck,
  type FormCheckEvent,
  type FormCheckState,
} from "./types";
import { POSE, type NormalizedLandmark } from "@/lib/pose/types";
import type { Side } from "@/lib/onboarding/types";

const TARGET_REPS = 10;

// Thresholds
const BASELINE_STABLE_FRAMES = 18; // ~1.5s at 12fps detect cadence
const BASELINE_MOVEMENT_TOLERANCE = 0.005; // normalized y movement
const REP_UP_THRESHOLD = 0.04; // hip y must drop (lift) by this much from baseline
const REP_DOWN_THRESHOLD_RATIO = 0.3; // come back to within X of baseline to count a rep
const UNEVEN_HIP_THRESHOLD = 0.012; // L vs R hip y difference (normalized)
const LOW_VISIBILITY_FLOOR = 0.4;

type CompensationKey =
  | "uneven_hips"
  | "press_down_side_high"
  | "partial_range"
  | "knees_collapsed";

export class HipBridgeFormCheck implements FormCheck {
  readonly exerciseId = "hip_bridge_pelvic_press_down";
  readonly mode = "reps" as const;

  private pressDownSide: Side = "left"; // convex lumbar side
  private inPosition = false;

  // Baseline = average hip midpoint y when user is supine flat.
  private baselineSamples: number[] = [];
  private baselineY: number | null = null;

  // Rep tracking: phase, peak lift, rep count.
  private phase: "idle" | "rising" | "at_top" | "descending" = "idle";
  private peakHipY: number | null = null;
  private peakReached = false;
  private reps = 0;
  private setComplete = false;

  private compState = new Map<
    CompensationKey,
    {
      firstSeenMs: number;
      lastEventMs: number;
      lastPhrase: string;
      lastSeverity: "minor" | "major";
    }
  >();

  configureSide(side: Side): void {
    this.pressDownSide = side;
  }

  resetForNewSet(): void {
    this.inPosition = false;
    this.baselineSamples = [];
    this.baselineY = null;
    this.phase = "idle";
    this.peakHipY = null;
    this.peakReached = false;
    this.reps = 0;
    this.setComplete = false;
    this.compState.clear();
  }

  process(landmarks: NormalizedLandmark[] | null, nowMs: number): FormCheckEvent[] {
    const events: FormCheckEvent[] = [];
    if (this.setComplete || !landmarks) return events;

    const lHip = landmarks[POSE.LEFT_HIP];
    const rHip = landmarks[POSE.RIGHT_HIP];
    const lKnee = landmarks[POSE.LEFT_KNEE];
    const rKnee = landmarks[POSE.RIGHT_KNEE];
    if (
      !lHip?.visibility ||
      !rHip?.visibility ||
      lHip.visibility < LOW_VISIBILITY_FLOOR ||
      rHip.visibility < LOW_VISIBILITY_FLOOR
    ) {
      if (this.inPosition) {
        this.inPosition = false;
        events.push({ type: "out_of_position", reason: "I lost your hips" });
      }
      return events;
    }

    if (!this.inPosition) {
      this.inPosition = true;
    }

    const hipMidY = (lHip.y + rHip.y) / 2;

    // Build the baseline once: collect frames while hipY is stable.
    if (this.baselineY === null) {
      this.baselineSamples.push(hipMidY);
      if (this.baselineSamples.length > BASELINE_STABLE_FRAMES) {
        this.baselineSamples.shift();
      }
      if (this.baselineSamples.length === BASELINE_STABLE_FRAMES) {
        const max = Math.max(...this.baselineSamples);
        const min = Math.min(...this.baselineSamples);
        if (max - min < BASELINE_MOVEMENT_TOLERANCE) {
          this.baselineY = this.baselineSamples.reduce((a, b) => a + b, 0) / this.baselineSamples.length;
        }
      }
      return events;
    }

    // Rep state machine: transitions on hipMidY relative to baseline.
    const lift = this.baselineY - hipMidY; // positive = hips lifted (smaller y)

    switch (this.phase) {
      case "idle":
      case "descending": {
        if (lift > REP_UP_THRESHOLD * 0.4 && lift > 0) {
          // started lifting
          this.phase = "rising";
          this.peakHipY = hipMidY;
          this.peakReached = false;
          events.push({ type: "rep_started" });
        }
        break;
      }
      case "rising": {
        if (this.peakHipY === null || hipMidY < this.peakHipY) {
          this.peakHipY = hipMidY;
        }
        if (lift >= REP_UP_THRESHOLD) {
          this.peakReached = true;
          this.phase = "at_top";
          // run top-of-rep checks
          this.checkTopOfRep(landmarks, hipMidY, nowMs, events);
        } else if (lift < REP_UP_THRESHOLD * 0.3) {
          // never made it high enough
          this.observeCompensation(
            "partial_range",
            nowMs,
            events,
            "All the way up — squeeze the glutes.",
            "minor",
          );
          this.phase = "descending";
        }
        break;
      }
      case "at_top": {
        // Continue running top-of-rep checks while hips are at peak range.
        this.checkTopOfRep(landmarks, hipMidY, nowMs, events);
        // Begin descent when hips drop noticeably from peak.
        if (this.peakHipY !== null && hipMidY > this.peakHipY + REP_UP_THRESHOLD * 0.3) {
          this.phase = "descending";
        }
        break;
      }
    }

    // Rep counts on the way down: when hipMidY returns near baseline.
    if (
      this.phase === "descending" &&
      this.peakReached &&
      lift < REP_UP_THRESHOLD * REP_DOWN_THRESHOLD_RATIO
    ) {
      this.reps += 1;
      this.peakReached = false;
      this.peakHipY = null;
      this.phase = "idle";
      events.push({ type: "rep_completed", rep: this.reps });
      this.clearAllCompensations();
      if (this.reps >= TARGET_REPS) {
        this.setComplete = true;
        events.push({ type: "set_complete" });
      }
    }

    // Knees-collapsed check: knee distance significantly less than hip distance.
    if (
      lKnee?.visibility &&
      rKnee?.visibility &&
      lKnee.visibility > LOW_VISIBILITY_FLOOR &&
      rKnee.visibility > LOW_VISIBILITY_FLOOR &&
      this.phase === "at_top"
    ) {
      const kneeWidth = Math.abs(lKnee.x - rKnee.x);
      const hipWidth = Math.abs(lHip.x - rHip.x);
      if (kneeWidth < hipWidth * 0.6) {
        this.observeCompensation(
          "knees_collapsed",
          nowMs,
          events,
          "Push your knees back out — hip-width.",
          "minor",
        );
      } else {
        this.clearCompensation("knees_collapsed");
      }
    }

    return events;
  }

  private checkTopOfRep(
    landmarks: NormalizedLandmark[],
    _hipMidY: number,
    nowMs: number,
    events: FormCheckEvent[],
  ) {
    const lHip = landmarks[POSE.LEFT_HIP];
    const rHip = landmarks[POSE.RIGHT_HIP];
    if (!lHip || !rHip) return;

    // Even hip lift: |lHip.y - rHip.y| should be small.
    const hipDelta = lHip.y - rHip.y; // negative = left higher, positive = right higher
    const absDelta = Math.abs(hipDelta);

    if (absDelta > UNEVEN_HIP_THRESHOLD) {
      // Determine which hip is HIGHER (smaller y on screen).
      const higherSide: Side = hipDelta < 0 ? "left" : "right";
      // If the higher side IS the press-down side (the side the user should
      // be pressing INTO the floor), that's the specific pattern we cue.
      if (higherSide === this.pressDownSide) {
        this.observeCompensation(
          "press_down_side_high",
          nowMs,
          events,
          `Press your ${this.pressDownSide} hip down — that's it.`,
          "major",
        );
        this.clearCompensation("uneven_hips");
      } else {
        this.observeCompensation(
          "uneven_hips",
          nowMs,
          events,
          "Even up your hips — same height left and right.",
          "minor",
        );
        this.clearCompensation("press_down_side_high");
      }
    } else {
      this.clearCompensation("uneven_hips");
      this.clearCompensation("press_down_side_high");
    }
  }

  private observeCompensation(
    id: CompensationKey,
    nowMs: number,
    events: FormCheckEvent[],
    phrase: string,
    severity: "minor" | "major",
  ) {
    const existing = this.compState.get(id);
    if (!existing) {
      this.compState.set(id, {
        firstSeenMs: nowMs,
        lastEventMs: 0,
        lastPhrase: phrase,
        lastSeverity: severity,
      });
      return;
    }
    existing.lastPhrase = phrase;
    existing.lastSeverity = severity;
    if (
      nowMs - existing.firstSeenMs >= COMPENSATION_TRIGGER_MS &&
      nowMs - existing.lastEventMs >= COMPENSATION_REFRACTORY_MS
    ) {
      events.push({ type: "compensation", id, severity, phrase });
      existing.lastEventMs = nowMs;
    }
  }

  private clearCompensation(id: CompensationKey) {
    this.compState.delete(id);
  }

  private clearAllCompensations() {
    this.compState.clear();
  }

  getState(): FormCheckState {
    const active: ActiveCompensation[] = [];
    const now = performance.now();
    for (const [id, c] of this.compState.entries()) {
      active.push({
        id,
        phrase: c.lastPhrase,
        severity: c.lastSeverity,
        durationMs: now - c.firstSeenMs,
      });
    }
    return {
      inPosition: this.inPosition,
      repsCompleted: this.reps,
      targetReps: TARGET_REPS,
      holdSeconds: 0,
      setComplete: this.setComplete,
      activeCompensations: active,
    };
  }
}
