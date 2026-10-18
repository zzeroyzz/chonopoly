"use client";

import { useState, type ReactNode } from "react";

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
    <div className="flex items-baseline gap-2 mb-1">
      <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
        {children}
      </span>
      {hint && <span className="text-[10px] text-(--color-text-disabled)">{hint}</span>}
    </div>
  );
}

/**
 * Numeric input that can actually be emptied.
 *
 * A controlled `type="number"` bound straight to a number can't hold an empty
 * string, so clearing the field snaps it back to 0 and typing "3.5" over a
 * leading zero gives "03.5". This keeps the raw text while the field is focused
 * and only reads the model value back on blur, so the field behaves like a text
 * box and the model still only ever sees numbers.
 */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  note,
  min,
  testId,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  /** Short qualifier, sits beside the label. */
  hint?: string;
  /** Explanatory line under the field, where the eye lands after reading the value. */
  note?: ReactNode;
  /** Kept for call-site compatibility; the input is text now, so it's unused. */
  step?: string;
  min?: number;
  /** Stable handle for tests that assert on a specific field's value. */
  testId?: string;
}) {
  // null means "not being edited" — show the model value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(value) : "");

  function handle(raw: string) {
    // Strip rather than reject. Rejecting made pasting impossible — "$350,000"
    // and "1,250.50" both fail a strict numeric test, so the paste silently did
    // nothing. Cleaning the input accepts anything a person would realistically
    // paste out of a listing or a spreadsheet.
    let cleaned = raw.replace(/[^0-9.-]/g, "");

    // Keep only a leading minus, and only the first decimal point.
    const negative = cleaned.startsWith("-");
    cleaned = cleaned.replace(/-/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
    }
    if (negative) cleaned = "-" + cleaned;

    setDraft(cleaned);

    if (cleaned === "" || cleaned === "-" || cleaned === ".") {
      onChange(0);
      return;
    }
    const n = Number(cleaned);
    if (Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
  }

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
          type="text"
          inputMode="decimal"
          data-testid={testId}
          value={shown}
          onChange={(e) => handle(e.target.value)}
          onFocus={(e) => {
            setDraft(e.target.value);
            // Select on focus so typing replaces rather than appends to the default.
            e.target.select();
          }}
          onBlur={() => setDraft(null)}
          className={`${inputClass} ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-(--color-text-tertiary) pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {note && (
        <p className="text-[11px] text-(--color-text-tertiary) mt-1 leading-relaxed">{note}</p>
      )}
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

/**
 * A collapsed section, for reference figures that shouldn't compete with the
 * numbers you act on.
 *
 * Built on <details> rather than state: it is open/closed markup the browser
 * already understands, so it is keyboard accessible and findable by in-page
 * search without any of that being reimplemented here.
 */
export function Disclosure({
  label,
  summary,
  defaultOpen = false,
  children,
}: {
  label: string;
  /** The one figure worth seeing while collapsed, if there is one. */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none py-1 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-(--color-text-tertiary)">
          <span className="inline-block transition-transform group-open:rotate-90">›</span>
          {label}
        </span>
        {summary && (
          <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary) group-open:hidden">
            {summary}
          </span>
        )}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
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
