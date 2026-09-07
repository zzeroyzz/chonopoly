"use client";

import { type ReactNode } from "react";

/**
 * Local field primitives. The app has no shared Input/Select components — every
 * panel writes its own inline — so these stay scoped to the calculator rather
 * than becoming an app-wide abstraction nobody asked for.
 */

const inputClass =
  "w-full h-10 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) " +
  "px-3 text-[14px] text-(--color-text-primary) font-(--font-mono) " +
  "focus:outline-none focus:border-(--color-accent) transition-colors";

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
        {children}
      </span>
      {hint && <span className="text-[10px] text-(--color-text-tertiary)">{hint}</span>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  step = "any",
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  step?: string;
  min?: number;
}) {
  return (
    <label className="block">
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-(--color-text-tertiary) pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={`${inputClass} ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-(--color-text-tertiary) pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${inputClass} appearance-none pr-8`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 h-8 rounded-[var(--radius-pill)] text-[12px] font-medium border transition-colors ${
              active
                ? "bg-(--color-accent)/15 text-(--color-accent) border-(--color-accent)/30"
                : "text-(--color-text-secondary) border-(--color-border-default) hover:text-(--color-text-primary)"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-(--color-accent) w-4 h-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-(--color-text-primary) leading-tight">{label}</span>
        {hint && <span className="block text-[11px] text-(--color-text-tertiary) mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary) mb-3">{children}</p>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-sm)] ${className}`}
    >
      {children}
    </div>
  );
}
