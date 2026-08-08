"use client";

// The onboarding safety screen.
//
// Every question is answered explicitly — there is no "leave it blank" path,
// because an unanswered screening question is not a "no", and treating it as
// one is how a screen quietly stops working. The step cannot be skipped for
// the same reason.

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { RedFlagNotice } from "@/components/safety/RedFlagNotice";
import { questionsFor, triage } from "@/lib/safety/redFlags";
import type { OnboardingState } from "@/lib/onboarding/types";
import { cn } from "@/lib/cn";

type Props = {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
  saving?: boolean;
};

export function SafetyStep({ state, update, onBack, onNext, saving }: Props) {
  const questions = useMemo(() => questionsFor("onboarding"), []);
  const answers = state.safetyScreen ?? {};

  const answeredCount = questions.filter(
    (q) => typeof answers[q.id] === "boolean",
  ).length;
  const allAnswered = answeredCount === questions.length;

  const result = useMemo(
    () =>
      triage({
        answers,
        profile: {
          primaryCurveApex: state.primaryCurveApex,
          primaryConvexSide: state.primaryLeanSide,
          ageYears: state.ageYears ?? null,
        },
      }),
    [answers, state.primaryCurveApex, state.primaryLeanSide, state.ageYears],
  );

  function answer(id: string, value: boolean) {
    update({ safetyScreen: { ...answers, [id]: value } });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1}>A few safety questions</Heading>
        <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-ink-secondary">
          Most people answer no to all of these. They exist because a handful of
          symptoms mean exercise isn&apos;t the right next step, and I&apos;d
          rather ask than assume.
        </p>
      </div>

      <Card className="flex flex-col divide-y divide-border/70 p-0">
        {questions.map((q) => {
          const value = answers[q.id];
          return (
            <fieldset key={q.id} className="flex flex-col gap-3 px-5 py-5">
              <legend className="text-[15px] leading-relaxed text-ink-primary">
                {q.prompt}
              </legend>
              {q.help ? (
                <p className="-mt-1 text-[13.5px] leading-relaxed text-ink-tertiary">
                  {q.help}
                </p>
              ) : null}
              <div className="flex gap-2">
                {([
                  { label: "No", val: false },
                  { label: "Yes", val: true },
                ] as const).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={value === opt.val}
                    onClick={() => answer(q.id, opt.val)}
                    className={cn(
                      "min-w-[84px] rounded-input border px-4 py-2 text-[15px] transition-all duration-200",
                      "focus:outline-none focus:shadow-focus-sage",
                      value === opt.val
                        ? "border-sage bg-sage text-white"
                        : "border-border bg-surface text-ink-primary hover:border-sage/60",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
      </Card>

      {result.severity ? (
        <RedFlagNotice result={result} name={state.name} />
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-4">
          {!allAnswered ? (
            <span className="text-[13.5px] text-ink-tertiary">
              {questions.length - answeredCount} left
            </span>
          ) : null}
          <Button onClick={onNext} disabled={!allAnswered || saving}>
            {saving ? "Saving…" : "Finish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
