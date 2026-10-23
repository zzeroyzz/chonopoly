import {
  primaryFinancingByProperty,
  storedHomeValue,
  type AnalysisRow,
} from "@/lib/screen/primaryFinancing";

function analysis(overrides: Partial<AnalysisRow>): AnalysisRow {
  return {
    property_id: "p1",
    kind: "financing",
    is_primary: false,
    label: "",
    inputs: {},
    inputs_version: 1,
    ...overrides,
  };
}

describe("primaryFinancingByProperty", () => {
  it("prefers the primary over an earlier one", () => {
    const first = analysis({ label: "first" });
    const primary = analysis({ label: "primary", is_primary: true });
    expect(primaryFinancingByProperty([first, primary]).get("p1")).toBe(primary);
  });

  it("falls back to the first when none is primary", () => {
    const first = analysis({ label: "first" });
    const second = analysis({ label: "second" });
    expect(primaryFinancingByProperty([first, second]).get("p1")).toBe(first);
  });

  it("ignores rehab numbers and unattached ones", () => {
    const picked = primaryFinancingByProperty([
      analysis({ kind: "rehab" }),
      analysis({ property_id: null }),
    ]);
    expect(picked.size).toBe(0);
  });
});

describe("storedHomeValue", () => {
  it("reads the price that was typed", () => {
    expect(storedHomeValue({ homeValue: 135_000, downPaymentPct: 3.5 })).toBe(135_000);
  });

  it("is null rather than a default when none was stored", () => {
    expect(storedHomeValue({ downPaymentPct: 3.5 })).toBeNull();
    expect(storedHomeValue(null)).toBeNull();
    expect(storedHomeValue({ homeValue: 0 })).toBeNull();
    expect(storedHomeValue({ homeValue: "135000" })).toBeNull();
  });
});
