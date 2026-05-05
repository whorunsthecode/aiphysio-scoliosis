export type CurvePatternKey =
  | "right_thoracic"
  | "left_thoracic"
  | "right_lumbar"
  | "left_lumbar"
  | "double_right_thoracic_left_lumbar"
  | "double_left_thoracic_right_lumbar"
  | "thoracolumbar"
  | "any";

export type FormCheckTargetId =
  | "hip_level"
  | "shoulder_level"
  | "pelvic_tilt"
  | "spine_neutral"
  | "knee_tracking"
  | "scapular_position"
  | "hip_drop"
  | "spine_rotation"
  | "back_leg_extension"
  | "lateral_fold_isolation"
  | "wall_contact"
  | "rib_isolation";

// Body regions that an exercise loads — used to skip exercises when the
// user has flagged pain in those regions today. Region IDs match the body
// map in the pain-baseline onboarding step.
export type BodyRegionId =
  | "neck"
  | "left_shoulder"
  | "right_shoulder"
  | "upper_back"
  | "mid_back"
  | "lower_back"
  | "left_hip"
  | "right_hip";

export type Exercise = {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  category: "strength" | "flexibility" | "breathing" | "balance" | "derotation";
  description: string;
  setup_instructions: string;
  execution_cues: string;
  applicable_patterns: CurvePatternKey[];
  asymmetric_cues: Partial<Record<CurvePatternKey, string>>;
  form_check_targets: FormCheckTargetId[];
  contraindicated_for: CurvePatternKey[];
  // Regions actively loaded by this exercise. Empty = low load anywhere.
  loads_regions?: BodyRegionId[];
  reps?: number;
  sets?: number;
  duration_seconds?: number;
  per_side?: boolean;
  voice_corrections: { compensation: string; correction_phrase: string }[];
};
