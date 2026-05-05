"use client";

import type { ReactNode } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { STEPS, type StepId } from "@/lib/onboarding/types";

interface OnboardingShellProps {
  currentStep: StepId;
  children: ReactNode;
}

export function OnboardingShell({
  currentStep,
  children,
}: OnboardingShellProps) {
  const idx = STEPS.findIndex((s) => s.id === currentStep);
  const stepNumber = idx + 1;
  const total = STEPS.length;
  const pct = (stepNumber / total) * 100;

  return (
    <div className="min-h-screen bg-base">
      <div className="sticky top-0 z-10 bg-base/85 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-6 py-5">
          <div className="flex items-center justify-between text-[12px] text-ink-secondary/80">
            <span className="font-display text-[18px] text-sage-dark normal-case tracking-normal">
              Balance
            </span>
            <span className="font-medium uppercase tracking-[0.14em]">
              Step {stepNumber} of {total} · {STEPS[idx]?.title}
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar value={pct} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 pt-10 pb-24">{children}</main>
    </div>
  );
}
