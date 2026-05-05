"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Info, ShieldAlert } from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { TagPill } from "@/components/ui/TagPill";
import { getExerciseById } from "@/lib/exercises/library";
import {
  deriveCurvePattern,
  deriveRegionalSides,
} from "@/lib/exercises/profile";
import { hasFormCheck } from "@/lib/exercises/formCheck/factory";
import { loadDraft } from "@/lib/onboarding/persist";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type { OnboardingState, Side } from "@/lib/onboarding/types";

// Spec test profile mirrors the one used on /library so the coach is
// demoable without onboarding being completed.
const TEST_PROFILE: OnboardingState = {
  ...initialOnboardingState,
  name: "demo",
  curveType: "S",
  severity: "mild",
  primaryCurveApex: "lower_thoracic",
  primaryLeanSide: "right",
  secondaryCurveApex: "lumbar",
  secondaryLeanSide: "left",
  segmentShifts: {
    cervical: "left",
    upper_thoracic: "left",
    lower_thoracic: "left",
    lumbar: "left",
  },
};

const ExerciseCoach = dynamic(
  () => import("@/components/exercise/ExerciseCoach").then((m) => m.ExerciseCoach),
  { ssr: false },
);

export default function ExerciseRoute() {
  const params = useParams<{ id: string }>();
  const exerciseId = params.id;
  const exercise = getExerciseById(exerciseId);

  const [profile, setProfile] = useState<OnboardingState>(TEST_PROFILE);
  const [usedDraft, setUsedDraft] = useState(false);

  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.curveType) {
      setProfile(draft);
      setUsedDraft(true);
    }
  }, []);

  const sides = useMemo(() => deriveRegionalSides(profile), [profile]);
  const pattern = useMemo(() => deriveCurvePattern(profile), [profile]);

  // Determine the configured side per exercise:
  //  side plank → convex thoracic (the side the back bulges toward at thoracic)
  //  hip bridge → convex lumbar (the press-down side)
  //  bird-dog  → CONCAVE thoracic (the arm whose extension lengthens that side)
  //  lunge / t-stretch → no side enforcement (alternates per side)
  const configuredSide: Side | null = useMemo(() => {
    if (!exercise) return null;
    if (exercise.id === "side_plank_convex_thoracic_side_down") {
      return sides.thoracicConvex;
    }
    if (exercise.id === "hip_bridge_pelvic_press_down") {
      return sides.lumbarConvex;
    }
    if (exercise.id === "bird_dog_asymmetric_hold") {
      return sides.thoracicConcave;
    }
    return null;
  }, [exercise, sides]);

  if (!exercise) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
        <Heading level={1}>Not found</Heading>
        <p className="text-ink-secondary">
          I don&rsquo;t have an exercise with that ID. Head back to the library.
        </p>
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-sage-dark hover:underline"
        >
          <ArrowLeft size={14} strokeWidth={1.5} /> Library
        </Link>
      </main>
    );
  }

  const supports = hasFormCheck(exercise.id);

  // Side plank requires a known thoracic convex side to enforce wrong-side-
  // down contraindication. Block if we can't determine it.
  const sidePlankBlocked =
    exercise.id === "side_plank_convex_thoracic_side_down" &&
    !sides.thoracicConvex;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-12 lg:py-16 space-y-10">
      <header className="space-y-3">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <ArrowLeft size={14} strokeWidth={1.5} /> Library
        </Link>
        <SectionLabel>
          Tier {exercise.tier} · {exercise.category}
          {supports ? " · live form-check" : " · skeleton-only (coming soon)"}
        </SectionLabel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <Heading level={1}>{exercise.name}</Heading>
            <p className="max-w-2xl text-ink-secondary">
              {exercise.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {configuredSide ? (
              <TagPill tone="sage">
                {exercise.id === "side_plank_convex_thoracic_side_down"
                  ? `${configuredSide} side down`
                  : exercise.id === "hip_bridge_pelvic_press_down"
                    ? `press ${configuredSide} hip down`
                    : exercise.id === "bird_dog_asymmetric_hold"
                      ? `longer hold: ${configuredSide} arm`
                      : `cue side: ${configuredSide}`}
              </TagPill>
            ) : null}
            {usedDraft ? (
              <TagPill tone="sage">your saved profile</TagPill>
            ) : (
              <TagPill tone="neutral">spec test profile</TagPill>
            )}
            <TagPill tone="neutral">{prettyPattern(pattern)}</TagPill>
          </div>
        </div>
      </header>

      {sidePlankBlocked ? (
        <Card tone="terracotta" className="space-y-2">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={20}
              strokeWidth={1.6}
              className="mt-0.5 shrink-0 text-terracotta-dark"
            />
            <div className="space-y-1.5">
              <p className="font-display text-[18px] text-ink-primary">
                I need to know your thoracic curve direction first.
              </p>
              <p className="text-[14px] text-ink-secondary">
                Side plank held on the wrong side reinforces a curve. Finish
                the curve-pattern step in onboarding so I can put you on the
                right side.
              </p>
              <Link
                href="/onboarding"
                className="text-sage-dark hover:underline text-[14px]"
              >
                Complete onboarding →
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      {!sidePlankBlocked ? (
        <ExerciseCoach
          exercise={exercise}
          configuredSide={configuredSide}
        />
      ) : null}

      <Card tone="muted" className="text-[13px] text-ink-secondary">
        <div className="flex items-start gap-2">
          <Info
            size={14}
            strokeWidth={1.5}
            className="mt-0.5 shrink-0 text-sage-dark"
          />
          <div>
            <p className="mb-1 font-medium text-ink-primary">
              Form-check, honestly
            </p>
            <p>
              I&rsquo;m watching the things webcam pose detection can see well —
              hip level, body line, gross compensations. Subtler movement
              quality is still your physio&rsquo;s job. Voice cues fire on
              compensations that hold for at least two seconds, and I keep them
              to one cue every five seconds so it doesn&rsquo;t get noisy.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}

function prettyPattern(pattern: string): string {
  const map: Record<string, string> = {
    right_thoracic: "right thoracic",
    left_thoracic: "left thoracic",
    right_lumbar: "right lumbar",
    left_lumbar: "left lumbar",
    double_right_thoracic_left_lumbar:
      "double major (R thoracic / L lumbar)",
    double_left_thoracic_right_lumbar:
      "double major (L thoracic / R lumbar)",
    thoracolumbar: "thoracolumbar",
    any: "any pattern",
  };
  return map[pattern] ?? pattern;
}
