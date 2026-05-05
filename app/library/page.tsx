"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Filter,
  Info,
  Play,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Heading } from "@/components/ui/Heading";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import { Button } from "@/components/ui/Button";
import { EXERCISE_LIBRARY } from "@/lib/exercises/library";
import {
  CONTRAINDICATION_RULES,
} from "@/lib/exercises/contraindications";
import { hasFormCheck } from "@/lib/exercises/formCheck/factory";
import { selectProgram } from "@/lib/exercises/selectProgram";
import {
  deriveCurvePattern,
  deriveRegionalSides,
} from "@/lib/exercises/profile";
import { loadDraft } from "@/lib/onboarding/persist";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type { OnboardingState } from "@/lib/onboarding/types";
import type { Exercise, CurvePatternKey } from "@/lib/exercises/types";

// Spec test profile: S-curve, 22°, right thoracic + left lumbar, all four
// segments shifted left, right hip flexor stiff. Used as the demo profile
// when no localStorage draft is present.
const TEST_PROFILE: OnboardingState = {
  ...initialOnboardingState,
  name: "demo",
  curveType: "S",
  severity: "mild",
  primaryCurveApex: "lower_thoracic",
  primaryLeanSide: "right",
  secondaryCurveApex: "lumbar",
  secondaryLeanSide: "left",
  segmentShifts: {
    cervical: "left",
    upper_thoracic: "left",
    lower_thoracic: "left",
    lumbar: "left",
  },
};

const CATEGORIES = [
  "all",
  "strength",
  "flexibility",
  "breathing",
  "balance",
  "derotation",
] as const;

const TIERS = [
  { id: "all" as const, label: "All tiers" },
  { id: 1 as const, label: "Tier 1 — Pelvic de-rotation" },
  { id: 2 as const, label: "Tier 2 — Asymmetric strength" },
  { id: 3 as const, label: "Tier 3 — Schroth-adjacent" },
  { id: 4 as const, label: "Tier 4 — Daily mobility" },
  { id: 5 as const, label: "Tier 5 — Breathing" },
];

