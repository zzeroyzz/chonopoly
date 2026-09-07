import { type MortgageInputs } from "./types";

export const TERM_PRESETS = [30, 20, 15];
export const HARD_MONEY_TERM_PRESETS = [6, 12, 18, 24];

export function defaultInputs(now: Date = new Date()): MortgageInputs {
  return {
    homeValue: 350000,
    downPayment: 70000,
    loanAmountOverride: null,
    interestRate: 6.75,
    termYears: 30,
    termMonths: 12,
    startMonth: now.getMonth(),
    startYear: now.getFullYear(),
    propertyTaxYearly: 4200,
    pmiRate: 0.5,
    insuranceYearly: 1800,
    hoaMonthly: 0,
    loanType: "conventional",

    grossMonthlyIncome: 9000,
    otherMonthlyDebt: 600,

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
