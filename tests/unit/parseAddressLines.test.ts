import {
  fillFromPaste,
  parseAddressLines,
  parseOneAddress,
  parsePrice,
} from "@/lib/property/parseAddressLines";

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

describe("the shapes people paste", () => {
  const SHALIMAR = { street: "2012 Shalimar Dr NE", city: "Atlanta", state: "GA", zip: "30345" };

  function only(text: string) {
    const { houses, errors } = parseAddressLines(text);
    expect(errors).toEqual([]);
    expect(houses).toHaveLength(1);
    const [h] = houses;
    return { street: h.addressLine1, city: h.city, state: h.state, zip: h.zip, price: h.price };
  }

  it.each([
    ["with commas", "2012 Shalimar Dr NE, Atlanta, GA 30345"],
    ["with no commas at all", "2012 Shalimar Dr NE Atlanta GA 30345"],
    ["with a trailing country, as Google and Zillow copy it", "2012 Shalimar Dr NE, Atlanta, GA 30345, USA"],
    ["with United States spelled out", "2012 Shalimar Dr NE, Atlanta, GA 30345, United States"],
    ["with the state spelled out", "2012 Shalimar Dr NE, Atlanta, Georgia 30345"],
    ["over two lines, as a listing header shows it", "2012 Shalimar Dr NE\nAtlanta, GA 30345"],
  ])("reads an address %s", (_shape, text) => {
    expect(only(text)).toMatchObject(SHALIMAR);
  });

  it("treats a tab as a field break, so a spreadsheet row keeps its price", () => {
    expect(only("2012 Shalimar Dr NE, Atlanta, GA 30345\t$249,900")).toMatchObject({
      ...SHALIMAR,
      price: 249_900,
    });
  });

  it("finds the city after other street types with no commas", () => {
    expect(only("3484 Primrose Pl Decatur GA 30032")).toMatchObject({
      street: "3484 Primrose Pl",
      city: "Decatur",
    });
  });

  it("does not take a spelled-out direction that starts the city", () => {
    expect(only("123 Main St North Augusta SC 29841")).toMatchObject({
      street: "123 Main St",
      city: "North Augusta",
      state: "SC",
    });
  });

  it("reads a two-word state", () => {
    expect(only("12 Oak Ln, Asheville, North Carolina 28801")).toMatchObject({ state: "NC" });
  });

  it("leaves a no-comma line whole when there is no street type to cut at", () => {
    // A guess at where the city starts with nothing to go on would make up an
    // address.
    expect(only("12 Peachtree Atlanta GA 30303")).toMatchObject({
      street: "12 Peachtree Atlanta GA 30303",
      city: null,
    });
  });

  it("keeps two complete addresses on two lines as two houses", () => {
    const { houses } = parseAddressLines(
      "2012 Shalimar Dr NE, Atlanta, GA 30345\n3484 Primrose Pl, Decatur, GA 30032"
    );
    expect(houses.map((h) => h.addressLine1)).toEqual(["2012 Shalimar Dr NE", "3484 Primrose Pl"]);
  });
});

describe("parseOneAddress", () => {
  it("splits one pasted address into its parts", () => {
    expect(parseOneAddress("2012 Shalimar Dr NE, Atlanta, GA 30345, USA")).toEqual({
      addressLine1: "2012 Shalimar Dr NE",
      city: "Atlanta",
      state: "GA",
      zip: "30345",
    });
  });

  it("leaves a bare street alone, since there is nothing to fill", () => {
    expect(parseOneAddress("128 Maple St")).toBeNull();
  });

  it("does not guess at something that is not an address", () => {
    expect(parseOneAddress("call me about the house")).toBeNull();
  });

  it("does not fill from a paste of several houses", () => {
    expect(
      parseOneAddress("2012 Shalimar Dr NE, Atlanta, GA 30345\n3484 Primrose Pl, Decatur, GA 30032")
    ).toBeNull();
  });
});

describe("fillFromPaste", () => {
  const PASTED = { addressLine1: "2012 Shalimar Dr NE", city: "Atlanta", state: "GA", zip: "30345" };
  const EMPTY = { address_line1: "", city: "", state: "GA", zip: "" };

  it("fills every field of an empty form", () => {
    expect(fillFromPaste(EMPTY, PASTED, "GA")).toEqual({
      address_line1: "2012 Shalimar Dr NE",
      city: "Atlanta",
      state: "GA",
      zip: "30345",
    });
  });

  it("keeps a city or ZIP typed before the paste", () => {
    const filled = fillFromPaste({ ...EMPTY, city: "Brookhaven", zip: "30319" }, PASTED, "GA");
    expect(filled.city).toBe("Brookhaven");
    expect(filled.zip).toBe("30319");
  });

  it("replaces the untouched default state, but not one that was typed", () => {
    const florida = { ...PASTED, state: "FL" };
    expect(fillFromPaste(EMPTY, florida, "GA").state).toBe("FL");
    expect(fillFromPaste({ ...EMPTY, state: "AL" }, florida, "GA").state).toBe("AL");
  });
});
