"use client";

import { useState } from "react";
import { type PropertyTaxEstimate } from "@/lib/census/propertyTax";
import { FieldLabel } from "./fields";
import { dollars } from "./format";

interface Props {
  homeValue: number;
  /** Fills the annual property tax field from the looked-up rate. */
  onApply: (annualTax: number) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; estimate: PropertyTaxEstimate }
  | { kind: "none" };

/**
 * ZIP-level property tax lookup.
 *
 * Fills the tax field on request and never on its own — same rule as the
 * interest rate. What it writes is an area average, so the copy says so rather
 * than letting a sourced number pass for the parcel's actual bill.
 */
export function PropertyTaxLookup({ homeValue, onApply }: Props) {
  const [zip, setZip] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function lookup() {
    if (!/^\d{5}$/.test(zip)) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/property-tax?zip=${zip}`);
      if (res.ok && res.status !== 204) {
        setState({ kind: "found", estimate: (await res.json()) as PropertyTaxEstimate });
      } else {
        setState({ kind: "none" });
      }
    } catch {
      setState({ kind: "none" });
    }
  }

  const annualAtThisValue =
    state.kind === "found" ? (homeValue * state.estimate.ratePercent) / 100 : 0;

  return (
    <div className="mt-3 pt-3 border-t border-(--color-border-subtle)">
      <div className="flex items-end gap-2">
        <label className="block w-28">
          <FieldLabel hint="tax lookup">ZIP</FieldLabel>
          {/* Text, not number — a numeric input renders an empty ZIP as 0 and
              makes the user clear it before typing. */}
          <input
            type="text"
            inputMode="numeric"
            placeholder="30301"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            className="w-full h-10 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) px-3 text-[14px] text-(--color-text-primary) font-(--font-mono) focus:outline-none focus:border-(--color-accent) transition-colors"
          />
        </label>
        <button
          type="button"
          onClick={lookup}
          disabled={!/^\d{5}$/.test(zip) || state.kind === "loading"}
          className="h-10 px-3 rounded-[var(--radius-md)] border border-(--color-border-default) text-[12px] text-(--color-text-secondary) hover:text-(--color-text-primary) disabled:opacity-40 transition-colors"
        >
          {state.kind === "loading" ? "Looking up…" : "Look up rate"}
        </button>
      </div>

      {state.kind === "found" && (
        <div className="mt-2.5">
          <p className="text-[12px] text-(--color-text-secondary)">
            {state.estimate.zip} averages{" "}
            <span className="text-(--color-accent) font-(--font-mono)">
              {state.estimate.ratePercent.toFixed(2)}%
            </span>{" "}
            — about {dollars(annualAtThisValue)}/yr at this home value.
          </p>
          <button
            type="button"
            onClick={() => onApply(Math.round(annualAtThisValue))}
            className="text-[12px] text-(--color-accent) mt-1"
          >
            Use this figure
          </button>
          <p className="text-[10px] text-(--color-text-tertiary) mt-1.5 leading-relaxed">
            {state.estimate.source}, {state.estimate.vintage}. This is the ZIP-wide median tax over
            median value, not this property&apos;s bill — exemptions and assessment ratios move it.
          </p>
        </div>
      )}

      {state.kind === "none" && (
        <p className="text-[11px] text-(--color-text-tertiary) mt-2">
          No estimate available for that ZIP. Enter the tax amount directly.
        </p>
      )}
    </div>
  );
}
