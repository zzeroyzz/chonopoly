import { calculateMortgage } from "@/lib/mortgage/calculate";
import { calculateDti } from "@/lib/mortgage/dti";
import {
  monthlyPayment,
  buildAmortizationSchedule,
  buildInterestOnlySchedule,
  paymentDate,
  toAnnualRows,
} from "@/lib/mortgage/amortization";
import { vaFundingFeeRate, FHA_UFMIP_RATE } from "@/lib/mortgage/loanTypes";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

function inputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return { ...defaultInputs(new Date(2025, 0, 1)), ...overrides };
}

describe("monthlyPayment", () => {
  it("matches the standard amortization formula", () => {
    // $300,000 at 6% for 30 years is a well-known ~$1,798.65
    expect(monthlyPayment(300000, 6, 360)).toBeCloseTo(1798.65, 1);
  });

  it("divides principal evenly at a 0% rate", () => {
    expect(monthlyPayment(120000, 0, 120)).toBeCloseTo(1000, 6);
  });

  it("returns zero for a zero principal or term", () => {
    expect(monthlyPayment(0, 6, 360)).toBe(0);
    expect(monthlyPayment(100000, 6, 0)).toBe(0);
  });
});

describe("amortization schedule", () => {
  const schedule = buildAmortizationSchedule({
    principal: 300000,
    annualRatePercent: 6,
    termMonths: 360,
    startYear: 2025,
    startMonth: 0,
  });

  it("runs for the full term", () => {
    expect(schedule).toHaveLength(360);
  });

  it("pays the balance to exactly zero", () => {
    expect(schedule[schedule.length - 1].balance).toBe(0);
  });

  it("reconciles: principal paid equals the loan amount", () => {
    const totalPrincipal = schedule.reduce((s, r) => s + r.principal, 0);
    expect(totalPrincipal).toBeCloseTo(300000, 2);
  });

  it("starts the first payment one month after the start month", () => {
    expect(schedule[0].date).toBe("2025-02-01");
  });

  it("rolls the year over correctly", () => {
    expect(paymentDate(2025, 11, 1)).toBe("2026-01-01");
  });
});

describe("interest-only schedule (hard money)", () => {
  const schedule = buildInterestOnlySchedule({
    principal: 200000,
    annualRatePercent: 12,
    termMonths: 12,
    startYear: 2025,
    startMonth: 0,
  });

  it("holds the balance flat until the balloon", () => {
    expect(schedule[0].balance).toBe(200000);
    expect(schedule[10].balance).toBe(200000);
  });

  it("pays interest only, with no principal until the end", () => {
    expect(schedule[0].principal).toBe(0);
    expect(schedule[0].interest).toBeCloseTo(2000, 6);
  });

  it("returns the full principal as a balloon in the final period", () => {
    const last = schedule[schedule.length - 1];
    expect(last.isBalloon).toBe(true);
    expect(last.principal).toBe(200000);
    expect(last.balance).toBe(0);
  });
});

describe("conventional PMI", () => {
  it("applies PMI under 20% down and terminates it at 78% LTV of original value", () => {
    const result = calculateMortgage(
      inputs({ homeValue: 300000, downPayment: 15000, interestRate: 6, pmiRate: 0.6, pmiRateAuto: false })
    );

    expect(result.monthlyMortgageInsurance).toBeGreaterThan(0);
    expect(result.mortgageInsuranceEndPeriod).not.toBeNull();

    // The terminating payment is the first where the balance is at or below 78%.
    const endPeriod = result.mortgageInsuranceEndPeriod!;
    const endRow = result.schedule[endPeriod - 1];
    expect(endRow.balance).toBeLessThanOrEqual(300000 * 0.78);
    expect(result.schedule[endPeriod - 2].balance).toBeGreaterThan(300000 * 0.78);
  });

  it("charges no PMI at 20% down or more", () => {
    const result = calculateMortgage(inputs({ homeValue: 300000, downPayment: 60000 }));
    expect(result.monthlyMortgageInsurance).toBe(0);
    expect(result.totalMonthlyAfterMortgageInsurance).toBeNull();
  });

  it("reports a lower payment after PMI drops off", () => {
    const result = calculateMortgage(inputs({ homeValue: 300000, downPayment: 15000, pmiRateAuto: false }));
    expect(result.totalMonthlyAfterMortgageInsurance).toBeCloseTo(
      result.totalMonthlyWithMortgageInsurance - result.monthlyMortgageInsurance,
      6
    );
  });
});

