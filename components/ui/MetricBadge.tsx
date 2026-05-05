import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface MetricBadgeProps {
  value: ReactNode;
  unit?: string;
  label?: string;
  size?: "md" | "lg";
  tone?: "sage" | "terracotta";
  className?: string;
}

const sizeStyles = {
  md: "h-16 w-16 text-[18px]",
  lg: "h-20 w-20 text-[22px]",
} as const;

const toneStyles = {
  sage: "bg-sage-tint text-sage-dark ring-sage/20",
  terracotta: "bg-terracotta-wash text-terracotta-dark ring-terracotta/20",
} as const;

export function MetricBadge({
  value,
  unit,
  label,
  size = "md",
  tone = "sage",
  className,
}: MetricBadgeProps) {
  return (
    <div className={cn("inline-flex flex-col items-center gap-1.5", className)}>
      <div
        className={cn(
          "relative grid place-items-center rounded-full ring-1",
          "font-mono font-medium font-numerals leading-none",
          sizeStyles[size],
          toneStyles[tone],
        )}
      >
        <span className="block">{value}</span>
        {unit ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 ml-[1.6em] -translate-y-[0.55em] text-[10px] font-normal opacity-70"
          >
            {unit}
          </span>
        ) : null}
        {unit ? <span className="sr-only"> {unit}</span> : null}
      </div>
      {label ? (
        <span className="font-body text-[12px] text-ink-secondary">{label}</span>
      ) : null}
    </div>
  );
}
