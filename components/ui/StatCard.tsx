import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatCardProps {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  sublabel?: string;
  tone?: "ink" | "sage" | "terracotta";
  status?: "active" | null;
  className?: string;
}

const valueTone = {
  ink: "text-ink-primary",
  sage: "text-sage-dark",
  terracotta: "text-terracotta-dark",
} as const;

export function StatCard({
  icon,
  value,
  label,
  sublabel,
  tone = "ink",
  status = null,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-card bg-surface p-6 shadow-card",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 inline-flex text-ink-tertiary">{icon}</div>
      ) : null}
      {status === "active" ? (
        <span className="absolute right-5 top-5 inline-block h-2 w-2 rounded-full bg-sage" />
      ) : null}
      <div
        className={cn(
          "font-display text-[42px] leading-none font-bold tracking-[-0.01em] font-numerals",
          valueTone[tone],
        )}
      >
        {value}
      </div>
      <div className="mt-3 text-[15px] text-ink-primary">{label}</div>
      {sublabel ? (
        <div className="mt-0.5 text-[13px] text-ink-tertiary">{sublabel}</div>
      ) : null}
    </div>
  );
}
