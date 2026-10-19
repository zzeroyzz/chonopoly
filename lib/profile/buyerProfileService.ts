import { createClient } from "@supabase/supabase-js";
import { type Database } from "../supabase/database.types";
import { type RequestContext } from "../context";
import {
  type BuyerProfile,
  type ProfileDebt,
  type ProfileDefaults,
  type ProfileIncome,
  type IncomeType,
} from "./types";

/**
 * Typed against the generated schema (`lib/supabase/database.types.ts`), so a
 * column that does not exist is a compile error instead of a 500. Regenerate
 * with `npm run db:types` after every migration.
 */
function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const PROFILES = "buyer_profiles";
const INCOMES = "profile_incomes";
const DEBTS = "profile_debts";

/**
 * The buyer profile data layer.
 *
 * Personal context only. The table has no team policy — a team here can include
 * an agent or an assistant, and a salary is not theirs to read — so every
 * function rejects a team context rather than silently returning nothing.
 *
 * The service-role key bypasses RLS, which makes the owner filter in each query
 * the actual boundary rather than a convenience.
 */

/** Teams cannot hold a profile. Said once, here, rather than at every call site. */
function assertPersonal(ctx: RequestContext): void {
  if (ctx.type !== "personal") {
    throw new Error("A buyer profile is personal — team contexts do not have one");
  }
}

interface ProfileRow {
  id: string;
  cash_available: number;
  cash_reserves: number;
  loan_type: string;
  renovation_program: string;
  interest_rate: number;
  term_years: number;
  down_payment_pct: number;
  closing_cost_pct: number;
  county_loan_limit: number | null;
  dpa_enabled: boolean;
  dpa_structure: string;
  dpa_rate: number;
  dpa_term_years: number;
  buying_pct: number;
  selling_pct: number;
  holding_monthly: number;
  holding_months: number;
  contingency_photos_pct: number;
  contingency_visit_pct: number;
  filing_status?: string;
  federal_ordinary_pct?: number;
  federal_long_term_pct?: number;
  state_tax_rates_pct?: unknown;
}

function toDefaults(row: ProfileRow): ProfileDefaults {
  return {
    loanType: row.loan_type,
    renovationProgram: row.renovation_program,
    interestRate: Number(row.interest_rate),
    termYears: row.term_years,
    downPaymentPct: Number(row.down_payment_pct),
    closingCostPct: Number(row.closing_cost_pct),
    countyLoanLimit: row.county_loan_limit === null ? null : Number(row.county_loan_limit),
    dpaEnabled: row.dpa_enabled,
    dpaStructure: row.dpa_structure,
    dpaRate: Number(row.dpa_rate),
    dpaTermYears: row.dpa_term_years,
    buyingPct: Number(row.buying_pct),
    sellingPct: Number(row.selling_pct),
    holdingMonthly: Number(row.holding_monthly),
    holdingMonths: row.holding_months,
    contingencyPhotosPct: Number(row.contingency_photos_pct),
    contingencyVisitPct: Number(row.contingency_visit_pct),
    // Present only once the tax-defaults migration has run. Reading them
    // defensively keeps the app working either side of it.
    ...(row.filing_status !== undefined ? { filingStatus: String(row.filing_status) } : {}),
    ...(row.federal_ordinary_pct !== undefined
      ? { federalOrdinaryPct: Number(row.federal_ordinary_pct) }
      : {}),
    ...(row.federal_long_term_pct !== undefined
      ? { federalLongTermPct: Number(row.federal_long_term_pct) }
      : {}),
    ...(row.state_tax_rates_pct !== undefined && row.state_tax_rates_pct !== null
      ? { stateTaxRatesPct: row.state_tax_rates_pct as Record<string, number> }
      : {}),
  };
}

const PROFILE_COLUMNS = `
  id, cash_available, cash_reserves,
  loan_type, renovation_program, interest_rate, term_years, down_payment_pct,
  closing_cost_pct, county_loan_limit, dpa_enabled, dpa_structure, dpa_rate,
  dpa_term_years, buying_pct, selling_pct, holding_monthly, holding_months,
  contingency_photos_pct, contingency_visit_pct
`;

/**
 * The tax columns, which exist only after 20261019030000_tax_defaults.sql runs.
 *
 * Selected separately and retried without them on failure, so this deploy is
 * safe to ship before the migration is approved. Naming a column that does not
 * exist is a 400 from PostgREST, and that 400 would take the whole profile
 * down — the calculator, every verdict, the Properties list — over a tax rate.
 */
