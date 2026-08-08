"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { WelcomeStep } from "@/components/onboarding/steps/WelcomeStep";
import { CurveStep } from "@/components/onboarding/steps/CurveStep";
import { SegmentStep } from "@/components/onboarding/steps/SegmentStep";
import { XrayStep } from "@/components/onboarding/steps/XrayStep";
import { ProgramStep } from "@/components/onboarding/steps/ProgramStep";
import { LifestyleStep } from "@/components/onboarding/steps/LifestyleStep";
import { PainStep } from "@/components/onboarding/steps/PainStep";
import { SafetyStep } from "@/components/onboarding/steps/SafetyStep";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import { saveProfile } from "@/lib/onboarding/persist";
import { STEPS, type OnboardingState } from "@/lib/onboarding/types";

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<OnboardingState>(initialOnboardingState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STEPS[stepIdx].id;

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setName = useCallback(
    (name: string) => setState((prev) => ({ ...prev, name })),
    [],
  );

  const goNext = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIdx((i) => Math.max(i - 1, 0));

  const finish = async () => {
    setSaving(true);
    setError(null);
    const result = await saveProfile(state);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/onboarding/complete");
  };

  const stepBody = useMemo(() => {
    switch (currentStep) {
      case "welcome":
        return (
          <WelcomeStep state={state} setName={setName} onNext={goNext} />
        );
      case "curve":
        return (
          <CurveStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={goNext}
          />
        );
      case "segments":
        return (
          <SegmentStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={goNext}
          />
        );
      case "xray":
        return (
          <XrayStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={goNext}
            onSkip={goNext}
          />
        );
      case "program":
        return (
          <ProgramStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={goNext}
            onSkip={goNext}
          />
        );
      case "lifestyle":
        return (
          <LifestyleStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={goNext}
          />
        );
      case "pain":
        return (
          <PainStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={goNext}
            onSkip={goNext}
            saving={false}
          />
        );
      case "safety":
        return (
          <SafetyStep
            state={state}
            update={update}
            onBack={goBack}
            onNext={finish}
            saving={saving}
          />
        );
    }
  }, [currentStep, state, setName, update, saving]);

  return (
    <OnboardingShell currentStep={currentStep}>
      {error ? (
        <div className="mb-6 rounded-card border border-drift bg-terracotta-wash px-5 py-4 text-[14px] text-terracotta-dark">
          Something went wrong saving: {error}. Your answers are still here —
          try again.
        </div>
      ) : null}
      {stepBody}
    </OnboardingShell>
  );
}
