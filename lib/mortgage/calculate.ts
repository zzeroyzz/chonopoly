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
  vaFundingFeeRate,
} from "./loanTypes";
import {
  buildAmortizationSchedule,
  buildInterestOnlySchedule,
  paymentDate,
} from "./amortization";

/** Base loan before any financed fees are rolled in. */
export function baseLoanAmount(inputs: MortgageInputs): number {
  if (inputs.loanAmountOverride !== null) return Math.max(0, inputs.loanAmountOverride);
  return Math.max(0, inputs.homeValue - inputs.downPayment);
}

export function downPaymentPercent(inputs: MortgageInputs): number {
  if (inputs.homeValue <= 0) return 0;
  return (inputs.downPayment / inputs.homeValue) * 100;
}

/**
 * Month at which conventional PMI terminates automatically — the first payment
 * where the balance reaches 78% of ORIGINAL value. Returns null when the loan
 * starts at or below that threshold, or when PMI never applies.
 */
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
    monthlyMortgageInsurance = (loanAmount * (inputs.pmiRate / 100)) / 12;
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
  const monthlyInsurance = inputs.insuranceYearly / 12;
  const monthlyHoa = inputs.hoaMonthly;

  const totalMonthlyWithMortgageInsurance =
    principalAndInterest + monthlyTax + monthlyInsurance + monthlyHoa + monthlyMortgageInsurance;

  const miRows = schedule.filter((r) => r.mortgageInsurance > 0);
  const mortgageInsurancePaymentCount = miRows.length;
  const mortgageInsuranceTotalPaid = miRows.reduce((sum, r) => sum + r.mortgageInsurance, 0);
  const miEndRow = schedule.find((r) => r.isMortgageInsuranceEnd) ?? null;

  const hasMortgageInsuranceEnd =
    monthlyMortgageInsurance > 0 && miEndRow !== null && mortgageInsurancePaymentCount < schedule.length;

  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0);

  const years = termMonths / 12;
  const totalTax = inputs.propertyTaxYearly * years;
  const totalInsurance = inputs.insuranceYearly * years;
  const totalHoa = inputs.hoaMonthly * termMonths;

  // Everything the borrower pays out over the term, escrow included — not just
  // debt service. Matches how the reference calculators total this.
  const totalOfAllPayments =
    schedule.reduce((sum, r) => sum + r.payment + r.mortgageInsurance, 0) +
    totalTax +
    totalInsurance +
    totalHoa;

  const result: MortgageResult = {
    loanAmount,
    downPaymentAmount: inputs.downPayment,
    downPaymentPercent: downPercent,
    financedFees,

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
