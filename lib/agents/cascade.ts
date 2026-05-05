// Cascade models — rules-based propagation chains per scoliosis curve pattern.
// Each chain lists stages in causal order; stage X "activates" when its
// monitoring signal exceeds the threshold (personal baseline + 2σ when
// available, else fixed mm threshold).

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
