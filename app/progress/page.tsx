"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Heart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "@/components/ui/StatCard";
import { TagPill } from "@/components/ui/TagPill";
import { MeasurementTrendCard } from "@/components/charts/MeasurementTrendCard";
import { PainHeatmap } from "@/components/charts/PainHeatmap";
import { loadSessionHistory } from "@/lib/session/persist";
import {
  ALL_MEASUREMENTS,
  aggregatePain,
  extractTrend,
  weekStats,
} from "@/lib/session/trend";
import { lifestyleObservations } from "@/lib/session/lifestyle";
import { loadDraft } from "@/lib/onboarding/persist";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import { getExerciseById } from "@/lib/exercises/library";
import type { OnboardingState } from "@/lib/onboarding/types";
import type { SessionState } from "@/lib/session/types";

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
  lifestyle: {
    oneSidedSport: "badminton",
    oneSidedSportFrequency: "weekly",
    dailySittingHours: "8_to_12",
    bagCarryingSide: "right",
    sleepPosition: "right",
  },
};

export default function ProgressPage() {
  const [profile, setProfile] = useState<OnboardingState>(TEST_PROFILE);
  const [usedDraft, setUsedDraft] = useState(false);
  const [sessions, setSessions] = useState<SessionState[]>([]);

  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.curveType) {
      setProfile(draft);
      setUsedDraft(true);
    }
    setSessions(loadSessionHistory());
  }, []);

  const trends = useMemo(
    () =>
      ALL_MEASUREMENTS.map((id) => ({
        id,
        series: extractTrend(sessions, id),
      })),
    [sessions],
  );

  const stats = useMemo(() => weekStats(sessions), [sessions]);
  const painAgg = useMemo(() => aggregatePain(sessions), [sessions]);
  const observations = useMemo(
    () => lifestyleObservations(profile),
    [profile],
  );

  const overall = trends.find((t) => t.id === "overallScore")!;
  const lastSession = sessions[sessions.length - 1];

  const improving = trends.filter((t) => t.series.direction === "improving");
  const drifting = trends.filter((t) => t.series.direction === "drifting");

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-12 lg:py-16 space-y-12">
      <header className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <ArrowLeft size={14} strokeWidth={1.5} /> Home
        </Link>
        <SectionLabel>
          Longitudinal posture · {sessions.length} session
          {sessions.length === 1 ? "" : "s"} on file
        </SectionLabel>
        <Heading level={1}>Progress</Heading>
        <p className="max-w-2xl text-ink-secondary">
          What&rsquo;s shifting over time, weighted by how confident each scan
          was. Lighter bands around each line show the noise floor — small
          wiggles inside the band aren&rsquo;t change.
        </p>
      </header>

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Top stat row */}
          <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<TrendingUp size={18} strokeWidth={1.5} />}
              value={
                overall.series.points.length > 0
                  ? Math.round(
                      overall.series.points[overall.series.points.length - 1].value,
                    )
                  : "—"
              }
              label="Posture score"
              sublabel={
                overall.series.points.length >= 2
                  ? overall.series.direction === "improving"
                    ? "rising over time"
                    : overall.series.direction === "drifting"
                      ? "easing back"
                      : "stable"
                  : "needs more sessions"
              }
              tone={
                overall.series.direction === "improving" ? "sage" : "ink"
              }
            />
            <StatCard
              icon={<Calendar size={18} strokeWidth={1.5} />}
              value={stats.sessionsThisWeek}
              label="Sessions this week"
              sublabel={`${stats.activeDays} active day${stats.activeDays === 1 ? "" : "s"}`}
            />
            <StatCard
              icon={<Sparkles size={18} strokeWidth={1.5} />}
              value={improving.length}
              label="Markers easing"
              sublabel={`of ${trends.length}`}
              tone={improving.length > drifting.length ? "sage" : "ink"}
            />
            <StatCard
              icon={<Heart size={18} strokeWidth={1.5} />}
              value={Object.keys(painAgg).length}
              label="Pain regions"
              sublabel={
                Object.keys(painAgg).length === 0
                  ? "nothing flagged"
                  : "in recent sessions"
              }
              tone={
                Object.keys(painAgg).length === 0 ? "sage" : "terracotta"
              }
            />
          </section>

          {/* Trend grid */}
          <section className="space-y-5">
            <div>
              <SectionLabel>Posture markers over time</SectionLabel>
              <Heading level={2}>Trends</Heading>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {trends.map(({ id, series }) => (
                <MeasurementTrendCard
                  key={id}
                  series={series}
                  unit={id === "overallScore" ? "" : "mm"}
                />
              ))}
            </div>
          </section>

          {/* Practice rate */}
          <section className="space-y-5">
            <div>
              <SectionLabel>Practice this week</SectionLabel>
              <Heading level={2}>Activity</Heading>
            </div>
            <Card className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.14em] text-ink-secondary/80">
                    Active days
                  </p>
                  <p className="font-display text-[32px] font-bold text-sage-dark font-numerals leading-none">
                    {stats.activeDays}
                    <span className="text-[14px] text-ink-tertiary"> / 7</span>
                  </p>
                  <ProgressBar
                    value={(stats.activeDays / 7) * 100}
                    className="mt-2"
                  />
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-[0.14em] text-ink-secondary/80">
                    Total sets
                  </p>
                  <p className="font-display text-[32px] font-bold text-ink-primary font-numerals leading-none">
                    {stats.totalSets}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-tertiary">
                    across{" "}
                    {stats.sessionsThisWeek > 0
                      ? `${stats.avgExercisesPerSession.toFixed(1)} exercises avg/session`
                      : "no sessions yet"}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-[0.14em] text-ink-secondary/80">
                    Total minutes
                  </p>
                  <p className="font-display text-[32px] font-bold text-ink-primary font-numerals leading-none">
                    {stats.totalMinutes}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-tertiary">
                    practice time
                  </p>
                </div>
              </div>
            </Card>
          </section>

          {/* Pain heatmap */}
          <section className="space-y-5">
            <div>
              <SectionLabel>How you&rsquo;ve been feeling</SectionLabel>
              <Heading level={2}>Pain log</Heading>
            </div>
            <PainHeatmap
              aggregate={painAgg}
              totalSessions={sessions.length}
            />
          </section>
        </>
      )}

      {/* Lifestyle observations */}
      {observations.length > 0 ? (
        <section className="space-y-5">
          <div>
            <SectionLabel>Quiet observations</SectionLabel>
            <Heading level={2}>From your day-to-day</Heading>
            <p className="mt-1 max-w-2xl text-[14px] text-ink-secondary">
              Patterns that load the spine over time. None of these are urgent
              — just worth knowing.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {observations.map((obs) => {
              const exercise = obs.suggestedExerciseId
                ? getExerciseById(obs.suggestedExerciseId)
                : null;
              return (
                <Card key={obs.id} tone="sage" className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TagPill tone="sage">{obs.category}</TagPill>
                    <p className="font-display text-[16px] text-ink-primary">
                      {obs.title}
                    </p>
                  </div>
                  <p className="text-[14px] text-ink-primary/85">{obs.body}</p>
                  {exercise ? (
                    <div className="pt-1">
                      <Link href={`/exercise/${exercise.id}`}>
                        <Button
                          variant="secondary"
                          rightIcon={
                            <ArrowRight size={14} strokeWidth={1.5} />
                          }
                        >
                          Try {exercise.name}
                        </Button>
                      </Link>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Recent sessions list */}
      {sessions.length > 0 ? (
        <section className="space-y-5">
          <div>
            <SectionLabel>Recent sessions</SectionLabel>
            <Heading level={2}>History</Heading>
          </div>
          <div className="space-y-2">
            {[...sessions]
              .reverse()
              .slice(0, 8)
              .map((s) => {
                const date = new Date(s.startedAt);
                return (
                  <Card key={s.id} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px] text-ink-primary">
                        {date.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                        ,{" "}
                        {date.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-[12px] text-ink-tertiary">
                        {s.exerciseSummaries.length} exercise
                        {s.exerciseSummaries.length === 1 ? "" : "s"} ·{" "}
                        {s.completedAt
                          ? `${Math.max(1, Math.round((s.completedAt - s.startedAt) / 60_000))} min`
                          : "incomplete"}
                      </p>
                    </div>
                    {s.finalScan ? (
                      <p className="font-mono text-[15px] text-sage-dark">
                        {Math.round(s.finalScan.measurements.overallScore)}
                      </p>
                    ) : (
                      <TagPill tone="neutral">no final scan</TagPill>
                    )}
                  </Card>
                );
              })}
          </div>
        </section>
      ) : null}

      {/* Honest closing note */}
      <Card tone="muted" className="text-[13px] text-ink-secondary">
        These measurements track your posture between physio visits.
        They&rsquo;re useful for spotting trends but aren&rsquo;t a replacement
        for your physio&rsquo;s Cobb angle measurements.{" "}
        <span className="text-sage-dark font-medium">
          Your physio&rsquo;s notes remain the source of truth.
        </span>
        {!usedDraft ? (
          <span className="block pt-2">
            Running on the spec test profile — finish onboarding for the
            observations to use your real lifestyle data.
          </span>
        ) : null}
      </Card>
    </main>
  );
}

function EmptyState() {
  return (
    <Card className="text-center space-y-4 py-12">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
        <TrendingUp size={26} strokeWidth={1.5} />
      </div>
      <p className="font-display text-[20px] text-ink-primary">
        No sessions on file yet.
      </p>
      <p className="mx-auto max-w-md text-[14px] text-ink-secondary">
        Run a session and the trend lines will start filling in. They get
        meaningful around the 5-session mark — the chart needs enough points to
        see past day-to-day measurement noise.
      </p>
      <div>
        <Link href="/session">
          <Button
            variant="primary"
            rightIcon={<ArrowRight size={16} strokeWidth={1.5} />}
          >
            Run today&rsquo;s session
          </Button>
        </Link>
      </div>
    </Card>
  );
}
