// Contraindication rules. Three severities:
//
//   absolute   — never prescribe. If the user has it in their physio program,
//                surface a strong flag with the safer alternative ID.
//   relative   — never auto-prescribe. Ok if a physio explicitly cleared it,
//                with a soft flag.
//   ask_physio — heavy compounds, new sports, etc. Show with a "worth asking
//                your physio" flag.

import type { CurvePatternKey } from "./types";
import type { Side } from "@/lib/onboarding/types";

export type ContraindicationCategory = "absolute" | "relative" | "ask_physio";

export type ContraindicationRule = {
  id: string;
  category: ContraindicationCategory;
  // Human-readable label for the rule itself.
  title: string;
  // Warm explanation shown to the user when this rule fires.
  reason_user_facing: string;
  // What the rule matches. Either by library exercise IDs, or by name pattern
  // (used against arbitrary physio-program text).
  matches: {
    libraryIds?: string[];
    namePatterns?: RegExp[];
  };
  // Optional: this rule only applies for these patterns (e.g. side plank
  // wrong-side-down depends on which side has the convex thoracic curve).
  appliesTo?: { patterns?: CurvePatternKey[] };
  // Library IDs to suggest as safer alternatives.
  safe_alternatives?: string[];
};

// Side-plank wrong-side flagging is computed dynamically — we need to know
// the user's pattern. See `checkSidePlankSide`.

export const CONTRAINDICATION_RULES: ContraindicationRule[] = [
  // ──────────────────────────── ABSOLUTE ────────────────────────────
  {
    id: "wheel_pose_full_backbend",
    category: "absolute",
    title: "Full backbends",
    reason_user_facing:
      "Full backbends like wheel pose put extreme load on the convex side of a curve. Your physio will choose specific extension work that's safer for your pattern.",
    matches: {
      namePatterns: [
        /\bwheel\s*pose\b/i,
        /\bfull\s*back\s*bend\b/i,
        /\bchakr?asana\b/i,
        /\bbridge\s*(?:full|complete)\b/i,
      ],
    },
    safe_alternatives: ["hip_bridge_pelvic_press_down", "wall_stand_postural_reset"],
  },
  {
    id: "deadlift_unsupervised",
    category: "absolute",
    title: "Deadlifts (without physio sign-off)",
    reason_user_facing:
      "Deadlifts under load amplify rotational forces on a curve. They're not auto-prescribed — only do them if your physio has specifically cleared form and load.",
    matches: {
      namePatterns: [/\bdead\s*lift/i, /\brdl\b/i, /\bromanian\s*deadlift/i],
    },
    safe_alternatives: ["hip_bridge_pelvic_press_down", "single_leg_bridge_variant"],
  },
  {
    id: "loaded_forward_flexion",
    category: "absolute",
    title: "Loaded forward flexion",
    reason_user_facing:
      "Loaded toe-touches, weighted forward folds, and Pilates roll-ups compress the spine in flexion — bad news for asymmetric loading. We have safer options for the same goal.",
    matches: {
      namePatterns: [
        /loaded.*toe.*touch/i,
        /weighted.*(?:forward|fold)/i,
        /\broll[\s-]?up/i,
        /loaded.*forward\s*(?:fold|flex)/i,
        /jefferson\s*curl/i,
      ],
    },
    safe_alternatives: ["cat_cow", "childs_pose_side_reach"],
  },
  {
    id: "long_static_twists",
    category: "absolute",
    title: "End-range static twists held long",
    reason_user_facing:
      "Long held end-range twists pull the spine into the existing rotation. Active de-rotation work is what you want.",
    matches: {
      namePatterns: [
        /end[\s-]?range.*twist/i,
        /static.*twist/i,
        /twist.*(?:hold|held)/i,
        /seated\s*spinal\s*twist/i,
        /bharadvaj/i,
      ],
    },
    safe_alternatives: ["frog_in_the_pond", "sitting_waist_fold"],
  },
  {
    id: "long_inversions",
    category: "absolute",
    title: "Inversions",
    reason_user_facing:
      "Headstand, shoulder stand, and other long inversions stack asymmetric loads through your spine in unpredictable ways. Skip them.",
    matches: {
      namePatterns: [
        /\bhead\s*stand\b/i,
        /\bshoulder\s*stand\b/i,
        /\bsirsasana\b/i,
        /\bsalamba/i,
        /\binversion\b/i,
      ],
    },
    safe_alternatives: ["wall_stand_postural_reset", "childs_pose_side_reach"],
  },

  // ──────────────────────────── RELATIVE ────────────────────────────
  {
    id: "heavy_overhead_press",
    category: "relative",
    title: "Heavy overhead pressing",
    reason_user_facing:
      "Heavy overhead loads ask a lot of stable scapulae. Worth checking with your physio that your form holds under load before adding weight.",
    matches: {
      namePatterns: [
        /\boverhead\s*press/i,
        /\bmilitary\s*press/i,
        /\bpush\s*press/i,
      ],
    },
    safe_alternatives: ["bird_dog_asymmetric_hold"],
  },
  {
    id: "long_static_asymmetric_holds",
    category: "relative",
    title: "Long static holds in asymmetric positions",
    reason_user_facing:
      "Holds longer than 60 seconds in any asymmetric position can fatigue the same muscle groups that already work harder for you. Keep holds short and frequent.",
    matches: {
      namePatterns: [/(?:hold|stay).*(?:60|90|120|180)\s*s(?:ec)?\b/i],
    },
  },

  // ──────────────────────────── ASK PHYSIO ──────────────────────────
  {
    id: "heavy_compound_lifts",
    category: "ask_physio",
    title: "Heavy compound lifts",
    reason_user_facing:
      "Heavy back squats, front squats, and other loaded compounds aren't off-limits — but they need a physio's eye on your specific form. Worth asking before you load them.",
    matches: {
      namePatterns: [
        /\bback\s*squat\b/i,
        /\bfront\s*squat\b/i,
        /\bbarbell\s*squat\b/i,
        /heavy.*squat/i,
        /\bclean\b/i,
        /\bsnatch\b/i,
      ],
    },
  },
  {
    id: "running_volume",
    category: "ask_physio",
    title: "Higher running volume",
    reason_user_facing:
      "Running on hard surfaces at volume puts repetitive impact through an asymmetric spine. Your physio can help you build to it sensibly.",
    matches: {
      namePatterns: [
        /\brun.*(?:5\s?k|10\s?k|half\s?marathon|marathon)\b/i,
        /\blong\s*run\b/i,
      ],
    },
  },
];

