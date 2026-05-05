import type { Exercise } from "./types";

// Source of truth: app spec. Descriptions, cues, and form-check targets are
// transcribed verbatim where possible — clinical content; do not paraphrase.
// form_check_targets and voice_corrections expand in Phase 8 (per-exercise
// pose detection wiring).

export const EXERCISE_LIBRARY: Exercise[] = [
  // Tier 1 — Pelvic de-rotation
  {
    id: "hip_bridge_pelvic_press_down",
    name: "Hip bridge with pelvic press-down",
    tier: 1,
    category: "strength",
    description:
      "Bridge lift while actively pressing the convex-lumbar-side pelvis down into the floor.",
    setup_instructions:
      "Lie on your back, knees bent, feet flat hip-width apart, arms relaxed at your sides.",
    execution_cues:
      "Press the convex-lumbar-side pelvis down into the floor as you lift. Even hip lift height, no anterior pelvic tilt at top.",
    applicable_patterns: ["any"],
    asymmetric_cues: {
      right_lumbar: "Press the right pelvis down as you lift",
      left_lumbar: "Press the left pelvis down as you lift",
      double_right_thoracic_left_lumbar: "Press the left pelvis down as you lift",
      double_left_thoracic_right_lumbar: "Press the right pelvis down as you lift",
    },
    form_check_targets: ["hip_level", "pelvic_tilt"],
    contraindicated_for: [],
    loads_regions: ["lower_back", "left_hip", "right_hip"],
    reps: 10,
    sets: 3,
    voice_corrections: [],
  },
  {
    id: "single_leg_bridge_variant",
    name: "Single-leg bridge variant",
    tier: 1,
    category: "strength",
    description:
      "Whole-body lift with feet shoulder-width, pressing the convex-lumbar-side pelvis down.",
    setup_instructions:
      "Lie on your back, feet shoulder-width apart, knees bent.",
    execution_cues:
      "Lift whole body, press convex-lumbar-side pelvis down. Pelvic level at top, no rotation.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["hip_level", "spine_rotation"],
    contraindicated_for: [],
    loads_regions: ["lower_back", "left_hip", "right_hip"],
    reps: 8,
    sets: 2,
    voice_corrections: [],
  },
  {
    id: "pelvic_mobility_drill",
    name: "Pelvic mobility drill",
    tier: 1,
    category: "flexibility",
    description: "Move pelvis front/back/left/right while standing.",
    setup_instructions: "Stand with feet hip-width apart, soft knees.",
    execution_cues:
      "Isolated pelvic motion, ribs stay still. Front, back, left, right.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["rib_isolation"],
    contraindicated_for: [],
    reps: 10,
    voice_corrections: [],
  },
  {
    id: "side_lying_foam_roller_release",
    name: "Side-lying foam roller release",
    tier: 1,
    category: "flexibility",
    description:
      "Lie on side, top leg crossed over bottom; gentle pressure on outer hip/ITB.",
    setup_instructions:
      "Lie on side with foam roller under outer hip. Top leg crossed over bottom (right leg over left when lying on left).",
    execution_cues:
      "Switch sides; spend more time on the stiff hip flexor side.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: [],
    contraindicated_for: [],
    loads_regions: ["left_hip", "right_hip"],
    duration_seconds: 60,
    per_side: true,
    voice_corrections: [],
  },
  {
    id: "side_clam",
    name: "Side clam",
    tier: 1,
    category: "strength",
    description:
      "Side-lying, knees bent; lift top knee while keeping feet together. Glute med focus.",
    setup_instructions:
      "Lie on your side, knees bent at 90°, feet stacked together.",
    execution_cues: "Lift top knee while keeping feet together. Glute med focus.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["hip_level"],
    contraindicated_for: [],
    loads_regions: ["left_hip", "right_hip"],
    reps: 20,
    per_side: true,
    voice_corrections: [],
  },

  // Tier 2 — Asymmetrically cued bilateral strength
  {
    id: "lunge_pelvic_tilt_back_leg_tiptoe",
    name: "Lunge with pelvic tilt + back-leg tip-toe",
    tier: 2,
    category: "strength",
    description:
      "Lunge with the front leg feeling almost nothing; back leg tip-toe; tilt pelvis back; squeeze glute on the way up.",
    setup_instructions:
      "Step into a lunge stance. Back leg up on the toe. Front knee soft.",
    execution_cues:
      "Front leg should feel almost nothing; back leg tip-toe; tilt pelvis back; squeeze glute on the way up.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["pelvic_tilt", "knee_tracking", "back_leg_extension"],
    contraindicated_for: [],
    loads_regions: ["left_hip", "right_hip", "lower_back"],
    reps: 5,
    sets: 3,
    per_side: true,
    voice_corrections: [],
  },
  {
    id: "t_stretch_neutral_spine",
    name: "T-stretch with neutral spine",
    tier: 2,
    category: "balance",
    description:
      "Floating leg straight in back, opposite hand reaches forward toward platform until back is flat / neutral spine.",
    setup_instructions:
      "Stand on one leg with the opposite leg straight behind you. Reach forward with the opposite hand.",
    execution_cues:
      "Neutral spine (no rounding or arching), floating leg straight, hip square.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["spine_neutral", "back_leg_extension"],
    contraindicated_for: [],
    loads_regions: ["lower_back"],
    reps: 10,
    per_side: true,
    voice_corrections: [],
  },
  {
    id: "bird_dog_asymmetric_hold",
    name: "Bird-dog with asymmetric hold",
    tier: 2,
    category: "strength",
    description:
      "Standard bird-dog with longer hold on the pattern that opens the user's concave thoracic side.",
    setup_instructions:
      "On hands and knees, wrists under shoulders, knees under hips, neutral neck.",
    execution_cues:
      "No hip drop, no spine rotation, neutral neck. Longer hold on the cued side.",
    applicable_patterns: ["any"],
    asymmetric_cues: {
      right_thoracic:
        "Longer hold extending the left arm + right leg (opens the left concave side).",
      left_thoracic:
        "Longer hold extending the right arm + left leg (opens the right concave side).",
    },
    form_check_targets: ["hip_drop", "spine_rotation"],
    contraindicated_for: [],
    loads_regions: ["lower_back", "left_shoulder", "right_shoulder"],
    reps: 8,
    per_side: true,
    voice_corrections: [],
  },
  {
    id: "squat_glute_focused",
    name: "Squat (glute-focused)",
    tier: 2,
    category: "strength",
    description:
      "User physio-cleared. Bodyweight or light load. Focus on glute drive, not quad.",
    setup_instructions: "Stand with feet hip-width, toes slightly out.",
    execution_cues:
      "Knees track over toes, even weight distribution L/R, no lateral hip shift.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["knee_tracking", "hip_level"],
    contraindicated_for: [],
    loads_regions: ["lower_back", "left_hip", "right_hip"],
    reps: 10,
    sets: 3,
    voice_corrections: [],
  },

  // Tier 3 — Schroth-adjacent corrective
  {
    id: "frog_in_the_pond",
    name: "Frog in the pond",
    tier: 3,
    category: "derotation",
    description:
      "Lying down, knees bent left and parallel to mat line, left hand on neck, left scapula rotates back, right hand at 90°.",
    setup_instructions:
      "Lie on your back. Bend knees and drop them to the left, parallel to the mat line. Place left hand on neck. Right hand at 90° to the side.",
    execution_cues: "Scapular position, knee alignment to mat line.",
    applicable_patterns: ["right_thoracic", "double_right_thoracic_left_lumbar"],
    asymmetric_cues: {},
    form_check_targets: ["scapular_position"],
    contraindicated_for: [],
    loads_regions: ["mid_back", "left_shoulder"],
    duration_seconds: 30,
    sets: 3,
    voice_corrections: [],
  },
  {
    id: "sitting_waist_fold",
    name: "Sitting waist fold",
    tier: 3,
    category: "derotation",
    description:
      "Sit on chair, fold left waist (compresses left side, opens right).",
    setup_instructions:
      "Sit upright on a firm chair, feet flat on the floor.",
    execution_cues:
      "Actual lateral fold not forward fold, shoulder stays over hip.",
    applicable_patterns: ["any"],
    asymmetric_cues: {
      right_thoracic: "Fold to the left to open the right concave thoracic side.",
      left_thoracic: "Fold to the right to open the left concave thoracic side.",
    },
    form_check_targets: ["lateral_fold_isolation"],
    contraindicated_for: [],
    loads_regions: ["mid_back"],
    duration_seconds: 30,
    sets: 3,
    voice_corrections: [],
  },
  {
    id: "side_plank_convex_thoracic_side_down",
    name: "Side plank, convex-thoracic side down",
    tier: 3,
    category: "strength",
    description:
      "For right thoracic curves: right side down. For left thoracic: left side down. Wrong side held long is a contraindication.",
    setup_instructions:
      "Side-lying with elbow under shoulder. Stack feet. Lift hips into a straight line.",
    execution_cues:
      "Hip lifted (no sag), top shoulder back (no roll forward), head neutral.",
    applicable_patterns: [
      "right_thoracic",
      "left_thoracic",
      "double_right_thoracic_left_lumbar",
      "double_left_thoracic_right_lumbar",
    ],
    asymmetric_cues: {
      right_thoracic: "Right side down.",
      left_thoracic: "Left side down.",
      double_right_thoracic_left_lumbar: "Right side down for thoracic curve.",
      double_left_thoracic_right_lumbar: "Left side down for thoracic curve.",
    },
    form_check_targets: ["hip_level", "shoulder_level"],
    contraindicated_for: [],
    loads_regions: ["mid_back", "left_shoulder", "right_shoulder", "lower_back"],
    duration_seconds: 30,
    sets: 3,
    voice_corrections: [],
  },

  // Tier 4 — Mobility / daily resets
  {
    id: "hip_flexor_stretch_stiff_side",
    name: "Hip flexor stretch (stiff side emphasis)",
    tier: 4,
    category: "flexibility",
    description:
      "Half-kneeling, tilt pelvis back, squeeze glute on kneeling side.",
    setup_instructions:
      "Half-kneeling: one knee on the floor, other foot forward in a lunge stance.",
    execution_cues: "Tilt pelvis back, squeeze glute on kneeling side.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["pelvic_tilt"],
    contraindicated_for: [],
    loads_regions: ["left_hip", "right_hip"],
    duration_seconds: 45,
    sets: 2,
    per_side: true,
    voice_corrections: [],
  },
  {
    id: "wall_stand_postural_reset",
    name: "Wall stand postural reset",
    tier: 4,
    category: "balance",
    description:
      "Heels, glutes, upper back, head against wall.",
    setup_instructions:
      "Stand with heels, glutes, upper back, and head against a wall.",
    execution_cues: "Full contact, no excessive lumbar gap.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: ["wall_contact"],
    contraindicated_for: [],
    duration_seconds: 60,
    voice_corrections: [],
  },
  {
    id: "cat_cow",
    name: "Cat-cow",
    tier: 4,
    category: "flexibility",
    description: "Symmetric thoracic mobility, safe for all.",
    setup_instructions:
      "On hands and knees, wrists under shoulders, knees under hips.",
    execution_cues: "Slow cycles between flexion and extension.",
    applicable_patterns: ["any"],
    asymmetric_cues: {},
    form_check_targets: [],
    contraindicated_for: [],
    reps: 10,
    voice_corrections: [],
  },
  {
    id: "childs_pose_side_reach",
    name: "Child's pose with side reach",
    tier: 4,
    category: "flexibility",
    description:
      "Reach toward convex thoracic side to lengthen it.",
    setup_instructions:
      "From hands and knees, sit hips back to heels and reach arms forward.",
    execution_cues: "30 seconds each side, longer on convex side.",
    applicable_patterns: ["any"],
    asymmetric_cues: {
      right_thoracic: "Longer reach to the right (convex thoracic side).",
      left_thoracic: "Longer reach to the left (convex thoracic side).",
    },
    form_check_targets: [],
    contraindicated_for: [],
    duration_seconds: 30,
    per_side: true,
    voice_corrections: [],
  },

  // Tier 5 — Breathing
  {
    id: "schroth_rotational_breathing",
    name: "Schroth rotational breathing",
    tier: 5,
    category: "breathing",
    description:
      "Breathe into the concave side(s) to expand collapsed ribs. For S-curves: separate inhalation focus per curve.",
    setup_instructions: "Seated or side-lying, hands placed over the concave ribs.",
    execution_cues:
      "Breathe into the concave side(s) to expand collapsed ribs. For S-curves: separate inhalation focus per curve.",
    applicable_patterns: ["any"],
    asymmetric_cues: {
      right_thoracic: "Inhale into the left ribs to open the concave side.",
      left_thoracic: "Inhale into the right ribs to open the concave side.",
    },
    form_check_targets: [],
    contraindicated_for: [],
    reps: 10,
    sets: 3,
    voice_corrections: [],
  },
];

export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}

// Compact view for prompt context — only the fields the LLM needs to match against.
export function libraryForPrompt() {
  return EXERCISE_LIBRARY.map((e) => ({
    id: e.id,
    name: e.name,
    tier: e.tier,
    category: e.category,
    description: e.description,
  }));
}
