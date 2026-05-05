// Lunge with pelvic tilt + back-leg tip-toe.
//
// Detection (front-three-quarter view assumed):
//   - stance: which leg is forward (ankle.x significantly different from
//     hip.x in either direction, vs the other leg behind the hip)
//   - rep counting: hip y oscillation (descend → ascend = 1 rep)
//   - front knee tracking: at the bottom, front knee.x should be over front
//     ankle.x (within tolerance); collapsing inside ankle is the key warning
//   - hip drop: lateral hip differential > threshold at the bottom
//
// Pelvic tilt is hard to see from webcam alone — out of scope for v1.

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

const TARGET_REPS = 5;
const VISIBILITY_FLOOR = 0.4;
const STANCE_X_OFFSET_NORM = 0.06; // foot in front of hip
const REP_DESCENT_THRESHOLD_NORM = 0.05; // hip drop from standing baseline
const KNEE_COLLAPSE_THRESHOLD_NORM = 0.04; // knee inside ankle
const UNEVEN_HIP_THRESHOLD = 0.025;
const BASELINE_STABLE_FRAMES = 18;
const BASELINE_MOVEMENT_TOLERANCE = 0.005;

type CompensationKey = "knee_collapse_in" | "hip_drop_at_bottom";
type Phase = "idle" | "descending" | "at_bottom" | "ascending";

export class LungeFormCheck implements FormCheck {
  readonly exerciseId = "lunge_pelvic_tilt_back_leg_tiptoe";
  readonly mode = "reps" as const;

  // Lunge alternates per side; configuredSide is informational only.
  private cueSide: Side | null = null;

  private inPosition = false;
  private baselineSamples: number[] = [];
  private baselineY: number | null = null;

