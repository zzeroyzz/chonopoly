export type LoanType = "conventional" | "fha" | "va" | "hardMoney" | "dscr";

/**
 * How down payment assistance is repaid. This is not cosmetic — it decides
 * whether the assistance adds a monthly payment, which decides whether it
 * affects DTI and therefore what the buyer can actually afford.
 *
 * grant      — forgiven outright, or forgiven after a residency period.
 * deferred   — no monthly payment; principal due on sale, refinance or payoff.
 * amortizing — a real second lien with a monthly payment from day one.
 */
export type DpaStructure = "grant" | "deferred" | "amortizing";

export type RepairLevel = "light" | "moderate" | "heavy";

export interface MortgageInputs {
  homeValue: number;
  /** Down payment in dollars. The percent form is derived, never stored. */
  downPayment: number;
  /** Set when the user edits the loan amount directly; null means "derive it". */
  loanAmountOverride: number | null;
  /** Annual rate as a percent, e.g. 6.75. Always manual entry. */
  interestRate: number;
  termYears: number;
  /** Hard money only — that loan is sized in months, not years. */
  termMonths: number;
  /** 0-indexed month, matching Date. */
  startMonth: number;
  startYear: number;
  propertyTaxYearly: number;
  /** Annual PMI as a percent of the loan amount. Conventional only. */
  pmiRate: number;
  /** While true, pmiRate is derived from LTV. A user edit sets it false and their number wins. */
  pmiRateAuto: boolean;
  /** Buyer closing costs as a percent of purchase price. */
  closingCostPercent: number;
  insuranceYearly: number;
  /** While true, insuranceYearly is derived from home value. A user edit sets it false. */
  insuranceRateAuto: boolean;
  hoaMonthly: number;
  loanType: LoanType;

  /**
   * Down payment assistance, in dollars. Reduces cash to close.
   *
   * Deliberately NOT subtracted from the down payment or added to the loan: the
   * first mortgage is unchanged, so its LTV — and therefore PMI — is unchanged
   * too. Assistance covering the down payment does not make PMI go away, and
   * treating it as if it did understates the payment badly.
   */
  dpaAmount: number;
  dpaStructure: DpaStructure;
  /** Amortizing structures only. Annual rate as a percent; 0 is common. */
  dpaRate: number;
  /** Amortizing structures only. */
  dpaTermYears: number;

  grossMonthlyIncome: number;
  otherMonthlyDebt: number;

  /** FHA: finance the upfront premium into the loan rather than paying at closing. */
  fhaUfmipFinanced: boolean;

  /** VA */
  vaFundingFeeFinanced: boolean;
  vaExempt: boolean;
  vaSubsequentUse: boolean;

  /** Hard money */
  points: number;
  arv: number | null;

  /** DSCR */
  grossMonthlyRent: number;
  vacancyPct: number;
  operatingExpensesMonthly: number;
  dscrThreshold: number;
}

export interface AmortizationRow {
  period: number;
  /** First day of the payment month, ISO "YYYY-MM-DD". */
  date: string;
  payment: number;
  principal: number;
  interest: number;
  mortgageInsurance: number;
  balance: number;
  /** Last period that carries mortgage insurance. */
  isMortgageInsuranceEnd?: boolean;
  /** Hard money only — the principal due at term end. */
  isBalloon?: boolean;
}

export interface DscrResult {
  noi: number;
  annualDebtService: number;
  ratio: number;
  passes: boolean;
}

export interface MortgageResult {
  loanAmount: number;
  downPaymentAmount: number;
  downPaymentPercent: number;
  /** Fees rolled into the loan — FHA UFMIP or the VA funding fee. */
  financedFees: number;
  /** Buyer closing costs in dollars. One-time, never part of the monthly payment. */
  closingCosts: number;
  /** Fees due at closing rather than financed — unfinanced UFMIP or VA funding fee. */
  feesDueAtClosing: number;
  /** Everything the buyer writes cheques for at closing, after assistance. */
  cashToClose: number;
  /** Cash to close before any assistance is applied. */
  cashToCloseBeforeDpa: number;
  /** Assistance actually used. Capped at cash needed — nobody hands back change. */
  dpaApplied: number;
  /** Assistance offered beyond what closing required. Surfaced, not silently dropped. */
  dpaUnused: number;
  /** Monthly payment on the assistance. Zero unless the structure amortizes. */
  dpaMonthlyPayment: number;
  /**
   * First-lien LTV plus the assistance, as a percent. Can exceed 100 on some
   * programs, and is left uncapped on purpose.
   */
  combinedLtv: number;

  principalAndInterest: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyMortgageInsurance: number;
  /** PITI + HOA + MI + any amortizing assistance payment. */
  totalMonthlyWithMortgageInsurance: number;
  /** Same, once MI drops off. Null when MI never ends or never applied. */
  totalMonthlyAfterMortgageInsurance: number | null;

  mortgageInsuranceEndPeriod: number | null;
  mortgageInsuranceEndDate: string | null;
  mortgageInsurancePaymentCount: number;
  mortgageInsuranceTotalPaid: number;

  payoffDate: string;
  totalInterest: number;
  totalOfAllPayments: number;
  annualPayment: number;
  totalTax: number;
  totalInsurance: number;

  schedule: AmortizationRow[];
  isInterestOnly: boolean;

  /** FHA */
  ufmip?: number;
  /** VA */
  vaFundingFee?: number;
  /** Hard money */
  pointsCost?: number;
  balloonAmount?: number;
  loanToArv?: number | null;
  /** DSCR */
  dscr?: DscrResult;
}

export type RatioStatus = "pass" | "caution" | "fail";

export interface DtiResult {
  /** Whether ratios apply at all — they don't for hard money or DSCR. */
  applicable: boolean;
  frontEnd: number;
  backEnd: number;
  frontGuideline: number | null;
  backGuideline: number | null;
  frontStatus: RatioStatus;
  backStatus: RatioStatus;
  /** Free-text caveat shown under the ratios, e.g. the VA residual-income note. */
  note?: string;
}
