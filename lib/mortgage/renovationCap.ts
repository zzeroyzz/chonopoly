import { type MortgageInputs } from "./types";
import { renovationFinanced, totalAcquisitionCost } from "./calculate";

/**
 * The FHA 203(k) maximum mortgage, and what it costs you out of pocket when the
 * project does not fit under it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE: HUD Handbook 4000.1, Section II.A.8.a — 203(k) Rehabilitation
 * Mortgage Insurance Program; as amended by Mortgagee Letter 2024-13
 * (9 July 2024, effective 4 November 2024).
 *   https://www.hud.gov/sites/dfiles/OCHCO/documents/2024-13hsgml.pdf
 *   https://www.hud.gov/hud-partners/single-family-203k
 *
 * For a purchase, the maximum mortgage is based on the LESSER of:
 *   (a) the lesser of the as-is value or the purchase price, plus the estimated
 *       cost of rehabilitation and allowable financeable items; or
 *   (b) 110% of the expected market value upon completion of the work,
 * with the applicable LTV factor applied (96.5% for an owner-occupant
 * purchase), and in no case above the FHA county loan limit.
 *
 * ML 2024-13 raised the Limited 203(k) total rehabilitation cost ceiling from
 * $35,000 to $75,000 and introduced an annual review of that figure. $75,000 is
 * current as of October 2026 — it is a dated constant and wants re-checking,
 * which is why it says so below.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is an ESTIMATE and is labelled as one everywhere it appears. The
 * lender's own maximum mortgage worksheet is the final word; it accounts for
 * fees, inspections and reserves this does not.
 */

/** HUD 4000.1 II.A.8.a: base loan amount may not exceed 110% of after-improved value. */
export const AFTER_IMPROVED_VALUE_FACTOR = 1.1;

/** Owner-occupant purchase LTV factor. */
export const PURCHASE_LTV_FACTOR = 0.965;

/**
 * Limited 203(k) total rehabilitation cost ceiling. ML 2024-13; reviewed
 * annually by HUD, so re-confirm this before trusting it in a new year.
 */
export const LIMITED_203K_REHAB_CEILING = 75_000;

/** Condominiums are 100% of after-improved value, not 110%. */
export const CONDO_AFTER_IMPROVED_VALUE_FACTOR = 1.0;

export interface RenovationCapResult {
  /** False for a non-renovation loan, where none of this applies. */
  applicable: boolean;

  /** min(as-is value, purchase price) + rehab + contingency. */
  costBasis: number;
  /** 110% of after-improved value (100% for a condo). */
  afterImprovedCap: number;
  /** Which of the two bound the loan — the sentence the UI wants. */
  boundBy: "cost_basis" | "after_improved_value" | "county_limit" | null;

  /** The estimated maximum mortgage, after the LTV factor and county limit. */
  maximumMortgage: number;
  /** What the buyer would borrow if nothing capped it. */
  requestedLoan: number;

  /** True when the project fits with no forced extra cash. */
  fits: boolean;
  /**
   * Extra cash the cap forces out of pocket, over and above the planned down
   * payment. Feeds cashToClose, so a house over the cap can trip the cash hard
   * stop rather than passing with a warning somewhere else on the page.
   */
  outOfPocketGap: number;

  /** Limited 203(k) only: rehab total against the $75,000 ceiling. */
  rehabCeiling: number | null;
  rehabOverCeilingBy: number;

  notes: string[];
}

function notApplicable(): RenovationCapResult {
  return {
    applicable: false,
    costBasis: 0,
    afterImprovedCap: 0,
    boundBy: null,
    maximumMortgage: 0,
    requestedLoan: 0,
    fits: true,
    outOfPocketGap: 0,
    rehabCeiling: null,
    rehabOverCeilingBy: 0,
    notes: [],
  };
}

