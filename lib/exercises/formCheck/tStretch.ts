// T-stretch with neutral spine.
//
// Single-leg stand, opposite leg extended back, opposite arm reaching
// forward — body lengthens roughly horizontally.
//
// Detection (most reliable from a side or 3/4 view):
//   - position: shoulder.y ≈ hip.y (body horizontal-ish), back ankle far
//     from hip and at similar height to hip/shoulder
//   - hip square: |L hip y − R hip y| small (no rotation)
//   - back leg straight: knee angle of the floating leg near 180°
//   - per-rep hold ≥ 1.5s before counting
//   - reps: 10 (split per side; we don't strictly enforce side alternation)

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
const VISIBILITY_FLOOR = 0.4;
const HORIZONTAL_RATIO_THRESHOLD = 0.35; // |shoulder.y - hip.y| / shoulder-hip-x distance
const HIP_ROTATION_THRESHOLD = 0.018; // L vs R hip y difference at hold
const KNEE_BEND_THRESHOLD = 30; // degrees from straight
const HOLD_TO_COUNT_MS = 1_500;

type CompensationKey = "hip_rotated" | "back_knee_bent";
type Phase = "idle" | "entering" | "holding" | "exiting";

export class TStretchFormCheck implements FormCheck {
  readonly exerciseId = "t_stretch_neutral_spine";
  readonly mode = "reps" as const;

  private cueSide: Side | null = null;

  private phase: Phase = "idle";
  private inPosition = false;
  private holdStartedAtMs: number | null = null;
  private repCounted = false;
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
    this.cueSide = side;
  }

  resetForNewSet(): void {
    this.phase = "idle";
    this.inPosition = false;
    this.holdStartedAtMs = null;
    this.repCounted = false;
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
    const lKnee = landmarks[POSE.LEFT_KNEE];
    const rKnee = landmarks[POSE.RIGHT_KNEE];
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

    // Are we in T-position? Shoulder-hip line should be roughly horizontal in
    // image coords (the body extends sideways/forward, not up/down).
    const shoulderMid = midpoint(lShoulder, rShoulder);
    const hipMid = midpoint(lHip, rHip);
    const torsoXSpan = Math.max(0.05, Math.abs(shoulderMid.x - hipMid.x));
    const torsoYDelta = Math.abs(shoulderMid.y - hipMid.y);
    const horizontalRatio = torsoYDelta / torsoXSpan;

    const inT = horizontalRatio < HORIZONTAL_RATIO_THRESHOLD;

    switch (this.phase) {
      case "idle":
      case "exiting": {
        if (inT) {
          this.phase = "entering";
          this.holdStartedAtMs = nowMs;
          this.repCounted = false;
          events.push({ type: "rep_started" });
        }
        break;
      }
      case "entering":
      case "holding": {
        if (!inT) {
          this.phase = "exiting";
          this.holdStartedAtMs = null;
        } else {
          // Run form checks while holding.
          this.checkHoldForm(
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

          if (this.holdStartedAtMs !== null) {
            const heldMs = nowMs - this.holdStartedAtMs;
            if (heldMs >= HOLD_TO_COUNT_MS && !this.repCounted) {
              this.phase = "holding";
              this.repCounted = true;
              this.reps += 1;
              events.push({ type: "rep_completed", rep: this.reps });
              if (this.reps >= TARGET_REPS) {
                this.setComplete = true;
                events.push({ type: "set_complete" });
              }
            }
          }
        }
        break;
      }
    }

    return events;
  }

  private checkHoldForm(
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
    // Hip rotation: |L hip y − R hip y| at the hold should be small.
    const hipDelta = Math.abs(lHip.y - rHip.y);
    if (hipDelta > HIP_ROTATION_THRESHOLD) {
      this.observeCompensation(
        "hip_rotated",
        nowMs,
        events,
        "Square your hips — keep them parallel to the floor.",
        "major",
      );
    } else {
      this.clearCompensation("hip_rotated");
    }

    // Back knee bent: identify the back leg (the one further behind in x or
    // far from the standing ankle). Then compute knee angle.
    const standingSide = this.detectStandingSide(lHip, rHip, lAnkle, rAnkle);
    if (
      standingSide &&
      lKnee?.visibility &&
      rKnee?.visibility &&
      lAnkle?.visibility &&
      rAnkle?.visibility &&
      lKnee.visibility > VISIBILITY_FLOOR &&
      rKnee.visibility > VISIBILITY_FLOOR
    ) {
      const backHip = standingSide === "left" ? rHip : lHip;
      const backKnee = standingSide === "left" ? rKnee : lKnee;
      const backAnkle = standingSide === "left" ? rAnkle : lAnkle;
      const angleDeg = jointAngle(backHip, backKnee, backAnkle);
      // 180° = straight; smaller = more bend.
      if (angleDeg < 180 - KNEE_BEND_THRESHOLD) {
        this.observeCompensation(
          "back_knee_bent",
          nowMs,
          events,
          "Straighten your back leg — long line.",
          "minor",
        );
      } else {
        this.clearCompensation("back_knee_bent");
      }
    }

    // suppress unused var warning while keeping cueSide on the API for future
    void this.cueSide;
  }

  private detectStandingSide(
    lHip: NormalizedLandmark,
    rHip: NormalizedLandmark,
    lAnkle: NormalizedLandmark | undefined,
    rAnkle: NormalizedLandmark | undefined,
  ): Side | null {
    // The standing leg's ankle is closer (in y) to its hip than the floating
    // leg's ankle, which extends out behind.
    if (!lAnkle?.visibility || !rAnkle?.visibility) return null;
    const lDist = Math.hypot(lAnkle.x - lHip.x, lAnkle.y - lHip.y);
    const rDist = Math.hypot(rAnkle.x - rHip.x, rAnkle.y - rHip.y);
    if (Math.abs(lDist - rDist) < 0.04) return null;
    return lDist < rDist ? "left" : "right";
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

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

// Angle ABC (at vertex B) in degrees.
function jointAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark,
): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magAb = Math.hypot(abx, aby);
  const magCb = Math.hypot(cbx, cby);
  if (magAb === 0 || magCb === 0) return 180;
  const cos = dot / (magAb * magCb);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
