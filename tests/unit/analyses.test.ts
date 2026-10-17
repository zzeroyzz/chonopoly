import { normalizeAddress, addressHash } from "@/lib/property/address";

/**
 * The dedupe rules the save path depends on.
 *
 * `upsertProperty` itself needs a database, so these cover the layer that
 * decides *whether* two addresses are the same house — which is what makes
 * "saving twice at one address gives one property" true. The round trip through
 * the table is covered by the Playwright spec against a stubbed API.
 */

describe("address matching", () => {
  it("treats the same house written two ways as one address", () => {
    // The case that matters: an agent's listing and your own typing rarely
    // match character for character.
    const a = addressHash({ addressLine1: "128 Maple Street", city: "Duluth", state: "GA", zip: "30096" });
    const b = addressHash({ addressLine1: "128 maple st", city: "duluth", state: "ga", zip: "30096" });
    expect(a).toBe(b);
  });

  it("normalises directionals and suffixes", () => {
    expect(normalizeAddress({ addressLine1: "1653 Sylvan Road Southwest", state: "GA" }))
      .toBe(normalizeAddress({ addressLine1: "1653 Sylvan Rd SW", state: "GA" }));
  });

  it("keeps different houses apart", () => {
    const a = addressHash({ addressLine1: "128 Maple St", city: "Duluth", state: "GA", zip: "30096" });
    const b = addressHash({ addressLine1: "130 Maple St", city: "Duluth", state: "GA", zip: "30096" });
    expect(a).not.toBe(b);
  });

  it("distinguishes the same street number in different cities", () => {
    const a = addressHash({ addressLine1: "128 Maple St", city: "Duluth", state: "GA", zip: "30096" });
    const b = addressHash({ addressLine1: "128 Maple St", city: "Decatur", state: "GA", zip: "30030" });
    expect(a).not.toBe(b);
  });

  it("produces a stable hash for the same input", () => {
    const parts = { addressLine1: "44 Oak Ave", city: "Decatur", state: "GA", zip: "30030" };
    expect(addressHash(parts)).toBe(addressHash(parts));
  });
});
