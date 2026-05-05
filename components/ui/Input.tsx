"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-input border bg-surface px-4 py-3 font-body text-[16px] text-ink-primary",
        "placeholder:text-ink-tertiary",
        "transition-all duration-200 ease-soft",
        "focus:outline-none focus:border-sage focus:shadow-focus-sage",
        invalid ? "border-drift" : "border-border",
        className,
      )}
      {...rest}
    />
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, invalid, rows = 6, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "w-full rounded-input border bg-surface px-4 py-3 font-body text-[16px] text-ink-primary",
          "placeholder:text-ink-tertiary",
          "transition-all duration-200 ease-soft resize-y",
          "focus:outline-none focus:border-sage focus:shadow-focus-sage",
          invalid ? "border-drift" : "border-border",
          className,
        )}
        {...rest}
      />
    );
  },
);
