// Side plank, convex-thoracic side down.
//
// What we detect (front- or three-quarter-view webcam, user lying on the
// configured side, supporting on the elbow nearest the floor):
//
//   1. In-position check: torso roughly horizontal (shoulder.y ~= ankle.y),
//      hip lifted toward the camera (hip below the shoulder-ankle midline by
//      less than the sag threshold).
//   2. Hip sag: vertical distance from hip to the line connecting shoulder
//      and ankle. Hip BELOW that line = sag. Hip well ABOVE = pike.
//   3. Top shoulder rolling forward: lateral (x) drift of the upper shoulder
//      toward the centre of the frame. Falls back to z-axis when MediaPipe
//      provides it.
//   4. Head dropped: nose y noticeably below the shoulder line.
//
// Hold tracking:
//   - hold begins once the user is in position
//   - if they fall out of position for >0.5s, hold pauses (warm cue, then resumes)

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

const TARGET_HOLD_SECONDS = 30;

// Thresholds — all in normalized image coordinates (0..1) before conversion.
// Calibrated for adult torso ≈ 30–40% of frame height when set up correctly.
const TORSO_HORIZONTAL_TOLERANCE = 0.18; // shoulder–ankle |dy| / total torso length
const SAG_THRESHOLD_NORM = 0.04; // hip below ideal line by this fraction
const PIKE_THRESHOLD_NORM = 0.05; // hip above ideal line
const HEAD_DROP_THRESHOLD_NORM = 0.06; // nose y below shoulder line
const SHOULDER_ROLL_THRESHOLD_X = 0.05; // top shoulder lateral drift
const OUT_OF_POSITION_GRACE_MS = 500; // tolerate brief landmark loss

type CompensationKey =
  | "hip_sag"
  | "hip_pike"
  | "shoulder_roll_forward"
  | "head_dropped";

export class SidePlankFormCheck implements FormCheck {
  readonly exerciseId = "side_plank_convex_thoracic_side_down";
  readonly mode = "hold" as const;

  private side: Side = "right";
  private inPosition = false;
  private outOfPositionSinceMs: number | null = null;
  private holdStartedAtMs: number | null = null;
  private accumulatedHoldMs = 0;
  private setComplete = false;

