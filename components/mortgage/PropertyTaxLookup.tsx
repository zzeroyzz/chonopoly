"use client";

import { useState } from "react";
import { type CountyTaxRate } from "@/lib/census/propertyTax";
import { FieldLabel } from "./fields";
import { dollars } from "./format";

interface Props {
  homeValue: number;
  /** Fills the annual property tax field from the selected county's rate. */
  onApply: (annualTax: number) => void;
}

interface LookupResponse {
  zip: string;
  resolved: CountyTaxRate;
  counties: CountyTaxRate[];
  source: string;
  vintage: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; data: LookupResponse }
  | { kind: "none" };

/**
 * Property tax lookup from a ZIP.
 *
 * The ZIP resolves to its county and the county's effective rate comes from ACS.
 * County rather than ZIP because millage is levied there, and because it's the
 * same figure the public tax calculators publish — DeKalb returns 0.919%, which
 * matches them to three decimals.
 *
 * A ZIP can straddle counties, so the resolved one is shown by name and can be
 * changed. Same rule as the interest rate and the PMI band: derive a default,
 * make it visible, let a real answer win.
 */
export function PropertyTaxLookup({ homeValue, onApply }: Props) {
  const [zip, setZip] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [overrideFips, setOverrideFips] = useState("");

  async function lookup() {
    if (!/^\d{5}$/.test(zip)) return;
    setState({ kind: "loading" });
    setOverrideFips("");
    try {
      const res = await fetch(`/api/property-tax?zip=${zip}`);
      if (res.ok && res.status !== 204) {
        setState({ kind: "found", data: (await res.json()) as LookupResponse });
      } else {
        setState({ kind: "none" });
      }
    } catch {
      setState({ kind: "none" });
    }
  }

  const data = state.kind === "found" ? state.data : null;
  const county =
    data && overrideFips
      ? (data.counties.find((c) => c.fips === overrideFips) ?? data.resolved)
      : (data?.resolved ?? null);
  const annual = county ? (homeValue * county.ratePercent) / 100 : 0;

  const controlClass =
    "w-full h-10 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) " +
    "px-3 text-[14px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent) transition-colors";

  return (
    <div className="mt-3 pt-3 border-t border-(--color-border-subtle)">
      <div className="flex items-end gap-2">
        <label className="block w-28">
          <FieldLabel hint="tax lookup">ZIP</FieldLabel>
          {/* Text, not number — a numeric input renders an empty ZIP as 0. */}
          <input
            type="text"
            inputMode="numeric"
            placeholder="30096"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup();
              }
            }}
            className={`${controlClass} font-(--font-mono)`}
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

      {data && county && (
        <div className="mt-2.5">
          <p className="text-[12px] text-(--color-text-secondary)">
            {county.name} averages{" "}
            <span className="text-(--color-accent) font-(--font-mono)">
              {county.ratePercent.toFixed(3)}%
            </span>{" "}
            — {dollars(annual)}/yr at {dollars(homeValue)}.
          </p>

          <button
            type="button"
            onClick={() => onApply(Math.round(annual))}
            className="text-[12px] text-(--color-accent) mt-1"
          >
            Use this figure
          </button>

          {/* A ZIP can straddle counties, so don't pick silently. */}
          <div className="mt-2.5">
            <FieldLabel>County</FieldLabel>
            <select
              value={overrideFips || data.resolved.fips}
              onChange={(e) => setOverrideFips(e.target.value)}
              className={`${controlClass} appearance-none`}
            >
              {data.counties.map((c) => (
                <option key={c.fips} value={c.fips}>
                  {c.name} — {c.ratePercent.toFixed(2)}%
                </option>
              ))}
            </select>
          </div>

          <p className="text-[10px] text-(--color-text-tertiary) mt-2 leading-relaxed">
            {data.source}, {data.vintage}. County average across owner-occupied homes, many of which
            carry a homestead exemption — a rental has none, so expect to pay more than this.
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
