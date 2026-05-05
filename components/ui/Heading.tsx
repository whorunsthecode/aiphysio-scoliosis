import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level: 1 | 2 | 3;
  children: ReactNode;
}

const sizeClasses: Record<HeadingProps["level"], string> = {
  1: "text-[28px] sm:text-[36px] md:text-[44px] leading-[1.15] font-normal tracking-[-0.01em]",
  2: "text-[24px] sm:text-[28px] leading-[1.2] font-medium tracking-[-0.005em]",
  3: "text-[20px] sm:text-[22px] leading-[1.3] font-medium",
};

export function Heading({ level, className, children, ...rest }: HeadingProps) {
  const Tag = (`h${level}`) as "h1" | "h2" | "h3";
  return (
    <Tag
      className={cn(
        "font-display text-ink-primary",
        sizeClasses[level],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
