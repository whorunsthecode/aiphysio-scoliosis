"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

type ChipVariant = "pill" | "card";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: ReactNode;
  variant?: ChipVariant;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, icon, variant = "pill", className, children, ...rest },
  ref,
) {
  const isPill = variant === "pill";
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        "group relative inline-flex items-center font-body font-medium text-ink-primary",
        "transition-all duration-200 ease-soft",
        "focus-visible:shadow-focus-sage",
        isPill
          ? "gap-2 rounded-[18px] border bg-surface px-5 py-3 text-[15px]"
          : "w-full justify-start gap-2 rounded-2xl border bg-surface px-5 py-4 text-[15px]",
        selected
          ? "border-sage bg-sage-tint text-sage-dark"
          : "border-border hover:border-sage/60 hover:bg-sage-wash",
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span
          className={cn(
            "inline-flex shrink-0 transition-colors",
            selected ? "text-sage-dark" : "text-ink-secondary",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
      {selected && isPill ? (
        <span
          className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sage text-white shadow-card animate-soft-rise"
          aria-hidden
        >
          <Check size={12} strokeWidth={2.5} />
        </span>
      ) : null}
    </button>
  );
});
