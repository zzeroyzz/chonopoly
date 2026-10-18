import { parseAddressLines, parsePrice } from "@/lib/property/parseAddressLines";

/**
 * Batch add's parser. The realistic input is a paste from an email, not
 * something typed into a form, so it has to be forgiving — but it must never
 * guess an address, because a wrong house is worse than a rejected line.
 */

describe("parsePrice", () => {
  it("takes the forms a person actually types", () => {
    expect(parsePrice("250000")).toBe(250_000);
    expect(parsePrice("$250,000")).toBe(250_000);
    expect(parsePrice(" 250000 ")).toBe(250_000);
    expect(parsePrice("185k")).toBe(185_000);
    expect(parsePrice("185K")).toBe(185_000);
    expect(parsePrice("1.5k")).toBe(1_500);
  });

  it("returns null rather than guessing", () => {
    // An unparseable number must not silently become a price the verdicts
    // then judge a house against.
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("cheap")).toBeNull();
    expect(parsePrice("250-300k")).toBeNull();
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("-5000")).toBeNull();
  });
});

describe("parseAddressLines", () => {
  it("parses the documented full form", () => {
    const { houses } = parseAddressLines(
      "128 Maple St, Duluth GA 30096, 250000, https://zillow.com/x"
    );

    expect(houses).toHaveLength(1);
    expect(houses[0]).toMatchObject({
      addressLine1: "128 Maple St",
      city: "Duluth",
      state: "GA",
      zip: "30096",
      price: 250_000,
      listingUrl: "https://zillow.com/x",
    });
  });

  it("tells a trailing ZIP from a trailing price", () => {
    // The hard case: a bare 5-digit number is both. "44 Oak Ave, Duluth, GA,
    // 30096" ends in a ZIP; the same line plus a price ends in a price.
    const zipLast = parseAddressLines("44 Oak Ave, Duluth, GA, 30096").houses[0];
    expect(zipLast.zip).toBe("30096");
    expect(zipLast.price).toBeNull();

    const priceLast = parseAddressLines("44 Oak Ave, Duluth GA 30096, 250000").houses[0];
    expect(priceLast.zip).toBe("30096");
    expect(priceLast.price).toBe(250_000);
  });

  it("keeps a thousands comma inside the number", () => {
    // Splitting "$312,500" on commas makes "$312" and "500", and the "500"
    // then looks like a believable price.
    const house = parseAddressLines("77 Brook Ln, Duluth GA 30096, $312,500").houses[0];

    expect(house.price).toBe(312_500);
    expect(house.city).toBe("Duluth");
    expect(house.zip).toBe("30096");
  });

  it("does not mistake a street number's comma for a field separator", () => {
    const house = parseAddressLines("1,234 Long Rd, Duluth GA 30096").houses[0];

    expect(house.addressLine1).toBe("1234 Long Rd");
    expect(house.city).toBe("Duluth");
  });

  it("accepts a bare street line", () => {
    const house = parseAddressLines("9 Plain St").houses[0];

    expect(house.addressLine1).toBe("9 Plain St");
    expect(house.city).toBeNull();
    // Left null rather than inferred — the property default takes over, and
    // RentCast is given only what we actually know.
    expect(house.state).toBeNull();
    expect(house.zip).toBeNull();
  });

  it("takes the price and the link in either order", () => {
    const a = parseAddressLines("1 A St, Duluth GA 30096, 250000, https://x.com/1").houses[0];
    const b = parseAddressLines("1 A St, Duluth GA 30096, https://x.com/1, 250000").houses[0];

    expect(a.price).toBe(250_000);
    expect(a.listingUrl).toBe("https://x.com/1");
    expect(b.price).toBe(250_000);
    expect(b.listingUrl).toBe("https://x.com/1");
  });

  it("rejects a line that is not an address, naming the line number", () => {
    const { houses, errors } = parseAddressLines("128 Maple St\nnot an address\n44 Oak Ave");

    expect(houses).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].lineNumber).toBe(2);
    expect(errors[0].raw).toBe("not an address");
    expect(errors[0].message).toMatch(/street number/);
  });

  it("keeps going after a bad line", () => {
    // One bad line in a paste of twenty must not lose the other nineteen.
    const { houses, errors } = parseAddressLines(
      ["1 A St", "junk", "2 B St", "more junk", "3 C St"].join("\n")
    );

    expect(houses.map((h) => h.addressLine1)).toEqual(["1 A St", "2 B St", "3 C St"]);
    expect(errors.map((e) => e.lineNumber)).toEqual([2, 4]);
  });

  it("flags a repeat within the same paste", () => {
    // Pasting the same house twice would spend two RentCast requests on one
    // address.
    const { houses, duplicates } = parseAddressLines(
      "128 Maple St, Duluth GA 30096\n128 maple st, duluth ga 30096"
    );

    expect(houses).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].lineNumber).toBe(2);
  });

  it("ignores blank lines and stray whitespace", () => {
    const { houses, errors } = parseAddressLines("\n  128 Maple St  \n\n   \n44 Oak Ave\n");

    expect(houses).toHaveLength(2);
    expect(errors).toHaveLength(0);
    expect(houses[0].addressLine1).toBe("128 Maple St");
  });

  it("numbers lines as the user sees them, blanks included", () => {
    const { errors } = parseAddressLines("1 A St\n\njunk");

    // Line 3 in the textarea, not line 2 of the non-empty lines.
    expect(errors[0].lineNumber).toBe(3);
  });

  it("handles an empty paste", () => {
    expect(parseAddressLines("")).toEqual({ houses: [], errors: [], duplicates: [] });
  });

  it("uppercases the state but leaves the city as typed", () => {
    const house = parseAddressLines("1 A St, duluth ga 30096").houses[0];

    expect(house.state).toBe("GA");
    expect(house.city).toBe("duluth");
  });
});
