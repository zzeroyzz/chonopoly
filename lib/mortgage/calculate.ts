import {
  type MortgageInputs,
  type MortgageResult,
  type AmortizationRow,
} from "./types";
import {
  LOAN_TYPE_CONFIG,
  FHA_UFMIP_RATE,
  FHA_ANNUAL_MIP_RATE,
  FHA_MIP_TERMINATION_MONTHS_AT_10_PERCENT_DOWN,
  PMI_AUTO_TERMINATION_LTV,
  CONSERVATIVE_INSURANCE_RATE,
  vaFundingFeeRate,
} from "./loanTypes";
import {
  buildAmortizationSchedule,
  buildInterestOnlySchedule,
  paymentDate,
} from "./amortization";
import { suggestedPmiRate, ltvPercent } from "./pmi";

/** Whether renovation financing is in play. */
export function isRenovationLoan(inputs: MortgageInputs): boolean {
  return inputs.renovationProgram !== "none" && renovationFinanced(inputs) > 0;
}

/** Rehab budget plus its contingency reserve — the part rolled into the loan. */
export function renovationFinanced(inputs: MortgageInputs): number {
  if (inputs.renovationProgram === "none") return 0;
  const budget = Math.max(0, inputs.renovationBudget);
  const contingency = budget * (Math.max(0, inputs.renovationContingencyPct) / 100);
  return budget + contingency;
}

/**
 * Purchase price plus the financed renovation.
 *
 * This is the figure the down payment is calculated on, not the price. A 3.5%
 * FHA down payment on a $200k house with $50k of work is 3.5% of $250k, not of
 * $200k — getting that wrong understates the cash the buyer needs by thousands.
 */
export function totalAcquisitionCost(inputs: MortgageInputs): number {
  return Math.max(0, inputs.homeValue) + renovationFinanced(inputs);
}

/**
 * The value the loan is measured against.
 *
 * On a renovation loan that's the after-repair value — the point of the product
 * is borrowing against the finished house. Falls back to the purchase price
 * when no ARV has been entered, which keeps the result conservative rather than
 * optimistic: a smaller denominator means a higher LTV and more mortgage
 * insurance, never less.
 */
export function valuationBasis(inputs: MortgageInputs): number {
  if (isRenovationLoan(inputs) && inputs.afterRepairValue && inputs.afterRepairValue > 0) {
    return inputs.afterRepairValue;
  }
  return inputs.homeValue;
}

/** Base loan before any financed fees are rolled in. */
export function baseLoanAmount(inputs: MortgageInputs): number {
  if (inputs.loanAmountOverride !== null) return Math.max(0, inputs.loanAmountOverride);
  return Math.max(0, totalAcquisitionCost(inputs) - inputs.downPayment);
}

/**
 * Annual home insurance. Derived from home value while on auto, so it scales
 * when the price changes; a typed figure wins, same rule as the rate and PMI.
 */
export function effectiveInsuranceYearly(inputs: MortgageInputs): number {
  if (!inputs.insuranceRateAuto) return inputs.insuranceYearly;
  return (inputs.homeValue * CONSERVATIVE_INSURANCE_RATE) / 100;
}

export function downPaymentPercent(inputs: MortgageInputs): number {
  // Against total acquisition cost, which equals the price when there's no
  // renovation — so the non-renovation answer is unchanged.
  const basis = totalAcquisitionCost(inputs);
  if (basis <= 0) return 0;
  return (inputs.downPayment / basis) * 100;
}

/**
 * Month at which conventional PMI terminates automatically — the first payment
 * where the balance reaches 78% of ORIGINAL value. Returns null when the loan
 * starts at or below that threshold, or when PMI never applies.
 */
/**
 * Monthly payment on down payment assistance.
 *
 * Zero for grants and deferred seconds — they carry no payment, which is the
 * whole reason the structure has to be an input rather than an assumption. An
 * amortizing second is a real loan and its payment belongs in the monthly
 * total and therefore in DTI.
 *
 * A 0% amortizing second is common, so the zero-rate branch is the normal case
 * here, not an edge case.
 */
