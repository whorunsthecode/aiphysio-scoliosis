"use client";

import { Heading } from "@/components/ui/Heading";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Input } from "@/components/ui/Input";
import { StepNav } from "@/components/onboarding/StepNav";
import type {
  BagSide,
  OnboardingState,
  SittingHours,
  SleepPosition,
  SportFrequency,
} from "@/lib/onboarding/types";

const SPORTS = ["badminton", "tennis", "golf", "fencing", "none", "other"];

const FREQUENCY: { id: SportFrequency; label: string }[] = [
  { id: "none", label: "None" },
  { id: "occasional", label: "Occasional" },
  { id: "weekly", label: "Weekly" },
  { id: "multiple", label: "Multiple per week" },
];

const SITTING: { id: SittingHours; label: string }[] = [
  { id: "under_4", label: "Under 4h" },
  { id: "4_to_8", label: "4–8h" },
  { id: "8_to_12", label: "8–12h" },
  { id: "over_12", label: "Over 12h" },
];

const BAG: { id: BagSide; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "alternating", label: "Alternating" },
  { id: "backpack", label: "Backpack" },
];

const SLEEP: { id: SleepPosition; label: string }[] = [
  { id: "back", label: "Back" },
  { id: "left", label: "Left side" },
  { id: "right", label: "Right side" },
  { id: "stomach", label: "Stomach" },
  { id: "mixed", label: "Mixed" },
];

interface LifestyleStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function LifestyleStep({
  state,
  update,
  onBack,
  onNext,
}: LifestyleStepProps) {
  const setLifestyle = (patch: Partial<OnboardingState["lifestyle"]>) =>
    update({ lifestyle: { ...state.lifestyle, ...patch } });

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>A few things about your day</Heading>
        <p className="text-ink-secondary max-w-xl">
          Daily habits load the spine asymmetrically over time. Knowing yours
          helps me notice patterns — and surface them gently in your weekly
          review.
        </p>
      </div>

      <section className="space-y-3">
        <SectionLabel>One-sided sport</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {SPORTS.map((sport) => (
            <Chip
              key={sport}
              selected={state.lifestyle.oneSidedSport === sport}
              onClick={() => setLifestyle({ oneSidedSport: sport })}
            >
              {sport}
            </Chip>
          ))}
        </div>
        {state.lifestyle.oneSidedSport &&
        state.lifestyle.oneSidedSport !== "none" ? (
          <div className="space-y-2 pt-3">
            <SectionLabel>How often?</SectionLabel>
            <div className="flex flex-wrap gap-3">
              {FREQUENCY.map((opt) => (
                <Chip
                  key={opt.id}
                  selected={state.lifestyle.oneSidedSportFrequency === opt.id}
                  onClick={() =>
                    setLifestyle({ oneSidedSportFrequency: opt.id })
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <SectionLabel>Daily sitting hours</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {SITTING.map((opt) => (
            <Chip
              key={opt.id}
              selected={state.lifestyle.dailySittingHours === opt.id}
              onClick={() => setLifestyle({ dailySittingHours: opt.id })}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Bag-carrying side</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {BAG.map((opt) => (
            <Chip
              key={opt.id}
              selected={state.lifestyle.bagCarryingSide === opt.id}
              onClick={() => setLifestyle({ bagCarryingSide: opt.id })}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Sleep position</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {SLEEP.map((opt) => (
            <Chip
              key={opt.id}
              selected={state.lifestyle.sleepPosition === opt.id}
              onClick={() => setLifestyle({ sleepPosition: opt.id })}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      {state.lifestyle.oneSidedSport === "other" ? (
        <section className="space-y-2 max-w-md">
          <SectionLabel>Which sport?</SectionLabel>
          <Input
            placeholder="e.g. squash"
            onChange={(e) =>
              setLifestyle({ oneSidedSport: e.target.value || "other" })
            }
          />
        </section>
      ) : null}

      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}
