"use client";

import { Heading } from "@/components/ui/Heading";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { StepNav } from "@/components/onboarding/StepNav";
import type { OnboardingState, SegmentShift } from "@/lib/onboarding/types";

const SEGMENTS: {
  id: keyof OnboardingState["segmentShifts"];
  numeral: string;
  label: string;
}[] = [
  { id: "cervical", numeral: "I", label: "Cervical (neck)" },
  { id: "upper_thoracic", numeral: "II", label: "Upper thoracic" },
  { id: "lower_thoracic", numeral: "III", label: "Lower thoracic" },
  { id: "lumbar", numeral: "IV", label: "Lumbar (low back)" },
];

const OPTIONS: { id: SegmentShift; label: string }[] = [
  { id: "left", label: "Shifted left" },
  { id: "right", label: "Shifted right" },
  { id: "centered", label: "Centered" },
];

interface SegmentStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
}

export function SegmentStep({
  state,
  update,
  onBack,
  onNext,
}: SegmentStepProps) {
  const setShift = (
    segment: keyof OnboardingState["segmentShifts"],
    value: SegmentShift,
  ) => {
    update({
      segmentShifts: { ...state.segmentShifts, [segment]: value },
    });
  };

  const allSet = SEGMENTS.every((s) => state.segmentShifts[s.id] !== null);

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>How is each segment sitting?</Heading>
        <p className="text-ink-secondary max-w-xl">
          We split the spine into four parts. For each, tell me whether it
          drifts to one side or stays in the middle. If you&rsquo;re not sure,
          leave it centered — your posture scan will refine this.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[180px_1fr] items-start">
        <Card tone="muted" className="hidden lg:block sticky top-32">
          <SegmentSpine shifts={state.segmentShifts} />
        </Card>

        <div className="space-y-5">
          {SEGMENTS.map((seg) => (
            <Card key={seg.id} className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <SectionLabel>Segment {seg.numeral}</SectionLabel>
                  <p className="mt-1 font-display text-[20px] text-ink-primary">
                    {seg.label}
                  </p>
                </div>
                <SegmentBadge
                  numeral={seg.numeral}
                  shift={state.segmentShifts[seg.id]}
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {OPTIONS.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={state.segmentShifts[seg.id] === opt.id}
                    onClick={() => setShift(seg.id, opt.id)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!allSet} />
    </div>
  );
}

function SegmentBadge({
  numeral,
  shift,
}: {
  numeral: string;
  shift: SegmentShift | null;
}) {
  const tone =
    shift === null
      ? "bg-base text-ink-tertiary border border-border"
      : shift === "centered"
        ? "bg-sage-tint text-sage-dark"
        : "bg-terracotta-wash text-terracotta-dark";
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full font-display text-[14px] ${tone}`}
    >
      {numeral}
    </span>
  );
}

function SegmentSpine({
  shifts,
}: {
  shifts: OnboardingState["segmentShifts"];
}) {
  // Vertical stylized spine; each segment offset based on its shift.
  const offset = (s: SegmentShift | null) =>
    s === "left" ? -10 : s === "right" ? 10 : 0;

  const segments = [
    { y: 24, shift: shifts.cervical, numeral: "I" },
    { y: 64, shift: shifts.upper_thoracic, numeral: "II" },
    { y: 104, shift: shifts.lower_thoracic, numeral: "III" },
    { y: 144, shift: shifts.lumbar, numeral: "IV" },
  ];

  // Build a smooth curve between segment centers
  const cx = 60;
  const points = segments.map((s) => ({
    x: cx + offset(s.shift),
    y: s.y,
  }));
  const path = `M${cx},10 ` + points.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${cx},170`;

  return (
    <svg viewBox="0 0 120 180" className="w-full">
      <line
        x1={cx}
        y1={6}
        x2={cx}
        y2={174}
        stroke="#e8e0d6"
        strokeDasharray="2 4"
      />
      <path
        d={path}
        fill="none"
        stroke="#7fa78a"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {segments.map((s) => {
        const cxd = cx + offset(s.shift);
        const filled = s.shift !== null;
        return (
          <g key={s.numeral}>
            <circle
              cx={cxd}
              cy={s.y}
              r={9}
              fill={filled ? "#7fa78a" : "#fffcf7"}
              stroke="#7fa78a"
              strokeWidth={2}
            />
            <text
              x={cxd}
              y={s.y + 3}
              textAnchor="middle"
              fontSize={9}
              fill={filled ? "#fffcf7" : "#7fa78a"}
              fontFamily="serif"
            >
              {s.numeral}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
