import { type MortgageInputs } from "./types";

export const TERM_PRESETS = [30, 20, 15];
export const HARD_MONEY_TERM_PRESETS = [6, 12, 18, 24];

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
    dpaStructure: "grant",
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
