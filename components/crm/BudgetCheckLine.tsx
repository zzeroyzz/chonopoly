"use client";

import { AlertTriangle } from "lucide-react";
import { type BudgetCheck } from "@/lib/rehab/calculateRehab";
import { dollars } from "@/components/mortgage/format";

/**
 * "Budget $45k · Estimate $52k · $7k over", wherever the rehab number appears.
 *
 * One component rather than the same sentence written at four call sites, so
 * the Rehab tab, the Profit card and the property cards cannot word it
 * differently or disagree about what counts as over.
 *
 * Over budget is not an error. The loan was written for the budget, so the
 * difference is simply cash the buyer brings until the numbers are re-run —
 * and the button that re-runs them is right here, because that is the moment
 * someone wants it.
 */
export function BudgetCheckLine({
  check,
  onRerun,
  compact = false,
}: {
  check: BudgetCheck;
  /** Omitted where there is nothing to re-run, such as the tools page. */
  onRerun?: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        data-testid="budget-check"
        className={check.isOver ? "text-(--color-warning)" : "text-(--color-text-secondary)"}
      >
        {check.summary}
      </span>
    );
  }

  return (
    <div
      data-testid="budget-check"
      className={`rounded-lg border px-3 py-2.5 ${
        check.isOver ? "border-(--color-warning)" : "border-(--color-border-default)"
      }`}
    >
      <div className="flex items-start gap-2">
        {check.isOver && (
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-(--color-warning)" />
        )}
        <p className="flex-1 min-w-0 text-[12px] text-(--color-text-primary)">{check.summary}</p>
      </div>

      {check.isOver && (
        <>
          <p className="text-[11px] text-(--color-text-secondary) leading-relaxed mt-1">
            The loan was sized on the budget, so the extra {dollars(check.over, 0)} is cash you
            bring until you re-run the numbers.
          </p>
          {onRerun && (
            <button
              type="button"
              onClick={onRerun}
              data-testid="rerun-at-estimate"
              className="mt-2 h-9 px-3 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[12px] font-semibold"
            >
              Re-run the numbers at {dollars(check.estimate, 0)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
