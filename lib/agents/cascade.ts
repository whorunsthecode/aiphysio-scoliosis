// Watch-lists per curve pattern.
//
// Each list names the posture signals that commonly shift alongside a given
// curve, in the order a clinician would typically look for them. An item is
// "active" when its signal in recent scans exceeds the personal baseline
// + 2σ (or a fixed fallback when no baseline exists yet).
//
// This used to be called a "cascade prediction". It is not one. The order
// is a clinical heuristic, not a validated causal chain, and the webcam scan
// cannot forecast progression. What it can honestly do is say "this signal
// has moved beyond your usual range this week — worth a look". The table
// name and column names (cascade_predictions, predicted_next) are kept for
// schema stability; every user-facing surface calls this a watch-list.

import type { CurvePatternKey } from "@/lib/exercises/types";

export type CascadeStageDef = {
  stage: string;
  signal: string;
  thresholdMm: number; // absolute fallback when no baseline available
  description: string;
};

export const CASCADE_MODELS: Partial<Record<CurvePatternKey, CascadeStageDef[]>> = {
  double_right_thoracic_left_lumbar: [
    {
      stage: "lumbar_curve_drift",
      signal: "lower_thoracic_segment_shift",
      thresholdMm: 12,
      description:
        "Lower thoracic segment drifting beyond personal baseline — primary curve activating.",
    },
    {
      stage: "pelvic_rotation",
      signal: "pelvic_rotation_mm",
      thresholdMm: 8,
      description:
        "Pelvic rotation rising — compensatory pattern from the lumbar curve.",
    },
    {
      stage: "hip_flexor_asymmetry",
      signal: "stiff_hip_flexor_logged",
      thresholdMm: 0, // qualitative — any logged stiffness counts
      description:
        "Hip flexor asymmetry — would benefit from increased frequency on the stiff side.",
    },
    {
      stage: "knee_tracking_drift",
      signal: "lunge_knee_collapse_form_score",
      thresholdMm: 0,
      description:
        "Knee tracking drift — downstream of pelvic + hip changes.",
    },
  ],
  double_left_thoracic_right_lumbar: [
    {
      stage: "lumbar_curve_drift",
      signal: "lower_thoracic_segment_shift",
      thresholdMm: 12,
      description:
        "Lower thoracic segment drifting beyond personal baseline.",
    },
    {
      stage: "pelvic_rotation",
      signal: "pelvic_rotation_mm",
      thresholdMm: 8,
      description: "Pelvic rotation rising.",
    },
    {
      stage: "hip_flexor_asymmetry",
      signal: "stiff_hip_flexor_logged",
      thresholdMm: 0,
      description: "Hip flexor asymmetry.",
    },
  ],
  right_thoracic: [
    {
      stage: "thoracic_curve_drift",
      signal: "upper_thoracic_segment_shift",
      thresholdMm: 12,
      description:
        "Upper thoracic segment drifting beyond personal baseline.",
    },
    {
      stage: "shoulder_asymmetry",
      signal: "shoulder_diff_mm",
      thresholdMm: 12,
      description: "Shoulder differential rising.",
    },
    {
      stage: "scapular_winging",
      signal: "scapular_form_check",
      thresholdMm: 0,
      description: "Scapular position drift — downstream of shoulder asymmetry.",
    },
    {
      stage: "forward_head",
      signal: "head_offset_mm",
      thresholdMm: 18,
      description: "Forward-head posture — head shifting laterally relative to pelvis.",
    },
  ],
  left_thoracic: [
    {
      stage: "thoracic_curve_drift",
      signal: "upper_thoracic_segment_shift",
      thresholdMm: 12,
      description: "Upper thoracic segment drifting.",
    },
    {
      stage: "shoulder_asymmetry",
      signal: "shoulder_diff_mm",
      thresholdMm: 12,
      description: "Shoulder differential rising.",
    },
    {
      stage: "scapular_winging",
      signal: "scapular_form_check",
      thresholdMm: 0,
      description: "Scapular position drift.",
    },
    {
      stage: "forward_head",
      signal: "head_offset_mm",
      thresholdMm: 18,
      description: "Forward-head posture.",
    },
  ],
};
