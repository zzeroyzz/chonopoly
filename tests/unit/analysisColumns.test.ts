import { monthlyPaymentOf } from "@/lib/mortgage/scenarioService";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guards the bug that reached production: scenarioService was refactored onto
 * `analyses` but kept selecting home_value, loan_type and monthly_payment —
 * mortgage_scenarios columns that `analyses` never had. Every live read of the
 * Numbers tab returned
 * "column analyses.home_value does not exist".
 *
 * The real protection is the typed column lists, which make this a compile
 * error. These tests cover what types cannot: that the generated schema is the
 * shape the service assumes, and that a row written before `outputs` existed
 * still reports a real payment.
 */

const schema = readFileSync(
  join(process.cwd(), "lib/supabase/database.types.ts"),
  "utf8"
);

function columnsOf(table: string): string[] {
  const start = schema.indexOf(`      ${table}: {`);
  if (start === -1) throw new Error(`${table} missing from the generated types`);
  const segment = schema.slice(start);
  const row = segment.slice(segment.indexOf("Row: {"), segment.indexOf("Insert: {"));
  return [...row.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
}

describe("the analyses schema the service assumes", () => {
  it("has the jsonb columns the service reads", () => {
    const columns = columnsOf("analyses");
    for (const column of ["inputs", "outputs", "inputs_version", "profile_snapshot", "kind", "is_primary"]) {
      expect(columns).toContain(column);
    }
  });

  it("does not have the old mortgage_scenarios scalar columns", () => {
    // If one of these ever comes back, it is a deliberate schema change and
    // this test should be the thing that makes someone say so out loud.
    const columns = columnsOf("analyses");
    for (const column of ["home_value", "loan_type", "monthly_payment"]) {
      expect(columns).not.toContain(column);
    }
  });

  it("does not have them on analysis_versions either", () => {
    // listVersions selected them from here too, and would have failed the
    // moment anyone opened a scenario's history.
    const columns = columnsOf("analysis_versions");
    for (const column of ["home_value", "loan_type", "monthly_payment"]) {
      expect(columns).not.toContain(column);
    }
    expect(columns).toContain("outputs");
  });

  it("is regenerable, so the types track the real database", () => {
    expect(schema).toContain("export type Database");
  });
});

describe("monthlyPaymentOf", () => {
  const inputs = defaultInputs(new Date(2026, 0, 1));

  it("prefers the stored figure", () => {
    expect(monthlyPaymentOf({ monthlyPayment: 2221 }, inputs)).toBe(2221);
  });

  it("recomputes from inputs when outputs is missing", () => {
    // The row copied over from mortgage_scenarios has no outputs. Showing $0
    // there would read as a free house.
    const expected = calculateMortgage(inputs).totalMonthlyWithMortgageInsurance;

    expect(monthlyPaymentOf(null, inputs)).toBeCloseTo(expected, 6);
    expect(monthlyPaymentOf({}, inputs)).toBeCloseTo(expected, 6);
    expect(monthlyPaymentOf(undefined, inputs)).toBeCloseTo(expected, 6);
    expect(monthlyPaymentOf(null, inputs)).toBeGreaterThan(0);
  });

  it("ignores a stored value that is not a finite number", () => {
    const expected = calculateMortgage(inputs).totalMonthlyWithMortgageInsurance;

    expect(monthlyPaymentOf({ monthlyPayment: NaN }, inputs)).toBeCloseTo(expected, 6);
    expect(monthlyPaymentOf({ monthlyPayment: "2221" }, inputs)).toBeCloseTo(expected, 6);
  });

  it("keeps a stored zero only when it is a real number", () => {
    // A genuinely zero payment is possible (a paid-off house), so 0 is not
    // treated as absent.
    expect(monthlyPaymentOf({ monthlyPayment: 0 }, inputs)).toBe(0);
  });
});
