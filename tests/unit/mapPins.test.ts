import { mapPins, pinLabel, NO_PRICE_PIN_LABEL } from "@/lib/screen/mapPins";

describe("pinLabel", () => {
  it("rounds to thousands under a million", () => {
    expect(pinLabel(135_000)).toBe("$135k");
    expect(pinLabel(149_900)).toBe("$150k");
  });

  it("uses millions from a million up", () => {
    expect(pinLabel(1_000_000)).toBe("$1M");
    expect(pinLabel(1_240_000)).toBe("$1.2M");
  });

  it("says so when there is no asking price, rather than $0", () => {
    expect(pinLabel(null)).toBe(NO_PRICE_PIN_LABEL);
    expect(pinLabel(0)).toBe(NO_PRICE_PIN_LABEL);
  });
});

describe("mapPins", () => {
  it("pins the houses it can place and counts the rest", () => {
    const { pins, unplaced } = mapPins([
      { propertyId: "a", listPrice: 135_000, latitude: 33.56, longitude: -84.58 },
      { propertyId: "b", listPrice: 100_000, latitude: null, longitude: null },
      { propertyId: "c", listPrice: null, latitude: 33.7, longitude: -84.4 },
    ]);

    expect(pins).toEqual([
      { propertyId: "a", latitude: 33.56, longitude: -84.58, label: "$135k" },
      { propertyId: "c", latitude: 33.7, longitude: -84.4, label: NO_PRICE_PIN_LABEL },
    ]);
    expect(unplaced).toBe(1);
  });

  it("is empty for no houses", () => {
    expect(mapPins([])).toEqual({ pins: [], unplaced: 0 });
  });
});
