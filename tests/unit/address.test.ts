import { normalizeStreet, normalizeAddress, addressHash } from "@/lib/property/address";

describe("normalizeStreet", () => {
  it("canonicalizes suffixes", () => {
    expect(normalizeStreet("123 Main Street")).toBe("123 MAIN ST");
    expect(normalizeStreet("123 Main St.")).toBe("123 MAIN ST");
    expect(normalizeStreet("45 Oak Avenue")).toBe("45 OAK AVE");
    expect(normalizeStreet("45 Oak Ave")).toBe("45 OAK AVE");
    expect(normalizeStreet("9 Elm Boulevard")).toBe("9 ELM BLVD");
  });

  it("canonicalizes directionals", () => {
    expect(normalizeStreet("123 North Main St")).toBe("123 N MAIN ST");
    expect(normalizeStreet("123 N. Main St")).toBe("123 N MAIN ST");
    expect(normalizeStreet("7 Southwest Pine Rd")).toBe("7 SW PINE RD");
  });

  it("keeps the unit but canonicalizes the designator", () => {
    expect(normalizeStreet("123 Main St Apt 4")).toBe("123 MAIN ST UNIT 4");
    expect(normalizeStreet("123 Main St #4")).toBe("123 MAIN ST UNIT 4");
    expect(normalizeStreet("123 Main St Unit 4")).toBe("123 MAIN ST UNIT 4");
    expect(normalizeStreet("123 Main St Suite 4")).toBe("123 MAIN ST UNIT 4");
  });

  it("does not collapse different units together", () => {
    expect(normalizeStreet("123 Main St Apt 2")).not.toBe(normalizeStreet("123 Main St Apt 3"));
  });

  it("collapses a designator written twice", () => {
    expect(normalizeStreet("123 Main St Apt #4")).toBe("123 MAIN ST UNIT 4");
  });

  it("handles empty and punctuation-only input", () => {
    expect(normalizeStreet("")).toBe("");
    expect(normalizeStreet("   ")).toBe("");
    expect(normalizeStreet("...")).toBe("");
  });
});

describe("normalizeAddress", () => {
  it("collapses ZIP+4 to the five digit ZIP", () => {
    const a = normalizeAddress({ addressLine1: "123 Main St", city: "Atlanta", state: "GA", zip: "30301-1234" });
    const b = normalizeAddress({ addressLine1: "123 Main St", city: "Atlanta", state: "GA", zip: "30301" });
    expect(a).toBe(b);
  });

  it("ignores missing optional parts rather than emitting blanks", () => {
    expect(normalizeAddress({ addressLine1: "123 Main St" })).toBe("123 MAIN ST");
  });

  it("treats the same address written differently as identical", () => {
    const a = normalizeAddress({ addressLine1: "123 N. Main Street, Apt #4", city: "Atlanta", state: "ga", zip: "30301" });
    const b = normalizeAddress({ addressLine1: "123 North Main St Unit 4", city: "ATLANTA", state: "GA", zip: "30301" });
    expect(a).toBe(b);
  });
});

describe("addressHash", () => {
  it("is stable for the same input", () => {
    const parts = { addressLine1: "123 Main St", city: "Atlanta", state: "GA", zip: "30301" };
    expect(addressHash(parts)).toBe(addressHash(parts));
  });

  it("matches across formatting differences", () => {
    expect(addressHash({ addressLine1: "123 N. Main Street", city: "Atlanta", state: "GA", zip: "30301-9999" }))
      .toBe(addressHash({ addressLine1: "123 North Main St", city: "atlanta", state: "ga", zip: "30301" }));
  });

  it("differs for different houses on the same street", () => {
    expect(addressHash({ addressLine1: "123 Main St" })).not.toBe(addressHash({ addressLine1: "125 Main St" }));
  });

  it("differs for different units at the same address", () => {
    expect(addressHash({ addressLine1: "123 Main St Apt 2" })).not.toBe(addressHash({ addressLine1: "123 Main St Apt 3" }));
  });

  it("returns a fixed-width hex string", () => {
    expect(addressHash({ addressLine1: "1 A St" })).toMatch(/^[0-9a-f]{16}$/);
  });
});