export interface RenovationCapOptions {
  /**
   * Appraised as-is value. Falls back to the purchase price when unknown, which
   * is the conservative direction: HUD takes the LESSER of the two, so assuming
   * the price can only overstate the basis if the real as-is value is lower —
   * and a too-low as-is value is the lender's finding to deliver, not a surprise
   * this tool should manufacture.
   */
  asIsValue?: number | null;
  /** FHA county loan limit. No cap applied when unknown. */
  countyLoanLimit?: number | null;
  /** Limited 203(k) carries the rehab ceiling; Standard does not. */
  isLimited?: boolean;
  isCondo?: boolean;
}

export function calculate203kCap(
  inputs: MortgageInputs,
  options: RenovationCapOptions = {}
): RenovationCapResult {
  if (inputs.renovationProgram === "none") return notApplicable();

  const rehabTotal = renovationFinanced(inputs);
  if (rehabTotal <= 0) return notApplicable();

  const purchasePrice = Math.max(0, inputs.homeValue);
  const asIs =
    options.asIsValue !== null && options.asIsValue !== undefined && options.asIsValue > 0
      ? options.asIsValue
      : purchasePrice;

  // HUD: the lesser of as-is value or purchase price.
  const adjustedAsIsValue = Math.min(asIs, purchasePrice);
  const costBasis = adjustedAsIsValue + rehabTotal;

  // Without an ARV there is no after-improved value to cap against, so the
  // cost basis stands alone. Reported as a note rather than silently assumed.
  const afterImprovedValue = inputs.afterRepairValue ?? 0;
  const valueFactor = options.isCondo
    ? CONDO_AFTER_IMPROVED_VALUE_FACTOR
    : AFTER_IMPROVED_VALUE_FACTOR;
  const afterImprovedCap = afterImprovedValue > 0 ? afterImprovedValue * valueFactor : Infinity;

  const notes: string[] = [];
  if (afterImprovedValue <= 0) {
    notes.push(
      "No after-repair value entered, so the 110% after-improved ceiling has not been applied. Add an ARV for a real cap."
    );
  }

  const binding = Math.min(costBasis, afterImprovedCap);
  let boundBy: RenovationCapResult["boundBy"] =
    afterImprovedCap < costBasis ? "after_improved_value" : "cost_basis";

  let maximumMortgage = binding * PURCHASE_LTV_FACTOR;

  const countyLimit = options.countyLoanLimit;
  if (countyLimit !== null && countyLimit !== undefined && countyLimit > 0) {
    if (countyLimit < maximumMortgage) {
      maximumMortgage = countyLimit;
      boundBy = "county_limit";
    }
  }

  // What they are actually trying to borrow. Uses the real planned down payment
  // rather than assuming the 3.5% minimum — a buyer putting more down may fit
  // under a cap that the minimum would breach.
  const requestedLoan = Math.max(0, totalAcquisitionCost(inputs) - Math.max(0, inputs.downPayment));

  const outOfPocketGap = Math.max(0, requestedLoan - maximumMortgage);

  const rehabCeiling = options.isLimited ? LIMITED_203K_REHAB_CEILING : null;
  const rehabOverCeilingBy =
    rehabCeiling !== null ? Math.max(0, rehabTotal - rehabCeiling) : 0;

  if (rehabOverCeilingBy > 0) {
    notes.push(
      `Rehab of ${Math.round(rehabTotal).toLocaleString()} is over the Limited 203(k) ceiling of ${LIMITED_203K_REHAB_CEILING.toLocaleString()}. This needs a Standard 203(k).`
    );
  }

  notes.push("Estimate only — the lender's maximum mortgage worksheet is the final word.");

  return {
    applicable: true,
    costBasis,
    afterImprovedCap: Number.isFinite(afterImprovedCap) ? afterImprovedCap : 0,
    boundBy,
    maximumMortgage,
    requestedLoan,
    fits: outOfPocketGap === 0 && rehabOverCeilingBy === 0,
    outOfPocketGap,
    rehabCeiling,
    rehabOverCeilingBy,
    notes,
  };
}
