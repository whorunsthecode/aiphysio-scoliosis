import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SectionLabelProps = HTMLAttributes<HTMLParagraphElement>;

export function SectionLabel({ className, children, ...rest }: SectionLabelProps) {
  return (
    <p
      className={cn(
        "font-body text-[11px] font-medium uppercase tracking-[0.14em] text-ink-secondary/80",
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  );
}
