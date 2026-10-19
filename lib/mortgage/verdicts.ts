import { type MortgageInputs, type MortgageResult, type DtiResult } from "./types";
import { type RenovationCapResult } from "./renovationCap";
import { type DealResult } from "./flip";
import { VERDICT_THRESHOLDS } from "./defaults";

/**
 * The two verdicts the screen table shows, because they answer different
 * questions and a house can pass one and fail the other.
 *
 *   Can we afford it?   → Qualifies · Tight · Doesn't qualify
 *   Does the deal work? → Works · Thin · Doesn't work
 *
 * Both carry their reasons. A bare "Doesn't qualify" is useless on a screen of
 * fifteen houses: the whole value is knowing whether it was the ratios, the
 * cash, or a 203(k) cap, because each one has a different answer available.
 *
 * Both are pure functions of figures computed elsewhere. Nothing here fetches
 * or recalculates, so a verdict can always be traced to the numbers on screen.
 */

export type AffordabilityVerdict = "qualifies" | "tight" | "does_not_qualify";
export type DealVerdict = "works" | "thin" | "does_not_work";

export const AFFORDABILITY_LABEL: Record<AffordabilityVerdict, string> = {
  qualifies: "Qualifies",
  tight: "Tight",
  does_not_qualify: "Doesn't qualify",
};

export const DEAL_LABEL: Record<DealVerdict, string> = {
  works: "Works",
  thin: "Thin",
  does_not_work: "Doesn't work",
};

export interface VerdictReason {
  /** A blocker decides the verdict; a caution only downgrades it. */
  kind: "blocker" | "caution";
  text: string;
}

export interface AffordabilityAssessment {
  verdict: AffordabilityVerdict;
  reasons: VerdictReason[];
  /** The one-line summary for a table cell. */
  summary: string;
  /**
   * True when the ratios do not apply at all — hard money and DSCR are
   * underwritten on the property, not the borrower.
   */
  ratiosApply: boolean;
  /** True when no income is on file, so there is nothing to judge against. */
  needsProfile: boolean;
}

export interface AffordabilityInput {
  inputs: MortgageInputs;
  result: MortgageResult;
  dti: DtiResult;
  /** Null when the house is not on a renovation loan. */
  renovationCap: RenovationCapResult | null;
  /** From the buyer profile. */
  cashAvailable: number;
  countyLoanLimit: number | null;
}

/**
 * Can we afford it?
 *
 * Hard stops first. Any one of them is "doesn't qualify" regardless of the
 * others, because they are each independently fatal — being inside your DTI
 * does not help if you cannot fund the closing.
 */
export function assessAffordability(input: AffordabilityInput): AffordabilityAssessment {
  const { inputs, result, dti, renovationCap, cashAvailable, countyLoanLimit } = input;
  const reasons: VerdictReason[] = [];

  // No income on file is its own state, not a failure. Phase 0's "set your
  // income" prompt handles it; a verdict computed against zero would be a
  // confident answer to a question nobody asked.
  if (inputs.grossMonthlyIncome <= 0) {
    return {
      verdict: "tight",
      reasons: [{ kind: "caution", text: "No income on file — set your income to get a verdict." }],
      summary: "Set your income",
      ratiosApply: dti.applicable,
      needsProfile: true,
    };
  }

  const blockers: VerdictReason[] = [];
  const cautions: VerdictReason[] = [];

  // ── Hard stops ─────────────────────────────────────────────────────────────

  if (dti.applicable) {
    if (dti.frontStatus === "fail") {
      blockers.push({
        kind: "blocker",
        text: `Housing ratio ${dti.frontEnd.toFixed(0)}% is over the ${dti.frontGuideline}% guideline`,
      });
    }
    if (dti.backStatus === "fail") {
      blockers.push({
        kind: "blocker",
        text: `Total debt ratio ${dti.backEnd.toFixed(0)}% is over the ${dti.backGuideline}% guideline`,
      });
    }
  }

  // The 203(k) gap is part of cash to close, so it is counted once, here, and
  // not added again below.
  const cashNeeded = result.cashToClose + (renovationCap?.outOfPocketGap ?? 0);

  if (cashNeeded > cashAvailable) {
    blockers.push({
      kind: "blocker",
      text: `Needs ${money(cashNeeded)} at closing, ${money(cashAvailable)} available`,
    });
  }

  if (renovationCap?.applicable && renovationCap.rehabOverCeilingBy > 0) {
    blockers.push({
      kind: "blocker",
      text: `Rehab is ${money(renovationCap.rehabOverCeilingBy)} over the Limited 203(k) ceiling`,
    });
  }

  if (countyLoanLimit !== null && countyLoanLimit > 0 && result.loanAmount > countyLoanLimit) {
    blockers.push({
      kind: "blocker",
      text: `Loan of ${money(result.loanAmount)} is over the county limit of ${money(countyLoanLimit)}`,
    });
  }

  // ── Cautions ───────────────────────────────────────────────────────────────

  if (dti.applicable) {
    if (dti.frontStatus === "caution") {
      cautions.push({
        kind: "caution",
        text: `Housing ratio ${dti.frontEnd.toFixed(0)}% is just over the ${dti.frontGuideline}% guideline`,
      });
    }
    if (dti.backStatus === "caution") {
      cautions.push({
        kind: "caution",
        text: `Total debt ratio ${dti.backEnd.toFixed(0)}% is just over the ${dti.backGuideline}% guideline`,
      });
    }
  }

  // Reserves. Qualifying on paper with nothing left for the first surprise is
  // Tight, not fine.
  const housingPayment = result.totalMonthlyWithMortgageInsurance;
  const leftAfterClosing = cashAvailable - cashNeeded;
  const monthsOfReserve = housingPayment > 0 ? leftAfterClosing / housingPayment : Infinity;

  if (
    blockers.length === 0 &&
    housingPayment > 0 &&
    monthsOfReserve < VERDICT_THRESHOLDS.cashReservesTightMonths
  ) {
    cautions.push({
      kind: "caution",
      text: `${money(Math.max(0, leftAfterClosing))} left after closing — under ${VERDICT_THRESHOLDS.cashReservesTightMonths} months of payments`,
    });
  }

  if (result.combinedLtv > VERDICT_THRESHOLDS.combinedLtvTightPct) {
    cautions.push({
      kind: "caution",
      text: `Combined LTV ${result.combinedLtv.toFixed(0)}% leaves almost no equity`,
    });
  }

  if (result.borrowerMinimumApplied) {
    cautions.push({
      kind: "caution",
      text: "Assistance would have covered everything; the program's minimum contribution applies",
    });
  }

  // ── The verdict ────────────────────────────────────────────────────────────

  const verdict: AffordabilityVerdict =
    blockers.length > 0 ? "does_not_qualify" : cautions.length > 0 ? "tight" : "qualifies";

  reasons.push(...blockers, ...cautions);

  return {
    verdict,
    reasons,
    // The first reason, because it is the most severe: blockers are pushed
    // before cautions.
    summary: reasons[0]?.text ?? "Within your ratios and cash",
    ratiosApply: dti.applicable,
    needsProfile: false,
  };
}

