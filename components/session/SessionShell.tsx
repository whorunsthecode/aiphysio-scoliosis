"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SESSION_PHASES, type SessionPhase } from "@/lib/session/types";

interface SessionShellProps {
  phase: SessionPhase;
  exerciseProgress?: { current: number; total: number };
  children: ReactNode;
}

export function SessionShell({
  phase,
  exerciseProgress,
  children,
}: SessionShellProps) {
  // Map phase → step index for the visible progress bar. Exercise phase
  // animates internally as you finish each exercise.
  const total = SESSION_PHASES.length;
  const baseIdx = SESSION_PHASES.findIndex((p) => p.id === phase);
  // Smooth percent that includes per-exercise micro-progress.
  const exFraction =
    phase === "exercise" && exerciseProgress
      ? exerciseProgress.current / Math.max(exerciseProgress.total, 1)
      : 0;
  const pct = Math.min(
    100,
    ((baseIdx + (phase === "exercise" ? exFraction : phase === "complete" ? 0 : 1)) /
      total) *
      100,
  );

  const titleFor = (p: SessionPhase) =>
    SESSION_PHASES.find((x) => x.id === p)?.title ?? p;

  return (
    <div className="min-h-screen bg-base">
      <div className="sticky top-0 z-10 bg-base/85 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <div className="flex items-center justify-between gap-4 text-[12px] text-ink-secondary/80">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1 hover:text-ink-primary transition-colors"
              >
                <ArrowLeft size={12} strokeWidth={1.5} />
                Home
              </Link>
              <span className="font-display text-[18px] text-sage-dark">
                Balance
              </span>
            </div>
            <span className="font-medium uppercase tracking-[0.14em]">
              {phase === "preparing"
                ? "Today's practice"
                : phase === "exercise" && exerciseProgress
                  ? `Exercise ${exerciseProgress.current} of ${exerciseProgress.total}`
                  : titleFor(phase)}
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar value={pct} />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 pt-10 pb-24">{children}</main>
    </div>
  );
}
