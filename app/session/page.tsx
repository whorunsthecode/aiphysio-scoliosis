"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Play,
  ScanLine,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import { SessionShell } from "@/components/session/SessionShell";
import { PainQuickCheck } from "@/components/session/PainQuickCheck";
import { SessionComplete } from "@/components/session/SessionComplete";
import { loadDraft } from "@/lib/onboarding/persist";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import { triage } from "@/lib/safety/redFlags";
import type { TriageResult } from "@/lib/safety/types";
import { RedFlagNotice } from "@/components/safety/RedFlagNotice";
import {
  deriveCurvePattern,
  deriveRegionalSides,
} from "@/lib/exercises/profile";
import { selectProgram } from "@/lib/exercises/selectProgram";
import { saveSession } from "@/lib/session/persist";
import type { SessionState } from "@/lib/session/types";
import type { OnboardingState, Side } from "@/lib/onboarding/types";
import type { PostureSnapshot } from "@/lib/pose/stats";
import type { Exercise } from "@/lib/exercises/types";
import type { SelectionResult } from "@/lib/exercises/selectProgram";
import type { SessionSummary } from "@/components/exercise/ExerciseCoach";

const PoseScanner = dynamic(
  () => import("@/components/pose/PoseScanner").then((m) => m.PoseScanner),
  { ssr: false },
);
const ExerciseCoach = dynamic(
  () =>
    import("@/components/exercise/ExerciseCoach").then((m) => m.ExerciseCoach),
  { ssr: false },
);

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

