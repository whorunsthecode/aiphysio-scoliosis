"use client";

// Home dashboard — matches the reference platform UI:
// "Good to see you, <name>" header with curve summary, 4-stat row,
// sage "Start today's session" CTA, two quick-action cards, and
// two-column Recent practices / Recent check-ins.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  Clock,
  Dumbbell,
  Flame,
  ScanLine,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatCard } from "@/components/ui/StatCard";
import { loadDraft } from "@/lib/onboarding/persist";
import { loadSessionHistory } from "@/lib/session/persist";
import { deriveCurvePattern, deriveRegionalSides } from "@/lib/exercises/profile";
import { EXERCISE_LIBRARY } from "@/lib/exercises/library";
import type { OnboardingState } from "@/lib/onboarding/types";
import type { SessionState } from "@/lib/session/types";

export default function HomePage() {
  const [profile, setProfile] = useState<OnboardingState | null>(null);
  const [sessions, setSessions] = useState<SessionState[]>([]);

  useEffect(() => {
    setProfile(loadDraft());
    setSessions(loadSessionHistory());
  }, []);

  const stats = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 86400000;
    const recent = sessions.filter((s) => s.startedAt >= oneWeekAgo);
    const totalMinutes = sessions.reduce(
      (a, s) =>
        a + (s.completedAt ? (s.completedAt - s.startedAt) / 60_000 : 0),
      0,
    );
    const dayStreak = computeDayStreak(sessions);
    const lastWithFinal = [...sessions]
      .reverse()
      .find((s) => s.finalScan);
    const score = lastWithFinal?.finalScan?.measurements.overallScore ?? null;
    return {
      sessions: recent.length,
      minutes: Math.round(totalMinutes),
      dayStreak,
      score,
    };
  }, [sessions]);

  const curveSummary = useMemo(
    () => formatCurveSummary(profile),
    [profile],
  );

  const recentPractices = useMemo(() => {
    const all: {
      name: string;
      sessionId: string;
      sets: number;
      duration: number;
    }[] = [];
    for (const s of [...sessions].reverse()) {
      for (const ex of s.exerciseSummaries) {
        all.push({
          name: prettyExerciseName(ex.exerciseId),
          sessionId: s.id,
          sets: ex.setsCompleted,
          duration: ex.details.reduce((a, d) => a + d.holdSeconds, 0) / 60,
        });
        if (all.length >= 6) break;
      }
      if (all.length >= 6) break;
    }
    return all.slice(0, 3);
  }, [sessions]);

  const recentCheckIns = useMemo(() => {
    return [...sessions]
      .reverse()
      .filter((s) => s.finalScan ?? s.initialScan)
      .slice(0, 3)
      .map((s) => {
        const snap = s.finalScan ?? s.initialScan!;
        return {
          id: s.id,
          startedAt: s.startedAt,
          score: Math.round(snap.measurements.overallScore),
          shoulder: snap.measurements.shoulderDiffMm,
          pelvis: snap.measurements.hipDiffMm,
          head: snap.measurements.headOffsetMm,
        };
      });
  }, [sessions]);

  const exerciseCount = EXERCISE_LIBRARY.length;
  const greetingName = profile?.name?.trim() || "there";

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-6 py-12 lg:px-12 lg:py-16 space-y-10">
        <header className="space-y-2">
          <Heading level={1}>Good to see you, {greetingName}.</Heading>
          {curveSummary ? (
            <p className="text-ink-secondary">{curveSummary}</p>
          ) : null}
        </header>

        {/* Stat row */}
        <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Activity size={18} strokeWidth={1.5} />}
            value={stats.sessions}
            label="Sessions"
          />
          <StatCard
            icon={<Clock size={18} strokeWidth={1.5} />}
            value={stats.minutes}
            label="Minutes moved"
            sublabel="total"
          />
          <StatCard
            icon={<Flame size={18} strokeWidth={1.5} />}
            value={stats.dayStreak}
            label="Day streak"
            status={stats.dayStreak > 0 ? "active" : null}
          />
          <StatCard
            icon={<TrendingUp size={18} strokeWidth={1.5} />}
            value={stats.score === null ? "—" : Math.round(stats.score)}
            label="Posture score"
            sublabel={stats.score === null ? "no scan yet" : "avg alignment"}
            tone={stats.score !== null ? "sage" : "ink"}
          />
        </section>

        {/* Hero CTA */}
        <Link href="/session" className="block group">
          <Card
            tone="sage-solid"
            className="flex items-center gap-5 transition-all duration-200 ease-soft group-hover:shadow-card-lift"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15">
              <CalendarCheck
                size={22}
                strokeWidth={1.5}
                className="text-white"
              />
            </div>
            <div className="flex-1">
              <p className="font-display text-[22px] leading-tight text-white">
                Start today&rsquo;s session
              </p>
              <p className="text-[14px] text-white/80">
                Pain check-in → posture scan → tailored exercises → re-scan
              </p>
            </div>
            <ArrowRight
              size={20}
              strokeWidth={1.5}
              className="text-white shrink-0 transition-transform duration-200 group-hover:translate-x-1"
            />
          </Card>
        </Link>

        {/* Quick actions */}
        <section className="grid gap-4 md:grid-cols-2">
          <QuickCard
            href="/scan"
            icon={<ScanLine size={20} strokeWidth={1.5} />}
            title="Quick scan"
            subtitle="Standalone posture check"
          />
          <QuickCard
            href="/library"
            icon={<Dumbbell size={20} strokeWidth={1.5} />}
            title="Exercise library"
            subtitle={`${exerciseCount} exercises available`}
          />
        </section>

        {/* Recent two-column */}
        <section className="grid gap-6 lg:grid-cols-2">
          <RecentPracticesPanel items={recentPractices} />
          <RecentCheckInsPanel items={recentCheckIns} />
        </section>

        {/* Footer disclaimer */}
        <Card tone="muted" className="text-[13px] text-ink-secondary">
          These measurements track your posture between physio visits.
          They&rsquo;re useful for spotting trends but aren&rsquo;t a
          replacement for radiographic Cobb angle measurements.{" "}
          <span className="text-sage-dark font-medium">
            Your physio&rsquo;s measurements remain the source of truth for
            your curve.
          </span>
        </Card>
      </main>
    </AppShell>
  );
}

