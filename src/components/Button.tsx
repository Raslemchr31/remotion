"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Spinner } from "@/components/icons";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // Amber means "this commits your marks". Reserved for submit and approve.
  primary: "bg-amber text-canvas hover:bg-amber/90 active:bg-amber/80 shadow-lift",
  secondary: "bg-raised text-ink border border-line hover:border-line-strong active:bg-surface",
  ghost: "text-ink-dim hover:text-ink hover:bg-raised",
  danger: "bg-rose-soft text-rose border border-rose/30 hover:border-rose/60",
};

export function Button({
  variant = "secondary",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      // A loading button that stays clickable submits twice on a slow phone
      // connection, which here would mean two comment rounds for one press.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-center",
        "font-semibold transition-all duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {loading ? <Spinner className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
