import { resolveCategory, matchesBudget } from "@/lib/budget/budgetService";

// ─── resolveCategory ─────────────────────────────────────────────────────────
// R3 invariant: this logic must stay in sync with the inline copies in
// nightly-snapshot and weekly-report edge functions. Change here = change there.

describe("resolveCategory", () => {
  test("override wins over primary category", () => {
    expect(resolveCategory({ category_primary: "FOOD_AND_DRINK", category_override: "GENERAL_MERCHANDISE" }))
      .toBe("GENERAL_MERCHANDISE");
  });

  test("null override falls through to primary", () => {
    expect(resolveCategory({ category_primary: "TRANSPORTATION", category_override: null }))
      .toBe("TRANSPORTATION");
  });

  test("undefined override falls through to primary", () => {
    expect(resolveCategory({ category_primary: "ENTERTAINMENT" }))
      .toBe("ENTERTAINMENT");
  });

  test("null primary maps to OTHER when no override", () => {
    expect(resolveCategory({ category_primary: null, category_override: null }))
      .toBe("OTHER");
  });

  test("both null → OTHER", () => {
    expect(resolveCategory({ category_primary: null }))
      .toBe("OTHER");
  });

  test("override takes effect even when primary is null", () => {
    expect(resolveCategory({ category_primary: null, category_override: "FOOD_AND_DRINK" }))
      .toBe("FOOD_AND_DRINK");
  });
});

// ─── matchesBudget ────────────────────────────────────────────────────────────

describe("matchesBudget", () => {
  const LINKED = new Set(["acc-1", "acc-2"]);

  const baseTx = {
    plaid_account_id: "acc-1",
    category_primary: "FOOD_AND_DRINK",
    category_override: null,
    amount: 50,
    date: "2026-07-10",
  };

  test("positive case — all conditions met", () => {
    expect(matchesBudget(baseTx, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(true);
  });

  test("negative or zero amount is excluded", () => {
    expect(matchesBudget({ ...baseTx, amount: -10 }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
    expect(matchesBudget({ ...baseTx, amount: 0 }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
  });

  test("wrong category is excluded", () => {
    expect(matchesBudget(baseTx, "TRANSPORTATION", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
  });

  test("override category is used over primary", () => {
    const tx = { ...baseTx, category_override: "GENERAL_MERCHANDISE" };
    expect(matchesBudget(tx, "GENERAL_MERCHANDISE", "2026-07-01", "2026-07-31", LINKED)).toBe(true);
    expect(matchesBudget(tx, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
  });

  test("date before period_start is excluded", () => {
    expect(matchesBudget({ ...baseTx, date: "2026-06-30" }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
  });

  test("date after period_end is excluded", () => {
    expect(matchesBudget({ ...baseTx, date: "2026-08-01" }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
  });

  test("date on period_start boundary is included", () => {
    expect(matchesBudget({ ...baseTx, date: "2026-07-01" }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(true);
  });

  test("date on period_end boundary is included", () => {
    expect(matchesBudget({ ...baseTx, date: "2026-07-31" }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(true);
  });

  test("unlinked account is excluded", () => {
    expect(matchesBudget({ ...baseTx, plaid_account_id: "acc-99" }, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(false);
  });

  test("amount as string (DB may return strings) is coerced correctly", () => {
    const tx = { ...baseTx, amount: "42" as unknown as number };
    expect(matchesBudget(tx, "FOOD_AND_DRINK", "2026-07-01", "2026-07-31", LINKED)).toBe(true);
  });
});
