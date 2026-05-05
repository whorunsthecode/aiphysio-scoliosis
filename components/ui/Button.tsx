"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-sage text-white shadow-card hover:bg-sage-dark active:bg-sage-dark hover:scale-[1.02]",
  secondary:
    "bg-surface text-ink-primary border border-sage/60 hover:border-sage hover:bg-sage-wash hover:scale-[1.02]",
  ghost:
    "bg-transparent text-ink-primary hover:bg-sage-wash",
};

const sizeClasses: Record<Size, string> = {
  md: "px-6 py-3 text-[15px]",
  lg: "px-8 py-3.5 text-[16px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      className,
      children,
      leftIcon,
      rightIcon,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-body font-medium",
          "transition-all duration-200 ease-soft origin-center",
          "focus-visible:shadow-focus-sage",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...rest}
      >
        {leftIcon ? <span className="-ml-1 inline-flex">{leftIcon}</span> : null}
        <span>{children}</span>
        {rightIcon ? <span className="-mr-1 inline-flex">{rightIcon}</span> : null}
      </button>
    );
  },
);
