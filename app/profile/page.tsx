"use client";

// Profile route — view + edit the user's curve pattern, prescription mode,
// and physio program. Backed by the same localStorage profile draft as
// onboarding, so changes here flow into selectProgram + agents immediately.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Edit3,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Chip } from "@/components/ui/Chip";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TagPill } from "@/components/ui/TagPill";
import { loadDraft, saveProfile } from "@/lib/onboarding/persist";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type {
  ApexRegion,
  CurveType,
  OnboardingState,
  SegmentShift,
  Severity,
  Side,
} from "@/lib/onboarding/types";

const CURVE_TYPES: { id: CurveType; label: string }[] = [
  { id: "S", label: "S-curve" },
  { id: "C", label: "C-curve" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "unknown", label: "Unsure" },
];

const APEX_OPTIONS: { id: ApexRegion; label: string }[] = [
  { id: "cervical", label: "Cervical" },
  { id: "upper_thoracic", label: "Upper thoracic" },
  { id: "lower_thoracic", label: "Lower thoracic" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "lumbar", label: "Lumbar" },
];

const SEVERITY: { id: Severity; label: string }[] = [
  { id: "mild", label: "Mild (under 25°)" },
  { id: "moderate", label: "Moderate (25–40°)" },
  { id: "severe", label: "Severe (over 40°)" },
  { id: "unknown", label: "I don’t know" },
];

const SHIFT_OPTIONS: { id: SegmentShift; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "centered", label: "Centered" },
];

const SEGMENTS: {
  key: keyof OnboardingState["segmentShifts"];
  label: string;
}[] = [
  { key: "cervical", label: "I · Cervical" },
  { key: "upper_thoracic", label: "II · Upper thoracic" },
  { key: "lower_thoracic", label: "III · Lower thoracic" },
  { key: "lumbar", label: "IV · Lumbar" },
];