export type RuleHit = {
  rule: ContraindicationRule;
  matchedBy: "library_id" | "name_pattern";
};

// Find any rules that match a given exercise candidate.
export function findContraindications(input: {
  libraryId?: string | null;
  name?: string | null;
}): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of CONTRAINDICATION_RULES) {
    if (input.libraryId && rule.matches.libraryIds?.includes(input.libraryId)) {
      hits.push({ rule, matchedBy: "library_id" });
      continue;
    }
    if (input.name && rule.matches.namePatterns) {
      for (const pat of rule.matches.namePatterns) {
        if (pat.test(input.name)) {
          hits.push({ rule, matchedBy: "name_pattern" });
          break;
        }
      }
    }
  }
  return hits;
}

// Side-plank-on-the-wrong-side is a contextual contraindication. Returns a
// hit when the user's selected side opposes the convex thoracic side.
export function checkSidePlankSide(
  selectedSide: Side | null,
  thoracicConvex: Side | null,
): RuleHit | null {
  if (!selectedSide || !thoracicConvex) return null;
  if (selectedSide === thoracicConvex) return null; // correct: convex side down
  return {
    rule: {
      id: "side_plank_wrong_side",
      category: "absolute",
      title: "Side plank, wrong side down",
      reason_user_facing: `Side plank should be done with your ${thoracicConvex} side down — that's the side your back bulges toward at the thoracic level. Holding the other side reinforces the curve.`,
      matches: { libraryIds: ["side_plank_convex_thoracic_side_down"] },
      safe_alternatives: ["side_plank_convex_thoracic_side_down"],
    },
    matchedBy: "library_id",
  };
}
