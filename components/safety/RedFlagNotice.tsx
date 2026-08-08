"use client";

// How a red flag is shown. One component for all three tiers, because the
// difference between them is urgency of language and colour, not structure —
// and a person reading this needs the same four things every time: what we
// noticed, why it matters, what to do, and something they can hand over.

import { useState } from "react";
import { handoffSummary } from "@/lib/safety/redFlags";
import type { TriageResult } from "@/lib/safety/types";
import { cn } from "@/lib/cn";

const TIER = {
  emergency: {
    heading: "Please get this looked at today",
    frame: "border-terracotta bg-terracotta-wash",
    accent: "text-terracotta-dark",
  },
  urgent: {
    heading: "Worth seeing someone this week",
    frame: "border-drift bg-drift/10",
    accent: "text-ink-primary",
  },
  review: {
    heading: "Mention this at your next appointment",
    frame: "border-border bg-surface",
    accent: "text-ink-primary",
  },
} as const;

export function RedFlagNotice({
  result,
  name,
  className,
}: {
  result: TriageResult;
  name?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!result.severity || result.hits.length === 0) return null;

  const tier = TIER[result.severity];
  const summary = handoffSummary(result, {
    name,
    when: new Date().toISOString().slice(0, 10),
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      role={result.severity === "emergency" ? "alert" : "status"}
      className={cn("rounded-card border px-5 py-5", tier.frame, className)}
    >
      <h2 className={cn("font-display text-[20px] leading-tight", tier.accent)}>
        {tier.heading}
      </h2>

      <ul className="mt-4 flex flex-col gap-4">
        {result.hits.map((hit) => (
          <li key={hit.rule.id} className="text-[15px] leading-relaxed">
            <p className="text-ink-primary">{hit.rule.observation}</p>
            <p className="mt-1 text-ink-secondary">{hit.rule.why}</p>
            <p className="mt-1 font-medium text-ink-primary">
              {hit.rule.action}
            </p>
          </li>
        ))}
      </ul>

      {result.blocksSession ? (
        <p className="mt-4 border-t border-border/60 pt-4 text-[14px] text-ink-secondary">
          Today&apos;s exercises are paused until you&apos;ve spoken to someone.
          That&apos;s deliberate — movement isn&apos;t the right next step here.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-input border border-border bg-surface px-4 py-2 text-[14px] text-ink-primary transition-colors hover:border-sage focus:outline-none focus:shadow-focus-sage"
        >
          {copied ? "Copied" : "Copy a summary to show them"}
        </button>
        <span className="text-[13px] text-ink-tertiary">
          Your answers, written out — not a diagnosis.
        </span>
      </div>
    </section>
  );
}
