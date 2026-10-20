import {
  mapPropertyRecord,
  mapPropertyRecords,
  latestSale,
} from "@/lib/comps/fromPropertyRecords";
import { type RentCastPropertyRecord } from "@/lib/rentcast/types";

/**
 * The GET /properties boundary.
 *
 * Every shape here is taken from the one live response stored for 1653 Sylvan
 * Rd SW on 2026-10-20. That call used saleDateRange=180; the app now sends
 * 365, which changes how many records come back but nothing about their
 * shape, so these fixtures stay valid.
 */

function record(overrides: Partial<RentCastPropertyRecord> = {}): RentCastPropertyRecord {
  return {
    id: "952-Estes-Dr-SW,-Atlanta,-GA-30310",
    formattedAddress: "952 Estes Dr SW, Atlanta, GA 30310",
    city: "Atlanta",
    state: "GA",
    zipCode: "30310",
    county: "Fulton",
    latitude: 33.7,
    longitude: -84.42,
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    squareFootage: 1_164,
    lotSize: 8_000,
    yearBuilt: 1940,
    lastSaleDate: "2026-05-15T00:00:00.000Z",
    lastSalePrice: 298_342,
    owner: { type: "Individual", names: ["Kimberly D Williams"] },
    history: {
      "2008-09-16": { date: "2008-09-16T00:00:00.000Z", event: "Sale", price: 32_500 },
      "2026-05-15": { date: "2026-05-15T00:00:00.000Z", event: "Sale", price: 298_342 },
    },
    ...overrides,
  };
}

describe("mapPropertyRecord", () => {
  it("turns a county record into a confirmed sale", () => {
    const mapped = mapPropertyRecord(record());

    expect(mapped).not.toBeNull();
    expect(mapped!.status).toBe("sold");
    expect(mapped!.price).toBe(298_342);
    expect(mapped!.formatted_address).toBe("952 Estes Dr SW, Atlanta, GA 30310");
    expect(mapped!.sqft).toBe(1_164);
    expect(mapped!.county).toBe("Fulton");
  });

  it("stores the sale date as a plain date, not a timestamp", () => {
    // The column is a date. "2026-05-15T00:00:00.000Z" in a date column is a
    // conversion waiting to shift by a day in the wrong timezone.
    expect(mapPropertyRecord(record())!.removed_date).toBe("2026-05-15");
  });

  it("carries the buyer through for the fixer-upper flag", () => {
    const mapped = mapPropertyRecord(
      record({ owner: { type: "Organization", names: ["ELMWOOD HOMES LLC"] } })
    );

    expect(mapped!.buyer_type).toBe("Organization");
    expect(mapped!.buyer_name).toBe("ELMWOOD HOMES LLC");
  });

  it("survives a record with no owner at all", () => {
    const mapped = mapPropertyRecord(record({ owner: undefined }));

    expect(mapped).not.toBeNull();
    expect(mapped!.buyer_type).toBeNull();
    expect(mapped!.buyer_name).toBeNull();
  });

  it("drops a record with no sale price", () => {
    // It cannot move an ARV, and a zero posing as a sale price would drag a
    // median toward nothing while looking like evidence.
    expect(mapPropertyRecord(record({ lastSalePrice: undefined, history: {} }))).toBeNull();
  });

  it("drops a nominal transfer recorded at zero", () => {
    expect(mapPropertyRecord(record({ lastSalePrice: 0, history: {} }))).toBeNull();
  });

  it("drops a record with no usable address", () => {
    expect(
      mapPropertyRecord(record({ formattedAddress: undefined, addressLine1: undefined }))
    ).toBeNull();
  });

  it("falls back to the newest sale in history when lastSalePrice is missing", () => {
    const mapped = mapPropertyRecord(record({ lastSalePrice: undefined, lastSaleDate: undefined }));

    expect(mapped!.price).toBe(298_342);
    expect(mapped!.removed_date).toBe("2026-05-15");
  });
});

describe("latestSale", () => {
  it("reads history as an object keyed by date, not an array", () => {
    // The shape that would silently break a mapper written from memory:
    // history[0] is undefined, and Object.values is the only way in.
    const newest = latestSale(record().history);

    expect(newest?.price).toBe(298_342);
    expect(newest?.date).toBe("2026-05-15T00:00:00.000Z");
  });

  it("returns null for no history", () => {
    expect(latestSale(undefined)).toBeNull();
    expect(latestSale({})).toBeNull();
  });

  it("ignores events that are not sales", () => {
    const history = {
      "2026-01-01": { date: "2026-01-01T00:00:00.000Z", event: "Listing", price: 999_999 },
      "2025-01-01": { date: "2025-01-01T00:00:00.000Z", event: "Sale", price: 200_000 },
    };

    expect(latestSale(history)?.price).toBe(200_000);
  });
});

// The fixer-upper test moved to arv.ts, which is the only place that knows
// the median of the counted comps. Its tests moved to arv.test.ts with it.

describe("mapPropertyRecords", () => {
  it("handles an undefined array", () => {
    expect(mapPropertyRecords(undefined)).toEqual([]);
  });

  it("keeps the usable records and drops the rest", () => {
    const mapped = mapPropertyRecords([
      record({ id: "a" }),
      record({ id: "b", lastSalePrice: undefined, history: {} }),
      record({ id: "c" }),
    ]);

    expect(mapped.map((m) => m.external_id)).toEqual(["a", "c"]);
  });
});