  private phase: Phase = "idle";
  private peakDescent = 0;
  private reps = 0;
  private setComplete = false;
  private frontLeg: Side | null = null; // detected at start of descent

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
    this.cueSide = side;
  }

  resetForNewSet(): void {
    this.inPosition = false;
    this.baselineSamples = [];
    this.baselineY = null;
    this.phase = "idle";
    this.peakDescent = 0;
    this.reps = 0;
    this.setComplete = false;
    this.frontLeg = null;
    this.compState.clear();
  }

  process(landmarks: NormalizedLandmark[] | null, nowMs: number): FormCheckEvent[] {
    const events: FormCheckEvent[] = [];
    if (this.setComplete || !landmarks) return events;

    const lHip = landmarks[POSE.LEFT_HIP];
    const rHip = landmarks[POSE.RIGHT_HIP];
    const lKnee = landmarks[POSE.LEFT_KNEE];
    const rKnee = landmarks[POSE.RIGHT_KNEE];
    const lAnkle = landmarks[POSE.LEFT_ANKLE];
    const rAnkle = landmarks[POSE.RIGHT_ANKLE];

    if (
      !lHip?.visibility ||
      !rHip?.visibility ||
      lHip.visibility < VISIBILITY_FLOOR ||
      rHip.visibility < VISIBILITY_FLOOR
    ) {
      if (this.inPosition) {
        this.inPosition = false;
        events.push({ type: "out_of_position", reason: "I lost your hips" });
      }
      return events;
    }

    this.inPosition = true;
    const hipMidY = (lHip.y + rHip.y) / 2;
    const hipMidX = (lHip.x + rHip.x) / 2;

    // Build baseline standing position once.
    if (this.baselineY === null) {
      this.baselineSamples.push(hipMidY);
      if (this.baselineSamples.length > BASELINE_STABLE_FRAMES) {
        this.baselineSamples.shift();
      }
      if (this.baselineSamples.length === BASELINE_STABLE_FRAMES) {
        const max = Math.max(...this.baselineSamples);
        const min = Math.min(...this.baselineSamples);
        if (max - min < BASELINE_MOVEMENT_TOLERANCE) {
          this.baselineY = this.baselineSamples.reduce((a, b) => a + b, 0) /
            this.baselineSamples.length;
        }
      }
      return events;
    }

    const descent = hipMidY - this.baselineY;

    // Detect front leg from ankle.x at bottom of lunge.
    const detectFrontLeg = (): Side | null => {
      if (!lAnkle?.visibility || !rAnkle?.visibility) return null;
      const lOffset = lAnkle.x - hipMidX;
      const rOffset = rAnkle.x - hipMidX;
      if (Math.abs(lOffset - rOffset) < STANCE_X_OFFSET_NORM) return null;
      // The leg whose ankle is furthest from hip in any direction (front).
      // Convention: front leg is the more-displaced one.
      if (Math.abs(lOffset) > Math.abs(rOffset)) return "left";
      return "right";
    };

    switch (this.phase) {
      case "idle":
      case "ascending": {
        if (descent > REP_DESCENT_THRESHOLD_NORM * 0.4) {
          this.phase = "descending";
          this.peakDescent = descent;
          this.frontLeg = detectFrontLeg();
          events.push({ type: "rep_started" });
        }
        break;
      }
      case "descending": {
        if (descent > this.peakDescent) this.peakDescent = descent;
        if (descent >= REP_DESCENT_THRESHOLD_NORM) {
          this.phase = "at_bottom";
          this.frontLeg = this.frontLeg ?? detectFrontLeg();
          this.checkBottomForm(
            landmarks,
            lHip,
            rHip,
            lKnee,
            rKnee,
            lAnkle,
            rAnkle,
            nowMs,
            events,
          );
        } else if (descent < REP_DESCENT_THRESHOLD_NORM * 0.2) {
          // gave up — back to idle
          this.phase = "idle";
        }
        break;
      }
      case "at_bottom": {
        if (descent < this.peakDescent - REP_DESCENT_THRESHOLD_NORM * 0.3) {
          // started ascending
          this.phase = "ascending";
        } else {
          this.checkBottomForm(
            landmarks,
            lHip,
            rHip,
            lKnee,
            rKnee,
            lAnkle,
            rAnkle,
            nowMs,
            events,
          );
        }
        break;
      }
    }

    if (
      this.phase === "ascending" &&
      descent < REP_DESCENT_THRESHOLD_NORM * 0.2
    ) {
      this.reps += 1;
      this.peakDescent = 0;
      this.frontLeg = null;
      this.phase = "idle";
      this.compState.clear();
      events.push({ type: "rep_completed", rep: this.reps });
      if (this.reps >= TARGET_REPS) {
        this.setComplete = true;
        events.push({ type: "set_complete" });
      }
    }

    return events;
  }

  private checkBottomForm(
    _lms: NormalizedLandmark[],
    lHip: NormalizedLandmark,
    rHip: NormalizedLandmark,
    lKnee: NormalizedLandmark | undefined,
    rKnee: NormalizedLandmark | undefined,
    lAnkle: NormalizedLandmark | undefined,
    rAnkle: NormalizedLandmark | undefined,
    nowMs: number,
    events: FormCheckEvent[],
  ) {
    // Hip drop at bottom — uneven L vs R hip y.
    const hipDelta = Math.abs(lHip.y - rHip.y);
    if (hipDelta > UNEVEN_HIP_THRESHOLD) {
      this.observeCompensation(
        "hip_drop_at_bottom",
        nowMs,
        events,
        "Lift the dropping hip — even pelvis at the bottom.",
        "minor",
      );
    } else {
      this.clearCompensation("hip_drop_at_bottom");
    }

    // Front knee tracking: knee.x should be roughly over ankle.x.
    if (
      this.frontLeg &&
      lKnee?.visibility &&
      rKnee?.visibility &&
      lAnkle?.visibility &&
      rAnkle?.visibility &&
      lKnee.visibility > VISIBILITY_FLOOR &&
      rKnee.visibility > VISIBILITY_FLOOR
    ) {
      const knee = this.frontLeg === "left" ? lKnee : rKnee;
      const ankle = this.frontLeg === "left" ? lAnkle : rAnkle;
      const collapseInward =
        this.frontLeg === "left"
          ? knee.x - ankle.x > KNEE_COLLAPSE_THRESHOLD_NORM
          : ankle.x - knee.x > KNEE_COLLAPSE_THRESHOLD_NORM;
      if (collapseInward) {
        this.observeCompensation(
          "knee_collapse_in",
          nowMs,
          events,
          "Push your front knee out — track over the ankle.",
          "major",
        );
      } else {
        this.clearCompensation("knee_collapse_in");
      }
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
