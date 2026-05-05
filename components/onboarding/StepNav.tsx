"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface StepNavProps {
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isFinal?: boolean;
  saving?: boolean;
}

export function StepNav({
  onBack,
  onNext,
  onSkip,
  nextLabel = "Continue",
  nextDisabled = false,
  isFinal = false,
  saving = false,
}: StepNavProps) {
  return (
    <div className="mt-12 flex items-center justify-between gap-4 border-t border-border/60 pt-8">
      <div>
        {onBack ? (
          <Button
            variant="ghost"
            onClick={onBack}
            leftIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
          >
            Back
          </Button>
        ) : (
          <span aria-hidden />
        )}
      </div>
      <div className="flex items-center gap-3">
        {onSkip ? (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        ) : null}
        <Button
          variant="primary"
          onClick={onNext}
          disabled={nextDisabled || saving}
          rightIcon={
            isFinal ? undefined : <ArrowRight size={18} strokeWidth={1.5} />
          }
        >
          {saving ? "Saving…" : isFinal ? "Finish" : nextLabel}
        </Button>
      </div>
    </div>
  );
}
