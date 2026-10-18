import { normalizeAddress, addressHash } from "@/lib/property/address";

/**
 * The dedupe hole that produced two property rows for one house.
 *
 * Saving from the calculator asked for the address again, and the city field
 * got "Atlanta, GA" once and "Atlanta" the next time. Those hash differently,
 * so upsertProperty could not match them and made a second house.
 *
 * The binding fix removes the retyping entirely for a house already on file.
 * These tests pin down the hashing behaviour that made the duplicate possible,
 * so the shape of the bug is on record.
 */

const SW = { addressLine1: "1653 Sylvan Rd SW", city: "Atlanta", state: "GA", zip: "30310" };
const CITY_WITH_STATE = {
  addressLine1: "1653 Sylvan Rd SW",
  city: "Atlanta, GA",
  state: "GA",
  zip: "30310",
};

describe("the duplicate that reached production", () => {
  it("shows why two saves of one house made two rows", () => {
    // This is the recorded state of the two rows: same street, same ZIP, same
    // state, and a city field that swallowed ", GA" on the first save.
    expect(normalizeAddress(SW)).toBe("1653 SYLVAN RD SW ATLANTA GA 30310");
    expect(normalizeAddress(CITY_WITH_STATE)).toBe("1653 SYLVAN RD SW ATLANTA GA GA 30310");

    // Different strings, so different hashes, so no match.
    expect(addressHash(SW)).not.toBe(addressHash(CITY_WITH_STATE));
  });

  it("still dedupes the same house entered the same way", () => {
    // The dedupe itself works; it was the input that varied.
    expect(addressHash(SW)).toBe(
      addressHash({ addressLine1: "1653 sylvan rd sw", city: "ATLANTA", state: "ga", zip: "30310-1234" })
    );
  });
});
