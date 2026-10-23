import { groupByProperty, isSaveableName } from "@/lib/mortgage/groupScenarios";
import { type ScenarioSummary } from "@/lib/mortgage/scenarioService";

const MAPLE = {
  id: "prop-maple",
  addressLine1: "128 Maple St",
  city: null,
  state: "GA",
  zip: null,
  needsAddressReview: false,
};

function scenario(id: string, label: string, property: typeof MAPLE | null): ScenarioSummary {
  return {
    id,
    property,
    label,
    homeValue: 250_000,
    loanType: "fha",
    monthlyPayment: 2_221,
    version: 1,
    updatedAt: "2026-10-23T00:00:00.000Z",
  } as ScenarioSummary;
}

describe("groupByProperty", () => {
  it("puts a save made against a house under that house", () => {
    const { houses, unassigned } = groupByProperty([scenario("s1", "at asking", MAPLE)]);
    expect(houses).toHaveLength(1);
    expect(houses[0].property.addressLine1).toBe("128 Maple St");
    expect(houses[0].rows.map((r) => r.label)).toEqual(["at asking"]);
    expect(unassigned).toEqual([]);
  });

  it("gives two saves on one house one heading and two rows", () => {
    const { houses } = groupByProperty([
      scenario("s1", "at asking", MAPLE),
      scenario("s2", "at $240k", MAPLE),
    ]);
    expect(houses).toHaveLength(1);
    expect(houses[0].rows.map((r) => r.label)).toEqual(["at asking", "at $240k"]);
  });

  it("lists a save with no house under Unassigned", () => {
    const { houses, unassigned } = groupByProperty([scenario("s1", "quick math", null)]);
    expect(houses).toEqual([]);
    expect(unassigned.map((r) => r.label)).toEqual(["quick math"]);
  });
});

describe("isSaveableName", () => {
  it("needs a name before saving", () => {
    expect(isSaveableName("")).toBe(false);
    expect(isSaveableName("Maple St")).toBe(true);
  });

  it("does not count whitespace as a name", () => {
    expect(isSaveableName("   ")).toBe(false);
  });
});