function QuickCard({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="block group">
      <Card className="flex items-center gap-4 transition-all duration-200 ease-soft group-hover:shadow-card-lift">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sage-tint text-sage-dark">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-[16px] font-medium text-ink-primary">{title}</p>
          <p className="text-[13px] text-ink-tertiary">{subtitle}</p>
        </div>
        <ChevronRight
          size={18}
          strokeWidth={1.5}
          className="text-ink-tertiary"
        />
      </Card>
    </Link>
  );
}

function RecentPracticesPanel({
  items,
}: {
  items: { name: string; sets: number; duration: number; sessionId: string }[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Recent practices</SectionLabel>
        <Link
          href="/progress"
          className="text-[13px] text-sage-dark hover:underline"
        >
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <Card tone="muted" className="text-[13px] text-ink-secondary">
          No practices yet. Start a session to see them here.
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <Card
              key={`${it.sessionId}-${i}`}
              padding="md"
              className="flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-[14px] text-ink-primary">{it.name}</p>
                <p className="text-[12px] text-ink-tertiary">
                  {it.duration > 0 ? `${Math.max(1, Math.round(it.duration))} min · ` : ""}
                  {it.sets} set{it.sets === 1 ? "" : "s"}
                </p>
              </div>
              <span className="font-mono text-[15px] text-terracotta-dark">
                {it.sets * 10}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentCheckInsPanel({
  items,
}: {
  items: {
    id: string;
    startedAt: number;
    score: number;
    shoulder: number;
    pelvis: number;
    head: number;
  }[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Recent check-ins</SectionLabel>
        <Link
          href="/progress"
          className="text-[13px] text-sage-dark hover:underline"
        >
          View all
        </Link>
      </div>
      {items.length === 0 ? (
        <Card tone="muted" className="text-[13px] text-ink-secondary">
          No check-ins yet. Run a posture scan from the home or check-in tab.
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const date = new Date(it.startedAt);
            return (
              <Card key={it.id} padding="md" className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-ink-tertiary">
                    {date.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <span
                    className="font-mono text-[15px]"
                    style={{
                      color: it.score >= 75 ? "#6b9077" : "#b27460",
                    }}
                  >
                    {it.score}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-[12px]">
                  <Measurement label="Shoulder" value={it.shoulder} />
                  <Measurement label="Pelvis" value={it.pelvis} />
                  <Measurement label="Head" value={it.head} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Measurement({ label, value }: { label: string; value: number }) {
  const sign = value >= 0 ? "+" : "";
  const tone = Math.abs(value) > 10 ? "#b27460" : "#8a7f76";
  return (
    <div>
      <p className="text-ink-tertiary">{label}</p>
      <p className="font-mono" style={{ color: tone }}>
        {sign}
        {value.toFixed(1)}°
      </p>
    </div>
  );
}

function computeDayStreak(sessions: SessionState[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(
    sessions.map((s) => new Date(s.startedAt).toDateString()),
  );
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (days.has(d.toDateString())) {
      streak += 1;
    } else if (i === 0) {
      // allow today to be empty if there's a session yesterday
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function formatCurveSummary(profile: OnboardingState | null): string | null {
  if (!profile || !profile.curveType) return null;
  const pattern = deriveCurvePattern(profile);
  const sides = deriveRegionalSides(profile);
  const map: Record<string, string> = {
    right_thoracic: "Right thoracic",
    left_thoracic: "Left thoracic",
    right_lumbar: "Right lumbar",
    left_lumbar: "Left lumbar",
    double_right_thoracic_left_lumbar:
      "Double major (right thoracic / left lumbar)",
    double_left_thoracic_right_lumbar:
      "Double major (left thoracic / right lumbar)",
    thoracolumbar: "Thoracolumbar",
    any: "Curve pattern",
  };
  const lean =
    sides.thoracicConvex ?? sides.lumbarConvex ?? profile.primaryLeanSide;
  return `${map[pattern] ?? "Curve"}${lean ? ` · ${lean} lean` : ""}`;
}

function prettyExerciseName(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