export default function LibraryPage() {
  const [profile, setProfile] = useState<OnboardingState>(TEST_PROFILE);
  const [usedDraft, setUsedDraft] = useState(false);

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [tier, setTier] = useState<(typeof TIERS)[number]["id"]>("all");

  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.curveType) {
      setProfile(draft);
      setUsedDraft(true);
    }
  }, []);

  const pattern = useMemo(() => deriveCurvePattern(profile), [profile]);
  const sides = useMemo(() => deriveRegionalSides(profile), [profile]);

  const program = useMemo(
    () =>
      selectProgram({
        profile,
        scan: null,
        pain: profile.pain,
        physioProgram: profile.physioProgram.parsed,
        physioClarifications: profile.physioProgram.clarifications,
      }),
    [profile],
  );

  const filtered = useMemo(() => {
    return EXERCISE_LIBRARY.filter((e) => {
      if (category !== "all" && e.category !== category) return false;
      if (tier !== "all" && e.tier !== tier) return false;
      return true;
    });
  }, [category, tier]);

  return (
    <AppShell>
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-12 lg:py-16 space-y-12">
      <header className="space-y-2">
        <SectionLabel>
          {EXERCISE_LIBRARY.length} exercises · asymmetric prescription
        </SectionLabel>
        <Heading level={1}>Exercise library</Heading>
        <p className="max-w-2xl text-ink-secondary">
          Each exercise tagged with which curve patterns it helps, asymmetric
          side cues, and the regions it loads. Selection logic builds a 3–5
          exercise program from your profile, today&rsquo;s scan, and any pain
          you&rsquo;ve flagged.
        </p>
      </header>

      {/* Today's program demo */}
      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <SectionLabel>Today&rsquo;s program · demo</SectionLabel>
            <Heading level={2}>
              For your curve · {prettyPattern(pattern)}
            </Heading>
          </div>
          <div className="flex items-center gap-2">
            <TagPill tone="sage">{program.mode.replace("_", " ")}</TagPill>
            {usedDraft ? (
              <TagPill tone="sage">your saved profile</TagPill>
            ) : (
              <TagPill tone="neutral">spec test profile</TagPill>
            )}
          </div>
        </div>

        {program.notes.length > 0 ? (
          <Card tone="muted" className="space-y-1.5">
            {program.notes.map((n, i) => (
              <p
                key={i}
                className="flex gap-2 text-[13px] text-ink-secondary"
              >
                <Info
                  size={14}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-sage-dark"
                />
                <span>{n}</span>
              </p>
            ))}
          </Card>
        ) : null}

        {program.warnings.length > 0 ? (
          <Card tone="terracotta" className="space-y-1.5">
            {program.warnings.map((w, i) => (
              <p
                key={i}
                className="flex gap-2 text-[14px] text-ink-primary"
              >
                <ShieldAlert
                  size={15}
                  strokeWidth={1.6}
                  className="mt-0.5 shrink-0 text-terracotta-dark"
                />
                <span>{w}</span>
              </p>
            ))}
          </Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {program.exercises.map((px, i) => (
            <Card key={i} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[18px] text-ink-primary">
                    {px.display.name}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-secondary">
                    {px.display.description}
                  </p>
                </div>
                <TagPill tone={px.source === "physio" ? "sage" : "neutral"}>
                  {px.source}
                </TagPill>
              </div>

              {px.display.side_cue ? (
                <p className="text-[13px] text-sage-dark">
                  · {px.display.side_cue}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {px.display.reps != null ? (
                  <Counter label="reps" value={px.display.reps} />
                ) : null}
                {px.display.sets != null ? (
                  <Counter label="sets" value={px.display.sets} />
                ) : null}
                {px.display.duration_seconds != null ? (
                  <Counter
                    label="hold"
                    value={`${px.display.duration_seconds}s`}
                  />
                ) : null}
              </div>

              {px.physio_clarification ? (
                <p className="rounded-2xl bg-sage-wash px-3 py-2 text-[12px] text-ink-secondary">
                  Your note: {px.physio_clarification}
                </p>
              ) : null}

              {px.exercise && hasFormCheck(px.exercise.id) ? (
                <div className="pt-1">
                  <Link href={`/exercise/${px.exercise.id}`}>
                    <Button
                      variant="primary"
                      leftIcon={<Play size={16} strokeWidth={1.5} />}
                    >
                      Coach me through this
                    </Button>
                  </Link>
                </div>
              ) : null}

              {px.flags.length > 0 ? (
                <div className="space-y-1.5">
                  {px.flags.map((f, j) => (
                    <p
                      key={j}
                      className="flex items-start gap-2 text-[12px] text-terracotta-dark"
                    >
                      <ShieldAlert
                        size={13}
                        strokeWidth={1.6}
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        <span className="font-medium">{f.rule}:</span>{" "}
                        {f.note}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}

              <p className="border-t border-border/60 pt-2 text-[11px] text-ink-tertiary">
                {px.reason}
              </p>
            </Card>
          ))}
        </div>

        {program.suggestions.length > 0 ? (
          <div className="space-y-3 pt-2">
            <SectionLabel>Worth asking your physio about</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              {program.suggestions.map((s, i) => (
                <Card key={i} tone="sage" padding="md" className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-[16px] text-ink-primary">
                      {s.exercise.name}
                    </p>
                    <TagPill tone="sage">tier {s.exercise.tier}</TagPill>
                  </div>
                  {s.side_cue ? (
                    <p className="text-[12px] text-sage-dark">{s.side_cue}</p>
                  ) : null}
                  <p className="text-[12px] text-ink-secondary">{s.reason}</p>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        <Card padding="md" tone="muted" className="text-[13px] text-ink-secondary">
          <p className="mb-1 font-medium text-ink-primary">
            How this program was put together
          </p>
          <p>
            Pattern: <span className="font-mono">{pattern}</span>
            {sides.thoracicConvex
              ? `, thoracic bulges to ${sides.thoracicConvex}`
              : ""}
            {sides.lumbarConvex
              ? `, lumbar bulges to ${sides.lumbarConvex}`
              : ""}
            .
          </p>
          <p className="mt-1">
            Selection scans the library for exercises applicable to this
            pattern, drops anything the contraindication rules flag, skips
            anything that loads a painful region, then picks across tiers based
            on what your last scan showed (or a default mix when no scan is
            present).
          </p>
        </Card>
      </section>

      {/* Full library browser */}
      <section className="space-y-5 border-t border-border/60 pt-12">
        <div>
          <SectionLabel>Full library</SectionLabel>
          <Heading level={2}>All {EXERCISE_LIBRARY.length} exercises</Heading>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Filter
              size={16}
              strokeWidth={1.5}
              className="text-ink-tertiary"
            />
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                selected={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {TIERS.map((t) => (
              <Chip
                key={String(t.id)}
                selected={tier === t.id}
                onClick={() => setTier(t.id)}
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ex) => (
            <LibraryExerciseCard
              key={ex.id}
              exercise={ex}
              userPattern={pattern}
            />
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card tone="muted" className="text-[14px] text-ink-secondary">
            No exercises match those filters.
          </Card>
        ) : null}
      </section>

      {/* Contraindication rules */}
      <section className="space-y-5 border-t border-border/60 pt-12">
        <div>
          <SectionLabel>Contraindications</SectionLabel>
          <Heading level={2}>What we never auto-prescribe</Heading>
          <p className="mt-2 max-w-2xl text-ink-secondary">
            Three severity bands. <em>Absolute</em> rules block selection and
            flag the exercise if it shows up in your physio program.{" "}
            <em>Relative</em> rules don&rsquo;t auto-prescribe; we&rsquo;ll
            flag them softly. <em>Ask physio</em> items get a gentle nudge.
          </p>
        </div>

        <div className="space-y-3">
          {(["absolute", "relative", "ask_physio"] as const).map((band) => {
            const rules = CONTRAINDICATION_RULES.filter(
              (r) => r.category === band,
            );
            return (
              <Card key={band} className="space-y-3">
                <div className="flex items-center gap-2">
                  <SectionLabel>{band.replace("_", " ")}</SectionLabel>
                  <TagPill
                    tone={
                      band === "absolute"
                        ? "terracotta"
                        : band === "relative"
                          ? "terracotta"
                          : "neutral"
                    }
                  >
                    {rules.length} rules
                  </TagPill>
                </div>
                <ul className="space-y-3">
                  {rules.map((r) => (
                    <li key={r.id} className="space-y-1">
                      <p className="text-[14px] font-medium text-ink-primary">
                        {r.title}
                      </p>
                      <p className="text-[13px] text-ink-secondary">
                        {r.reason_user_facing}
                      </p>
                      {r.safe_alternatives ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[12px] text-ink-tertiary">
                          <CheckCircle2
                            size={13}
                            strokeWidth={1.6}
                            className="text-sage-dark"
                          />
                          Safer:{" "}
                          {r.safe_alternatives
                            .map(
                              (id) =>
                                EXERCISE_LIBRARY.find((e) => e.id === id)
                                  ?.name ?? id,
                            )
                            .join(", ")}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
    </AppShell>
  );
}

function LibraryExerciseCard({
  exercise,
  userPattern,
}: {
  exercise: Exercise;
  userPattern: CurvePatternKey;
}) {
  const applies =
    exercise.applicable_patterns.includes(userPattern) ||
    exercise.applicable_patterns.includes("any");
  const sideCue =
    exercise.asymmetric_cues[userPattern] ?? exercise.asymmetric_cues["any"];

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[16px] text-ink-primary">
            {exercise.name}
          </p>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {exercise.description}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TagPill tone="neutral">tier {exercise.tier}</TagPill>
          <TagPill tone="neutral">{exercise.category}</TagPill>
        </div>
      </div>

      {sideCue ? (
        <p className="rounded-2xl bg-sage-wash px-3 py-2 text-[12px] text-sage-dark">
          For your curve: {sideCue}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-1">
        {exercise.reps != null ? (
          <Counter label="reps" value={exercise.reps} />
        ) : null}
        {exercise.sets != null ? (
          <Counter label="sets" value={exercise.sets} />
        ) : null}
        {exercise.duration_seconds != null ? (
          <Counter label="hold" value={`${exercise.duration_seconds}s`} />
        ) : null}
        {exercise.per_side ? (
          <Counter label="" value="each side" />
        ) : null}
      </div>

      {exercise.loads_regions && exercise.loads_regions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-ink-tertiary">
          <span>loads:</span>
          {exercise.loads_regions.map((r) => (
            <TagPill key={r} tone="neutral">
              {r.replace("_", " ")}
            </TagPill>
          ))}
        </div>
      ) : null}

      {!applies ? (
        <p className="rounded-2xl border border-border bg-base px-3 py-2 text-[11px] text-ink-tertiary">
          Not applicable to your pattern ({prettyPattern(userPattern)}).
        </p>
      ) : null}

      <div className="pt-1">
        <Link href={`/exercise/${exercise.id}`}>
          <Button
            variant={hasFormCheck(exercise.id) ? "primary" : "secondary"}
            rightIcon={<ArrowRight size={16} strokeWidth={1.5} />}
          >
            {hasFormCheck(exercise.id) ? "Coach me" : "Open"}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-base px-3 py-1.5">
      {label ? (
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-secondary/80">
          {label}
        </p>
      ) : null}
      <p className="font-mono text-[14px] text-ink-primary">{value}</p>
    </div>
  );
}

function prettyPattern(pattern: CurvePatternKey): string {
  const map: Record<CurvePatternKey, string> = {
    right_thoracic: "right thoracic",
    left_thoracic: "left thoracic",
    right_lumbar: "right lumbar",
    left_lumbar: "left lumbar",
    double_right_thoracic_left_lumbar:
      "double major (right thoracic / left lumbar)",
    double_left_thoracic_right_lumbar:
      "double major (left thoracic / right lumbar)",
    thoracolumbar: "thoracolumbar",
    any: "any",
  };
  return map[pattern];
}
