import {
  resolveInputs,
  snapshotOf,
  snapshotChanges,
  housePrefill,
  SNAPSHOT_KEYS,
} from "@/lib/mortgage/resolveInputs";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { calculateDti } from "@/lib/mortgage/dti";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { type BuyerProfile } from "@/lib/profile/types";

const NOW = new Date(2025, 0, 1);

function profile(overrides: Partial<BuyerProfile> = {}): BuyerProfile {
  return {
    id: "p-1",
    cashAvailable: 25_000,
    cashReserves: 5_000,
    defaults: {
      loanType: "fha",
      renovationProgram: "none",
      interestRate: 6.75,
      termYears: 30,
      downPaymentPct: 3.5,
      closingCostPct: 5,
      countyLoanLimit: null,
      dpaEnabled: false,
      dpaStructure: "grant",
      dpaRate: 0,
      dpaTermYears: 10,
      buyingPct: 1,
      sellingPct: 8,
      holdingMonthly: 750,
      holdingMonths: 5,
      contingencyPhotosPct: 20,
      contingencyVisitPct: 10,
    },
    incomes: [
      { id: "i-1", label: "Salary", incomeType: "w2", grossMonthly: 9_000, borrower: null },
    ],
    debts: [
      { id: "d-1", label: "Car loan", debtType: "auto", monthlyPayment: 420, includeInRatios: true },
      { id: "d-2", label: "Student loan", debtType: "student", monthlyPayment: 180, includeInRatios: true },
    ],
    ...overrides,
  };
}

describe("resolveInputs", () => {
  it("sums itemised income and debts rather than taking a typed total", () => {
    const r = resolveInputs(profile(), { homeValue: 250_000 }, NOW);
    expect(r.grossMonthlyIncome).toBe(9_000);
    expect(r.otherMonthlyDebt).toBe(600); // 420 + 180
  });

  it("does not let the house argument overwrite profile income", () => {
    // Callers pass a full MortgageInputs as the house argument, and that object
    // carries grossMonthlyIncome from the defaults. If the house spread wins,
    // every ratio reads $0 while the screen insists the profile is loaded.
    const fullDraft = { ...defaultInputs(NOW), homeValue: 250_000 };
    const r = resolveInputs(profile(), fullDraft, NOW);

    expect(r.grossMonthlyIncome).toBe(9_000);
    expect(r.otherMonthlyDebt).toBe(600);
    expect(r.homeValue).toBe(250_000);
  });

  it("leaves excluded debts out of the ratios but not out of the profile", () => {
    const p = profile();
    p.debts[1].includeInRatios = false;
    const r = resolveInputs(p, {}, NOW);

    expect(r.otherMonthlyDebt).toBe(420);
    // The row is still there — excluding it is a ratio decision, not a delete.
    expect(p.debts).toHaveLength(2);
  });

  it("produces the same MortgageInputs the form produced, given the same values", () => {
    // The parity test: resolveInputs must be a drop-in for what the user used
    // to type, or every saved scenario shifts the day this ships.
    const house = { homeValue: 250_000, downPayment: 8_750, propertyTaxYearly: 4_200 };
    const resolved = resolveInputs(profile(), house, NOW);
    const typed = {
      ...defaultInputs(NOW),
      ...house,
      loanType: "fha" as const,
      grossMonthlyIncome: 9_000,
      otherMonthlyDebt: 600,
      renovationContingencyPct: 20,
    };

    expect(calculateMortgage(resolved).totalMonthlyWithMortgageInsurance).toBeCloseTo(
      calculateMortgage(typed).totalMonthlyWithMortgageInsurance,
      6
    );
  });

  it("derives the down payment from the profile percentage", () => {
    const r = resolveInputs(profile(), { homeValue: 250_000 }, NOW);
    expect(r.downPayment).toBeCloseTo(8_750, 6); // 3.5% of 250,000
  });

  it("measures that percentage against price plus financed work", () => {
    const p = profile();
    p.defaults.renovationProgram = "fha203k";
    const r = resolveInputs(p, { homeValue: 250_000, renovationBudget: 50_000 }, NOW);

    // 50,000 + 20% contingency = 60,000 financed; 3.5% of 310,000.
    expect(r.downPayment).toBeCloseTo(310_000 * 0.035, 4);
  });

  it("lets an explicit house down payment win over the percentage", () => {
    const r = resolveInputs(profile(), { homeValue: 250_000, downPayment: 25_000 }, NOW);
    expect(r.downPayment).toBe(25_000);
  });

  it("reports zero income with no profile, so ratios read as not applicable", () => {
    // Not a fabricated salary. calculateDti treats zero income as "no verdict",
    // which the UI turns into "set your income" — an honest empty state.
    const r = resolveInputs(null, { homeValue: 250_000 }, NOW);
    expect(r.grossMonthlyIncome).toBe(0);
    expect(r.otherMonthlyDebt).toBe(0);
    expect(calculateDti(r, calculateMortgage(r)).applicable).toBe(true);
  });

  it("never reinstates the old hardcoded income", () => {
    expect(defaultInputs(NOW).grossMonthlyIncome).toBe(0);
    expect(defaultInputs(NOW).otherMonthlyDebt).toBe(0);
  });
});

