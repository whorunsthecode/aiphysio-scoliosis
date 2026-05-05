import { cn } from "@/lib/cn";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  label?: string;
  tone?: "sage" | "terracotta";
}

export function ProgressBar({
  value,
  max = 100,
  className,
  label,
  tone = "sage",
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = tone === "sage" ? "bg-sage" : "bg-terracotta";
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-border/70", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-soft",
          fill,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
