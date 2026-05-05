import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "sage" | "terracotta" | "neutral";

interface TagPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const toneClasses: Record<Tone, string> = {
  sage: "bg-sage-tint text-sage-dark",
  terracotta: "bg-terracotta-wash text-terracotta-dark",
  neutral: "bg-base text-ink-secondary border border-border",
};

export function TagPill({
  tone = "neutral",
  className,
  children,
  ...rest
}: TagPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
