"use client";

import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import { LineChart } from "./LineChart";
import type { TrendDirection, TrendSeries } from "@/lib/session/trend";

interface MeasurementTrendCardProps {
  series: TrendSeries;
  unit?: "mm" | "" | string;
}

export function MeasurementTrendCard({
  series,
  unit = "mm",
}: MeasurementTrendCardProps) {
  const last = series.points[series.points.length - 1];
  const first = series.points[0];

  const directionTone =
    series.direction === "improving"
      ? "sage"
      : series.direction === "drifting"
        ? "terracotta"
        : "neutral";
  const directionLabel = directionLabelFor(
    series.direction,
    series.improvementMode,
  );
  const valueColor =
    series.direction === "improving"
      ? "#6b9077"
      : series.direction === "drifting"
        ? "#b27460"
        : "#8a7f76";

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>{series.label}</SectionLabel>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className="font-display text-[28px] font-bold leading-none font-numerals"
              style={{ color: valueColor }}
            >
              {last ? formatValue(last.value, series.improvementMode) : "—"}
            </span>
            {unit ? (
              <span className="text-[12px] text-ink-tertiary">{unit}</span>
            ) : null}
          </div>
        </div>
        <TagPill tone={directionTone}>{directionLabel}</TagPill>
      </div>

      <LineChart
        points={series.points}
        ideal={series.ideal}
        direction={series.direction}
        height={92}
      />

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-[11px] text-ink-tertiary">
        <span>
          {series.points.length} session{series.points.length === 1 ? "" : "s"}
        </span>
        {first && last && first !== last ? (
          <span className="font-mono">
            {formatValue(first.value, series.improvementMode)} →{" "}
            {formatValue(last.value, series.improvementMode)}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function formatValue(
  v: number,
  mode: "lower_magnitude" | "higher_value",
): string {
  if (mode === "higher_value") return `${Math.round(v)}`;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

function directionLabelFor(
  direction: TrendDirection,
  mode: "lower_magnitude" | "higher_value",
): string {
  if (direction === "stable") return "stable";
  if (direction === "improving")
    return mode === "lower_magnitude" ? "easing" : "rising";
  return mode === "lower_magnitude" ? "drifting" : "easing back";
}
