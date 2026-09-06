"use client";

// The ongoing red-flag screen, asked at the start of every session.
//
// Why every session and not "every fortnight": the onboarding answers are
// kept server-side only (see lib/privacy/data.ts), so the session page has
// no trustworthy record of when the user was last screened, and the
// symptoms this asks about — bladder change, saddle numbness, progressing
// leg weakness — are ones that can appear between one session and the next.
// Seven yes/no taps is a small price for the one screen that can stop a
// session that should not happen.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { questionsFor } from "@/lib/safety/redFlags";
import type { ScreeningAnswers } from "@/lib/safety/types";
import { cn } from "@/lib/cn";

export function SessionSafetyCheck({
  onContinue,
}: {
  onContinue: (answers: ScreeningAnswers) => void;
}) {
  const questions = useMemo(() => questionsFor("ongoing"), []);
  const [answers, setAnswers] = useState<ScreeningAnswers>({});

  const answered = questions.filter((q) => typeof answers[q.id] === "boolean").length;
  const allAnswered = answered === questions.length;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Heading level={1}>Anything new since last time?</Heading>
        <p className="max-w-xl text-ink-secondary">
          Same few questions every session. Most days the answer to all of
          them is no — they&apos;re here for the day it isn&apos;t.
        </p>
      </div>

      <Card className="flex flex-col divide-y divide-border/70 p-0">
        {questions.map((q) => {
          const value = answers[q.id];
          return (
            <fieldset key={q.id} className="flex flex-col gap-3 px-5 py-4">
              <legend className="text-[15px] leading-relaxed text-ink-primary">
                {q.prompt}
              </legend>
              {q.help ? (
                <p className="-mt-1 text-[13px] leading-relaxed text-ink-tertiary">
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
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.val }))}
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

      <div className="flex items-center justify-end gap-4">
        {!allAnswered ? (
          <span className="text-[13.5px] text-ink-tertiary">
            {questions.length - answered} left
          </span>
        ) : null}
        <Button onClick={() => onContinue(answers)} disabled={!allAnswered}>
          Continue
        </Button>
      </div>
    </div>
  );
}
