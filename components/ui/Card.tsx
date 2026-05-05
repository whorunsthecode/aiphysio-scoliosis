import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "sage" | "sage-solid" | "terracotta" | "muted";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  padding?: "sm" | "md" | "lg";
}

const toneClasses: Record<Tone, string> = {
  default: "bg-surface",
  sage: "bg-sage-wash",
  "sage-solid": "bg-sage text-white",
  terracotta: "bg-terracotta-wash",
  muted: "bg-base border border-border shadow-none",
};

const paddingClasses: Record<NonNullable<CardProps["padding"]>, string> = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = "default", padding = "md", className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card shadow-card",
        toneClasses[tone],
        paddingClasses[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
