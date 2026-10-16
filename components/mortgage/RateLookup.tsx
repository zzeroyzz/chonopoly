"use client";

import { useEffect, useState } from "react";
import { Card, SectionLabel, Disclosure } from "./fields";
import { monthYear } from "./format";

interface RateEntry {
  seriesId: string;
  label: string;
  rate: number;
  observedAt: string;
}

interface RatesResponse {
  source: string;
  rates: RateEntry[];
}

/**
 * Current average rates, for reference only.
 *
 * This deliberately does not touch the calculator's rate field — there's no fill
 * control and no wiring into the form. The user reads these and types what a
 * lender actually quoted. Showing both the 30- and 15-year averages side by side
 * also avoids the trap of filling a 15-year loan with the 30-year number.
 *
 * Renders nothing at all when the endpoint has no key configured.
 */
export function RateLookup() {
  const [data, setData] = useState<RatesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/mortgage/rates");
        if (!cancelled && res.ok && res.status !== 204) {
          setData((await res.json()) as RatesResponse);
        }
      } catch {
        // Reference only — stay quiet and let the field remain manual.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <SectionLabel>Current averages</SectionLabel>
        <div className="h-10 skeleton rounded-md" />
      </Card>
    );
  }

  if (!data || data.rates.length === 0) return null;

  return (
    <Card>
      {/* Reference only — it does not change the calculation, so it does not
          need to hold screen space above the figures that do. */}
      <Disclosure
        label="Current averages"
        summary={data.rates.map((r) => `${r.rate.toFixed(2)}%`).join(" · ")}
      >
      <div className="grid grid-cols-2 gap-3">
        {data.rates.map((r) => (
          <div key={r.seriesId}>
            <p className="text-[22px] font-bold font-(--font-mono) text-(--color-text-primary) leading-tight">
              {r.rate.toFixed(2)}%
            </p>
            <p className="text-[11px] text-(--color-text-secondary) mt-0.5">{r.label}</p>
            <p className="text-[10px] text-(--color-text-tertiary)">week of {monthYear(r.observedAt)}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-(--color-text-tertiary) mt-3 leading-relaxed">
        {data.source}. Reference only — enter the rate you were quoted.
      </p>
      </Disclosure>
    </Card>
  );
}
