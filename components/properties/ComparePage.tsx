"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { type ScreenRow } from "@/lib/screen/screenRow";
import { useCrmContext } from "@/components/crm/useCrmContext";
import { dollars } from "@/components/mortgage/format";
import { AFFORDABILITY_LABEL, DEAL_LABEL, NO_RESALE_PRICE_LABEL } from "@/lib/mortgage/verdicts";
import { LOAN_TYPE_CONFIG } from "@/lib/mortgage/loanTypes";
import { type LoanType } from "@/lib/mortgage/types";

/**
 * Two to four houses, side by side.
 *
 * Every figure comes from the same screen rows the Properties list is built
 * from, which are built from the same `buildDeal` the Profit card uses. That
 * is the whole point of comparing: if this view did its own arithmetic, two
 * screens could disagree about which house is better and neither would be
 * checkable.
 */

const MAX = 4;
const MIN = 2;

/** Which direction counts as better, for the quiet highlight. */
type Better = "high" | "low" | "none";

interface RowSpec {
  label: string;
  /** Null renders as "—" without competing for the highlight. */
  value: (r: ScreenRow) => string | null;
  /** The comparable number behind the text. */
  rank?: (r: ScreenRow) => number | null;
  better?: Better;
}

const GROUPS: { title: string; rows: RowSpec[] }[] = [
  {
    title: "Deal",
    rows: [
      {
        label: "Walk-away cash",
        value: (r) => (r.walkAwayCash === null ? null : dollars(r.walkAwayCash, 0)),
        rank: (r) => r.walkAwayCash,
        better: "high",
      },
      {
        label: "True profit",
        value: (r) => (r.trueProfit === null ? null : dollars(r.trueProfit, 0)),
        rank: (r) => r.trueProfit,
        better: "high",
      },
      {
        label: "Return on cash",
        value: (r) => (r.roiPct === null ? null : `${r.roiPct.toFixed(0)}%`),
        rank: (r) => r.roiPct,
        better: "high",
      },
      {
        label: "ARV",
        value: (r) => (r.arv === null ? null : dollars(r.arv, 0)),
        rank: (r) => r.arv,
        better: "high",
      },
      {
        label: "Deal verdict",
        value: (r) => (r.deal.hasArv ? DEAL_LABEL[r.deal.verdict] : NO_RESALE_PRICE_LABEL),
      },
    ],
  },
  {
    title: "Afford",
    rows: [
      {
        label: "Loan",
        // The label people use, not the enum. "hardMoney" is not a loan type
        // anybody says out loud.
        value: (r) => LOAN_TYPE_CONFIG[r.loanType as LoanType]?.label ?? r.loanType,
      },
      {
        label: "Monthly payment",
        value: (r) => `${dollars(r.piti, 0)}/mo`,
        rank: (r) => r.piti,
        better: "low",
      },
      {
        label: "Cash in",
        value: (r) => dollars(r.cashIn, 0),
        rank: (r) => r.cashIn,
        better: "low",
      },
      {
        label: "Back DTI",
        // Hard money has no DTI at all — it is sized off the deal, not the
        // borrower — so this is "—" rather than a number that looks like zero.
        value: (r) => (r.backDti === null ? null : `${r.backDti.toFixed(0)}%`),
        rank: (r) => r.backDti,
        better: "low",
      },
      {
        label: "Affordability",
        value: (r) =>
          r.affordability.needsProfile
            ? "No income on file"
            : AFFORDABILITY_LABEL[r.affordability.verdict],
      },
    ],
  },
  {
    title: "Rehab",
    rows: [
      { label: "Budget", value: (r) => dollars(r.rehabBudget, 0) },
      {
        label: "Estimate",
        value: (r) =>
          r.rehabSource === null
            ? "Budget only"
            : `${dollars(r.rehabTotal, 0)} · ${r.rehabSource}`,
      },
      {
        label: "Gap",
        value: (r) => {
          const gap = r.rehabTotal - r.rehabBudget;
          return gap > 0 ? `${dollars(gap, 0)} over` : gap < 0 ? `${dollars(-gap, 0)} under` : "—";
        },
        rank: (r) => r.rehabTotal - r.rehabBudget,
        better: "low",
      },
    ],
  },
  {
    title: "Time",
    rows: [
      {
        label: "Hold",
        value: (r) => `${r.holdMonths} mo`,
        rank: (r) => r.holdMonths,
        better: "low",
      },
      {
        label: "One more month",
        value: (r) => dollars(r.oneMoreMonth, 0),
        rank: (r) => r.oneMoreMonth,
        better: "low",
      },
    ],
  },
];