describe("FHA", () => {
  it("charges UFMIP at 1.75% and finances it into the loan by default", () => {
    const result = calculateMortgage(
      inputs({ loanType: "fha", homeValue: 300000, downPayment: 10500 })
    );
    const base = 300000 - 10500;
    expect(result.ufmip).toBeCloseTo(base * FHA_UFMIP_RATE, 6);
    expect(result.loanAmount).toBeCloseTo(base + base * FHA_UFMIP_RATE, 6);
  });

  it("leaves UFMIP out of the loan when paid at closing", () => {
    const base = 300000 - 10500;
    const result = calculateMortgage(
      inputs({ loanType: "fha", homeValue: 300000, downPayment: 10500, fhaUfmipFinanced: false })
    );
    expect(result.loanAmount).toBeCloseTo(base, 6);
    expect(result.ufmip).toBeCloseTo(base * FHA_UFMIP_RATE, 6);
  });

  it("keeps MIP for the life of the loan under 10% down", () => {
    const result = calculateMortgage(
      inputs({ loanType: "fha", homeValue: 300000, downPayment: 10500, termYears: 30 })
    );
    expect(result.mortgageInsurancePaymentCount).toBe(360);
    expect(result.totalMonthlyAfterMortgageInsurance).toBeNull();
  });

  it("terminates MIP after 11 years at 10% down or more", () => {
    const result = calculateMortgage(
      inputs({ loanType: "fha", homeValue: 300000, downPayment: 30000, termYears: 30 })
    );
    expect(result.mortgageInsurancePaymentCount).toBe(132);
    expect(result.mortgageInsuranceEndPeriod).toBe(132);
  });
});

describe("VA", () => {
  it("charges no monthly mortgage insurance", () => {
    const result = calculateMortgage(inputs({ loanType: "va", homeValue: 300000, downPayment: 0 }));
    expect(result.monthlyMortgageInsurance).toBe(0);
  });

  it("applies 2.15% first use at zero down", () => {
    const result = calculateMortgage(inputs({ loanType: "va", homeValue: 300000, downPayment: 0 }));
    expect(result.vaFundingFee).toBeCloseTo(300000 * 0.0215, 6);
  });

  it("reduces the fee at higher down payments and raises it on subsequent use", () => {
    expect(vaFundingFeeRate(0, false)).toBeCloseTo(0.0215, 6);
    expect(vaFundingFeeRate(5, false)).toBeCloseTo(0.015, 6);
    expect(vaFundingFeeRate(10, false)).toBeCloseTo(0.0125, 6);
    expect(vaFundingFeeRate(0, true)).toBeCloseTo(0.033, 6);
  });

  it("zeroes the fee when the borrower is exempt", () => {
    const result = calculateMortgage(
      inputs({ loanType: "va", homeValue: 300000, downPayment: 0, vaExempt: true })
    );
    expect(result.vaFundingFee).toBe(0);
    expect(result.loanAmount).toBeCloseTo(300000, 6);
  });
});

describe("hard money", () => {
  const result = calculateMortgage(
    inputs({
      loanType: "hardMoney",
      homeValue: 200000,
      downPayment: 40000,
      interestRate: 12,
      termMonths: 12,
      points: 2,
      arv: 320000,
    })
  );

  it("is interest-only with a balloon equal to the full principal", () => {
    expect(result.isInterestOnly).toBe(true);
    expect(result.balloonAmount).toBeCloseTo(160000, 6);
  });

  it("charges points as a percent of the loan", () => {
    expect(result.pointsCost).toBeCloseTo(3200, 6);
  });

  it("sizes the term in months, not years", () => {
    expect(result.schedule).toHaveLength(12);
  });

  it("reports loan-to-ARV when an ARV is supplied", () => {
    expect(result.loanToArv).toBeCloseTo(50, 6);
  });

  it("charges no mortgage insurance", () => {
    expect(result.monthlyMortgageInsurance).toBe(0);
  });
});

describe("DSCR", () => {
  it("computes NOI over annual debt service and passes above the threshold", () => {
    const result = calculateMortgage(
      inputs({
        loanType: "dscr",
        homeValue: 300000,
        downPayment: 75000,
        interestRate: 7,
        grossMonthlyRent: 3000,
        vacancyPct: 5,
        operatingExpensesMonthly: 500,
        dscrThreshold: 1.25,
      })
    );

    const effectiveRent = 3000 * 0.95;
    const expectedNoi = (effectiveRent - 500) * 12;
    expect(result.dscr!.noi).toBeCloseTo(expectedNoi, 6);
    expect(result.dscr!.annualDebtService).toBeCloseTo(result.principalAndInterest * 12, 6);
    expect(result.dscr!.ratio).toBeCloseTo(expectedNoi / (result.principalAndInterest * 12), 6);
  });

  it("fails below the threshold", () => {
    const result = calculateMortgage(
      inputs({
        loanType: "dscr",
        homeValue: 300000,
        downPayment: 60000,
        interestRate: 9,
        grossMonthlyRent: 1200,
        operatingExpensesMonthly: 400,
        dscrThreshold: 1.25,
      })
    );
    expect(result.dscr!.passes).toBe(false);
  });
});

