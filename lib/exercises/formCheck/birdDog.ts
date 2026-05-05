// Bird-dog with asymmetric hold.
//
// Setup: hands and knees, neutral spine. User extends opposite arm + leg
// (e.g. left arm + right leg), holds, returns. Per the curve pattern, one
// side gets a longer hold — the side whose extension lengthens the user's
// concave thoracic side.
//
// Detection (conservative — bird-dog is hard from a single webcam):
//   - phase: at_rest (4-pt) → extending → holding → returning → at_rest
//   - active side: by which wrist+ankle pair is most displaced from torso
//   - hip drop: y-difference between L hip and R hip during extension
//   - spine rotation: hip-line vs shoulder-line angle mismatch
//   - cued-side hold timer: only counts toward "long hold" when extending
//     the configured (concave-thoracic) side
//
// Reps: 8 per side per spec; we count a rep on each return-to-rest.

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

const TARGET_REPS = 8;
const VISIBILITY_FLOOR = 0.4;
const EXTEND_THRESHOLD_NORM = 0.10; // wrist+ankle displacement from rest position
const RETURN_THRESHOLD_NORM = 0.04;
const UNEVEN_HIP_THRESHOLD = 0.018;
const SPINE_ROTATION_RATIO = 0.25; // ratio between shoulder-line angle and hip-line angle

type CompensationKey = "hip_drop" | "spine_rotation" | "wrong_side";

type Phase = "at_rest" | "extending" | "holding" | "returning";
type ActiveSide = "left_arm_right_leg" | "right_arm_left_leg" | null;

export class BirdDogFormCheck implements FormCheck {
  readonly exerciseId = "bird_dog_asymmetric_hold";
  readonly mode = "reps" as const;

  // The concave-thoracic side (= side whose ARM should extend for the long hold).
  // E.g. right_thoracic curve → concave LEFT → cuedArmSide="left".
  private cuedArmSide: Side = "left";