export default function ProfilePage() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(loadDraft() ?? initialOnboardingState);
  }, []);

  if (!state) {
    return (
      <AppShell>
        <main className="grid min-h-[60vh] place-items-center">
          <Loader2 size={20} className="animate-spin text-sage-dark" />
        </main>
      </AppShell>
    );
  }

  const set = <K extends keyof OnboardingState>(
    key: K,
    value: OnboardingState[K],
  ) => setState((p) => (p ? { ...p, [key]: value } : p));

  const setSegment = (
    seg: keyof OnboardingState["segmentShifts"],
    value: SegmentShift,
  ) =>
    setState((p) =>
      p ? { ...p, segmentShifts: { ...p.segmentShifts, [seg]: value } } : p,
    );

  const onSave = async () => {
    if (!state) return;
    setSaving(true);
    setError(null);
    const result = await saveProfile(state);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedAt(Date.now());
  };

  const hasPhysio =
    state.physioProgram.rawText.trim().length > 0 ||
    !!state.physioProgram.parsed;

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-6 py-12 lg:px-12 lg:py-16 space-y-8">
        <header className="space-y-2">
          <Heading level={1}>Profile</Heading>
          <p className="text-ink-secondary">
            Curve pattern · prescription mode · physio program
          </p>
        </header>

        {/* Basic info */}
        <Card className="space-y-5">
          <SectionLabel>Basic info</SectionLabel>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <SectionLabel>Name</SectionLabel>
              <Input
                value={state.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <SectionLabel>Prescription mode</SectionLabel>
              <div className="flex flex-wrap gap-2">
                <Chip
                  selected={hasPhysio}
                  onClick={() => {
                    if (!hasPhysio) {
                      // jump back to onboarding step 5 to add a program
                      window.location.href = "/onboarding";
                    }
                  }}
                >
                  Physio-cleared program
                </Chip>
                <Chip
                  selected={!hasPhysio}
                  onClick={() =>
                    set("physioProgram", {
                      rawText: "",
                      parsed: null,
                      parseStatus: "idle",
                      parseError: null,
                      clarifications: {},
                    })
                  }
                >
                  Self-guided
                </Chip>
              </div>
              <p className="text-[12px] text-ink-tertiary">
                {hasPhysio
                  ? "Your physio's program is the source of truth. Coach adjusts volume + emphasis around it."
                  : "Self-guided: programs are built from the curated library based on your curve."}
              </p>
            </div>
          </div>
        </Card>

        {/* Curve pattern */}
        <Card className="space-y-5">
          <SectionLabel>Curve pattern</SectionLabel>

          <div className="space-y-2">
            <SectionLabel>Curve type</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {CURVE_TYPES.map((opt) => (
                <Chip
                  key={opt.id}
                  variant="card"
                  selected={state.curveType === opt.id}
                  onClick={() => set("curveType", opt.id)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <SectionLabel>Primary apex</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {APEX_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={state.primaryCurveApex === opt.id}
                    onClick={() => set("primaryCurveApex", opt.id)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <SectionLabel>Primary bulges to</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(["left", "right"] as Side[]).map((s) => (
                  <Chip
                    key={s}
                    selected={state.primaryLeanSide === s}
                    onClick={() => set("primaryLeanSide", s)}
                  >
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          {state.curveType === "S" ? (
            <div className="grid gap-5 sm:grid-cols-2 border-t border-border/60 pt-5">
              <div className="space-y-2">
                <SectionLabel>Secondary apex</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {APEX_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      selected={state.secondaryCurveApex === opt.id}
                      onClick={() => set("secondaryCurveApex", opt.id)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <SectionLabel>Secondary bulges to</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {(["left", "right"] as Side[]).map((s) => (
                    <Chip
                      key={s}
                      selected={state.secondaryLeanSide === s}
                      onClick={() => set("secondaryLeanSide", s)}
                    >
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-border/60 pt-5">
            <SectionLabel>Severity</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {SEVERITY.map((opt) => (
                <Chip
                  key={opt.id}
                  variant="card"
                  selected={state.severity === opt.id}
                  onClick={() => set("severity", opt.id)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>
        </Card>

        {/* Segmental shift */}
        <Card className="space-y-4">
          <SectionLabel>Four-segment shift profile</SectionLabel>
          <div className="space-y-3">
            {SEGMENTS.map((seg) => (
              <div
                key={seg.key}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-[14px] text-ink-primary">
                  {seg.label}
                </span>
                <div className="flex flex-wrap gap-2">
                  {SHIFT_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      selected={state.segmentShifts[seg.key] === opt.id}
                      onClick={() => setSegment(seg.key, opt.id)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Physio program (read-only summary; jump to onboarding for full edit) */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Physio program</SectionLabel>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-[13px] text-sage-dark hover:underline"
            >
              <Edit3 size={12} strokeWidth={1.6} /> Edit in onboarding
            </Link>
          </div>
          {hasPhysio && state.physioProgram.parsed ? (
            <div className="space-y-2">
              <p className="text-[13px] text-ink-secondary">
                {state.physioProgram.parsed.exercises.length} exercise
                {state.physioProgram.parsed.exercises.length === 1 ? "" : "s"}{" "}
                parsed.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.physioProgram.parsed.exercises
                  .slice(0, 5)
                  .map((ex, i) => (
                    <TagPill key={i} tone="sage">
                      {ex.name}
                    </TagPill>
                  ))}
                {state.physioProgram.parsed.exercises.length > 5 ? (
                  <TagPill tone="neutral">
                    +{state.physioProgram.parsed.exercises.length - 5} more
                  </TagPill>
                ) : null}
              </div>
            </div>
          ) : state.physioProgram.rawText ? (
            <Textarea
              value={state.physioProgram.rawText}
              rows={5}
              readOnly
              className="opacity-80"
            />
          ) : (
            <p className="text-[13px] text-ink-secondary">
              No physio program on file. Self-guided mode active.
            </p>
          )}
        </Card>

        {error ? (
          <Card tone="terracotta" className="text-[14px] text-ink-primary">
            Couldn&rsquo;t save: {error}
          </Card>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary hover:text-ink-primary"
          >
            <RotateCcw size={12} strokeWidth={1.6} /> Re-run onboarding
          </Link>
          <div className="flex items-center gap-3">
            {savedAt ? (
              <span className="text-[12px] text-ink-tertiary">
                Saved {new Date(savedAt).toLocaleTimeString()}
              </span>
            ) : null}
            <Button variant="primary" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