export function ComparePage() {
  const { ctxParams } = useCrmContext();
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read from window.location rather than useSearchParams: that hook
    // suspends, and AppShell — which carries the bottom nav — renders inside
    // this component. Suspending takes the nav off screen mid-navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(
      (new URLSearchParams(window.location.search).get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }, []);

  useEffect(() => {
    if (!ctxParams) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/properties/screen?${ctxParams}`);
        if (!res.ok) throw new Error("Could not load the houses");
        const body = (await res.json()) as { rows: ScreenRow[] };
        if (!cancelled) {
          setRows(body.rows);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the houses");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctxParams]);

  // Kept in the order they were picked, capped, so the columns do not shuffle.
  const chosen = ids
    .map((id) => rows.find((r) => r.propertyId === id))
    .filter((r): r is ScreenRow => Boolean(r))
    .slice(0, MAX);

  return (
    <>
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8">
        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) mb-3"
        >
          <ArrowLeft size={13} /> Properties
        </Link>

        <h1 className="text-[18px] font-semibold text-(--color-text-primary) mb-1">Compare</h1>

        {loading && (
          <SkeletonRegion label="Loading the houses you picked" testId="compare-loading">
            {/* A label column and three value columns, which is what the real
                table looks like at 390px before it scrolls sideways. */}
            <div className="grid gap-2 mt-3">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-28 shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </SkeletonRegion>
        )}
        {error && <p className="text-[12px] text-(--color-danger)">{error}</p>}

        {!loading && !error && chosen.length < MIN && (
          <div data-testid="compare-too-few" className="py-10 text-center">
            <p className="text-[13px] text-(--color-text-secondary)">
              Pick {MIN} to {MAX} houses to compare.
            </p>
            <Link
              href="/properties"
              className="inline-block mt-3 text-[13px] text-(--color-accent) font-medium"
            >
              Choose some →
            </Link>
          </div>
        )}

        {chosen.length >= MIN && (
          <>
            <p className="text-[11px] text-(--color-text-tertiary) mb-3">
              {chosen.length}{" "}houses · every figure from the same calculation as each
              house&rsquo;s Profit card
            </p>

            {/* The table scrolls sideways inside its own box; the page never
                does. Four columns do not fit a phone, and shrinking them to
                fit would make the numbers unreadable. */}
            <div className="overflow-x-auto" data-testid="compare-table">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-(--color-base) text-left font-normal text-(--color-text-tertiary) p-2 min-w-[7.5rem]">
                      House
                    </th>
                    {chosen.map((r) => (
                      <th key={r.propertyId} className="p-2 text-left min-w-[8.5rem] align-bottom">
                        <Link
                          href={`/properties/${r.propertyId}`}
                          className="text-[12px] font-medium text-(--color-text-primary) wrap-break-word hover:text-(--color-accent)"
                        >
                          {r.address}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((group) => (
                    <GroupRows key={group.title} group={group} chosen={chosen} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function GroupRows({
  group,
  chosen,
}: {
  group: { title: string; rows: RowSpec[] };
  chosen: ScreenRow[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={chosen.length + 1}
          className="sticky left-0 pt-4 pb-1 px-2 text-[10px] uppercase tracking-widest text-(--color-text-tertiary)"
        >
          {group.title}
        </td>
      </tr>
      {group.rows.map((spec) => {
        // The quiet highlight: work out which column wins this row, and only
        // when there is a real winner. Highlighting a tie teaches nothing.
        let best: number | null = null;
        if (spec.rank && spec.better && spec.better !== "none") {
          const values = chosen.map(spec.rank);
          const real = values.filter((v): v is number => v !== null);
          if (real.length > 1) {
            const target = spec.better === "high" ? Math.max(...real) : Math.min(...real);
            const winners = values.filter((v) => v === target).length;
            if (winners === 1) best = target;
          }
        }

        return (
          <tr key={spec.label} className="border-t border-(--color-border-subtle)">
            <td className="sticky left-0 z-10 bg-(--color-base) p-2 text-(--color-text-secondary)">
              {spec.label}
            </td>
            {chosen.map((r) => {
              const text = spec.value(r);
              const isBest = best !== null && spec.rank?.(r) === best;
              return (
                <td
                  key={r.propertyId}
                  data-best={isBest ? "yes" : undefined}
                  className={`p-2 font-(--font-mono) ${
                    isBest ? "text-(--color-accent) font-semibold" : "text-(--color-text-primary)"
                  }`}
                >
                  {text ?? <span className="text-(--color-text-tertiary)">—</span>}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
