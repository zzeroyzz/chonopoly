import { type LoanType, type RenovationProgram } from "../mortgage/types";

/**
 * One answer to "what does this house need?", for everything that asks.
 *
 * Before this, the screen read the reno budget off the primary analysis, the
 * flip read its own parameter, and the Rehab tab was going to read an estimate.
 * Three readers of one number is how a house shows $45k in one place and $52k
 * in another with nothing on screen to say which is right.
 *
 * The rule: an estimate wins if one exists, otherwise the reno budget from the
 * primary financing analysis. Phase 3 supplies the estimate and plugs in here —
 * nothing else has to change when it does.
 */

export type RehabSource = "estimate_visit" | "estimate_photos" | "budget";

export interface RehabEstimateInput {
  /** Subtotal plus contingency. */
  total: number;
  /** Which contingency applied, which is also what the label says. */
  source: "photos" | "visit";
}

export interface ResolvedRehab {
  total: number;
  source: RehabSource;
  /** "Budget only" when nothing has been estimated yet. */
  label: string;
  /** True when this is the reno budget standing in for an estimate. */
  budgetOnly: boolean;
}

export function resolveRehab(
  estimate: RehabEstimateInput | null,
  renovationBudget: number
): ResolvedRehab {
  if (estimate && estimate.total >= 0 && estimate.source) {
    return {
      total: Math.max(0, estimate.total),
      source: estimate.source === "visit" ? "estimate_visit" : "estimate_photos",
      label: estimate.source === "visit" ? "Estimate · visit" : "Estimate · photos",
      budgetOnly: false,
    };
  }

  return {
    total: Math.max(0, renovationBudget),
    source: "budget",
    label: "Budget only",
    budgetOnly: true,
  };
}

/**
 * Where the rehab money comes from, which decides whether it is cash.
 *
 * This is the part that moves a deal from "works" to "I cannot do this one":
 * the same $50,000 is financed on a 203(k), mostly financed on hard money, and
 * entirely out of pocket on a plain FHA loan.
 */
export interface RehabFunding {
  /** Rolled into the loan — repaid at sale rather than paid now. */
  inLoan: number;
  /** Out of pocket before the house can be listed. */
  inCash: number;
}

export function splitRehabFunding(
  rehabTotal: number,
  loanType: LoanType,
  renovationProgram: RenovationProgram,
  /** Hard money only: what the lender actually funded, after the ARV ceiling. */
  hardMoneyFunded: number | null,
  /**
   * The reno budget the loan was actually sized on.
   *
   * A 203(k) or a hard money loan was underwritten against the budget that
   * existed when the numbers were run. An estimate that comes in higher does
   * not quietly enlarge the loan — the lender already committed — so the
   * difference is cash the buyer brings until the numbers are re-run at the
   * new figure. Omitted means the budget and the estimate are the same thing.
   */
  fundedBudget?: number
): RehabFunding {
  const total = Math.max(0, rehabTotal);
  // The loan cannot cover more than it was sized for.
  const ceiling = fundedBudget === undefined ? total : Math.max(0, Math.min(fundedBudget, total));

  if (loanType === "hardMoney") {
    const funded = Math.max(0, Math.min(hardMoneyFunded ?? 0, ceiling));
    return { inLoan: funded, inCash: total - funded };
  }

  // A renovation program finances the work: that is the entire point of one —
  // but only up to what it was written for.
  if (renovationProgram !== "none") {
    return { inLoan: ceiling, inCash: total - ceiling };
  }

  // FHA or conventional with no renovation program. Every dollar is yours, and
  // this is the case people most often forget to budget for.
  return { inLoan: 0, inCash: total };
}
