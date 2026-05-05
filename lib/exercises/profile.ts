// Helpers that derive structured exercise-selection inputs from the user's
// onboarding state. The library and selection logic depend on a normalized
// "curve pattern key" rather than the raw user-facing fields.

import type {
  ApexRegion,
  OnboardingState,
  SegmentShift,
  Side,
} from "@/lib/onboarding/types";
import type { CurvePatternKey } from "./types";

export type ProfileLike = Pick<
  OnboardingState,
  | "curveType"
  | "primaryCurveApex"
  | "primaryLeanSide"
  | "secondaryCurveApex"
  | "secondaryLeanSide"
  | "segmentShifts"
>;

const isThoracic = (a: ApexRegion | null) =>
  a === "upper_thoracic" || a === "lower_thoracic";
const isLumbar = (a: ApexRegion | null) => a === "lumbar";

// Map (apex, lean) onto a curve-pattern key. Lean side = the side the back
// bulges toward = the convex side. Concave side = opposite of lean.
function singleCurveKey(
  apex: ApexRegion | null,
  lean: Side | null,
): CurvePatternKey | null {
  if (!apex || !lean) return null;
  if (apex === "thoracolumbar") return "thoracolumbar";
  if (isThoracic(apex)) {
    return lean === "right" ? "right_thoracic" : "left_thoracic";
  }
  if (isLumbar(apex)) {
    return lean === "right" ? "right_lumbar" : "left_lumbar";
  }
  return null;
}

export function deriveCurvePattern(profile: ProfileLike): CurvePatternKey {
  // S-curve: combine primary + secondary into a double-major key.
  if (profile.curveType === "S") {
    const a = profile.primaryCurveApex;
    const al = profile.primaryLeanSide;
    const b = profile.secondaryCurveApex;
    const bl = profile.secondaryLeanSide;
    const primaryThor = isThoracic(a);
    const secThor = isThoracic(b);
    const primaryLum = isLumbar(a);
    const secLum = isLumbar(b);

    if ((primaryThor && secLum) || (primaryLum && secThor)) {
      const thorLean = primaryThor ? al : bl;
      const lumLean = primaryLum ? al : bl;
      if (thorLean === "right" && lumLean === "left")
        return "double_right_thoracic_left_lumbar";
      if (thorLean === "left" && lumLean === "right")
        return "double_left_thoracic_right_lumbar";
    }
    // Fallback to the primary single curve if S-curve detail is incomplete.
  }

  if (profile.curveType === "thoracolumbar") return "thoracolumbar";

  return singleCurveKey(profile.primaryCurveApex, profile.primaryLeanSide) ?? "any";
}

// Derive concave/convex sides per spinal region from the pattern.
// "convex" = the side the back bulges toward (= the lean side in the user's
// own words). "concave" = the opposite. Used internally by selection logic;
// these terms are never shown to the user.
export type RegionalSides = {
  thoracicConvex: Side | null;
  thoracicConcave: Side | null;
  lumbarConvex: Side | null;
  lumbarConcave: Side | null;
};

export function deriveRegionalSides(profile: ProfileLike): RegionalSides {
  const opposite = (s: Side | null): Side | null =>
    s === "left" ? "right" : s === "right" ? "left" : null;

  let thoracicConvex: Side | null = null;
  let lumbarConvex: Side | null = null;

  // Primary curve
  if (isThoracic(profile.primaryCurveApex)) {
    thoracicConvex = profile.primaryLeanSide;
  } else if (isLumbar(profile.primaryCurveApex)) {
    lumbarConvex = profile.primaryLeanSide;
  }

  // Secondary curve (S-curve case)
  if (profile.curveType === "S") {
    if (isThoracic(profile.secondaryCurveApex) && !thoracicConvex) {
      thoracicConvex = profile.secondaryLeanSide;
    }
    if (isLumbar(profile.secondaryCurveApex) && !lumbarConvex) {
      lumbarConvex = profile.secondaryLeanSide;
    }
  }

  return {
    thoracicConvex,
    thoracicConcave: opposite(thoracicConvex),
    lumbarConvex,
    lumbarConcave: opposite(lumbarConvex),
  };
}

// Stiff-hip-flexor side is a common compensation when most segments shift to
// one side: 3+ segments shifted left → right hip flexor stiff, and vice
// versa. Returns null when the pattern is mixed.
export function inferStiffHipFlexorSide(profile: ProfileLike): Side | null {
  const shifts: SegmentShift[] = Object.values(profile.segmentShifts).filter(
    (s): s is SegmentShift => s !== null,
  );
  if (shifts.length < 3) return null;
  const leftCount = shifts.filter((s) => s === "left").length;
  const rightCount = shifts.filter((s) => s === "right").length;
  if (leftCount >= 3) return "right";
  if (rightCount >= 3) return "left";
  return null;
}
