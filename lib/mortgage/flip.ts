import { VERDICT_THRESHOLDS, defaultInputs } from "./defaults";
import { HARD_MONEY_DEFAULTS } from "./hardMoney";
import { LOAN_PRODUCTS, LOAN_TYPE_CONFIG } from "./loanTypes";
import { type LoanType, type MortgageInputs } from "./types";

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


// ── The Flip calculator's inputs ─────────────────────────────────────────────

/** What the Flip calculator lets you type. Everything else is a default. */
export interface FlipTyped {
  /** A `LOAN_PRODUCTS` value, such as "hardMoney" or "fha203k". */
  product: string;
  price: number;
  rehab: number;
  arv: number;
  ratePct: number;
  pointsPct: number;
  /** Down payment as a percent of price plus financed work. Ignored on hard money. */
  downPct: number;
}

/**
 * The rate, points and down payment a loan starts on in the Flip calculator.
 *
 * Hard money keeps its own: 15% and 2 points. The calculator used to open on
 * an FHA 203(k) carrying those, which modelled a mortgage at a hard money
 * rate. A mortgage starts on the app's rate, no points and its minimum down.
 */
export function flipStartingTerms(loanType: LoanType): {
  ratePct: number;
  pointsPct: number;
  downPct: number;
} {
  if (loanType === "hardMoney") {
    return { ratePct: HARD_MONEY_DEFAULTS.ratePct, pointsPct: HARD_MONEY_DEFAULTS.pointsPct, downPct: 0 };
  }
  return {
    ratePct: defaultInputs().interestRate,
    pointsPct: 0,
    downPct: LOAN_TYPE_CONFIG[loanType].minDownPercent,
  };
}

/** The loan a `LOAN_PRODUCTS` value names, falling back to hard money. */
export function flipProduct(product: string) {
  return LOAN_PRODUCTS.find((p) => p.value === product) ?? LOAN_PRODUCTS.find((p) => p.value === "hardMoney")!;
}

/**
 * The full inputs for what was typed — the same object the page calculates
 * and the save stores, so a saved flip reopens on the loan it was run on. The
 * save used to keep only price, rehab and ARV, and dropped the rest.
 */
export function flipInputs(typed: FlipTyped): MortgageInputs {
  const chosen = flipProduct(typed.product);
  const base = defaultInputs();
  const inputs: MortgageInputs = {
    ...base,
    loanType: chosen.loanType,
    renovationProgram: chosen.renovationProgram,
    homeValue: typed.price,
    renovationBudget: typed.rehab,
    interestRate: typed.ratePct,
    points: typed.pointsPct,
    arv: typed.arv > 0 ? typed.arv : null,
    afterRepairValue: typed.arv > 0 ? typed.arv : null,
  };

  // A mortgage's down payment is a percent of price plus the work it finances
  // (renovation loans roll the rehab in). The default was a fixed $12,250 —
  // 3.5% of a $350,000 house — whatever the price. Hard money sizes itself.
  const financedWork =
    inputs.renovationProgram === "none"
      ? 0
      : typed.rehab * (1 + inputs.renovationContingencyPct / 100);
  inputs.downPayment = ((typed.price + financedWork) * Math.max(0, typed.downPct)) / 100;
  return inputs;
}
