import { VERDICT_THRESHOLDS } from "./defaults";

/**
 * The one profit calculation in the app.
 *
 * It answers two questions in the order they actually get asked:
 *
 *   WALK-AWAY CASH — what lands in your account when the sale closes. This is
 *   the headline, because it is the money that buys the next house. It is the
 *   resale price minus everything that comes out of the closing statement.
 *
 *   TRUE PROFIT — what the deal made you, after the money you put in and the
 *   months you carried it. Walk-away cash flatters a deal where you brought
 *   $40k and carried it a year; true profit does not.
 *
 * The old version computed a single `profit` as ARV minus an all-in cost, which
 * conflated the two. A deal could show a healthy profit while handing back less
 * cash than you put in, and nothing on screen said so.
 *
 * Every line carries where it came from and whether it was typed over, because
 * a number you cannot trace is a number you cannot argue with — and these get
 * argued with, usually at an offer deadline.
 */

/** Where a figure came from, shown on every line of the breakdown. */
export type LineSource =
  | "financing_analysis"
  | "hard_money_terms"
  | "valuation"
  | "rehab_estimate"
  | "rehab_budget"
  | "defaults"
  | "manual"
  | "computed";

export const LINE_SOURCE_LABEL: Record<LineSource, string> = {
  financing_analysis: "from the financing analysis",
  hard_money_terms: "from the loan terms",
  valuation: "from the ARV",
  rehab_estimate: "from the rehab estimate",
  rehab_budget: "from the rehab budget",
  defaults: "from your defaults",
  manual: "entered",
  computed: "calculated",
};

/** One figure, with its provenance. */
export interface DealLine {
  value: number;
  source: LineSource;
  /** True when the user typed over the derived figure. */
  overridden: boolean;
  /** Shown under the line when it needs explaining. */
  note?: string;
}

export function line(
  value: number,
  source: LineSource,
  overridden = false,
  note?: string
): DealLine {
  return { value, source, overridden, note };
}

/** A named cost that does not fit any other line. */
export interface OtherFee {
  name: string;
  amount: number;
}

export interface DealParams {
  /** Resale price. Null when the house has no ARV yet. */
  arv: DealLine | null;

  // ── Out of the closing statement ──────────────────────────────────────────
  /** Balance repaid at sale. Amortized balance after the hold, or the full
   *  hard money loan. */
  loanPayoff: DealLine;
  sellerClosingCosts: DealLine;
  dpaRepayment: DealLine;
  capitalGains: DealLine;
  otherFees: OtherFee[];

  // ── Out of pocket ─────────────────────────────────────────────────────────
  downPayment: DealLine;
  buyerClosingCosts: DealLine;
  points: DealLine;
  /** Rehab not covered by the loan. All of it on FHA/conventional. */
  rehabPaidInCash: DealLine;
  /** A hard money ARV ceiling shortfall, which the buyer has to bring. */
  loanShortfall: DealLine;

  // ── Carry ─────────────────────────────────────────────────────────────────
  holdMonths: number;
  /** PITI across the hold, or the hard money interest total. */
  carry: DealLine;
  /** Utilities, lawn, staging — per month. */
  monthlyExtras: DealLine;
  /** What one more month adds, for the "another month costs" line. */
  oneMoreMonthCarry: number;

  /** For the 70% rule figure only. */
  purchasePrice: number;
  rehabTotal: number;
}

export interface DealResult {
  arv: number | null;
  /** True when there is no ARV, so both headline numbers are unknowable. */
  missingArv: boolean;

  otherFeesTotal: number;
  /** ARV − payoff − seller closing − DPA − capital gains − other fees. */
  walkAwayCash: number | null;

  cashIn: number;
  holdingCost: number;
  /** Walk-away cash − cash in − holding cost. */
  trueProfit: number | null;

  /** Profit as a percent of ARV. Null without an ARV. */
  marginPct: number | null;
  /** True profit over cash in. Null when no cash went in. */
  roiPct: number | null;

  /** What holding it one more month costs: carry plus the monthly extras. */
  oneMoreMonth: number;

  /** The 70% rule: ARV × 70% − rehab. A figure, never a gate. */
  maxOffer: number | null;
  overMaxOfferBy: number | null;
}

export function calculateDeal(params: DealParams): DealResult {
  const arv = params.arv ? Math.max(0, params.arv.value) : null;

  const otherFeesTotal = params.otherFees.reduce(
    (sum, fee) => sum + Math.max(0, fee.amount),
    0
  );

  const outOfClosing =
    params.loanPayoff.value +
    params.sellerClosingCosts.value +
    params.dpaRepayment.value +
    params.capitalGains.value +
    otherFeesTotal;

  // Null rather than zero: a house with no ARV has an unknown walk-away, and
  // showing $0 reads as a deal that makes nothing rather than one nobody has
  // priced yet.
  const walkAwayCash = arv === null ? null : arv - outOfClosing;

  const cashIn =
    params.downPayment.value +
    params.buyerClosingCosts.value +
    params.points.value +
    params.rehabPaidInCash.value +
    params.loanShortfall.value;

  const months = Math.max(0, params.holdMonths);
  const holdingCost = params.carry.value + params.monthlyExtras.value * months;

  const trueProfit = walkAwayCash === null ? null : walkAwayCash - cashIn - holdingCost;

  const maxOffer =
    arv === null
      ? null
      : Math.max(
          0,
          arv * (VERDICT_THRESHOLDS.maxOfferArvPct / 100) - Math.max(0, params.rehabTotal)
        );

  return {
    arv,
    missingArv: arv === null,
    otherFeesTotal,
    walkAwayCash,
    cashIn,
    holdingCost,
    trueProfit,
    marginPct: arv !== null && arv > 0 && trueProfit !== null ? (trueProfit / arv) * 100 : null,
    roiPct: cashIn > 0 && trueProfit !== null ? (trueProfit / cashIn) * 100 : null,
    oneMoreMonth: params.oneMoreMonthCarry + params.monthlyExtras.value,
    maxOffer,
    overMaxOfferBy:
      maxOffer === null ? null : Math.max(0, Math.max(0, params.purchasePrice) - maxOffer),
  };
}

/**
 * The balance still owed after holding an amortizing loan for N months.
 *
 * Hard money does not amortize, so its payoff is the full loan — handled by the
 * caller, which knows which kind of loan this is.
 */
export function payoffAfterMonths(
  schedule: { principal: number }[],
  loanAmount: number,
  months: number
): number {
  const paid = schedule
    .slice(0, Math.max(0, Math.round(months)))
    .reduce((sum, row) => sum + row.principal, 0);
  return Math.max(0, loanAmount - paid);
}