  private phase: Phase = "at_rest";
  private activeSide: ActiveSide = null;
  private holdStartedAtMs: number | null = null;
  private lastHoldDurationMs = 0;
  private inPosition = false;
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
    this.cuedArmSide = side;
  }

  resetForNewSet(): void {
    this.phase = "at_rest";
    this.activeSide = null;
    this.holdStartedAtMs = null;
    this.lastHoldDurationMs = 0;
    this.inPosition = false;
    this.reps = 0;
    this.setComplete = false;
    this.compState.clear();
  }

  process(landmarks: NormalizedLandmark[] | null, nowMs: number): FormCheckEvent[] {
    const events: FormCheckEvent[] = [];
    if (this.setComplete || !landmarks) return events;

    const lShoulder = landmarks[POSE.LEFT_SHOULDER];
    const rShoulder = landmarks[POSE.RIGHT_SHOULDER];
    const lHip = landmarks[POSE.LEFT_HIP];
    const rHip = landmarks[POSE.RIGHT_HIP];
    const lWrist = landmarks[POSE.LEFT_WRIST];
    const rWrist = landmarks[POSE.RIGHT_WRIST];
    const lAnkle = landmarks[POSE.LEFT_ANKLE];
    const rAnkle = landmarks[POSE.RIGHT_ANKLE];

    if (
      !lShoulder?.visibility ||
      !rShoulder?.visibility ||
      !lHip?.visibility ||
      !rHip?.visibility ||
      lShoulder.visibility < VISIBILITY_FLOOR ||
      rShoulder.visibility < VISIBILITY_FLOOR ||
      lHip.visibility < VISIBILITY_FLOOR ||
      rHip.visibility < VISIBILITY_FLOOR
    ) {
      if (this.inPosition) {
        this.inPosition = false;
        events.push({ type: "out_of_position", reason: "I lost your torso" });
      }
      return events;
    }

    this.inPosition = true;
    const shoulderMid = midpoint(lShoulder, rShoulder);
    const hipMid = midpoint(lHip, rHip);
    const torsoLength = Math.max(0.05, dist(shoulderMid, hipMid));

    // "Displacement" of wrists from shoulders + ankles from hips, normalized
    // by torso length so it's scale-invariant.
    const lWristDisp =
      lWrist?.visibility && lWrist.visibility > VISIBILITY_FLOOR
        ? dist(lWrist, lShoulder) / torsoLength
        : 0;
    const rWristDisp =
      rWrist?.visibility && rWrist.visibility > VISIBILITY_FLOOR
        ? dist(rWrist, rShoulder) / torsoLength
        : 0;
    const lAnkleDisp =
      lAnkle?.visibility && lAnkle.visibility > VISIBILITY_FLOOR
        ? dist(lAnkle, lHip) / torsoLength
        : 0;
    const rAnkleDisp =
      rAnkle?.visibility && rAnkle.visibility > VISIBILITY_FLOOR
        ? dist(rAnkle, rHip) / torsoLength
        : 0;

    // "At rest" baseline — wrist near shoulder + ankle near hip = on hands/knees.
    const restishWrists =
      lWristDisp < EXTEND_THRESHOLD_NORM * 0.8 + 0.4 &&
      rWristDisp < EXTEND_THRESHOLD_NORM * 0.8 + 0.4;
    const restishAnkles =
      lAnkleDisp < EXTEND_THRESHOLD_NORM * 0.8 + 0.4 &&
      rAnkleDisp < EXTEND_THRESHOLD_NORM * 0.8 + 0.4;

    // Detect "extending" by which arm and which leg are most displaced and
    // confirming opposite-side pairing (wide diagonal).
    const leftArmMore = lWristDisp - rWristDisp > EXTEND_THRESHOLD_NORM;
    const rightArmMore = rWristDisp - lWristDisp > EXTEND_THRESHOLD_NORM;
    const leftLegMore = lAnkleDisp - rAnkleDisp > EXTEND_THRESHOLD_NORM;
    const rightLegMore = rAnkleDisp - lAnkleDisp > EXTEND_THRESHOLD_NORM;

    const detectedSide: ActiveSide =
      leftArmMore && rightLegMore
        ? "left_arm_right_leg"
        : rightArmMore && leftLegMore
          ? "right_arm_left_leg"
          : null;

    // Phase machine
    switch (this.phase) {
      case "at_rest": {
        if (detectedSide) {
          this.phase = "extending";
          this.activeSide = detectedSide;
          events.push({ type: "rep_started" });
        }
        break;
      }
      case "extending": {
        if (detectedSide && detectedSide === this.activeSide) {
          // Reached "stable extended" — start hold.
          this.phase = "holding";
          this.holdStartedAtMs = nowMs;
          // Encouragement on the cued side.
          if (this.isCuedSide(detectedSide)) {
            // Only fire once per rep; use compensation refractory by mocking it.
            // We send `form_excellent` which the coach maps to a warm cue.
            events.push({ type: "form_excellent" });
          } else {
            // Soft nudge — wrong side, but don't block, just remind.
            this.observeCompensation(
              "wrong_side",
              nowMs,
              events,
              `Good — and now do the other side a little longer; that's the one we want.`,
              "minor",
            );
          }
        } else if (restishWrists && restishAnkles) {
          // returned without holding — count a partial rep
          this.phase = "at_rest";
          this.activeSide = null;
        }
        break;
      }
      case "holding": {
        if (!detectedSide) {
          // they let go — start returning
          this.phase = "returning";
        } else if (detectedSide !== this.activeSide) {
          // switched sides mid-hold — close out and recount
          this.phase = "extending";
          this.activeSide = detectedSide;
          this.holdStartedAtMs = nowMs;
        } else {
          // still holding — run form checks
          this.checkExtensionForm(landmarks, lShoulder, rShoulder, lHip, rHip, nowMs, events);
        }
        break;
      }
      case "returning": {
        if (restishWrists && restishAnkles) {
          // back to all-fours = rep complete
          this.lastHoldDurationMs =
            this.holdStartedAtMs !== null ? nowMs - this.holdStartedAtMs : 0;
          this.holdStartedAtMs = null;
          this.reps += 1;
          this.activeSide = null;
          this.phase = "at_rest";
          this.compState.clear();
          events.push({ type: "rep_completed", rep: this.reps });
          if (this.reps >= TARGET_REPS) {
            this.setComplete = true;
            events.push({ type: "set_complete" });
          }
        } else if (detectedSide) {
          // re-extended without resting — back to holding
          this.phase = "holding";
          this.holdStartedAtMs = this.holdStartedAtMs ?? nowMs;
          this.activeSide = detectedSide;
        }
        break;
      }
    }

    return events;
  }

  private isCuedSide(side: ActiveSide): boolean {
    if (side === null) return false;
    if (this.cuedArmSide === "left") return side === "left_arm_right_leg";
    return side === "right_arm_left_leg";
  }

  private checkExtensionForm(
    _lms: NormalizedLandmark[],
    lShoulder: NormalizedLandmark,
    rShoulder: NormalizedLandmark,
    lHip: NormalizedLandmark,
    rHip: NormalizedLandmark,
    nowMs: number,
    events: FormCheckEvent[],
  ) {
    // Hip drop: difference in y between left and right hip > threshold.
    const hipDelta = Math.abs(lHip.y - rHip.y);
    if (hipDelta > UNEVEN_HIP_THRESHOLD) {
      this.observeCompensation(
        "hip_drop",
        nowMs,
        events,
        "Lift the dropped hip — keep them level.",
        "major",
      );
    } else {
      this.clearCompensation("hip_drop");
    }

    // Spine rotation: angle between shoulder line and hip line.
    const shoulderAngle = Math.atan2(
      rShoulder.y - lShoulder.y,
      rShoulder.x - lShoulder.x,
    );
    const hipAngle = Math.atan2(rHip.y - lHip.y, rHip.x - lHip.x);
    const angleDiff = Math.abs(shoulderAngle - hipAngle);
    if (angleDiff > SPINE_ROTATION_RATIO) {
      this.observeCompensation(
        "spine_rotation",
        nowMs,
        events,
        "Square your shoulders to your hips — no twist.",
        "minor",
      );
    } else {
      this.clearCompensation("spine_rotation");
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
      holdSeconds:
        this.holdStartedAtMs !== null
          ? Math.floor((now - this.holdStartedAtMs) / 1000)
          : Math.floor(this.lastHoldDurationMs / 1000),
      setComplete: this.setComplete,
      activeCompensations: active,
    };
  }
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
