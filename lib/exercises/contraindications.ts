// Contraindication rules. Three severities:
//
//   absolute   — never prescribe. If the user has it in their physio program,
//                surface a strong flag with the safer alternative ID.
//   relative   — never auto-prescribe. Ok if a physio explicitly cleared it,
//                with a soft flag.
//   ask_physio — heavy compounds, new sports, etc. Show with a "worth asking
//                your physio" flag.
//
// EVIDENCE STATUS (clinical audit, docs/clinical-audit.md
// `contraindication-list-folk-wisdom`): none of the movement bans below is
// evidence-based for IDIOPATHIC scoliosis. SOSORT guidelines encourage sport
// and general activity; there is no trial showing backbends, inversions,
// loaded flexion or held twists worsen an idiopathic curve. They were
// therefore downgraded from "absolute" to "relative": the app will not
// auto-prescribe them and will surface them for a physio's judgement, but it
// no longer tells a patient they are forbidden. Population-specific bans
// (post-fusion, osteoporosis, pregnancy) are a different matter and live in
// lib/safety — those are condition-based, not exercise-name-based.

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
  // ────────── MOVEMENT CAUTIONS — relative; none evidence-based for AIS ──────────
  {
    id: "wheel_pose_full_backbend",
    category: "relative",
    title: "Full backbends",
    reason_user_facing:
      "Full backbends like wheel pose aren't shown to harm an idiopathic curve, but they load an asymmetric spine at end range. Not something this app will add on its own — fine if your physio has included it.",
    matches: {
      namePatterns: [
        /\bwheel\s*pose\b/i,
        /\bfull\s*back\s*bend\b/i,
        /\bchakr?asana\b/i,
        // Both word orders: "full bridge" was the exact banned phrase and the
        // old pattern only matched "bridge full".
        /\bfull\s*bridge\b/i,
        /\bbridge\s*(?:full|complete)\b/i,
      ],
    },
    safe_alternatives: ["hip_bridge_pelvic_press_down", "wall_stand_postural_reset"],
  },
  {
    id: "deadlift_unsupervised",
    category: "relative",
    title: "Deadlifts (without physio sign-off)",
    reason_user_facing:
      "Loaded deadlifts aren't off-limits with scoliosis, but form and load matter more for an asymmetric spine. Not auto-prescribed — worth having your physio watch a set before you load up.",
    matches: {
      namePatterns: [/\bdead\s*lift/i, /\brdl\b/i, /\bromanian\s*deadlift/i],
    },
    safe_alternatives: ["hip_bridge_pelvic_press_down", "single_leg_bridge_variant"],
  },
  {
    id: "loaded_forward_flexion",
    category: "relative",
    title: "Loaded forward flexion",
    reason_user_facing:
      "Weighted forward folds and loaded roll-ups aren't shown to worsen an idiopathic curve. They do matter if you have osteoporosis or a spinal fusion, which is why they're flagged rather than added automatically — check with your physio.",
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
    category: "relative",
    title: "End-range static twists held long",
    reason_user_facing:
      "Long-held end-range twists toward your curve's rotation aren't something this app adds on its own. Your physio can tell you which direction is useful for your pattern.",
    matches: {
      namePatterns: [
        /end[\s-]?range.*twist/i,
        /static.*twist/i,
        /twist.*(?:hold|held)/i,
        /seated\s*spinal\s*twist/i,
        /bharadvaj/i,
      ],
    },
    safe_alternatives: ["sitting_waist_fold", "schroth_rotational_breathing"],
  },
  {
    id: "long_inversions",
    category: "relative",
    title: "Inversions",
    reason_user_facing:
      "Headstands and shoulder stands aren't shown to harm an idiopathic curve, but they load the neck and spine at end range. Not auto-prescribed — fine if your physio is happy with them.",
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

// Side plank on the side opposite the thoracic convexity is a RELATIVE caution
// for prolonged daily training holds — not an absolute contraindication.
//
// The convex-side-down rule traces to a single uncontrolled case series
// (Fishman 2014, n=25) whose controlled replication (Sarkisova 2019) found no
// Cobb effect. There is no evidence at all that holding the other side
// "reinforces the curve"; that phrase was removed. The caution is kept as a
// relative flag so a physio-prescribed opposite-side plank is surfaced, not
// blocked, and a capped bilateral endurance test (lib/outcomes) is unaffected.
export function checkSidePlankSide(
  selectedSide: Side | null,
  thoracicConvex: Side | null,
): RuleHit | null {
  if (!selectedSide || !thoracicConvex) return null;
  if (selectedSide === thoracicConvex) return null; // convex side down: as prescribed
  return {
    rule: {
      id: "side_plank_opposite_side",
      category: "relative",
      title: "Side plank on the side opposite your curve",
      reason_user_facing: `Long daily side-plank holds are usually prescribed with the ${thoracicConvex} side down for your curve. Holding the other side isn't dangerous, but as a repeated training dose it's worth confirming with your physio. A short timed hold on both sides for the endurance check is fine.`,
      matches: { libraryIds: ["side_plank_convex_thoracic_side_down"] },
      safe_alternatives: ["side_plank_convex_thoracic_side_down"],
    },
    matchedBy: "library_id",
  };
}
