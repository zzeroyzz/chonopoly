import { type MortgageInputs } from "./types";

export const TERM_PRESETS = [30, 20, 15];
export const HARD_MONEY_TERM_PRESETS = [6, 12, 18, 24];

/**
 * Where the two screening verdicts draw their lines.
 *
 * Module constants, not per-user columns: the verdicts have to be right against
 * fixed numbers before anyone tunes them, and making them editable on day one
 * would cost six columns and six form inputs before we know whether 15% is even
 * the right figure. Promoting them to the buyer profile later is additive.
 *
 * Every number here is a judgement call, so each one says what it is for.
 */
export const VERDICT_THRESHOLDS = {
  // ── Affordability: Qualifies · Tight · Doesn't qualify ─────────────────────

  /**
   * Points above a DTI guideline that still counts as caution rather than fail.
   *
   * This was hardcoded in dti.ts and is unchanged — it moved here so both the
   * ratio badges and the affordability verdict read one number. Two copies of a
   * threshold eventually disagree, and then the badge says caution while the
   * verdict says it failed.
   */
  dtiCautionPoints: 7,

  /**
   * Months of housing payment that should survive closing. Below this the buyer
   * qualifies on paper and has nothing left for the first surprise, which is
   * Tight rather than fine.
   */
  cashReservesTightMonths: 3,

  /** Combined LTV above this leaves no equity to absorb an appraisal miss. */
  combinedLtvTightPct: 97,

  // ── Deal: Works · Thin · Doesn't work ──────────────────────────────────────
  //
  // Margin and profit are both tested, and both have to clear. 15% of a
  // $120,000 ARV is $18,000 — a percentage that looks healthy attached to a
  // payday that is not worth a six-month rehab. Neither test alone catches that.

  dealMarginWorksPct: 15,
  dealMarginThinPct: 10,
  dealMinProfitWorks: 25_000,
  dealMinProfitThin: 15_000,

  /**
   * The 70% rule, shown as a figure rather than used as a gate: a deal is
   * judged on margin alone. This is a margin rule wearing a different hat, and
   * two gates that can disagree give you a verdict you cannot explain in the
   * space a phone has.
   */
  maxOfferArvPct: 70,
} as const;

export function defaultInputs(now: Date = new Date()): MortgageInputs {
  return {
    homeValue: 350000,
    // 3.5% — the FHA minimum, and the case he's usually modelling.
    downPayment: 350000 * 0.035,
    loanAmountOverride: null,
    interestRate: 6.75,
    termYears: 30,
    termMonths: 12,
    startMonth: now.getMonth(),
    startYear: now.getFullYear(),
    propertyTaxYearly: 4200,
    pmiRate: 0.5,
    pmiRateAuto: true,
    closingCostPercent: 5,
    insuranceYearly: 1800,
    insuranceRateAuto: true,
    hoaMonthly: 0,
    loanType: "conventional",

    renovationProgram: "none",
    renovationBudget: 0,
    // Lenders require a contingency reserve on renovation loans. 10% is the
    // common floor; the figure is editable because the requirement varies by
    // program, by lender and by the condition of the house.
    renovationContingencyPct: 10,
    afterRepairValue: null,

    // No assistance until the user says otherwise — the calculator shouldn't
    // assume a program he may not qualify for.
    dpaEnabled: false,
    dpaStructure: "deferred",
    dpaRate: 0,
    dpaTermYears: 10,

    // Zero, not a plausible-looking salary.
    //
    // These two now come from the buyer profile via resolveInputs. A default of
    // 9000/600 meant a user who had entered nothing still got a confident
    // verdict, computed against an income they never claimed — the worst of the
    // three options, because it looks like an answer. Zero makes calculateDti
    // report "not applicable", which the UI turns into "set your income".
    grossMonthlyIncome: 0,
    otherMonthlyDebt: 0,
    dpaForgivenessYears: 5,
    dpaForgivenessStyle: "prorated",
    hardMoneyPurchaseLtvPct: 85,
    hardMoneyRehabFundedPct: 100,
    hardMoneyMaxLoanToArvPct: 75,
    hardMoneyInterestStyle: "non_dutch",
    hardMoneyDraws: [],

    fhaUfmipFinanced: true,

    vaFundingFeeFinanced: true,
    vaExempt: false,
    vaSubsequentUse: false,

    points: 2,
    arv: null,

    grossMonthlyRent: 2800,
    vacancyPct: 5,
    operatingExpensesMonthly: 700,
    dscrThreshold: 1.25,
  };
}
