"use client";

import { Heading } from "@/components/ui/Heading";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { StepNav } from "@/components/onboarding/StepNav";
import type {
  ApexRegion,
  CurveType,
  OnboardingState,
  Severity,
  Side,
} from "@/lib/onboarding/types";

const CURVE_TYPES: { id: CurveType; label: string; hint?: string }[] = [
  { id: "S", label: "S-curve", hint: "Two curves in opposite directions" },
  { id: "C", label: "C-curve", hint: "One curve in one direction" },
  { id: "thoracolumbar", label: "Thoracolumbar", hint: "A curve crossing mid-back into low back" },
  { id: "unknown", label: "I don’t know", hint: "That’s OK — we’ll work it out" },
];

const APEX_OPTIONS: { id: ApexRegion; label: string }[] = [
  { id: "cervical", label: "Cervical" },
  { id: "upper_thoracic", label: "Upper thoracic" },
  { id: "lower_thoracic", label: "Lower thoracic" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "lumbar", label: "Lumbar" },
];

const SEVERITY_OPTIONS: { id: Severity; label: string; hint: string }[] = [
  { id: "mild", label: "Mild", hint: "under 25°" },
  { id: "moderate", label: "Moderate", hint: "25–40°" },
  { id: "severe", label: "Severe", hint: "over 40°" },
  { id: "unknown", label: "I don’t know", hint: "We’ll proceed gently" },
];

interface CurveStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function CurveStep({ state, update, onBack, onNext }: CurveStepProps) {
  const showApex = state.curveType && state.curveType !== "unknown";
  const showLean = state.curveType && state.curveType !== "unknown";
  const showSecondary = state.curveType === "S";

  const canContinue = state.curveType !== null && state.severity !== null;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>Tell us about your curve</Heading>
        <p className="text-ink-secondary max-w-xl">
          A rough picture is fine. We&rsquo;ll refine it from your posture scan
          and X-ray if you have one.
        </p>
      </div>

      <section className="space-y-3">
        <SectionLabel>Curve type</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {CURVE_TYPES.map((opt) => (
            <Chip
              key={opt.id}
              variant="card"
              selected={state.curveType === opt.id}
              onClick={() => update({ curveType: opt.id })}
            >
              <span className="flex flex-col items-start text-left">
                <span>{opt.label}</span>
                {opt.hint ? (
                  <span className="mt-0.5 text-[12px] font-normal text-ink-tertiary">
                    {opt.hint}
                  </span>
                ) : null}
              </span>
            </Chip>
          ))}
        </div>
      </section>

      {showApex ? (
        <section className="space-y-3">
          <SectionLabel>
            {showSecondary ? "Main curve apex" : "Curve apex"}
          </SectionLabel>
          <div className="flex flex-wrap gap-3">
            {APEX_OPTIONS.map((opt) => (
              <Chip
                key={opt.id}
                selected={state.primaryCurveApex === opt.id}
                onClick={() => update({ primaryCurveApex: opt.id })}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      {showLean ? (
        <section className="space-y-3">
          <SectionLabel>Which one looks like yours?</SectionLabel>
          <p className="text-[14px] text-ink-secondary max-w-xl">
            Tap the picture where the back bulges toward your side.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <LeanCard
              side="left"
              selected={state.primaryLeanSide === "left"}
              onClick={() => update({ primaryLeanSide: "left" })}
            />
            <LeanCard
              side="right"
              selected={state.primaryLeanSide === "right"}
              onClick={() => update({ primaryLeanSide: "right" })}
            />
          </div>
        </section>
      ) : null}

      {showSecondary ? (
        <Card tone="muted" className="space-y-4">
          <SectionLabel>Secondary curve</SectionLabel>
          <div className="flex flex-wrap gap-3">
            {APEX_OPTIONS.map((opt) => (
              <Chip
                key={opt.id}
                selected={state.secondaryCurveApex === opt.id}
                onClick={() => update({ secondaryCurveApex: opt.id })}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {(["left", "right"] as Side[]).map((side) => (
              <Chip
                key={side}
                selected={state.secondaryLeanSide === side}
                onClick={() => update({ secondaryLeanSide: side })}
              >
                Bulges to the {side}
              </Chip>
            ))}
          </div>
        </Card>
      ) : null}

      <section className="space-y-3">
        <SectionLabel>How pronounced is your curve?</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SEVERITY_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              variant="card"
              selected={state.severity === opt.id}
              onClick={() => update({ severity: opt.id })}
            >
              <span className="flex flex-col items-start text-left">
                <span>{opt.label}</span>
                <span className="mt-0.5 text-[12px] font-normal text-ink-tertiary">
                  {opt.hint}
                </span>
              </span>
            </Chip>
          ))}
        </div>
      </section>

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!canContinue} />
    </div>
  );
}

function LeanCard({
  side,
  selected,
  onClick,
}: {
  side: Side;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "group rounded-card border bg-surface p-6 text-left transition-all duration-200 ease-soft " +
        (selected
          ? "border-sage bg-sage-tint shadow-card"
          : "border-border hover:border-sage/50 hover:bg-sage-wash")
      }
    >
      <div className="flex items-center gap-5">
        <SpineSilhouette lean={side} />
        <div>
          <p className="font-display text-[18px] text-ink-primary">
            Bulges to the {side}
          </p>
          <p className="text-[13px] text-ink-tertiary">
            Curve apex pushes outward on the {side} side
          </p>
        </div>
      </div>
    </button>
  );
}

function SpineSilhouette({ lean }: { lean: Side }) {
  // Stylized back-view: torso outline + curving spine path. lean=left bulges toward viewer's left.
  const sign = lean === "left" ? -1 : 1;
  const apex = 50 + sign * 12; // x of curve apex
  return (
    <svg
      viewBox="0 0 110 160"
      width="76"
      height="110"
      className="text-ink-secondary/70"
      aria-hidden
    >
      {/* shoulders */}
      <path
        d="M20 30 Q55 10 90 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* torso outline */}
      <path
        d={`M22 32 C 18 70, 26 110, 38 145 L 72 145 C 84 110, 92 70, 88 32`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* spine — curved */}
      <path
        d={`M55 30 Q ${apex} 80, 55 145`}
        fill="none"
        stroke="#7fa78a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* apex marker */}
      <circle cx={apex} cy={80} r={3.5} fill="#7fa78a" />
    </svg>
  );
}