  // Per-compensation: timestamp it first appeared this run, last time we
  // surfaced it via an event, current "phrase" for UI.
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
    this.side = side;
  }

  resetForNewSet(): void {
    this.inPosition = false;
    this.outOfPositionSinceMs = null;
    this.holdStartedAtMs = null;
    this.accumulatedHoldMs = 0;
    this.setComplete = false;
    this.compState.clear();
  }

  process(landmarks: NormalizedLandmark[] | null, nowMs: number): FormCheckEvent[] {
    const events: FormCheckEvent[] = [];

    if (this.setComplete) return events;

    if (!landmarks) {
      this.handleOutOfPosition(events, nowMs, "I lost sight of you");
      return events;
    }

    // Pick the side-down landmarks based on configured side.
    const sideDown = this.side === "right" ? "right" : "left";
    const downShoulder =
      landmarks[sideDown === "right" ? POSE.RIGHT_SHOULDER : POSE.LEFT_SHOULDER];
    const downHip = landmarks[sideDown === "right" ? POSE.RIGHT_HIP : POSE.LEFT_HIP];
    const downAnkle =
      landmarks[sideDown === "right" ? POSE.RIGHT_ANKLE : POSE.LEFT_ANKLE];
    const upShoulder =
      landmarks[sideDown === "right" ? POSE.LEFT_SHOULDER : POSE.RIGHT_SHOULDER];
    const nose = landmarks[POSE.NOSE];

    if (
      !downShoulder?.visibility ||
      !downHip?.visibility ||
      !downAnkle?.visibility ||
      downShoulder.visibility < 0.4 ||
      downHip.visibility < 0.4 ||
      downAnkle.visibility < 0.4
    ) {
      this.handleOutOfPosition(events, nowMs, "step into the camera");
      return events;
    }

    // Torso must be roughly horizontal (shoulder.y ≈ ankle.y, large x-spread).
    const torsoLengthX = Math.abs(downShoulder.x - downAnkle.x);
    if (torsoLengthX < 0.15) {
      this.handleOutOfPosition(events, nowMs, "lie down on your side");
      return events;
    }
    const torsoTilt = Math.abs(downShoulder.y - downAnkle.y) / torsoLengthX;
    const torsoHorizontal = torsoTilt < TORSO_HORIZONTAL_TOLERANCE;

    if (!torsoHorizontal) {
      this.handleOutOfPosition(events, nowMs, "settle into the side plank");
      return events;
    }

    // We're in position. Re-enter if previously out.
    if (!this.inPosition) {
      this.inPosition = true;
      this.outOfPositionSinceMs = null;
      this.holdStartedAtMs = nowMs;
      events.push({ type: "hold_started" });
    }

    // Compute hip deviation from the ideal shoulder-ankle straight line.
    const t =
      (downHip.x - downShoulder.x) /
      (downAnkle.x - downShoulder.x || 1e-6); // 0..1
    const idealHipY = downShoulder.y + t * (downAnkle.y - downShoulder.y);
    const hipDeviation = downHip.y - idealHipY; // positive = hip below line = sag

    // Sag detection
    if (hipDeviation > SAG_THRESHOLD_NORM) {
      const severity: "minor" | "major" =
        hipDeviation > SAG_THRESHOLD_NORM * 2 ? "major" : "minor";
      this.observeCompensation(
        "hip_sag",
        nowMs,
        events,
        "Lift your hips a touch — there.",
        severity,
      );
    } else {
      this.clearCompensation("hip_sag");
    }

    if (hipDeviation < -PIKE_THRESHOLD_NORM) {
      this.observeCompensation(
        "hip_pike",
        nowMs,
        events,
        "Drop the hips a little — long line.",
        "minor",
      );
    } else {
      this.clearCompensation("hip_pike");
    }

    // Top shoulder rolling forward: lateral drift of the upper shoulder
    // beyond the lower shoulder's x by more than threshold.
    if (upShoulder?.visibility && upShoulder.visibility > 0.3) {
      const upZ = typeof upShoulder.z === "number" ? upShoulder.z : 0;
      const downZ = typeof downShoulder.z === "number" ? downShoulder.z : 0;
      const zRollForward =
        upZ - downZ < -0.08 && Math.abs(upZ) + Math.abs(downZ) > 0;
      const xDrift = Math.abs(upShoulder.x - downShoulder.x);
      const xRoll =
        xDrift > SHOULDER_ROLL_THRESHOLD_X &&
        // lower shoulder also moved? skip
        true;
      if (zRollForward || xRoll) {
        this.observeCompensation(
          "shoulder_roll_forward",
          nowMs,
          events,
          "Drop the top shoulder back, you're hiking it.",
          "minor",
        );
      } else {
        this.clearCompensation("shoulder_roll_forward");
      }
    }

    // Head drop: nose noticeably below the shoulder line.
    if (nose?.visibility && nose.visibility > 0.4) {
      const noseDrop = nose.y - downShoulder.y;
      if (noseDrop > HEAD_DROP_THRESHOLD_NORM) {
        this.observeCompensation(
          "head_dropped",
          nowMs,
          events,
          "Lengthen through the crown of your head — chin level.",
          "minor",
        );
      } else {
        this.clearCompensation("head_dropped");
      }
    }

    // Form-excellent moment: in position, no active compensations for ≥3s.
    if (this.compState.size === 0 && this.inPosition && this.holdStartedAtMs) {
      const heldMs = nowMs - this.holdStartedAtMs + this.accumulatedHoldMs;
      if (heldMs > 3_000 && heldMs % 10_000 < 200) {
        events.push({ type: "form_excellent" });
      }
    }

    // Hold progress + completion.
    if (this.holdStartedAtMs !== null) {
      const liveHeldMs = nowMs - this.holdStartedAtMs + this.accumulatedHoldMs;
      const heldSec = Math.floor(liveHeldMs / 1000);
      // Emit a progress event roughly every second.
      if (Math.floor((liveHeldMs - 16) / 1000) !== heldSec) {
        events.push({ type: "hold_progress", secondsHeld: heldSec });
      }
      if (liveHeldMs >= TARGET_HOLD_SECONDS * 1_000 && !this.setComplete) {
        this.setComplete = true;
        events.push({ type: "set_complete" });
      }
    }

    return events;
  }

  private handleOutOfPosition(
    events: FormCheckEvent[],
    nowMs: number,
    reason: string,
  ) {
    if (this.outOfPositionSinceMs === null) {
      this.outOfPositionSinceMs = nowMs;
    }
    if (
      this.inPosition &&
      nowMs - this.outOfPositionSinceMs > OUT_OF_POSITION_GRACE_MS
    ) {
      // pause hold accumulator
      if (this.holdStartedAtMs !== null) {
        this.accumulatedHoldMs += nowMs - this.holdStartedAtMs;
        this.holdStartedAtMs = null;
      }
      this.inPosition = false;
      this.compState.clear();
      events.push({ type: "hold_lost", reason });
      events.push({ type: "out_of_position", reason });
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
    const elapsedMs = nowMs - existing.firstSeenMs;
    const sinceLastEventMs = nowMs - existing.lastEventMs;
    if (
      elapsedMs >= COMPENSATION_TRIGGER_MS &&
      sinceLastEventMs >= COMPENSATION_REFRACTORY_MS
    ) {
      events.push({
        type: "compensation",
        id,
        severity,
        phrase,
      });
      existing.lastEventMs = nowMs;
    }
  }

  private clearCompensation(id: CompensationKey) {
    this.compState.delete(id);
  }

  getState(): FormCheckState {
    const liveHeldMs =
      this.holdStartedAtMs !== null
        ? performance.now() - this.holdStartedAtMs + this.accumulatedHoldMs
        : this.accumulatedHoldMs;
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
      repsCompleted: 0,
      holdSeconds: Math.floor(liveHeldMs / 1000),
      targetHoldSeconds: TARGET_HOLD_SECONDS,
      setComplete: this.setComplete,
      activeCompensations: active,
    };
  }
}
