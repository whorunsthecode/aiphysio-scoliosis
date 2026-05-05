// Surface lifestyle patterns from the user's profile as gentle observations
// on the /progress page. Phrasing per spec: "You've been at your desk most
// days this week — three minutes of wall-stand reset would feel good."

import type { OnboardingState } from "@/lib/onboarding/types";
import { deriveRegionalSides } from "@/lib/exercises/profile";

export type LifestyleObservation = {
  id: string;
  category: "sitting" | "sport" | "bag" | "sleep" | "balance";
  title: string;
  body: string;
  // A library exercise ID we can suggest.
  suggestedExerciseId?: string;
};

export function lifestyleObservations(
  profile: OnboardingState,
): LifestyleObservation[] {
  const out: LifestyleObservation[] = [];
  const sides = deriveRegionalSides(profile);

  if (
    profile.lifestyle.dailySittingHours === "8_to_12" ||
    profile.lifestyle.dailySittingHours === "over_12"
  ) {
    out.push({
      id: "sitting",
      category: "sitting",
      title: "Long sits",
      body:
        "You're sitting most of the day. Three minutes of wall-stand reset every couple of hours would feel good — set a soft reminder if it helps.",
      suggestedExerciseId: "wall_stand_postural_reset",
    });
  }

  if (
    profile.lifestyle.oneSidedSport &&
    profile.lifestyle.oneSidedSport !== "none" &&
    (profile.lifestyle.oneSidedSportFrequency === "weekly" ||
      profile.lifestyle.oneSidedSportFrequency === "multiple")
  ) {
    out.push({
      id: "sport",
      category: "sport",
      title: `${profile.lifestyle.oneSidedSport} is one-sided`,
      body:
        "Repetitive single-side sport loads one half of the spine more than the other. Worth balancing with rotation work on the opposite side and the breathing exercise.",
      suggestedExerciseId: "schroth_rotational_breathing",
    });
  }

  if (
    profile.lifestyle.bagCarryingSide === "left" ||
    profile.lifestyle.bagCarryingSide === "right"
  ) {
    const side = profile.lifestyle.bagCarryingSide;
    const isThoracicConvexSide =
      sides.thoracicConvex === side || sides.lumbarConvex === side;
    out.push({
      id: "bag",
      category: "bag",
      title: `Bag on the ${side}`,
      body: isThoracicConvexSide
        ? `Carrying weight on your ${side} pulls the spine further into your existing curve. Switching shoulders or going backpack would directly help.`
        : `Carrying weight on the same side adds a lateral load. Alternating shoulders or a backpack would even things out.`,
    });
  }

  if (profile.lifestyle.sleepPosition === "stomach") {
    out.push({
      id: "sleep_stomach",
      category: "sleep",
      title: "Stomach sleeping",
      body:
        "Stomach sleeping rotates the neck for hours. If you can, drift toward back or side sleeping over time.",
    });
  } else if (
    profile.lifestyle.sleepPosition === "left" &&
    sides.thoracicConvex === "left"
  ) {
    out.push({
      id: "sleep_convex",
      category: "sleep",
      title: "Side sleeping on the convex side",
      body:
        "Sleeping on the side your back bulges toward at the thoracic level reinforces that curve. Alternating sides or trying back-sleeping a few nights a week can help.",
    });
  } else if (
    profile.lifestyle.sleepPosition === "right" &&
    sides.thoracicConvex === "right"
  ) {
    out.push({
      id: "sleep_convex",
      category: "sleep",
      title: "Side sleeping on the convex side",
      body:
        "Sleeping on the side your back bulges toward at the thoracic level reinforces that curve. Alternating sides or trying back-sleeping a few nights a week can help.",
    });
  }

  return out;
}
