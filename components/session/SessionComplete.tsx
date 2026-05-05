"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import {
  compareScans,
  type Comparison,
} from "@/lib/session/comparison";
import type { SessionState } from "@/lib/session/types";

interface SessionCompleteProps {
  session: SessionState;
  saving: boolean;
  saveError: string | null;
}

export function SessionComplete({
  session,
  saving,
  saveError,
}: SessionCompleteProps) {
  const comps = compareScans(session.initialScan, session.finalScan);
  const totalSets = session.exerciseSummaries.reduce(
    (a, s) => a + s.setsCompleted,
    0,
  );
  const minutes = session.completedAt
    ? Math.max(1, Math.round((session.completedAt - session.startedAt) / 60_000))
    : 0;

  const improvements = comps.filter((c) => c.direction === "improved");
  const drifts = comps.filter((c) => c.direction === "drifted");

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
          <CheckCircle2 size={26} strokeWidth={1.5} />
        </div>
        <Heading level={1}>{warmClosingLine(improvements, drifts)}</Heading>
        <p className="max-w-xl text-ink-secondary">
          {session.exerciseSummaries.length} exercise
          {session.exerciseSummaries.length === 1 ? "" : "s"} · {totalSets}{" "}
          set{totalSets === 1 ? "" : "s"} · {minutes} minute
          {minutes === 1 ? "" : "s"}.
        </p>
      </div>

      {saveError ? (
        <Card tone="terracotta" className="text-[14px] text-ink-primary">
          Couldn&rsquo;t save the session: {saveError}. The summary is here for
          you, but won&rsquo;t show in your history.
        </Card>
      ) : null}
      {saving ? (
        <Card tone="muted" className="text-[13px] text-ink-secondary">
          Saving your session…
        </Card>
      ) : null}

      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Before vs after</SectionLabel>
          <TagPill tone="sage">comparison</TagPill>
        </div>
        {comps.length === 0 ? (
          <p className="text-[14px] text-ink-secondary">
            One of the scans didn&rsquo;t complete cleanly, so I can&rsquo;t
            compare. Try again next time — the practice still counts.
          </p>
        ) : (
          <div className="space-y-3">
            {comps.map((c) => (
              <ComparisonRow key={c.label} comp={c} />
            ))}
          </div>
        )}
      </Card>

      <Card tone="sage" className="space-y-3">
        <SectionLabel>Practice notes</SectionLabel>
        <ul className="space-y-2 text-[14px] text-ink-primary/85">
          {session.exerciseSummaries.map((s) => (
            <li key={s.exerciseId}>
              <span className="font-medium text-ink-primary">
                {prettyExerciseName(s.exerciseId)}
              </span>{" "}
              · {s.setsCompleted} sets · {summarizeDetails(s)}
            </li>
          ))}
        </ul>
      </Card>

      {session.pain.length > 0 ? (
        <Card padding="md" tone="muted" className="text-[13px] text-ink-secondary">
          <p className="mb-1 font-medium text-ink-primary inline-flex items-center gap-1.5">
            <Heart size={13} strokeWidth={1.5} className="text-terracotta-dark" />
            How you started today
          </p>
          <p>
            You logged{" "}
            {session.pain
              .map((p) => `${p.location.replace("_", " ")} ${p.intensity}/10`)
              .join(", ")}
            . I skipped exercises that load those areas heavily.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3 pt-4">
        <Link href="/">
          <Button variant="primary" rightIcon={<ArrowRight size={18} strokeWidth={1.5} />}>
            Back to home
          </Button>
        </Link>
        <Link href="/library">
          <Button variant="secondary">Browse library</Button>
        </Link>
      </div>
    </div>
  );
}

function ComparisonRow({ comp }: { comp: Comparison }) {
  const tone =
    comp.direction === "improved"
      ? { color: "#6b9077", bg: "bg-sage-wash", icon: TrendingUp }
      : comp.direction === "drifted"
        ? { color: "#b27460", bg: "bg-terracotta-wash", icon: TrendingDown }
        : { color: "#8a7f76", bg: "bg-base", icon: Sparkles };
  const Icon = tone.icon;
  const sign = comp.delta >= 0 ? "+" : "";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl ${tone.bg} px-4 py-3`}
    >
      <div className="flex items-center gap-3">
        <Icon size={16} strokeWidth={1.6} style={{ color: tone.color }} />
        <div>
          <p className="text-[14px] text-ink-primary">{comp.label}</p>
          <p className="text-[12px] text-ink-tertiary">{comp.copy}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-[14px]" style={{ color: tone.color }}>
          {sign}
          {comp.delta.toFixed(1)}
        </p>
        <p className="text-[11px] text-ink-tertiary font-mono">
          {comp.initialMean.toFixed(1)} → {comp.finalMean.toFixed(1)}
        </p>
      </div>
    </div>
  );
}

function summarizeDetails(s: {
  details: { repsCompleted: number; holdSeconds: number }[];
}) {
  const reps = s.details.reduce((a, d) => a + d.repsCompleted, 0);
  const hold = s.details.reduce((a, d) => a + d.holdSeconds, 0);
  if (reps > 0 && hold > 0) return `${reps} reps + ${hold}s hold`;
  if (reps > 0) return `${reps} reps`;
  if (hold > 0) return `${hold}s hold`;
  return "completed";
}

function warmClosingLine(
  improvements: Comparison[],
  drifts: Comparison[],
): string {
  if (improvements.length >= 2) return "That was beautifully held.";
  if (improvements.length === 1)
    return `Nice — ${improvements[0].label.toLowerCase()} eased.`;
  if (drifts.length > 0) return "You showed up. That's the work.";
  return "Done. You showed up.";
}

function prettyExerciseName(id: string): string {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
