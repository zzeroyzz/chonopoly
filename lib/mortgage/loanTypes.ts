import { type LoanType, type MortgageInputs } from "./types";

/**
 * Which fields a loan type actually uses. The input panel and the calculator
 * both read this, so they can't disagree about what applies.
 */
export interface LoanTypeConfig {
  label: string;
  /** Conventional PMI. */
  showPmi: boolean;
  /** FHA annual MIP, paid monthly in place of PMI. */
  showMip: boolean;
  showVaFundingFee: boolean;
  /** Hard money: interest-only, term in months, points, balloon, optional ARV. */
  isHardMoney: boolean;
  /** DSCR: qualifies on property income, so borrower income fields don't apply. */
  isDscr: boolean;
  showBorrowerIncome: boolean;
  showDtiRatios: boolean;
  showMortgageInsuranceOfAnyKind: boolean;
  minDownPercent: number;
  /** Front-end / back-end guideline, or null when ratios don't apply. */
  frontEndGuideline: number | null;
  backEndGuideline: number | null;
  guidelineNote?: string;
}

export const LOAN_TYPE_CONFIG: Record<LoanType, LoanTypeConfig> = {
  conventional: {
    label: "Conventional",
    showPmi: true,
    showMip: false,
    showVaFundingFee: false,
    isHardMoney: false,
    isDscr: false,
    showBorrowerIncome: true,
    showDtiRatios: true,
    showMortgageInsuranceOfAnyKind: true,
    minDownPercent: 3,
    frontEndGuideline: 28,
    backEndGuideline: 36,
    guidelineNote:
      "28 / 36 is the traditional guideline. Automated underwriting routinely approves back-end ratios into the mid-40s.",
  },
  fha: {
    label: "FHA",
    showPmi: false,
    showMip: true,
    showVaFundingFee: false,
    isHardMoney: false,
    isDscr: false,
    showBorrowerIncome: true,
    showDtiRatios: true,
    showMortgageInsuranceOfAnyKind: true,
    minDownPercent: 3.5,
    frontEndGuideline: 31,
    backEndGuideline: 43,
    guidelineNote: "31 / 43 is the manual underwriting standard.",
  },
  va: {
    label: "VA",
    showPmi: false,
    showMip: false,
    showVaFundingFee: true,
    isHardMoney: false,
    isDscr: false,
    showBorrowerIncome: true,
    showDtiRatios: true,
    showMortgageInsuranceOfAnyKind: false,
    minDownPercent: 0,
    frontEndGuideline: null,
    backEndGuideline: 41,
    guidelineNote:
      "VA underwrites on residual income alongside DTI. Residual income is not modeled here.",
  },
  hardMoney: {
    label: "Hard money",
    showPmi: false,
    showMip: false,
    showVaFundingFee: false,
    isHardMoney: true,
    isDscr: false,
    showBorrowerIncome: false,
    showDtiRatios: false,
    showMortgageInsuranceOfAnyKind: false,
    minDownPercent: 0,
    frontEndGuideline: null,
    backEndGuideline: null,
  },
  dscr: {
    label: "DSCR",
    showPmi: false,
    showMip: false,
    showVaFundingFee: false,
    isHardMoney: false,
    isDscr: true,
    showBorrowerIncome: false,
    showDtiRatios: false,
    showMortgageInsuranceOfAnyKind: false,
    minDownPercent: 20,
    frontEndGuideline: null,
    backEndGuideline: null,
  },
};

export const LOAN_TYPES: LoanType[] = ["conventional", "fha", "va", "hardMoney", "dscr"];

/** FHA upfront mortgage insurance premium: 1.75% of the base loan amount. */
export const FHA_UFMIP_RATE = 0.0175;

/** FHA annual MIP rate, charged monthly. Rate varies by term, LTV and loan size;
 *  0.55% covers the common 30-year, >95% LTV, under-conforming-limit case. */
export const FHA_ANNUAL_MIP_RATE = 0.0055;

/** FHA MIP runs for the life of the loan under 10% down, and 11 years at 10%+. */
export const FHA_MIP_TERMINATION_MONTHS_AT_10_PERCENT_DOWN = 132;

/**
 * VA funding fee, purchase loans.
 * Source: 38 U.S.C. 3729 as amended, rates effective for loans closed on or
 * after 2023-04-07 — see va.gov/housing-assistance/home-loans/funding-fee-and-closing-costs.
 * Rounded percentages of the base loan amount.
 */
export function vaFundingFeeRate(downPaymentPercent: number, subsequentUse: boolean): number {
  if (downPaymentPercent >= 10) return 0.0125;
  if (downPaymentPercent >= 5) return 0.015;
  return subsequentUse ? 0.033 : 0.0215;
}

/**
 * Home insurance as a percent of home value per year, used as the default.
 *
 * The national average effective rate sits nearer 0.6%. This is deliberately
 * above it: the owner asked for a conservative figure, and on the affordability
 * calculation erring high is the safe direction — it lowers the maximum price
 * rather than sending him shopping above what he can carry. Georgia also runs
 * above the national average on wind and hail exposure.
 *
 * Caveat worth knowing: insurance actually scales with rebuild cost, not market
 * value, so a percent of value overshoots on expensive land. That's the same
 * direction as conservative, so it's tolerable here — but it's why the field
 * stays editable and labeled.
 */
export const CONSERVATIVE_INSURANCE_RATE = 0.8;

/** LTV at which conventional PMI terminates automatically, against original value. */
export const PMI_AUTO_TERMINATION_LTV = 0.78;

export function configFor(inputs: MortgageInputs): LoanTypeConfig {
  return LOAN_TYPE_CONFIG[inputs.loanType];
}