export default function SessionPage() {
  const [profile, setProfile] = useState<OnboardingState>(TEST_PROFILE);
  const [triageResult, setTriage] = useState<TriageResult | null>(null);
  const [usedDraft, setUsedDraft] = useState(false);
  const [session, setSession] = useState<SessionState>(() => ({
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`,
    startedAt: Date.now(),
    completedAt: null,
    phase: "preparing",
    pain: [],
    initialScan: null,
    finalScan: null,
    program: null,
    currentExerciseIdx: 0,
    exerciseSummaries: [],
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.curveType) {
      setProfile(draft);
      setUsedDraft(true);
    }
  }, []);

  const sides = useMemo(() => deriveRegionalSides(profile), [profile]);

  // Build the program from initial scan (and current pain check) once we
  // have an initial scan.
  useEffect(() => {
    if (session.phase !== "initial_scan") return;
    if (!session.initialScan) return;
    // Re-run the stored screen every session rather than trusting the
    // onboarding verdict indefinitely — the ruleset changes, and so do
    // symptoms. An emergency flag returns an empty programme.
    const triageResult = triage({
      answers: profile.safetyScreen ?? {},
      profile: {
        primaryCurveApex: profile.primaryCurveApex,
        primaryConvexSide: profile.primaryLeanSide,
        ageYears: profile.ageYears ?? null,
      },
    });
    const program = selectProgram({
      profile,
      scan: session.initialScan.measurements,
      pain: session.pain,
      physioProgram: profile.physioProgram.parsed,
      physioClarifications: profile.physioProgram.clarifications,
      triage: triageResult,
    });
    setTriage(triageResult);
    setSession((s) => ({
      ...s,
      program,
      phase: "program_preview",
    }));
  }, [session.phase, session.initialScan, session.pain, profile]);

  const onPainContinue = (points: typeof session.pain) =>
    setSession((s) => ({ ...s, pain: points, phase: "initial_scan" }));
  const onPainSkip = () =>
    setSession((s) => ({ ...s, pain: [], phase: "initial_scan" }));

  const onInitialScan = (snapshot: PostureSnapshot) =>
    setSession((s) => ({ ...s, initialScan: snapshot }));

  const onFinalScan = useCallback(
    async (snapshot: PostureSnapshot) => {
      const completed: SessionState = {
        ...session,
        finalScan: snapshot,
        phase: "complete",
        completedAt: Date.now(),
      };
      setSession(completed);
      setSaving(true);
      setSaveError(null);
      const result = await saveSession(completed);
      setSaving(false);
      if (!result.ok) setSaveError(result.error);
    },
    [session],
  );

  const beginProgram = () =>
    setSession((s) => ({ ...s, phase: "exercise", currentExerciseIdx: 0 }));

  const onExerciseComplete = (summary: SessionSummary) => {
    setSession((s) => {
      const summaries = [...s.exerciseSummaries, summary];
      const nextIdx = s.currentExerciseIdx + 1;
      const total = s.program?.exercises.length ?? 0;
      if (nextIdx >= total) {
        return {
          ...s,
          exerciseSummaries: summaries,
          phase: "final_scan",
        };
      }
      return {
        ...s,
        exerciseSummaries: summaries,
        currentExerciseIdx: nextIdx,
      };
    });
  };

  const startSession = () =>
    setSession((s) => ({ ...s, phase: "pain_check" }));

  const program = session.program;
  const currentExercise: Exercise | null = program
    ? (program.exercises[session.currentExerciseIdx]?.exercise ?? null)
    : null;
  const configuredSide: Side | null = currentExercise
    ? sideForExercise(currentExercise.id, sides)
    : null;

  return (
    <SessionShell
      phase={session.phase}
      exerciseProgress={
        program && session.phase === "exercise"
          ? {
              current: session.currentExerciseIdx + 1,
              total: program.exercises.length,
            }
          : undefined
      }
    >
      {session.phase === "preparing" ? (
        <PreparingPhase
          profile={profile}
          usedDraft={usedDraft}
          onStart={startSession}
        />
      ) : null}

      {session.phase === "pain_check" ? (
        <PainQuickCheck
          initial={session.pain}
          onContinue={onPainContinue}
          onSkip={onPainSkip}
        />
      ) : null}

      {session.phase === "initial_scan" ? (
        <ScanPhase
          title="Today's check-in"
          subtitle="Stand 1.5–2 m from the camera, square-on. We'll capture a 10-second snapshot before practice."
          onCapture={onInitialScan}
        />
      ) : null}

      {session.phase === "program_preview" && program ? (
        <div className="flex flex-col gap-6">
          {triageResult?.severity ? (
            <RedFlagNotice result={triageResult} name={profile.name} />
          ) : null}
          {/* An emergency flag leaves selectProgram with nothing to show, and
              there is no "begin anyway" affordance — the notice is the whole
              screen. */}
          {program.exercises.length > 0 ? (
            <ProgramPreview program={program} onBegin={beginProgram} />
          ) : null}
        </div>
      ) : null}

      {session.phase === "exercise" && currentExercise && program ? (
        <ExercisePhase
          exercise={currentExercise}
          program={program}
          configuredSide={configuredSide}
          currentIdx={session.currentExerciseIdx}
          onComplete={onExerciseComplete}
        />
      ) : null}

      {session.phase === "final_scan" ? (
        <ScanPhase
          title="One more check-in"
          subtitle="Same scan as before. We'll compare so you can see what shifted."
          onCapture={onFinalScan}
        />
      ) : null}

      {session.phase === "complete" ? (
        <SessionComplete
          session={session}
          saving={saving}
          saveError={saveError}
        />
      ) : null}
    </SessionShell>
  );
}

function sideForExercise(
  exerciseId: string,
  sides: ReturnType<typeof deriveRegionalSides>,
): Side | null {
  if (exerciseId === "side_plank_convex_thoracic_side_down")
    return sides.thoracicConvex;
  if (exerciseId === "hip_bridge_pelvic_press_down") return sides.lumbarConvex;
  if (exerciseId === "bird_dog_asymmetric_hold") return sides.thoracicConcave;
  return null;
}

function PreparingPhase({
  profile,
  usedDraft,
  onStart,
}: {
  profile: OnboardingState;
  usedDraft: boolean;
  onStart: () => void;
}) {
  const pattern = deriveCurvePattern(profile);
  const sides = deriveRegionalSides(profile);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <SectionLabel>{today}</SectionLabel>
        <Heading level={1}>
          Hi {profile.name?.trim() || "there"} — let&rsquo;s get into it.
        </Heading>
        <p className="max-w-xl text-ink-secondary">
          Five steps. Pain check-in, a 10-second posture scan, three to five
          exercises, another scan, and we compare. About 12 minutes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sage-tint text-sage-dark">
            <ScanLine size={20} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-[16px] font-medium text-ink-primary">
              Pose detection runs in your browser
            </p>
            <p className="mt-1 text-[13px] text-ink-secondary">
              No video leaves your device. Camera lights up only during scans
              and exercises.
            </p>
          </div>
        </Card>
        <Card className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sage-tint text-sage-dark">
            <Sparkles size={20} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-[16px] font-medium text-ink-primary">
              Exercises picked for your curve
            </p>
            <p className="mt-1 text-[13px] text-ink-secondary">
              {prettyPattern(pattern)}
              {sides.thoracicConvex
                ? `, thoracic bulges ${sides.thoracicConvex}`
                : ""}
              {sides.lumbarConvex ? `, lumbar bulges ${sides.lumbarConvex}` : ""}.
            </p>
          </div>
        </Card>
      </div>

      {!usedDraft ? (
        <Card tone="terracotta" className="space-y-2">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={18}
              strokeWidth={1.6}
              className="mt-0.5 shrink-0 text-terracotta-dark"
            />
            <div>
              <p className="font-medium text-ink-primary">
                Running on the spec test profile.
              </p>
              <p className="text-[14px] text-ink-secondary">
                Side cues are derived from a placeholder curve.{" "}
                <Link href="/onboarding" className="text-sage-dark hover:underline">
                  Finish onboarding
                </Link>{" "}
                so the program is genuinely yours.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="pt-2">
        <Button
          variant="primary"
          onClick={onStart}
          rightIcon={<ArrowRight size={18} strokeWidth={1.5} />}
        >
          Begin
        </Button>
      </div>
    </div>
  );
}

function ScanPhase({
  title,
  subtitle,
  onCapture,
}: {
  title: string;
  subtitle: string;
  onCapture: (snapshot: PostureSnapshot) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Heading level={1}>{title}</Heading>
        <p className="max-w-xl text-ink-secondary">{subtitle}</p>
      </div>
      <PoseScanner onCapture={onCapture} />
    </div>
  );
}

function ProgramPreview({
  program,
  onBegin,
}: {
  program: SelectionResult;
  onBegin: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <SectionLabel>Today&rsquo;s practice</SectionLabel>
        <Heading level={1}>{program.exercises.length} exercises</Heading>
        <p className="max-w-xl text-ink-secondary">
          Selected from your scan and how you&rsquo;re feeling. We&rsquo;ll do
          them in order. End the session anytime — what you do still counts.
        </p>
      </div>

      {program.notes.length > 0 ? (
        <Card tone="muted" className="space-y-1.5 text-[13px] text-ink-secondary">
          {program.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </Card>
      ) : null}

      <div className="grid gap-3">
        {program.exercises.map((px, i) => (
          <Card
            key={i}
            className="flex items-center gap-4"
          >
            <div className="grid h-10 w-10 place-items-center rounded-full bg-sage-tint font-display text-[16px] text-sage-dark">
              {i + 1}
            </div>
            <div className="flex-1">
              <p className="font-display text-[18px] text-ink-primary">
                {px.display.name}
              </p>
              {px.display.side_cue ? (
                <p className="text-[13px] text-sage-dark">{px.display.side_cue}</p>
              ) : null}
              <p className="text-[12px] text-ink-tertiary">{px.reason}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {px.display.reps != null ? (
                <TagPill tone="neutral">{px.display.reps} reps</TagPill>
              ) : null}
              {px.display.duration_seconds != null ? (
                <TagPill tone="neutral">{px.display.duration_seconds}s hold</TagPill>
              ) : null}
              {px.display.sets != null ? (
                <TagPill tone="neutral">{px.display.sets} sets</TagPill>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <div className="pt-2">
        <Button
          variant="primary"
          onClick={onBegin}
          leftIcon={<Play size={18} strokeWidth={1.5} />}
        >
          Begin first exercise
        </Button>
      </div>
    </div>
  );
}

function ExercisePhase({
  exercise,
  program,
  configuredSide,
  currentIdx,
  onComplete,
}: {
  exercise: Exercise;
  program: SelectionResult;
  configuredSide: Side | null;
  currentIdx: number;
  onComplete: (summary: SessionSummary) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionLabel>
          Exercise {currentIdx + 1} of {program.exercises.length} · Tier{" "}
          {exercise.tier}
        </SectionLabel>
        <Heading level={1}>{exercise.name}</Heading>
        <p className="max-w-xl text-ink-secondary">{exercise.description}</p>
      </div>
      <ExerciseCoach
        exercise={exercise}
        configuredSide={configuredSide}
        onComplete={onComplete}
      />
      <Card tone="muted" className="text-[13px] text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2
            size={13}
            strokeWidth={1.6}
            className="text-sage-dark"
          />
          When all sets are done, the next exercise loads automatically.
        </span>
      </Card>
    </div>
  );
}

function prettyPattern(p: string): string {
  const map: Record<string, string> = {
    right_thoracic: "Right thoracic curve",
    left_thoracic: "Left thoracic curve",
    right_lumbar: "Right lumbar curve",
    left_lumbar: "Left lumbar curve",
    double_right_thoracic_left_lumbar:
      "Double major (R thoracic / L lumbar)",
    double_left_thoracic_right_lumbar:
      "Double major (L thoracic / R lumbar)",
    thoracolumbar: "Thoracolumbar curve",
    any: "Curve pattern not yet set",
  };
  return map[p] ?? p;
}
