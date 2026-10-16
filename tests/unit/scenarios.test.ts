import { readInputs, diffInputs, CURRENT_INPUTS_VERSION } from "@/lib/mortgage/scenarioService";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

function inputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return { ...defaultInputs(new Date(2025, 0, 1)), ...overrides };
}

describe("readInputs", () => {
  it("round-trips a scenario written by the current version", () => {
    const saved = inputs({ homeValue: 250_000, downPayment: 8_750, loanType: "fha" });
    const read = readInputs(saved, CURRENT_INPUTS_VERSION);

    expect(read.homeValue).toBe(250_000);
    expect(read.downPayment).toBe(8_750);
    expect(read.loanType).toBe("fha");
  });

  it("fills a field that did not exist when the scenario was saved", () => {
    // The blob outlives the type. A missing field has to come back as its
    // default, because undefined reaches the calculator and becomes NaN.
    const old = { homeValue: 250_000, downPayment: 8_750 };
    const read = readInputs(old, 1);

    expect(read.homeValue).toBe(250_000);
    expect(read.interestRate).toBe(defaultInputs().interestRate);
    expect(read.termYears).toBe(defaultInputs().termYears);
    expect(read.dpaEnabled).toBe(false);
  });

  it("migrates a pre-rename dpaAmount into dpaEnabled", () => {
    // Assistance used to be a dollar amount. Any positive figure means the
    // program was on.
    expect(readInputs({ homeValue: 250_000, dpaAmount: 8_750 }, 1).dpaEnabled).toBe(true);
    expect(readInputs({ homeValue: 250_000, dpaAmount: 0 }, 1).dpaEnabled).toBe(false);
  });

  it("does not let a stale dpaAmount override an explicit dpaEnabled", () => {
    const read = readInputs({ dpaAmount: 9_000, dpaEnabled: false }, 1);
    expect(read.dpaEnabled).toBe(false);
  });

  it("opens a scenario written by a newer deploy rather than refusing it", () => {
    // Taking what we understand beats showing the owner nothing at all.
    const read = readInputs({ homeValue: 400_000 }, CURRENT_INPUTS_VERSION + 1);
    expect(read.homeValue).toBe(400_000);
  });

  it("falls back to defaults for a blob that is not an object", () => {
    expect(readInputs(null, 1).homeValue).toBe(defaultInputs().homeValue);
    expect(readInputs("nonsense", 1).homeValue).toBe(defaultInputs().homeValue);
  });
});

describe("diffInputs", () => {
  it("reports nothing for identical inputs", () => {
    expect(diffInputs(inputs(), inputs())).toEqual([]);
  });

  it("reports only the fields that changed", () => {
    const a = inputs({ homeValue: 250_000, interestRate: 6.75 });
    const b = inputs({ homeValue: 300_000, interestRate: 6.75 });

    const changes = diffInputs(a, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: "homeValue", from: 250_000, to: 300_000 });
  });

  it("catches a boolean flipping", () => {
    const changes = diffInputs(inputs({ dpaEnabled: false }), inputs({ dpaEnabled: true }));
    expect(changes).toEqual([{ field: "dpaEnabled", from: false, to: true }]);
  });

  it("treats null and a number as different", () => {
    const changes = diffInputs(
      inputs({ afterRepairValue: null }),
      inputs({ afterRepairValue: 300_000 })
    );
    expect(changes).toEqual([{ field: "afterRepairValue", from: null, to: 300_000 }]);
  });

  it("returns changes in a stable order", () => {
    const a = inputs({ homeValue: 1, interestRate: 1, termYears: 10 });
    const b = inputs({ homeValue: 2, interestRate: 2, termYears: 20 });
    expect(diffInputs(a, b).map((c) => c.field)).toEqual([
      "homeValue",
      "interestRate",
      "termYears",
    ]);
  });
});
