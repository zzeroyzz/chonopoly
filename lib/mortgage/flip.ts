import { type MortgageInputs, type MortgageResult } from "./types";
import { VERDICT_THRESHOLDS } from "./defaults";

/**
 * Flip economics: what you are all in for, what is left at resale, and what the
 * 70% rule would have you offer.
 *
 * profit = ARV − purchase − rehab − buying − holding − financing − selling
 *
 * Financing is its own line and is never folded into holding cost. Holding cost
 * is hand-entered on the buyer profile — utilities, taxes, insurance, lawn —
 * while financing is derived from the loan amount and the rate, both of which
 * move every time the price moves. Rolling the derived figure into the typed
 * one would mean the number on screen stops matching the number the user
 * entered, and they would have to recompute their own holding figure for every
 * house. Separate lines also let the breakdown say "you are paying $8,400 to
 * borrow this money", which is the line that changes minds about a thin deal.
 */

/** Where the financing figure came from. Always shown on the breakdown. */
export type FlipFinancingSource = "financing_analysis" | "generic_estimate";

export interface FlipFinancing {
  source: FlipFinancingSource;
  /** Which analysis supplied it, for the "from <label>" line. */
  analysisLabel: string | null;
  /** Interest paid across the hold. */
  interest: number;
  /** FHA UFMIP or the VA funding fee. Zero on the generic estimate. */
  upfrontMortgageInsurance: number;
  /** Monthly MIP/PMI summed across the hold. Zero on the generic estimate. */
  monthlyMortgageInsurance: number;
  /** Origination points. */
  points: number;
  total: number;
  /** The loan itself, for the cash-invested figure. Null when unknown. */
  loanAmount: number | null;
}

/**
 * Financing costs taken from a real financing analysis.
 *
 * Preferred whenever the house has a primary financing scenario, because these
 * are the actual numbers that scenario produced rather than a flat-rate
 * approximation of them. On an FHA 203(k) the difference is large: UFMIP and
 * monthly MIP are thousands that a points-plus-interest estimate omits entirely.
 *
 * Interest is summed from the amortization schedule rather than approximated,
 * so an amortizing loan is charged what it actually costs over those months
 * instead of a flat rate on the opening balance.
 */
export function financingFromAnalysis(
  inputs: MortgageInputs,
  result: MortgageResult,
  holdingMonths: number,
  analysisLabel: string | null
): FlipFinancing {
  const months = Math.max(0, Math.round(holdingMonths));

  const interest = result.schedule
    .slice(0, months)
    .reduce((sum, row) => sum + row.interest, 0);

  // Upfront MI is a cost whether it was financed or paid at closing: financed
  // just means it is repaid out of the sale proceeds instead of up front.
  const upfrontMortgageInsurance = result.ufmip ?? result.vaFundingFee ?? 0;

  const monthlyMortgageInsurance = result.schedule
    .slice(0, months)
    .reduce((sum, row) => sum + row.mortgageInsurance, 0);

  const points = result.pointsCost ?? 0;

  return {
    source: "financing_analysis",
    analysisLabel,
    interest,
    upfrontMortgageInsurance,
    monthlyMortgageInsurance,
    points,
    total: interest + upfrontMortgageInsurance + monthlyMortgageInsurance + points,
    loanAmount: result.loanAmount,
  };
}

/**
 * The fallback estimate, for a house with no financing analysis — hard money,
 * or cash with a line of credit behind it.
 *
 * Interest-only, which is how a rehab carry actually works: hard money lenders
 * take interest monthly and the principal at payoff, so nothing amortizes
 * during a six-month hold.
 */
export function genericFinancing(
  loanAmount: number,
  annualRatePct: number,
  pointsPct: number,
  holdingMonths: number
): FlipFinancing {
  const principal = Math.max(0, loanAmount);
  const months = Math.max(0, holdingMonths);

  const interest = principal * (Math.max(0, annualRatePct) / 100 / 12) * months;
  const points = principal * (Math.max(0, pointsPct) / 100);

  return {
    source: "generic_estimate",
    analysisLabel: null,
    interest,
    upfrontMortgageInsurance: 0,
    monthlyMortgageInsurance: 0,
    points,
    total: interest + points,
    loanAmount: principal,
  };
}

export interface FlipParams {
  arv: number;
  purchasePrice: number;
  /** Rehab including its contingency — photos or visit, whichever applies. */
  rehabTotal: number;
  /** Buying costs as a percent of the purchase price. */
  buyingPct: number;
  /** Selling costs as a percent of the resale price. */
  sellingPct: number;
  holdingMonthly: number;
  holdingMonths: number;
  financing: FlipFinancing;
}

export interface FlipResult {
  arv: number;
  purchasePrice: number;
  rehabTotal: number;
  buyingCosts: number;
  holdingCosts: number;
  sellingCosts: number;
  financingCosts: number;
  financing: FlipFinancing;

  /** Everything the deal costs, financing included. */
  allInCost: number;
  profit: number;
  /** Profit as a percent of ARV. Null when there is no ARV to divide by. */
  marginPct: number | null;
  /** Profit over cash actually invested. Null when the loan is unknown. */
  roiPct: number | null;
  cashInvested: number | null;

  /** The 70% rule: ARV × 70% − rehab. A figure on the screen, not a gate. */
  maxOffer: number;
  /** How far over max offer the price is. Zero when at or under. */
  overMaxOfferBy: number;
}

export function calculateFlip(params: FlipParams): FlipResult {
  const arv = Math.max(0, params.arv);
  const purchasePrice = Math.max(0, params.purchasePrice);
  const rehabTotal = Math.max(0, params.rehabTotal);

  const buyingCosts = purchasePrice * (Math.max(0, params.buyingPct) / 100);
  const sellingCosts = arv * (Math.max(0, params.sellingPct) / 100);
  const holdingCosts =
    Math.max(0, params.holdingMonthly) * Math.max(0, params.holdingMonths);
  const financingCosts = params.financing.total;

  const allInCost =
    purchasePrice + rehabTotal + buyingCosts + holdingCosts + sellingCosts + financingCosts;

  const profit = arv - allInCost;

  const loanAmount = params.financing.loanAmount;
  // Selling costs come out of the proceeds at closing, not out of pocket, so
  // they are excluded from cash invested — counting them would understate ROI.
  const cashInvested =
    loanAmount === null
      ? null
      : Math.max(
          0,
          purchasePrice + rehabTotal + buyingCosts + holdingCosts + financingCosts - loanAmount
        );

  const maxOffer = Math.max(
    0,
    arv * (VERDICT_THRESHOLDS.maxOfferArvPct / 100) - rehabTotal
  );

  return {
    arv,
    purchasePrice,
    rehabTotal,
    buyingCosts,
    holdingCosts,
    sellingCosts,
    financingCosts,
    financing: params.financing,
    allInCost,
    profit,
    marginPct: arv > 0 ? (profit / arv) * 100 : null,
    roiPct: cashInvested !== null && cashInvested > 0 ? (profit / cashInvested) * 100 : null,
    cashInvested,
    maxOffer,
    overMaxOfferBy: Math.max(0, purchasePrice - maxOffer),
  };
}
