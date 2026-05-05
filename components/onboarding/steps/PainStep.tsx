"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { StepNav } from "@/components/onboarding/StepNav";
import type {
  OnboardingState,
  PainPoint,
} from "@/lib/onboarding/types";

const REGIONS: { id: string; label: string; cx: number; cy: number }[] = [
  { id: "neck", label: "Neck", cx: 60, cy: 28 },
  { id: "left_shoulder", label: "Left shoulder", cx: 38, cy: 50 },
  { id: "right_shoulder", label: "Right shoulder", cx: 82, cy: 50 },
  { id: "upper_back", label: "Upper back", cx: 60, cy: 60 },
  { id: "mid_back", label: "Mid back", cx: 60, cy: 82 },
  { id: "lower_back", label: "Lower back", cx: 60, cy: 108 },
  { id: "left_hip", label: "Left hip", cx: 44, cy: 124 },
  { id: "right_hip", label: "Right hip", cx: 76, cy: 124 },
];

const PAIN_TYPES: PainPoint["type"][] = ["sharp", "dull", "ache", "tingling"];

interface PainStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  saving?: boolean;
}

export function PainStep({
  state,
  update,
  onBack,
  onNext,
  onSkip,
  saving,
}: PainStepProps) {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const activeRegionMeta = REGIONS.find((r) => r.id === activeRegion);

  const addOrUpdate = (patch: Partial<PainPoint> & { location: string }) => {
    const existing = state.pain.find((p) => p.location === patch.location);
    if (existing) {
      update({
        pain: state.pain.map((p) =>
          p.location === patch.location ? { ...p, ...patch } : p,
        ),
      });
    } else {
      update({
        pain: [
          ...state.pain,
          {
            id: crypto.randomUUID(),
            location: patch.location,
            intensity: patch.intensity ?? 3,
            type: patch.type ?? "ache",
          },
        ],
      });
    }
  };

  const remove = (location: string) =>
    update({ pain: state.pain.filter((p) => p.location !== location) });

  const startEditing = (regionId: string) => {
    setActiveRegion(regionId);
    if (!state.pain.some((p) => p.location === regionId)) {
      addOrUpdate({ location: regionId, intensity: 3, type: "ache" });
    }
  };

  const activePoint = state.pain.find((p) => p.location === activeRegion);

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>How are you feeling today?</Heading>
        <p className="text-ink-secondary max-w-xl">
          Tap anywhere that aches, tingles, or feels sharp. We&rsquo;ll keep an
          eye on these over time and skip exercises that load painful areas.
          Skip this if nothing&rsquo;s bothering you.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr] items-start">
        <Card tone="muted" className="flex justify-center py-8">
          <BodyMap
            painPoints={state.pain}
            activeRegion={activeRegion}
            onSelect={startEditing}
          />
        </Card>

        <div className="space-y-5">
          {activePoint ? (
            <Card className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <SectionLabel>Editing</SectionLabel>
                  <p className="mt-1 font-display text-[22px] text-ink-primary">
                    {activeRegionMeta?.label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    remove(activePoint.location);
                    setActiveRegion(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-ink-secondary transition-colors hover:bg-base hover:text-terracotta-dark"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                  Remove
                </button>
              </div>

              <div className="space-y-2">
                <SectionLabel>Intensity</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 11 }).map((_, n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        addOrUpdate({
                          location: activePoint.location,
                          intensity: n,
                        })
                      }
                      className={
                        "h-9 w-9 rounded-full font-mono text-[13px] transition-all " +
                        (activePoint.intensity === n
                          ? "bg-sage text-white shadow-card"
                          : "bg-base text-ink-secondary hover:bg-sage-wash")
                      }
                      aria-pressed={activePoint.intensity === n}
                      aria-label={`Intensity ${n}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-ink-tertiary">
                  0 = nothing, 10 = the worst it&rsquo;s ever been
                </p>
              </div>

              <div className="space-y-2">
                <SectionLabel>What does it feel like?</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {PAIN_TYPES.map((t) => (
                    <Chip
                      key={t}
                      selected={activePoint.type === t}
                      onClick={() =>
                        addOrUpdate({
                          location: activePoint.location,
                          type: t,
                        })
                      }
                    >
                      {t}
                    </Chip>
                  ))}
                </div>
              </div>
            </Card>
          ) : (
            <Card tone="sage" className="text-[14px] text-ink-primary/85">
              Tap a region on the body to log how it feels today.
            </Card>
          )}

          {state.pain.length > 0 ? (
            <div className="space-y-2">
              <SectionLabel>Logged today</SectionLabel>
              <div className="space-y-2">
                {state.pain.map((p) => {
                  const region = REGIONS.find((r) => r.id === p.location);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setActiveRegion(p.location)}
                      className={
                        "flex w-full items-center justify-between rounded-2xl border bg-surface px-5 py-3 text-left transition-colors " +
                        (activeRegion === p.location
                          ? "border-sage"
                          : "border-border hover:border-sage/50")
                      }
                    >
                      <div>
                        <p className="text-[15px] text-ink-primary">
                          {region?.label ?? p.location}
                        </p>
                        <p className="text-[12px] text-ink-tertiary">
                          {p.type}
                        </p>
                      </div>
                      <span className="font-mono text-[14px] text-ink-secondary">
                        {p.intensity}/10
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <StepNav
        onBack={onBack}
        onNext={onNext}
        onSkip={onSkip}
        nextLabel="Finish setup"
        isFinal
        saving={saving}
      />
    </div>
  );
}

function BodyMap({
  painPoints,
  activeRegion,
  onSelect,
}: {
  painPoints: PainPoint[];
  activeRegion: string | null;
  onSelect: (id: string) => void;
}) {
  const intensityFill = (intensity: number) => {
    if (intensity <= 3) return "rgba(127, 167, 138, 0.55)";
    if (intensity <= 6) return "rgba(232, 163, 151, 0.65)";
    return "rgba(178, 116, 96, 0.75)";
  };

  return (
    <svg viewBox="0 0 120 170" width="200" height="280" aria-label="Body map">
      {/* head */}
      <circle cx={60} cy={14} r={10} fill="#fbf7f2" stroke="#b8aea4" strokeWidth={1.5} />
      {/* shoulders + torso */}
      <path
        d="M30 38 Q60 30 90 38 L92 95 Q92 110 86 130 L34 130 Q28 110 28 95 Z"
        fill="#fbf7f2"
        stroke="#b8aea4"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* hips */}
      <path
        d="M34 130 Q60 145 86 130 L84 158 L36 158 Z"
        fill="#fbf7f2"
        stroke="#b8aea4"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* arms */}
      <path
        d="M30 40 L20 90 L26 92 L34 50"
        fill="#fbf7f2"
        stroke="#b8aea4"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path
        d="M90 40 L100 90 L94 92 L86 50"
        fill="#fbf7f2"
        stroke="#b8aea4"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* tappable region dots */}
      {REGIONS.map((r) => {
        const point = painPoints.find((p) => p.location === r.id);
        const isActive = activeRegion === r.id;
        return (
          <g
            key={r.id}
            onClick={() => onSelect(r.id)}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={r.cx}
              cy={r.cy}
              r={point ? 7 : 5}
              fill={point ? intensityFill(point.intensity) : "transparent"}
              stroke={isActive ? "#7fa78a" : "#b8aea4"}
              strokeWidth={isActive ? 2 : 1.2}
            />
            <circle
              cx={r.cx}
              cy={r.cy}
              r={2}
              fill={point ? "#fffcf7" : "#b8aea4"}
            />
            <title>{r.label}</title>
          </g>
        );
      })}
    </svg>
  );
}
