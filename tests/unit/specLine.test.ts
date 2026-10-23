import { specLabels, specLine } from "@/lib/screen/specLine";

describe("specLine", () => {
  it("reads beds, baths and size in that order", () => {
    expect(specLine({ beds: 3, baths: 2, sqft: 1_180 })).toEqual([
      "3 bed",
      "2 bath",
      "1,180 sq ft",
    ]);
  });

  it("keeps a half bath as a half", () => {
    expect(specLabels({ beds: null, baths: 2.5, sqft: null }).baths).toBe("2.5 bath");
  });

  it("leaves out a fact nobody entered", () => {
    expect(specLine({ beds: 4, baths: null, sqft: 2_240 })).toEqual(["4 bed", "2,240 sq ft"]);
  });

  it("is empty for a house with no facts", () => {
    expect(specLine({ beds: null, baths: null, sqft: null })).toEqual([]);
  });

  it("does not show a size of zero as a fact", () => {
    expect(specLabels({ beds: null, baths: null, sqft: 0 }).sqft).toBeNull();
  });

  it("ignores a figure that cannot be a fact", () => {
    expect(specLine({ beds: -1, baths: Number.NaN, sqft: Number.POSITIVE_INFINITY })).toEqual([]);
  });
});
