import { oneLineAddress, parseGeocodeReply } from "@/lib/census/geocode";

function reply(matches: unknown[]) {
  return { result: { input: {}, addressMatches: matches } };
}

describe("oneLineAddress", () => {
  it("joins the parts the geocoder matches on", () => {
    expect(
      oneLineAddress({ addressLine1: "674 White Bird Way", city: "Fairburn", state: "GA", zip: "30213" })
    ).toBe("674 White Bird Way, Fairburn, GA 30213");
  });

  it("leaves out the parts it does not have", () => {
    expect(oneLineAddress({ addressLine1: "674 White Bird Way", city: null, state: "GA", zip: null })).toBe(
      "674 White Bird Way, GA"
    );
  });

  it("is empty with no address at all", () => {
    expect(oneLineAddress({ addressLine1: "  ", city: null, state: null, zip: null })).toBe("");
  });
});

describe("parseGeocodeReply", () => {
  it("reads x as longitude and y as latitude", () => {
    expect(parseGeocodeReply(reply([{ coordinates: { x: -84.58, y: 33.56 } }]))).toEqual({
      latitude: 33.56,
      longitude: -84.58,
    });
  });

  it("takes the first match when there are several", () => {
    const point = parseGeocodeReply(
      reply([{ coordinates: { x: -84.1, y: 33.1 } }, { coordinates: { x: -85, y: 34 } }])
    );
    expect(point).toEqual({ latitude: 33.1, longitude: -84.1 });
  });

  it("is null when nothing matched", () => {
    expect(parseGeocodeReply(reply([]))).toBeNull();
  });

  it("is null for a reply of the wrong shape", () => {
    expect(parseGeocodeReply(null)).toBeNull();
    expect(parseGeocodeReply({ errors: ["Address cannot be empty"] })).toBeNull();
    expect(parseGeocodeReply(reply([{ coordinates: { x: "-84", y: "33" } }]))).toBeNull();
  });

  it("is null for a point that is not on Earth", () => {
    expect(parseGeocodeReply(reply([{ coordinates: { x: -84, y: 133 } }]))).toBeNull();
  });
});