const TAX_COLUMNS = `, filing_status, federal_ordinary_pct, federal_long_term_pct, state_tax_rates_pct`;

/**
 * The profile, or null when there isn't one yet.
 *
 * Null is a real answer, not an error: it is what puts the calculator into its
 * "set your income" state rather than screening against a number nobody entered.
 */
export async function getProfile(ctx: RequestContext): Promise<BuyerProfile | null> {
  assertPersonal(ctx);

  const read = (columns: string) =>
    db()
      .from(PROFILES)
      .select(columns)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id)
      .maybeSingle();

  let { data, error } = await read(PROFILE_COLUMNS + TAX_COLUMNS);
  if (error) {
    // Pre-migration: fall back to the columns that have always been there.
    ({ data, error } = await read(PROFILE_COLUMNS));
  }

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as ProfileRow;

  const [incomes, debts] = await Promise.all([
    db().from(INCOMES).select("id, label, income_type, gross_monthly, borrower")
      .eq("profile_id", row.id).order("created_at"),
    db().from(DEBTS).select("id, label, debt_type, monthly_payment, include_in_ratios")
      .eq("profile_id", row.id).order("created_at"),
  ]);

  if (incomes.error) throw new Error(incomes.error.message);
  if (debts.error) throw new Error(debts.error.message);

  return {
    id: row.id,
    cashAvailable: Number(row.cash_available),
    cashReserves: Number(row.cash_reserves),
    defaults: toDefaults(row),
    incomes: (incomes.data ?? []).map((i) => ({
      id: i.id as string,
      label: i.label as string,
      incomeType: i.income_type as IncomeType,
      grossMonthly: Number(i.gross_monthly),
      borrower: (i.borrower as string | null) ?? null,
    })),
    debts: (debts.data ?? []).map((d) => ({
      id: d.id as string,
      label: d.label as string,
      debtType: d.debt_type as string,
      monthlyPayment: Number(d.monthly_payment),
      includeInRatios: d.include_in_ratios as boolean,
    })),
  };
}

export interface CreateProfileInput {
  incomes: { label: string; incomeType?: IncomeType; grossMonthly: number }[];
  debts: { label: string; debtType?: string; monthlyPayment: number }[];
}

/**
 * Create the profile with its first income and debt rows.
 *
 * This is what the calculator's first-run modal calls. Column defaults supply
 * the loan and cost defaults, so the modal only has to ask for the two things a
 * verdict actually needs.
 *
 * Returns the existing profile untouched if one already exists — the modal only
 * appears when there is none, but a double submit should not error or clobber.
 */
export async function createProfile(
  input: CreateProfileInput,
  ctx: RequestContext,
  userId: string
): Promise<BuyerProfile> {
  assertPersonal(ctx);

  const existing = await getProfile(ctx);
  if (existing) return existing;

  const { data, error } = await db()
    .from(PROFILES)
    .insert({ owner_type: ctx.type, owner_id: ctx.id, created_by: userId })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const profileId = (data as { id: string }).id;

  await replaceIncomesAndDebts(profileId, input);

  const created = await getProfile(ctx);
  if (!created) throw new Error("Profile was created but could not be read back");
  return created;
}

/** Replace the itemised rows wholesale. Simpler than diffing, and the lists are short. */
async function replaceIncomesAndDebts(
  profileId: string,
  input: CreateProfileInput
): Promise<void> {
  await db().from(INCOMES).delete().eq("profile_id", profileId);
  await db().from(DEBTS).delete().eq("profile_id", profileId);

  const incomes = input.incomes
    .filter((i) => i.label.trim() !== "")
    .map((i) => ({
      profile_id: profileId,
      label: i.label.trim(),
      income_type: i.incomeType ?? "w2",
      gross_monthly: Math.max(0, i.grossMonthly),
    }));

  const debts = input.debts
    .filter((d) => d.label.trim() !== "")
    .map((d) => ({
      profile_id: profileId,
      label: d.label.trim(),
      debt_type: d.debtType ?? "other",
      monthly_payment: Math.max(0, d.monthlyPayment),
    }));

  if (incomes.length > 0) {
    const { error } = await db().from(INCOMES).insert(incomes);
    if (error) throw new Error(error.message);
  }
  if (debts.length > 0) {
    const { error } = await db().from(DEBTS).insert(debts);
    if (error) throw new Error(error.message);
  }
}