export interface DealAssessment {
  verdict: DealVerdict;
  reasons: VerdictReason[];
  summary: string;
  /**
   * True when the ARV has not been reviewed yet — every comp RentCast returned
   * is still included. The verdict is real but provisional, and must be
   * labelled so wherever it appears.
   */
  provisional: boolean;
  /** False when there is no ARV at all, so there is nothing to judge. */
  hasArv: boolean;
}

export interface DealInput {
  deal: DealResult;
  /** True until the comps have been reviewed on the Comps tab. */
  provisionalArv: boolean;
}

/**
 * Does the deal work?
 *
 * Margin and profit both have to clear. 15% of a $120,000 ARV is $18,000 — a
 * percentage that looks healthy attached to a payday not worth a six-month
 * rehab, and neither test alone catches that.
 *
 * The 70% rule is deliberately NOT a gate here. It is a margin rule wearing a
 * different hat, and two gates that can disagree give a verdict nobody can
 * explain in the space a phone has. Max offer is reported as a figure instead.
 */
export function assessDeal(input: DealInput): DealAssessment {
  const { deal, provisionalArv } = input;
  const t = VERDICT_THRESHOLDS;

  if (deal.arv === null || deal.arv <= 0 || deal.trueProfit === null || deal.marginPct === null) {
    return {
      verdict: "does_not_work",
      reasons: [{ kind: "blocker", text: "No ARV yet — add comps to judge the deal" }],
      summary: "No ARV yet",
      provisional: provisionalArv,
      hasArv: false,
    };
  }

  // True profit, not walk-away. Walk-away is the headline because it is the
  // money you leave with, but a deal where you brought $40,000 and carried it
  // a year can hand back a healthy cheque and still have lost you money. The
  // verdict judges what the deal made.
  const margin = deal.marginPct;
  const profit = deal.trueProfit;
  const reasons: VerdictReason[] = [];

  let verdict: DealVerdict;

  if (margin >= t.dealMarginWorksPct && profit >= t.dealMinProfitWorks) {
    verdict = "works";
    reasons.push({
      kind: "caution",
      text: `${money(profit)} true profit at ${margin.toFixed(0)}% margin`,
    });
  } else if (margin >= t.dealMarginThinPct && profit >= t.dealMinProfitThin) {
    verdict = "thin";
    // Say which of the two tests is the one holding it back; they have
    // different fixes — a lower price versus a cheaper rehab.
    reasons.push({
      kind: "caution",
      text:
        margin < t.dealMarginWorksPct
          ? `${margin.toFixed(0)}% margin is under the ${t.dealMarginWorksPct}% target`
          : `${money(profit)} profit is under the ${money(t.dealMinProfitWorks)} target`,
    });
  } else {
    verdict = "does_not_work";
    reasons.push({
      kind: "blocker",
      text:
        profit < 0
          ? `Loses ${money(Math.abs(profit))} at this price`
          : margin < t.dealMarginThinPct
            ? `${margin.toFixed(0)}% margin is under the ${t.dealMarginThinPct}% floor`
            : `${money(profit)} profit is under the ${money(t.dealMinProfitThin)} floor`,
    });
  }

  if (deal.overMaxOfferBy !== null && deal.overMaxOfferBy > 0 && deal.maxOffer !== null) {
    reasons.push({
      kind: "caution",
      text: `${money(deal.overMaxOfferBy)} over the 70% rule's ${money(deal.maxOffer)}`,
    });
  }

  return {
    verdict,
    reasons,
    summary: reasons[0].text,
    provisional: provisionalArv,
    hasArv: true,
  };
}

/** Whole dollars. Verdict text has no room for cents. */
function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
