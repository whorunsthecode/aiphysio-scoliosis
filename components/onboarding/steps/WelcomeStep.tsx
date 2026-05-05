"use client";

import { Heart, MessageCircle } from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StepNav } from "@/components/onboarding/StepNav";
import type { OnboardingState } from "@/lib/onboarding/types";

interface WelcomeStepProps {
  state: OnboardingState;
  setName: (name: string) => void;
  onNext: () => void;
}

export function WelcomeStep({ state, setName, onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Heading level={1}>Hi — let&rsquo;s work on your back together.</Heading>
        <p className="max-w-xl text-ink-secondary">
          A few questions so I can tailor practice to your curve. Nothing here
          replaces your physio — I work alongside them.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card tone="sage" className="space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-sage-dark">
            <Heart size={20} strokeWidth={1.5} />
          </div>
          <p className="font-display text-[20px] text-ink-primary">
            How I can help
          </p>
          <ul className="space-y-2 text-[15px] text-ink-primary/85">
            <li>Guide you through exercises tailored to your curve.</li>
            <li>Watch your form gently, the way a physio would.</li>
            <li>Notice what&rsquo;s changing over time.</li>
          </ul>
        </Card>
        <Card tone="terracotta" className="space-y-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-terracotta-dark">
            <MessageCircle size={20} strokeWidth={1.5} />
          </div>
          <p className="font-display text-[20px] text-ink-primary">
            What I&rsquo;m not
          </p>
          <ul className="space-y-2 text-[15px] text-ink-primary/85">
            <li>Not a replacement for your physio.</li>
            <li>Not a diagnostic tool.</li>
            <li>
              Anything I read from your X-ray is a starting point — your
              physio&rsquo;s notes always win.
            </li>
          </ul>
        </Card>
      </div>

      <div className="space-y-2 max-w-md">
        <SectionLabel>What should I call you?</SectionLabel>
        <Input
          placeholder="Your name"
          value={state.name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>

      <StepNav
        onNext={onNext}
        nextLabel="Let’s get started"
        nextDisabled={state.name.trim().length === 0}
      />
    </div>
  );
}
