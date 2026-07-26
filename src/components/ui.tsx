"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Kleines UI-Grundgerüst, damit die Seiten nicht in Klassenlisten ertrinken. */

function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cx(
        "rounded-xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20",
        className
      )}
    >
      {children}
    </Tag>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-blue-500 text-white hover:bg-blue-400 disabled:bg-blue-500/40",
  secondary: "bg-white/10 text-slate-100 hover:bg-white/20",
  ghost: "text-slate-300 hover:bg-white/10",
  danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
        BUTTON_VARIANTS[variant],
        className
      )}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-200">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

const CONTROL_CLASS =
  "w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL_CLASS, className)} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL_CLASS, "resize-y", className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL_CLASS, className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-slate-900/40 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-blue-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-slate-400">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

const BADGE_TONES = {
  neutral: "bg-white/10 text-slate-300",
  blue: "bg-blue-500/15 text-blue-300",
  green: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  red: "bg-red-500/15 text-red-300",
} as const;

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-blue-400/30 bg-blue-500/10 text-blue-100",
    warn: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    error: "border-red-400/30 bg-red-500/10 text-red-100",
    success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  } as const;

  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="[&_a]:underline">{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {children ? <div className="mt-2 text-sm text-slate-400">{children}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}
