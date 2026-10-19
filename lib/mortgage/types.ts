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
/**
 * How assistance is repaid, which is the only thing about it that changes the
 * deal. "forgivable" was missing and is the common one: forgiven over a term,
 * with whatever is left owed if you sell early.
 */
export type DpaStructure = "grant" | "deferred" | "forgivable" | "amortizing";

export type RepairLevel = "light" | "moderate" | "heavy";

/**
 * Renovation financing. A modifier on the loan type rather than a type of its
 * own, because 203(k) *is* FHA and HomeStyle *is* conventional — same mortgage
 * insurance, same ratios, same minimum down. Only the loan sizing changes.
 */
export type RenovationProgram = "none" | "fha203k" | "homestyle";

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
   * Renovation financing.
   *
   * Three things change when this is on, and all three are easy to get wrong:
   *   1. The loan is sized on purchase price PLUS the rehab budget, not price.
   *   2. The down payment is calculated on that total, not on the price.
   *   3. LTV — and therefore PMI or MIP — is measured against the AFTER-REPAIR
   *      value, not the purchase price. That's the whole point of the product:
   *      you're borrowing against the house you're going to have.
   */
  renovationProgram: RenovationProgram;
  /** Hard construction budget, before contingency and fees. */
  renovationBudget: number;
  /** Contingency reserve as a percent of the budget. Lenders require one. */
  renovationContingencyPct: number;
  /**
   * After-repair value. The loan ceiling is derived from this, so it is the
   * single most consequential input in the renovation path — and it is the
   * user's number, from comps or an as-completed appraisal. Nothing here
   * estimates it.
   */
  afterRepairValue: number | null;

  /**
   * Whether the buyer is using the assistance program.
   *
   * A boolean rather than an amount because the award is a fixed $10,000
   * (`DPA_AWARD`) — the program grants that or nothing, so there is no figure
   * for the buyer to choose and no way for them to type a wrong one.
   *
   * The award is allocated, not simply netted off: it covers the minimum down
   * payment for the loan type first, and everything left goes to closing costs.
   * That means it DOES reduce the first mortgage, which it previously did not —
   * so LTV, and therefore PMI, respond to it.
   */
  dpaEnabled: boolean;
  dpaStructure: DpaStructure;
  /** Forgivable: the term, and whether it forgives in one go or year by year. */
  dpaForgivenessYears: number;
  dpaForgivenessStyle: "cliff" | "prorated";
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
  /**
   * How the loan is sized and what the carry costs.
   *
   * These live on the inputs rather than on the deal analysis because the loan
   * is picked once, in Run the numbers, and everything downstream reads it. A
   * house has one loan; it should not be possible to model it one way on the
   * Numbers tab and another way in the list.
   */
  hardMoneyPurchaseLtvPct: number;
  hardMoneyRehabFundedPct: number;
  hardMoneyMaxLoanToArvPct: number;
  /** Dutch charges the whole loan from day one; Non-Dutch only what is drawn. */
  hardMoneyInterestStyle: "dutch" | "non_dutch";
  /** Rehab advances. Empty means "spread evenly", which is what gets prefilled. */
  hardMoneyDraws: { month: number; amount: number }[];

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
  /** Renovation: contingency reserve in dollars. */
  renovationContingency: number;
  /** Renovation: budget + contingency — everything rolled into the loan for the work. */
  renovationFinanced: number;
  /** Renovation: price + financed renovation. The basis for the down payment. */
  totalAcquisitionCost: number;
  /** Renovation: LTV against after-repair value. Null when ARV isn't known. */
  loanToAfterRepairValue: number | null;

  /** Everything the buyer writes cheques for at closing, after assistance. */
  cashToClose: number;
  /** Cash to close before any assistance is applied. */
  cashToCloseBeforeDpa: number;
  /** Assistance actually used. Capped at cash needed — nobody hands back change. */
  dpaApplied: number;
  /** The slice of the award that covered the minimum down payment. */
  dpaToDownPayment: number;
  /** The slice that went to closing costs — everything the down payment left. */
  dpaToClosing: number;
  /**
   * True when the buyer's own cash had to be raised to meet the program's
   * minimum investment. Worth surfacing: it means the award would otherwise
   * have covered everything.
   */
  borrowerMinimumApplied: boolean;
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
