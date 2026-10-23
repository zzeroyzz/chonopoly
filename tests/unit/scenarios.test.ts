jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
import { saveScenario } from "@/lib/mortgage/scenarioService";
import { fakeClient } from "./fakeDatabase";
import { readInputs, diffInputs, CURRENT_INPUTS_VERSION } from "@/lib/mortgage/scenarioService";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { type MortgageInputs } from "@/lib/mortgage/types";

function inputs(overrides: Partial<MortgageInputs> = {}): MortgageInputs {
  return { ...defaultInputs(new Date(2025, 0, 1)), ...overrides };
}

describe("readInputs", () => {
  it("round-trips a scenario written by the current version", () => {
    const saved = inputs({ homeValue: 250_000, downPayment: 8_750, loanType: "fha" });
    const read = readInputs(saved, CURRENT_INPUTS_VERSION);

    expect(read.homeValue).toBe(250_000);
    expect(read.downPayment).toBe(8_750);
    expect(read.loanType).toBe("fha");
  });

  it("fills a field that did not exist when the scenario was saved", () => {
    // The blob outlives the type. A missing field has to come back as its
    // default, because undefined reaches the calculator and becomes NaN.
    const old = { homeValue: 250_000, downPayment: 8_750 };
    const read = readInputs(old, 1);

    expect(read.homeValue).toBe(250_000);
    expect(read.interestRate).toBe(defaultInputs().interestRate);
    expect(read.termYears).toBe(defaultInputs().termYears);
    expect(read.dpaEnabled).toBe(false);
  });

  it("migrates a pre-rename dpaAmount into dpaEnabled", () => {
    // Assistance used to be a dollar amount. Any positive figure means the
    // program was on.
    expect(readInputs({ homeValue: 250_000, dpaAmount: 8_750 }, 1).dpaEnabled).toBe(true);
    expect(readInputs({ homeValue: 250_000, dpaAmount: 0 }, 1).dpaEnabled).toBe(false);
  });

  it("does not let a stale dpaAmount override an explicit dpaEnabled", () => {
    const read = readInputs({ dpaAmount: 9_000, dpaEnabled: false }, 1);
    expect(read.dpaEnabled).toBe(false);
  });

  it("opens a scenario written by a newer deploy rather than refusing it", () => {
    // Taking what we understand beats showing the owner nothing at all.
    const read = readInputs({ homeValue: 400_000 }, CURRENT_INPUTS_VERSION + 1);
    expect(read.homeValue).toBe(400_000);
  });

  it("falls back to defaults for a blob that is not an object", () => {
    expect(readInputs(null, 1).homeValue).toBe(defaultInputs().homeValue);
    expect(readInputs("nonsense", 1).homeValue).toBe(defaultInputs().homeValue);
  });
});

describe("diffInputs", () => {
  it("reports nothing for identical inputs", () => {
    expect(diffInputs(inputs(), inputs())).toEqual([]);
  });

  it("reports only the fields that changed", () => {
    const a = inputs({ homeValue: 250_000, interestRate: 6.75 });
    const b = inputs({ homeValue: 300_000, interestRate: 6.75 });

    const changes = diffInputs(a, b);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: "homeValue", from: 250_000, to: 300_000 });
  });

  it("catches a boolean flipping", () => {
    const changes = diffInputs(inputs({ dpaEnabled: false }), inputs({ dpaEnabled: true }));
    expect(changes).toEqual([{ field: "dpaEnabled", from: false, to: true }]);
  });

  it("treats null and a number as different", () => {
    const changes = diffInputs(
      inputs({ afterRepairValue: null }),
      inputs({ afterRepairValue: 300_000 })
    );
    expect(changes).toEqual([{ field: "afterRepairValue", from: null, to: 300_000 }]);
  });

  it("returns changes in a stable order", () => {
    const a = inputs({ homeValue: 1, interestRate: 1, termYears: 10 });
    const b = inputs({ homeValue: 2, interestRate: 2, termYears: 20 });
    expect(diffInputs(a, b).map((c) => c.field)).toEqual([
      "homeValue",
      "interestRate",
      "termYears",
    ]);
  });
});

describe("saveScenario", () => {
  const mockCreateClient = createClient as jest.Mock;
  const CTX = { type: "personal" as const, id: "user-1" };
  const SAVED_ROW = {
    data: {
      id: "s-1",
      label: "Maple St",
      inputs: { homeValue: 265_000 },
      inputs_version: CURRENT_INPUTS_VERSION,
      outputs: { monthlyPayment: 2_300 },
      version: 2,
      updated_at: "2026-10-23T00:00:00.000Z",
      profile_snapshot: null,
      properties: null,
      is_primary: false,
    },
    error: null,
  };

  function save(
    answers: Parameters<typeof fakeClient>[0],
    propertyId: string | null = null,
    label = "Maple St"
  ) {
    const { client, writes } = fakeClient(answers);
    mockCreateClient.mockReturnValue(client);
    return saveScenario(
      { label, inputs: inputs({ homeValue: 265_000 }), monthlyPayment: 2_300, propertyId },
      CTX,
      "user-1"
    ).then(() => writes);
  }

  it("updates the row with the same name instead of adding a second one", async () => {
    // The version number itself is bumped by the database on update; what the
    // app owns is choosing update over insert, so the list keeps one row.
    const writes = await save([{ data: { id: "s-1" }, error: null }, SAVED_ROW]);
    expect(writes.insert).toEqual([]);
    expect(writes.update).toHaveLength(1);
  });

  it("does not change which analysis is primary on a re-save", async () => {
    const writes = await save([{ data: { id: "s-1" }, error: null }, SAVED_ROW], "prop-1");
    expect(writes.update[0]).not.toHaveProperty("is_primary");
  });

  it("adds a new row for a new name, primary when the house has none", async () => {
    const writes = await save(
      [
        { data: null, error: null }, // no save with this name yet
        { data: null, error: null }, // no primary on this house yet
        SAVED_ROW,
      ],
      "prop-1"
    );
    expect(writes.insert).toHaveLength(1);
    expect(writes.insert[0]).toMatchObject({ property_id: "prop-1", is_primary: true });
  });

  it("refuses a name that is only spaces", async () => {
    await expect(save([], null, "   ")).rejects.toThrow("A name is required");
  });
});
