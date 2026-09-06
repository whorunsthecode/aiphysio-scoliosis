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

// Skeletal maturity is what actually gates bracing; age is the proxy this
// app has. Eighteen is conservative for girls and about right for boys.
const LIKELY_STILL_GROWING_UNDER = 18;

interface CurveStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip?: () => void;
}

export function CurveStep({ state, update, onBack, onNext, onSkip }: CurveStepProps) {
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
          <SectionLabel>Which side is higher when you bend forward?</SectionLabel>
          {/* The Adams forward-bend test is the one observation a person can
              make about themselves that reliably gives the convex side. Asking
              which way the back "bulges" standing up gets confused with the
              hip that sticks out, the shoulder that sits low, or a mirror
              image — and a wrong answer here trains the curve deeper. */}
          <p className="text-[14px] text-ink-secondary max-w-xl">
            Bend forward from the hips, arms hanging, and have someone look
            along your back from behind (or use a mirror). One side of your
            back will sit higher than the other — a hump, usually over the ribs.
            That side is what I need. It is <em>not</em> the hip that sticks
            out, or the shoulder that sits lower.
          </p>
          {state.sideConflict ? (
            <Card tone="terracotta" className="space-y-1">
              <p className="text-[14px] font-medium text-ink-primary">
                Two sources disagreed about this.
              </p>
              <p className="text-[13.5px] text-ink-secondary">
                You said {state.sideConflict.selfReport}; the X-ray read said{" "}
                {state.sideConflict.xray}. Confirm with your physio and set it
                here — until then your programme stays side-neutral.
              </p>
            </Card>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <LeanCard
              side="left"
              selected={state.primaryLeanSide === "left"}
              onClick={() => update({ primaryLeanSide: "left", sideConflict: null })}
            />
            <LeanCard
              side="right"
              selected={state.primaryLeanSide === "right"}
              onClick={() => update({ primaryLeanSide: "right", sideConflict: null })}
            />
          </div>
          {/* "Not sure" is a real answer, and the safe one: selectProgram
              withholds every side-dependent exercise until the side is known. */}
          <Chip
            selected={state.primaryLeanSide === null && !!state.curveType}
            onClick={() => update({ primaryLeanSide: null })}
          >
            Not sure — keep my exercises side-neutral for now
          </Chip>
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
                Higher on the {side} when bent forward
              </Chip>
            ))}
            <Chip
              selected={state.secondaryLeanSide === null}
              onClick={() => update({ secondaryLeanSide: null })}
            >
              Not sure
            </Chip>
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
        <BracingNote severity={state.severity} ageYears={state.ageYears ?? null} />
      </section>

      {/* Most people arriving know only that someone told them they have
          scoliosis. Making the curve mandatory turns them away at the door;
          letting them through unblocks the product, and selectProgram
          withholds every side-dependent exercise until the curve is known so
          the fallback stays safe rather than guessing a side. */}
      {onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          className="self-start text-[14.5px] text-ink-tertiary underline underline-offset-2 transition-colors hover:text-ink-secondary focus:outline-none focus:text-ink-secondary"
        >
          I don&apos;t know my curve yet
        </button>
      ) : null}

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!canContinue} />
    </div>
  );
}

// Exercise is not the whole of scoliosis care, and an app that only ever
// talks about exercise can quietly imply that it is. The SOSORT guideline
// position, stated once, plainly, where the severity is entered:
//   under 25°           exercise-based care is the usual first step
//   25–40°, growing     bracing plus exercise is the usual recommendation
//   over 40°            a specialist's plan; exercise alone is not treatment
function BracingNote({
  severity,
  ageYears,
}: {
  severity: Severity | null;
  ageYears: number | null;
}) {
  if (!severity) return null;
  const growing = typeof ageYears === "number" && ageYears < LIKELY_STILL_GROWING_UNDER;

  let text: string;
  if (severity === "mild") {
    text =
      "Under 25°, exercise-based care and regular check-ups are the usual first step. That's what this app supports.";
  } else if (severity === "moderate") {
    text = growing
      ? "At 25–40° while you're still growing, the usual recommendation is a brace worn alongside exercise — exercise on its own isn't the standard of care at this stage. If no one has discussed bracing with you, that's worth asking about."
      : "At 25–40° in an adult, exercise and monitoring are usual; bracing is mainly for curves that are still growing. Your specialist decides what applies to you.";
  } else if (severity === "severe") {
    text =
      "Over 40° needs a specialist's plan. Exercise can still help how you feel and function, but it isn't a treatment for the curve itself at this size, and this app won't pretend otherwise.";
  } else {
    text =
      "If you don't know your Cobb angle, it's worth finding out — it decides whether exercise alone is the right plan, or whether bracing or a specialist should be involved.";
  }

  return (
    <Card tone="muted" className="space-y-1">
      <p className="text-[13.5px] leading-relaxed text-ink-secondary">{text}</p>
      <p className="text-[12px] text-ink-tertiary">
        Based on the SOSORT international guideline. Your own team&rsquo;s advice
        always comes first.
      </p>
    </Card>
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
            Higher on the {side}
          </p>
          <p className="text-[13px] text-ink-tertiary">
            The hump is on my {side} when I bend forward
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
