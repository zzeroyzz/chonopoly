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

    // No assistance until the user says otherwise — the calculator shouldn't
    // assume a program he may not qualify for.
    dpaAmount: 0,
    dpaStructure: "grant",
    dpaRate: 0,
    dpaTermYears: 10,

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