describe("DTI ratios", () => {
  it("computes front and back end against gross monthly income", () => {
    const i = inputs({ grossMonthlyIncome: 10000, otherMonthlyDebt: 500 });
    const result = calculateMortgage(i);
    const dti = calculateDti(i, result);

    expect(dti.frontEnd).toBeCloseTo((result.totalMonthlyWithMortgageInsurance / 10000) * 100, 6);
    expect(dti.backEnd).toBeCloseTo(
      ((result.totalMonthlyWithMortgageInsurance + 500) / 10000) * 100,
      6
    );
  });

  it("does not apply to hard money or DSCR", () => {
    for (const loanType of ["hardMoney", "dscr"] as const) {
      const i = inputs({ loanType });
      expect(calculateDti(i, calculateMortgage(i)).applicable).toBe(false);
    }
  });

  it("uses the FHA 31/43 guideline", () => {
    const i = inputs({ loanType: "fha" });
    const dti = calculateDti(i, calculateMortgage(i));
    expect(dti.frontGuideline).toBe(31);
    expect(dti.backGuideline).toBe(43);
  });
});

/**
 * Independent reference case, checked against an outside calculator rather than
 * against our own reasoning. $475,000 at 5% down, 10% for 30 years, starting
 * September 2026.
 */
describe("reference case — conventional, 5% down, 10%, 30yr", () => {
  const i = inputs({
    homeValue: 475000,
    downPayment: 475000 * 0.05,
    interestRate: 10,
    termYears: 30,
    startMonth: 8, // September
    startYear: 2026,
    propertyTaxYearly: 3000,
    // The external reference was run at a flat 0.5%, so pin the manual rate
    // rather than the LTV-derived estimate — otherwise this stops comparing
    // like with like.
    pmiRate: 0.5,
    pmiRateAuto: false,
    insuranceYearly: 1500,
    hoaMonthly: 0,
  });
  const result = calculateMortgage(i);

  it("derives the loan amount", () => {
    expect(result.loanAmount).toBeCloseTo(451250, 2);
  });

  it("matches the payment with PMI", () => {
    expect(result.totalMonthlyWithMortgageInsurance).toBeCloseTo(4523.06, 1);
  });

  it("matches the payment after PMI ends", () => {
    expect(result.totalMonthlyAfterMortgageInsurance!).toBeCloseTo(4335.04, 1);
  });

  it("matches monthly PMI", () => {
    expect(result.monthlyMortgageInsurance).toBeCloseTo(188.02, 2);
  });

  /**
   * The outside reference drops PMI at payment 166, which is the 80% LTV point —
   * borrower-requested cancellation. The spec calls for the 78% automatic
   * termination instead, which lands at 178. Balance at 178 is the first at or
   * below $370,500 (475,000 x 0.78); at 166 it is still ~$380,200, or 80.05%.
   * The divergence is deliberate.
   */
  it("drops PMI at the 78% automatic termination point, not the 80% request point", () => {
    expect(result.mortgageInsuranceEndPeriod).toBe(178);
    expect(result.schedule[177].balance).toBeLessThanOrEqual(475000 * 0.78);
    expect(result.schedule[176].balance).toBeGreaterThan(475000 * 0.78);
  });

  it("matches total PMI paid for its own termination month", () => {
    expect(result.mortgageInsuranceTotalPaid).toBeCloseTo(178 * 188.02, 0);
  });

  it("matches total interest", () => {
    expect(result.totalInterest).toBeCloseTo(974365.02, 0);
  });

  it("matches the total of all payments, escrow included", () => {
    // Reference figure assumes PMI ends at 166; ours runs to 178, so back the
    // 12 extra premiums out before comparing.
    expect(result.totalOfAllPayments - 12 * 188.02).toBeCloseTo(1591826.47, 0);
  });

  it("matches the annual payment", () => {
    expect(result.annualPayment).toBeCloseTo(52020.5, 1);
  });

  it("matches monthly tax and insurance", () => {
    expect(result.monthlyTax).toBeCloseTo(250, 2);
    expect(result.monthlyInsurance).toBeCloseTo(125, 2);
  });

  it("pays off 360 payments after the first, in September 2056", () => {
    // First payment is October 2026 — one month after the start month, the
    // convention the spec calls for. The 360th therefore lands Sep 2056.
    expect(result.schedule[0].date).toBe("2026-10-01");
    expect(result.schedule).toHaveLength(360);
    expect(result.payoffDate).toBe("2056-09-01");
  });
});

describe("totals", () => {
  it("reconciles total interest against the schedule", () => {
    const result = calculateMortgage(inputs());
    const scheduleInterest = result.schedule.reduce((s, r) => s + r.interest, 0);
    expect(result.totalInterest).toBeCloseTo(scheduleInterest, 4);
  });

  it("groups the schedule into annual rows covering every month", () => {
    const result = calculateMortgage(inputs({ termYears: 15 }));
    const annual = toAnnualRows(result.schedule);
    const monthCount = annual.reduce((s, y) => s + y.months.length, 0);
    expect(monthCount).toBe(result.schedule.length);
  });
});
