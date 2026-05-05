import { TONE_COLORS, type AlignmentTone } from "@/lib/pose/thresholds";

interface MeasurementRowProps {
  label: string;
  valueMm: number | null;
  tone?: AlignmentTone | null;
  // For paired-direction labels e.g. left/right
  directionLabels?: { positive: string; negative: string };
}

export function MeasurementRow({
  label,
  valueMm,
  tone,
  directionLabels,
}: MeasurementRowProps) {
  const empty = valueMm === null;
  const sign = empty ? "" : valueMm >= 0 ? "+" : "";
  const display = empty ? "—" : `${sign}${valueMm.toFixed(1)}`;
  const direction =
    !empty && directionLabels
      ? valueMm >= 0
        ? directionLabels.positive
        : directionLabels.negative
      : null;

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-[14px] text-ink-primary">{label}</p>
        {direction ? (
          <p className="text-[11px] text-ink-tertiary">{direction}</p>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono text-[15px]"
          style={{
            color: tone ? TONE_COLORS[tone] : "var(--color-ink-tertiary)",
          }}
        >
          {display}
        </span>
        <span className="text-[11px] text-ink-tertiary">mm</span>
      </div>
    </div>
  );
}