describe("snapshots and the changed badge", () => {
  it("captures only profile and defaults keys", () => {
    const snap = snapshotOf(resolveInputs(profile(), { homeValue: 250_000 }, NOW));
    expect(Object.keys(snap).sort()).toEqual([...SNAPSHOT_KEYS].sort());
    // The house is not in it — a different price is a different scenario, not a
    // changed profile.
    expect(snap).not.toHaveProperty("homeValue");
  });

  it("does not fire when nothing changed", () => {
    const inputs = resolveInputs(profile(), { homeValue: 250_000 }, NOW);
    expect(snapshotChanges(snapshotOf(inputs), inputs)).toEqual([]);
  });

  it("does not fire when only the month rolls over", () => {
    // The trap this design avoids: startMonth/startYear resolve to "today", so
    // snapshotting the whole object would mark every saved scenario stale on the
    // first of the month.
    const january = resolveInputs(profile(), { homeValue: 250_000 }, new Date(2025, 0, 1));
    const february = resolveInputs(profile(), { homeValue: 250_000 }, new Date(2025, 1, 1));

    expect(february.startMonth).not.toBe(january.startMonth);
    expect(snapshotChanges(snapshotOf(january), february)).toEqual([]);
  });

  it("fires when a debt changes", () => {
    const before = resolveInputs(profile(), {}, NOW);

    const p = profile();
    p.debts.push({
      id: "d-3", label: "Credit card", debtType: "card", monthlyPayment: 95, includeInRatios: true,
    });
    const after = resolveInputs(p, {}, NOW);

    const changes = snapshotChanges(snapshotOf(before), after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: "otherMonthlyDebt", from: 600, to: 695 });
  });

  it("fires when a debt is excluded from ratios", () => {
    const before = resolveInputs(profile(), {}, NOW);
    const p = profile();
    p.debts[0].includeInRatios = false;
    const changes = snapshotChanges(snapshotOf(before), resolveInputs(p, {}, NOW));
    expect(changes.map((c) => c.field)).toEqual(["otherMonthlyDebt"]);
  });

  it("stays silent for a scenario saved before snapshots existed", () => {
    // Claiming the numbers changed when we cannot know would train the badge to
    // be ignored.
    expect(snapshotChanges(null, resolveInputs(profile(), {}, NOW))).toEqual([]);
    expect(snapshotChanges(undefined, resolveInputs(profile(), {}, NOW))).toEqual([]);
  });
});

describe("housePrefill", () => {
  // Seeds a new analysis from the house it is bound to. The calculator used to
  // open blank on a house whose price was already on file, which is how a
  // retyped address got a second chance to create a second property.

  it("takes price and reno budget from the primary analysis", () => {
    const seed = housePrefill(null, {
      homeValue: 312_500,
      renovationBudget: 45_000,
    });
    expect(seed.homeValue).toBe(312_500);
    expect(seed.renovationBudget).toBe(45_000);
  });

  it("prefers the house's own annual taxes over a scenario's older copy", () => {
    // Taxes are a fact about the building; a scenario holds a copy that may
    // predate the figure RentCast returned.
    const seed = housePrefill({ annual_taxes: 4_200 }, { propertyTaxYearly: 3_000 });
    expect(seed.propertyTaxYearly).toBe(4_200);
  });

  it("falls back to the scenario's taxes when the house has none recorded", () => {
    expect(housePrefill({ annual_taxes: null }, { propertyTaxYearly: 3_000 }))
      .toEqual({ propertyTaxYearly: 3_000 });
  });

  it("returns nothing when the house knows nothing", () => {
    // An empty seed leaves the defaults alone rather than zeroing the form.
    expect(housePrefill(null, null)).toEqual({});
    expect(housePrefill({ annual_taxes: null }, null)).toEqual({});
  });

  it("ignores non-numeric figures rather than seeding NaN", () => {
    const seed = housePrefill(null, {
      homeValue: undefined,
      renovationBudget: 45_000,
    });
    expect(seed).toEqual({ renovationBudget: 45_000 });
    expect("homeValue" in seed).toBe(false);
  });

  it("feeds resolveInputs without disturbing the profile fields", () => {
    // The seed is a house source, so it must not reach income or debts.
    const resolved = resolveInputs(profile(), housePrefill({ annual_taxes: 4_200 }, { homeValue: 312_500 }), NOW);
    expect(resolved.homeValue).toBe(312_500);
    expect(resolved.propertyTaxYearly).toBe(4_200);
    expect(resolved.grossMonthlyIncome).toBe(9_000);
  });
});
