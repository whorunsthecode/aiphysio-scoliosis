"use client";

import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import type { PainAggregate } from "@/lib/session/trend";

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

interface PainHeatmapProps {
  aggregate: PainAggregate;
  totalSessions: number;
}

export function PainHeatmap({ aggregate, totalSessions }: PainHeatmapProps) {
  const fillFor = (intensity: number, days: number) => {
    if (intensity <= 0) return "transparent";
    const alpha = Math.min(0.85, 0.25 + days * 0.1);
    if (intensity <= 3) return `rgba(127, 167, 138, ${alpha})`; // sage
    if (intensity <= 6) return `rgba(232, 163, 151, ${alpha})`; // drift
    return `rgba(178, 116, 96, ${alpha})`; // terracotta
  };

  const totalReports = Object.values(aggregate).reduce(
    (a, b) => a + b.daysReported,
    0,
  );

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <SectionLabel>Pain over recent sessions</SectionLabel>
        <TagPill tone={totalReports === 0 ? "sage" : "neutral"}>
          {totalReports === 0
            ? "nothing flagged"
            : `${totalReports} day${totalReports === 1 ? "" : "s"} logged`}
        </TagPill>
      </div>

      <div className="flex items-start gap-6">
        <svg viewBox="0 0 120 170" width="180" height="252" aria-label="Body map">
          <circle
            cx={60}
            cy={14}
            r={10}
            fill="#fbf7f2"
            stroke="#b8aea4"
            strokeWidth={1.5}
          />
          <path
            d="M30 38 Q60 30 90 38 L92 95 Q92 110 86 130 L34 130 Q28 110 28 95 Z"
            fill="#fbf7f2"
            stroke="#b8aea4"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <path
            d="M34 130 Q60 145 86 130 L84 158 L36 158 Z"
            fill="#fbf7f2"
            stroke="#b8aea4"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
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
          {REGIONS.map((r) => {
            const agg = aggregate[r.id];
            const fill = agg
              ? fillFor(agg.meanIntensity, agg.daysReported)
              : "transparent";
            return (
              <g key={r.id}>
                <circle
                  cx={r.cx}
                  cy={r.cy}
                  r={agg ? 8 : 4}
                  fill={fill}
                  stroke="#b8aea4"
                  strokeWidth={1.2}
                />
                <title>
                  {r.label}
                  {agg
                    ? ` — avg ${agg.meanIntensity.toFixed(1)} / 10 over ${agg.daysReported} day${agg.daysReported === 1 ? "" : "s"}`
                    : ""}
                </title>
              </g>
            );
          })}
        </svg>

        <div className="flex-1 space-y-2">
          {Object.keys(aggregate).length === 0 ? (
            <p className="text-[14px] text-ink-secondary">
              You haven&rsquo;t logged any pain in the past
              {totalSessions > 0
                ? ` ${totalSessions} session${totalSessions === 1 ? "" : "s"}`
                : ""}
              . That&rsquo;s the goal.
            </p>
          ) : (
            <ul className="space-y-1.5 text-[13px] text-ink-secondary">
              {Object.entries(aggregate).map(([loc, agg]) => (
                <li key={loc} className="flex items-baseline justify-between">
                  <span className="text-ink-primary">
                    {loc.replace("_", " ")}
                  </span>
                  <span className="font-mono text-ink-tertiary">
                    avg {agg.meanIntensity.toFixed(1)} · {agg.daysReported}{" "}
                    day{agg.daysReported === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
