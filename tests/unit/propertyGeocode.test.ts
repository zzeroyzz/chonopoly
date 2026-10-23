/**
 * A house is placed on the map as it is saved, and a lookup that fails never
 * stops the save. The geocoder and the database are both stand-ins here: this
 * checks what propertyService asks for and what it writes, not the network.
 */

jest.mock("@/lib/census/geocode", () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { geocodeAddress } from "@/lib/census/geocode";
import { updatePropertyFacts, upsertProperty } from "@/lib/property/propertyService";
import { fakeClient, type Answer } from "./fakeDatabase";

const mockCreateClient = createClient as jest.Mock;
const mockGeocode = geocodeAddress as jest.Mock;

const CTX = { type: "personal" as const, id: "user-1" };

function fakeDatabase(answers: Answer[]) {
  const { client, writes } = fakeClient(answers);
  mockCreateClient.mockReturnValue(client);
  return writes;
}

const EXISTING = {
  id: "p1",
  address_line1: "674 White Bird Way",
  city: "Fairburn",
  state: "GA",
  zip: "30213",
  latitude: 33.57,
  longitude: -84.58,
};

beforeEach(() => {
  mockGeocode.mockReset();
  mockCreateClient.mockReset();
});

describe("a new house", () => {
  it("is saved with the point the geocoder found", async () => {
    mockGeocode.mockResolvedValue({ latitude: 33.7, longitude: -84.4 });
    const writes = fakeDatabase([
      { data: null, error: null }, // no house at this address yet
      { data: { id: "new" }, error: null }, // the insert
    ]);

    await upsertProperty({ address_line1: "1 New St", city: "Atlanta", zip: "30310" }, CTX, "user-1");

    expect(writes.insert[0]).toMatchObject({ latitude: 33.7, longitude: -84.4 });
  });

  it("still saves, unplaced, when the geocoder finds nothing", async () => {
    mockGeocode.mockResolvedValue(null);
    const writes = fakeDatabase([
      { data: null, error: null },
      { data: { id: "new" }, error: null },
    ]);

    await upsertProperty({ address_line1: "1 New St" }, CTX, "user-1");

    expect(writes.insert).toHaveLength(1);
    expect(writes.insert[0]).toMatchObject({ latitude: null, longitude: null });
  });

  it("does not look up a point the caller already knows", async () => {
    const writes = fakeDatabase([
      { data: null, error: null },
      { data: { id: "new" }, error: null },
    ]);

    await upsertProperty(
      { address_line1: "1 New St", latitude: 33.1, longitude: -84.1 },
      CTX,
      "user-1"
    );

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(writes.insert[0]).toMatchObject({ latitude: 33.1, longitude: -84.1 });
  });
});

describe("editing a house", () => {
  it("moves the pin when the address changes", async () => {
    mockGeocode.mockResolvedValue({ latitude: 33.74, longitude: -84.25 });
    const writes = fakeDatabase([
      { data: EXISTING, error: null },
      { data: { ...EXISTING }, error: null },
    ]);

    await updatePropertyFacts("p1", { addressLine1: "3484 Primrose Pl", city: "Decatur" }, CTX);

    expect(mockGeocode).toHaveBeenCalledWith(
      expect.objectContaining({ addressLine1: "3484 Primrose Pl", city: "Decatur", zip: "30213" })
    );
    expect(writes.update[0]).toMatchObject({ latitude: 33.74, longitude: -84.25 });
  });

  it("clears the old pin rather than keep it when the new address cannot be placed", async () => {
    mockGeocode.mockResolvedValue(null);
    const writes = fakeDatabase([
      { data: EXISTING, error: null },
      { data: { ...EXISTING }, error: null },
    ]);

    await updatePropertyFacts("p1", { addressLine1: "Rural Route 4" }, CTX);

    expect(writes.update[0]).toMatchObject({ latitude: null, longitude: null });
  });

  it("leaves the pin alone when the address is not touched", async () => {
    const writes = fakeDatabase([
      { data: EXISTING, error: null },
      { data: { ...EXISTING }, error: null },
    ]);

    await updatePropertyFacts("p1", { beds: 4 }, CTX);

    expect(mockGeocode).not.toHaveBeenCalled();
    expect(writes.update[0]).not.toHaveProperty("latitude");
    expect(writes.update[0]).not.toHaveProperty("longitude");
  });
});