export interface UpdateProfileInput {
  cashAvailable?: number;
  cashReserves?: number;
  defaults?: Partial<ProfileDefaults>;
  incomes?: ProfileIncome[];
  debts?: ProfileDebt[];
}

/** Settings writes. The modal creates; everything after that comes through here. */
export async function updateProfile(
  input: UpdateProfileInput,
  ctx: RequestContext
): Promise<BuyerProfile> {
  assertPersonal(ctx);

  const existing = await getProfile(ctx);
  if (!existing) throw new Error("Profile not found");

  const d = input.defaults;
  // The generated Update type rather than Record<string, unknown>, so a
  // mistyped column name fails to compile instead of erroring at runtime.
  const patch: Database["public"]["Tables"]["buyer_profiles"]["Update"] = {};
  if (input.cashAvailable !== undefined) patch.cash_available = Math.max(0, input.cashAvailable);
  if (input.cashReserves !== undefined) patch.cash_reserves = Math.max(0, input.cashReserves);
  if (d?.loanType !== undefined) patch.loan_type = d.loanType;
  if (d?.renovationProgram !== undefined) patch.renovation_program = d.renovationProgram;
  if (d?.interestRate !== undefined) patch.interest_rate = d.interestRate;
  if (d?.termYears !== undefined) patch.term_years = d.termYears;
  if (d?.downPaymentPct !== undefined) patch.down_payment_pct = d.downPaymentPct;
  if (d?.closingCostPct !== undefined) patch.closing_cost_pct = d.closingCostPct;
  if (d?.countyLoanLimit !== undefined) patch.county_loan_limit = d.countyLoanLimit;
  if (d?.dpaEnabled !== undefined) patch.dpa_enabled = d.dpaEnabled;
  if (d?.dpaStructure !== undefined) patch.dpa_structure = d.dpaStructure;
  if (d?.dpaRate !== undefined) patch.dpa_rate = d.dpaRate;
  if (d?.dpaTermYears !== undefined) patch.dpa_term_years = d.dpaTermYears;
  if (d?.buyingPct !== undefined) patch.buying_pct = d.buyingPct;
  if (d?.sellingPct !== undefined) patch.selling_pct = d.sellingPct;
  if (d?.holdingMonthly !== undefined) patch.holding_monthly = d.holdingMonthly;
  if (d?.holdingMonths !== undefined) patch.holding_months = d.holdingMonths;
  if (d?.contingencyPhotosPct !== undefined) patch.contingency_photos_pct = d.contingencyPhotosPct;
  if (d?.contingencyVisitPct !== undefined) patch.contingency_visit_pct = d.contingencyVisitPct;
  // Skipped silently until the migration adds the columns, rather than failing
  // the whole save for a field the table does not have yet.
  const taxPatch = patch as Record<string, unknown>;
  if (d?.filingStatus !== undefined) taxPatch.filing_status = d.filingStatus;
  if (d?.federalOrdinaryPct !== undefined) taxPatch.federal_ordinary_pct = d.federalOrdinaryPct;
  if (d?.federalLongTermPct !== undefined) taxPatch.federal_long_term_pct = d.federalLongTermPct;
  if (d?.stateTaxRatesPct !== undefined) taxPatch.state_tax_rates_pct = d.stateTaxRatesPct;

  if (Object.keys(patch).length > 0) {
    const { error } = await db().from(PROFILES).update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
  }

  if (input.incomes) {
    await db().from(INCOMES).delete().eq("profile_id", existing.id);
    const rows = input.incomes
      .filter((i) => i.label.trim() !== "")
      .map((i) => ({
        profile_id: existing.id,
        label: i.label.trim(),
        income_type: i.incomeType,
        gross_monthly: Math.max(0, i.grossMonthly),
        borrower: i.borrower,
      }));
    if (rows.length > 0) {
      const { error } = await db().from(INCOMES).insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  if (input.debts) {
    await db().from(DEBTS).delete().eq("profile_id", existing.id);
    const rows = input.debts
      .filter((d2) => d2.label.trim() !== "")
      .map((d2) => ({
        profile_id: existing.id,
        label: d2.label.trim(),
        debt_type: d2.debtType,
        monthly_payment: Math.max(0, d2.monthlyPayment),
        include_in_ratios: d2.includeInRatios,
      }));
    if (rows.length > 0) {
      const { error } = await db().from(DEBTS).insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  const updated = await getProfile(ctx);
  if (!updated) throw new Error("Profile not found after update");
  return updated;
}
