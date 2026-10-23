import { type LoanType, type MortgageInputs, type RenovationProgram } from "./types";
import { HARD_MONEY_DEFAULTS } from "./hardMoney";
import { defaultInputs } from "./defaults";

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

/**
 * What the loan type dropdown offers.
 *
 * 203(k) and HomeStyle appear here as products you can pick, because that is how
 * people shop for them. They are not loan types underneath: a 203(k) is an FHA
 * loan with renovation sizing — same insurance, same ratios, same minimum down.
 * Keeping them as `(loanType, renovationProgram)` pairs means one definition of
 * what FHA means, instead of two that drift the first time a rule changes.
 */
export interface LoanProduct {
  value: string;
  label: string;
  loanType: LoanType;
  renovationProgram: RenovationProgram;
}

export const LOAN_PRODUCTS: LoanProduct[] = [
  { value: "conventional", label: "Conventional", loanType: "conventional", renovationProgram: "none" },
  { value: "homestyle", label: "HomeStyle renovation", loanType: "conventional", renovationProgram: "homestyle" },
  { value: "fha", label: "FHA", loanType: "fha", renovationProgram: "none" },
  { value: "fha203k", label: "FHA 203(k) renovation", loanType: "fha", renovationProgram: "fha203k" },
  { value: "va", label: "VA", loanType: "va", renovationProgram: "none" },
  { value: "hardMoney", label: "Hard money", loanType: "hardMoney", renovationProgram: "none" },
  { value: "dscr", label: "DSCR", loanType: "dscr", renovationProgram: "none" },
];

/** Which dropdown entry the current inputs correspond to. */
export function productValueFor(loanType: LoanType, renovationProgram: RenovationProgram): string {
  const match = LOAN_PRODUCTS.find(
    (p) => p.loanType === loanType && p.renovationProgram === renovationProgram
  );
  return match?.value ?? loanType;
}

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

/**
 * The assistance award. A fixed figure, not something the buyer chooses — the
 * program grants this amount or none, so it is a constant rather than an input.
 */
export const DPA_AWARD = 10000;

/**
 * The buyer's own money, minimum. The program requires it however the rest of
 * the closing is funded, so it is a floor on their cash and not an earmark
 * against the down payment specifically.
 */
export const BORROWER_MINIMUM_INVESTMENT = 1000;

/**
 * Whether assistance can apply to a loan type at all.
 *
 * Driven off the minimum down payment rather than a list of names, so the rule
 * survives a minimum changing: with 0% down there is no minimum for the award to
 * cover and the whole thing would fall through to closing costs, which is not
 * what these programs are for. That rules out VA and USDA.
 *
 * DSCR is excluded explicitly despite its 20% minimum — the awards do not
 * apply to it, and that is a fact about the programs rather than something the
 * minimum can tell us. DSCR likewise: it is an investor product.
 */
export function allowsDownPaymentAssistance(loanType: LoanType): boolean {
  const config = LOAN_TYPE_CONFIG[loanType];
  if (config.isHardMoney || config.isDscr) return false;
  return config.minDownPercent > 0;
}

export function configFor(inputs: MortgageInputs): LoanTypeConfig {
  return LOAN_TYPE_CONFIG[inputs.loanType];
}

/**
 * The rate and points to switch to when the loan type changes.
 *
 * Hard money charges far more than a mortgage, so moving onto it takes its
 * own 15% and 2 points; moving off it goes back to the Settings rate and no
 * points. Numbers kept whatever rate was there, which modelled hard money at
 * a mortgage's 6.75%. Any other switch leaves a typed rate alone.
 */
export function rateForLoanSwitch(
  from: LoanType,
  to: LoanType,
  settingsRate: number | null
): Pick<MortgageInputs, "interestRate" | "points"> | null {
  if (to === "hardMoney" && from !== "hardMoney") {
    return { interestRate: HARD_MONEY_DEFAULTS.ratePct, points: HARD_MONEY_DEFAULTS.pointsPct };
  }
  if (from === "hardMoney" && to !== "hardMoney") {
    return { interestRate: settingsRate ?? defaultInputs().interestRate, points: 0 };
  }
  return null;
}
