/**
 * Pasting "…, 250000" keeps the price. The parser always read it; the route
 * then dropped it, so a pasted house arrived with no listing price.
 */

jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  }),
}));

jest.mock("@/lib/context", () => ({
  resolveContext: async () => ({ type: "personal", id: "user-1" }),
}));

jest.mock("@/lib/property/propertyService", () => ({
  upsertProperty: jest.fn(async () => ({
    property: { id: "p1", needs_address_review: false },
    matchedOn: "created",
  })),
}));

// Batch add must never spend a RentCast request: fifteen pasted addresses
// would be fifteen of fifty a month. Stands in for the client so a call would
// be seen.
jest.mock("@/lib/rentcast/client", () => ({
  fetchPropertyRecords: jest.fn(),
  fetchValueEstimate: jest.fn(),
}));

import { POST } from "@/app/api/properties/batch/route";
import * as rentcast from "@/lib/rentcast/client";
import { upsertProperty } from "@/lib/property/propertyService";

const mockUpsert = upsertProperty as jest.Mock;

async function paste(text: string) {
  return POST(
    new Request("http://localhost/api/properties/batch", {
      method: "POST",
      body: JSON.stringify({ text }),
    })
  );
}

beforeEach(() => mockUpsert.mockClear());

describe("batch add", () => {
  it("saves the price on the line as the listing price", async () => {
    const res = await paste("128 Maple St, Duluth GA 30096, 250000");

    expect(res.status).toBe(200);
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({ list_price: 250_000 });
  });

  it("sends no listing price when the line has none", async () => {
    await paste("44 Oak Ave, Duluth, GA, 30096");

    expect(mockUpsert.mock.calls[0][0]).not.toHaveProperty("list_price");
  });
});

describe("batch add and RentCast", () => {
  it("never calls RentCast, however many addresses are pasted", async () => {
    await paste("128 Maple St, Duluth GA 30096\n44 Oak Ave, Duluth GA 30096\n58 Willow Bend Rd, Duluth GA 30096");

    expect(mockUpsert).toHaveBeenCalledTimes(3);
    for (const fn of Object.values(rentcast)) {
      if (jest.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled();
    }
  });
});