export function dpaPayment(inputs: MortgageInputs): number {
  if (inputs.dpaStructure !== "amortizing") return 0;
  const principal = Math.max(0, inputs.dpaAmount);
  const months = Math.max(1, Math.round(inputs.dpaTermYears * 12));
  if (principal <= 0) return 0;

  const r = inputs.dpaRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * How assistance lands on the closing figures.
 *
 * Capped at the cash actually required — assistance beyond that isn't a rebate,
 * so it's reported as unused rather than quietly turned into a negative bill.
 *
 * Combined LTV is left uncapped. Some programs genuinely push past 100%, and
 * clamping it would hide the one number that says so.
 */
function dpaBreakdown(
  inputs: MortgageInputs,
  cashBefore: number,
  loanAmount: number
): {
  cashToClose: number;
  cashToCloseBeforeDpa: number;
  dpaApplied: number;
  dpaUnused: number;
  combinedLtv: number;
} {
  const offered = Math.max(0, inputs.dpaAmount);
  const applied = Math.min(offered, Math.max(0, cashBefore));

  return {
    cashToCloseBeforeDpa: cashBefore,
    cashToClose: Math.max(0, cashBefore - applied),
    dpaApplied: applied,
    dpaUnused: offered - applied,
    combinedLtv:
      inputs.homeValue > 0 ? ((loanAmount + offered) / inputs.homeValue) * 100 : 0,
  };
}

function pmiTerminationPeriod(schedule: AmortizationRow[], originalValue: number): number | null {
  if (originalValue <= 0) return null;
  const target = originalValue * PMI_AUTO_TERMINATION_LTV;
  for (const row of schedule) {
    if (row.balance <= target) return row.period;
  }
  return null;
}

export function calculateMortgage(inputs: MortgageInputs): MortgageResult {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];
  const base = baseLoanAmount(inputs);
  const downPercent = downPaymentPercent(inputs);

  // ── Financed fees ────────────────────────────────────────────────────────
  let ufmip: number | undefined;
  let vaFundingFee: number | undefined;
  let financedFees = 0;

  if (inputs.loanType === "fha") {
    ufmip = base * FHA_UFMIP_RATE;
    if (inputs.fhaUfmipFinanced) financedFees += ufmip;
  }

  if (inputs.loanType === "va") {
    vaFundingFee = inputs.vaExempt
      ? 0
      : base * vaFundingFeeRate(downPercent, inputs.vaSubsequentUse);
    if (inputs.vaFundingFeeFinanced) financedFees += vaFundingFee;
  }

  const loanAmount = base + financedFees;

  // ── Mortgage insurance ───────────────────────────────────────────────────
  let monthlyMortgageInsurance = 0;
  // null = life of loan, 0 = none, N = that many payments
  let mortgageInsuranceMonths: number | null = 0;

  if (inputs.loanType === "conventional" && downPercent < 20) {
    // Rate bands by LTV. Auto by default; a typed value wins, same rule as the
    // interest rate.
    // LTV against the valuation basis — after-repair value on a renovation
    // loan, purchase price otherwise. On a HomeStyle the finished house is what
    // secures the loan, so measuring against the as-is price would overstate
    // the band and the premium.
    const rate = inputs.pmiRateAuto
      ? suggestedPmiRate(ltvPercent(loanAmount, valuationBasis(inputs)))
      : inputs.pmiRate;
    monthlyMortgageInsurance = (loanAmount * (rate / 100)) / 12;
  } else if (inputs.loanType === "fha") {
    monthlyMortgageInsurance = (loanAmount * FHA_ANNUAL_MIP_RATE) / 12;
    mortgageInsuranceMonths =
      downPercent >= 10 ? FHA_MIP_TERMINATION_MONTHS_AT_10_PERCENT_DOWN : null;
  }

  const isInterestOnly = config.isHardMoney;
  const termMonths = isInterestOnly ? inputs.termMonths : inputs.termYears * 12;

  // ── Schedule ─────────────────────────────────────────────────────────────
  let schedule: AmortizationRow[];

  if (isInterestOnly) {
    schedule = buildInterestOnlySchedule({
      principal: loanAmount,
      annualRatePercent: inputs.interestRate,
      termMonths,
      startYear: inputs.startYear,
      startMonth: inputs.startMonth,
    });
  } else {
    // Conventional PMI needs the schedule to find its own termination month, so
    // build once without MI, locate the 78% point, then rebuild with the limit.
    if (inputs.loanType === "conventional" && monthlyMortgageInsurance > 0) {
      const dry = buildAmortizationSchedule({
        principal: loanAmount,
        annualRatePercent: inputs.interestRate,
        termMonths,
        startYear: inputs.startYear,
        startMonth: inputs.startMonth,
      });
      mortgageInsuranceMonths = pmiTerminationPeriod(dry, inputs.homeValue) ?? termMonths;
    }

    schedule = buildAmortizationSchedule({
      principal: loanAmount,
      annualRatePercent: inputs.interestRate,
      termMonths,
      startYear: inputs.startYear,
      startMonth: inputs.startMonth,
      monthlyMortgageInsurance,
      mortgageInsuranceMonths,
    });
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const principalAndInterest = isInterestOnly
    ? loanAmount * (inputs.interestRate / 100 / 12)
    : schedule.length > 0
      ? schedule[0].payment
      : 0;

  const monthlyTax = inputs.propertyTaxYearly / 12;
  const insuranceYearly = effectiveInsuranceYearly(inputs);
  const monthlyInsurance = insuranceYearly / 12;
  const monthlyHoa = inputs.hoaMonthly;

  const dpaMonthlyPayment = dpaPayment(inputs);

  const totalMonthlyWithMortgageInsurance =
    principalAndInterest +
    monthlyTax +
    monthlyInsurance +
    monthlyHoa +
    monthlyMortgageInsurance +
    dpaMonthlyPayment;

  const miRows = schedule.filter((r) => r.mortgageInsurance > 0);
  const mortgageInsurancePaymentCount = miRows.length;
  const mortgageInsuranceTotalPaid = miRows.reduce((sum, r) => sum + r.mortgageInsurance, 0);
  const miEndRow = schedule.find((r) => r.isMortgageInsuranceEnd) ?? null;

  const hasMortgageInsuranceEnd =
    monthlyMortgageInsurance > 0 && miEndRow !== null && mortgageInsurancePaymentCount < schedule.length;

  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0);

  const years = termMonths / 12;
  const totalTax = inputs.propertyTaxYearly * years;
  const totalInsurance = insuranceYearly * years;
  const totalHoa = inputs.hoaMonthly * termMonths;

  // Everything the borrower pays out over the term, escrow included — not just
  // debt service. Matches how the reference calculators total this.
  const totalOfAllPayments =
    schedule.reduce((sum, r) => sum + r.payment + r.mortgageInsurance, 0) +
    totalTax +
    totalInsurance +
    totalHoa;

  // ── Cash at closing ──────────────────────────────────────────────────────
  // One-time money. Deliberately kept out of the monthly payment and the DTI
  // ratios — closing costs don't recur, and folding them in would overstate
  // every month for the life of the loan.
  const closingCosts = (inputs.homeValue * inputs.closingCostPercent) / 100;

  // A fee that isn't financed has to be paid at the table instead.
  let feesDueAtClosing = 0;
  if (ufmip !== undefined && !inputs.fhaUfmipFinanced) feesDueAtClosing += ufmip;
  if (vaFundingFee !== undefined && !inputs.vaFundingFeeFinanced) feesDueAtClosing += vaFundingFee;
  if (config.isHardMoney) feesDueAtClosing += loanAmount * (inputs.points / 100);

  const result: MortgageResult = {
    loanAmount,
    downPaymentAmount: inputs.downPayment,
    downPaymentPercent: downPercent,
    financedFees,
    closingCosts,
    feesDueAtClosing,
    renovationContingency: renovationFinanced(inputs) - Math.max(0, inputs.renovationBudget || 0),
    renovationFinanced: renovationFinanced(inputs),
    totalAcquisitionCost: totalAcquisitionCost(inputs),
    loanToAfterRepairValue:
      isRenovationLoan(inputs) && inputs.afterRepairValue && inputs.afterRepairValue > 0
        ? (loanAmount / inputs.afterRepairValue) * 100
        : null,

    ...dpaBreakdown(inputs, inputs.downPayment + closingCosts + feesDueAtClosing, loanAmount),
    dpaMonthlyPayment,

    principalAndInterest,
    monthlyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyMortgageInsurance,
    totalMonthlyWithMortgageInsurance,
    totalMonthlyAfterMortgageInsurance: hasMortgageInsuranceEnd
      ? totalMonthlyWithMortgageInsurance - monthlyMortgageInsurance
      : null,

    mortgageInsuranceEndPeriod: hasMortgageInsuranceEnd ? miEndRow!.period : null,
    mortgageInsuranceEndDate: hasMortgageInsuranceEnd ? miEndRow!.date : null,
    mortgageInsurancePaymentCount,
    mortgageInsuranceTotalPaid,

    payoffDate:
      schedule.length > 0
        ? schedule[schedule.length - 1].date
        : paymentDate(inputs.startYear, inputs.startMonth, 0),
    totalInterest,
    totalOfAllPayments,
    // Steady-state year: the housing payment without mortgage insurance, since
    // MI is temporary on every loan type that charges it except lifetime FHA MIP.
    annualPayment: (principalAndInterest + monthlyTax + monthlyInsurance + monthlyHoa) * 12,
    totalTax,
    totalInsurance,

    schedule,
    isInterestOnly,
  };

  if (ufmip !== undefined) result.ufmip = ufmip;
  if (vaFundingFee !== undefined) result.vaFundingFee = vaFundingFee;

  if (config.isHardMoney) {
    result.pointsCost = loanAmount * (inputs.points / 100);
    result.balloonAmount = loanAmount;
    result.loanToArv = inputs.arv && inputs.arv > 0 ? (loanAmount / inputs.arv) * 100 : null;
  }

  if (config.isDscr) {
    const effectiveRent = inputs.grossMonthlyRent * (1 - inputs.vacancyPct / 100);
    const noi = (effectiveRent - inputs.operatingExpensesMonthly) * 12;
    // Debt service is principal and interest only — taxes and insurance sit in opex.
    const annualDebtService = principalAndInterest * 12;
    const ratio = annualDebtService > 0 ? noi / annualDebtService : 0;
    result.dscr = {
      noi,
      annualDebtService,
      ratio,
      passes: ratio >= inputs.dscrThreshold,
    };
  }

  return result;
}
