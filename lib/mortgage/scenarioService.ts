import { createClient } from "@supabase/supabase-js";
import { type RequestContext } from "../context";
import { type Database, type Json } from "../supabase/database.types";
import { type MortgageInputs } from "./types";
import { defaultInputs } from "./defaults";
import { calculateMortgage } from "./calculate";
import { getProperty } from "../property/propertyService";
import { snapshotOf, type ProfileSnapshot } from "./resolveInputs";

/**
 * Typed against the generated schema, so naming a column that does not exist
 * is a compile error rather than a 500 in production. This service previously
 * selected home_value, loan_type and monthly_payment — mortgage_scenarios
 * columns that `analyses` never had — and nothing caught it, because the tests
 * stub the API and never reach PostgREST.
 */
function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Refactored onto `analyses` — the spine every analysis of a house hangs from.
// The old mortgage_scenarios tables stay in place, read-only, until the copy is
// verified and the drop separately approved.
const TABLE = "analyses";
const VERSIONS = "analysis_versions";

/** This service owns the financing kind. Rehab, flip and rental come later. */
const KIND = "financing";

/**
 * The shape `inputs` is stored in. Bump when a rename lands, and handle the old
 * number in `readInputs` — the point of the column is that a stored blob
 * outlives the type that wrote it.
 */
export const CURRENT_INPUTS_VERSION = 1;

export interface ScenarioProperty {
  id: string;
  addressLine1: string;
  city: string | null;
  state: string;
  zip: string | null;
  /** The address matched an existing house rather than matching a parcel. */
  needsAddressReview: boolean;
}

export interface ScenarioSummary {
  id: string;
  /** Null for saves made before a house was part of the model. */
  property?: ScenarioProperty | null;
  /**
   * The scenario the other tabs mean when they say "the price" and "the reno
   * budget". One per house, enforced by a partial unique index.
   */
  isPrimary?: boolean;
  /** Profile and defaults as they were when this ran. Null for older saves. */
  profileSnapshot?: ProfileSnapshot | null;
  label: string;
  homeValue: number;
  loanType: string;
  monthlyPayment: number;
  version: number;
  updatedAt: string;
}

export interface Scenario extends ScenarioSummary {
  inputs: MortgageInputs;
}

export interface ScenarioVersion {
  id: string;
  version: number;
  label: string;
  homeValue: number;
  loanType: string;
  monthlyPayment: number;
  inputs: MortgageInputs;
  supersededAt: string;
}

interface Row {
  id: string;
  label: string;
  version: number;
  updated_at: string;
  property_id?: string | null;
  is_primary?: boolean;
  properties?: PropertyJoin | PropertyJoin[] | null;
  profile_snapshot?: unknown;
  // The price and the loan type live in `inputs`; the payment lives in
  // `outputs`. `analyses` holds one jsonb of each rather than a column per
  // field — see the reshape migration for why.
  inputs?: unknown;
  outputs?: unknown;
  inputs_version?: number;
}

/**
 * jsonb columns are typed as `Json`, which an interface cannot satisfy without
 * an index signature. One cast in one place, rather than loosening the column
 * types and losing the protection that caught the home_value bug.
 */
function asJson(value: unknown): Json {
  return value as Json;
}

/** What `outputs` carries for a financing analysis. */
interface FinancingOutputs {
  monthlyPayment?: number;
}

/**
 * The monthly payment for a stored analysis.
 *
 * Prefers the saved figure. Falls back to recomputing it from `inputs` for
 * rows written before the payment was stored in `outputs` — including the row
 * copied over from mortgage_scenarios, which would otherwise show $0 in the
 * list and read as a free house.
 */
export function monthlyPaymentOf(outputs: unknown, inputs: MortgageInputs): number {
  const stored = (outputs as FinancingOutputs | null)?.monthlyPayment;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  return calculateMortgage(inputs).totalMonthlyWithMortgageInsurance;
}

/**
 * Read a stored blob back into current `MortgageInputs`.
 *
 * Spread over the defaults so a scenario saved before a field existed loads
 * with that field's default rather than `undefined`, which would otherwise
 * reach the calculator and produce NaN.
 *
 * Version 1 is the only shape so far. When a second arrives, convert it here —
 * this is the single place that needs to know the difference.
 */
export function readInputs(stored: unknown, version: number): MortgageInputs {
  const base = defaultInputs();
  if (!stored || typeof stored !== "object") return base;

  const raw = stored as Partial<MortgageInputs> & { dpaAmount?: number };

  // Scenarios written before assistance became a yes/no carry an amount.
  const { dpaAmount, ...rest } = raw;
  const migrated: Partial<MortgageInputs> =
    dpaAmount === undefined ? raw : { ...rest, dpaEnabled: rest.dpaEnabled ?? dpaAmount > 0 };

  if (version > CURRENT_INPUTS_VERSION) {
    // Written by a newer deploy. Take what we understand rather than refusing
    // to open it — the alternative is a scenario the owner cannot see at all.
    return { ...base, ...migrated };
  }

  return { ...base, ...migrated };
}

interface PropertyJoin {
  id: string;
  address_line1: string;
  city: string | null;
  state: string;
  zip: string | null;
  needs_address_review: boolean;
}

/** PostgREST returns an embedded row as an object or a one-element array. */
function toProperty(join: Row["properties"]): ScenarioProperty | null {
  const p = Array.isArray(join) ? join[0] : join;
  if (!p) return null;
  return {
    id: p.id,
    addressLine1: p.address_line1,
    city: p.city,
    state: p.state,
    zip: p.zip,
    needsAddressReview: p.needs_address_review,
  };
}

function toSummary(row: Row): ScenarioSummary {
  const inputs = readInputs(row.inputs, row.inputs_version ?? 1);
  return {
    id: row.id,
    label: row.label,
    homeValue: inputs.homeValue,
    loanType: inputs.loanType,
    monthlyPayment: monthlyPaymentOf(row.outputs, inputs),
    version: row.version,
    updatedAt: row.updated_at,
    profileSnapshot: (row.profile_snapshot as ProfileSnapshot | null) ?? null,
    property: toProperty(row.properties),
    isPrimary: row.is_primary ?? false,
  };
}

/**
 * Column lists are built from `keyof Row`, not written as free text.
 *
 * This is the part that actually closes the hole. A typed client is NOT enough
 * on its own: supabase-js does not validate column names inside a `.select()`
 * string, so `.select("home_value")` compiles cleanly against a schema with no
 * such column — verified both as a concatenated string and as a single
 * `as const` literal. Naming the fields as typed keys is what turns a column
 * that does not exist into a compile error.
 */
type AnalysisColumn = keyof Database["public"]["Tables"]["analyses"]["Row"];
type AnalysisVersionColumn = keyof Database["public"]["Tables"]["analysis_versions"]["Row"];

const SUMMARY_FIELDS: AnalysisColumn[] = [
  "id",
  "label",
  "version",
  "updated_at",
  // inputs and outputs rather than three scalar columns: the price and loan
  // type come out of the stored inputs blob, the payment out of outputs.
  "inputs",
  "inputs_version",
  "outputs",
  "profile_snapshot",
  "property_id",
  "is_primary",
];

const VERSION_FIELDS: AnalysisVersionColumn[] = [
  "id",
  "version",
  "label",
  "inputs",
  "inputs_version",
  "outputs",
  "superseded_at",
];

const SUMMARY_COLUMNS =
  SUMMARY_FIELDS.join(", ") +
  // The house, in the same round trip. The list groups by it, so fetching it
  // separately would be a query per row.
  ", properties(id, address_line1, city, state, zip, needs_address_review)";

const VERSION_COLUMNS = VERSION_FIELDS.join(", ");

/**
 * Scenarios for one context, newest first.
 *
 * The service-role key bypasses RLS, so the owner filter in each query here is
 * the actual boundary — not a convenience. Soft-deleted rows are excluded
 * everywhere except `listDeleted`.
 */
export async function listScenarios(
  ctx: RequestContext,
  opts: { propertyId?: string } = {}
): Promise<ScenarioSummary[]> {
  let query = db()
    .from(TABLE)
    .select(SUMMARY_COLUMNS)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null);

  // The property page asks for one house's analyses; the calculator asks for
  // all of them. Same query, one filter.
  if (opts.propertyId) query = query.eq("property_id", opts.propertyId);

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toSummary(r as unknown as Row));
}

export async function getScenario(id: string, ctx: RequestContext): Promise<Scenario> {
  const { data, error } = await db()
    .from(TABLE)
    .select(`${SUMMARY_COLUMNS}, inputs, inputs_version`)
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Scenario not found");

  const row = data as unknown as Row;
  return { ...toSummary(row), inputs: readInputs(row.inputs, row.inputs_version ?? 1) };
}

export interface SaveScenarioInput {
  label: string;
  inputs: MortgageInputs;
  monthlyPayment: number;
  /**
   * The house this analysis belongs to, by id. Null saves it unattached, under
   * "Unassigned", where it can be pointed at a house later.
   *
   * There is no address alternative, by design. Re-deriving a house from typed
   * text created two property rows for one house — "Atlanta, GA" in the city
   * field once and "Atlanta" the next time hashed differently, and the second
   * save made a second house. Properties are created in exactly one place, Add.
   */
  propertyId?: string | null;
}

export interface SaveScenarioResult {
  scenario: ScenarioSummary;
}

/**
 * Save under a name, replacing any scenario already using it.
 *
 * Upsert rather than insert-or-error: saving twice under one name is someone
 * updating their work, not a mistake to reject. The unique index is partial on
 * `deleted_at IS NULL`, so a name freed by a delete can be reused.
 *
 * An update here fires the database trigger that snapshots the previous state,
 * so the overwrite is recoverable.
 */
export async function saveScenario(
  input: SaveScenarioInput,
  ctx: RequestContext,
  userId: string
): Promise<SaveScenarioResult> {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required");

  // The house, if one was given — always by id. Saving never creates a
  // property: Add is the only place that does, so there is no address to
  // normalise here and no way for a second spelling to make a second house.
  const propertyId: string | null = input.propertyId ?? null;

  // Same name on the same house is an update, not a second row. Scoped by
  // property so "at asking" can exist once per house rather than once per
  // account.
  let existingQuery = db()
    .from(TABLE)
    .select("id")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .ilike("label", label);

  existingQuery = propertyId
    ? existingQuery.eq("property_id", propertyId)
    : existingQuery.is("property_id", null);

  const existing = await existingQuery.maybeSingle();

  // The first financing analysis on a house becomes its primary.
  //
  // Nothing was ever setting this, so `is_primary` was false on every row and
  // "the primary financing scenario" — the one the Comps, Rehab and screen
  // tabs mean when they say "the price" — never resolved to anything. The
  // partial unique index already guarantees at most one per house, so this
  // only claims the slot when it is empty.
  let isPrimary = false;
  if (propertyId && !existing.data?.id) {
    const { data: currentPrimary } = await db()
      .from(TABLE)
      .select("id")
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id)
      .eq("kind", KIND)
      .eq("property_id", propertyId)
      .eq("is_primary", true)
      .is("archived_at", null)
      .maybeSingle();

    isPrimary = !currentPrimary;
  }

  const payload = {
    owner_type: ctx.type,
    owner_id: ctx.id,
    kind: KIND,
    property_id: propertyId,
    label,
    // Only on an insert. An update must not change which analysis is primary —
    // that is a deliberate choice, not a side effect of re-saving.
    ...(existing.data?.id ? {} : { is_primary: isPrimary }),
    inputs: asJson(input.inputs),
    outputs: asJson({ monthlyPayment: input.monthlyPayment }),
    inputs_version: CURRENT_INPUTS_VERSION,
    // Profile and defaults keys only — never the whole object. startMonth
    // resolves to "today", so a full snapshot would mark every scenario stale
    // on the first of the month.
    profile_snapshot: asJson(snapshotOf(input.inputs)),
    created_by: userId,
  };

  const query = existing.data?.id
    ? db().from(TABLE).update(payload).eq("id", existing.data.id)
    : db().from(TABLE).insert(payload);

  const { data, error } = await query.select(SUMMARY_COLUMNS).single();
  if (error) throw new Error(error.message);
  return { scenario: toSummary(data as unknown as Row) };
}

/**
 * Attach an existing house to a save that never had one.
 *
 * Everything saved before the property spine has a null property_id and a
 * free-text name — they appear under "Unassigned". This is how they join the
 * spine, without retyping the numbers.
 *
 * Takes a property id, never an address. This used to call `upsertProperty`
 * with typed text, which made it the second door through which a property
 * could be created: a spelling that normalised differently produced a new
 * house instead of matching the one already on file. Add is the only door
 * now, so this can only point a save at something that already exists.
 */
export async function attachToProperty(
  id: string,
  propertyId: string,
  ctx: RequestContext
): Promise<SaveScenarioResult> {
  if (!propertyId?.trim()) throw new Error("A house is required");

  const existing = await getScenario(id, ctx);

  // The house has to be one of the caller's, or this would be a way to hang an
  // analysis on someone else's property.
  const property = await getProperty(propertyId, ctx);
  if (!property) throw new Error("Property not found");

  const { data, error } = await db()
    .from(TABLE)
    .update({ property_id: property.id })
    .eq("id", existing.id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .select(SUMMARY_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return { scenario: toSummary(data as unknown as Row) };
}

export async function renameScenario(
  id: string,
  label: string,
  ctx: RequestContext
): Promise<ScenarioSummary> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("A name is required");

  const { data, error } = await db()
    .from(TABLE)
    .update({ label: trimmed })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .select(SUMMARY_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Scenario not found");
  return toSummary(data as unknown as Row);
}

/**
 * Soft delete. The row and its history stay, so a teammate's delete is
 * recoverable — which is the whole reason the column exists.
 */
export async function deleteScenario(id: string, ctx: RequestContext): Promise<void> {
  const { data, error } = await db()
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Scenario not found");
}

export async function listVersions(
  id: string,
  ctx: RequestContext
): Promise<ScenarioVersion[]> {
  // Ownership is checked on the parent first; the versions table has no owner
  // columns of its own, so this is what scopes the read.
  await getScenario(id, ctx);

  const { data, error } = await db()
    .from(VERSIONS)
    .select(VERSION_COLUMNS)
    .eq("analysis_id", id)
    .order("version", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const row = r as unknown as Row & { superseded_at: string };
    const inputs = readInputs(row.inputs, row.inputs_version ?? 1);
    return {
      id: row.id,
      version: row.version,
      label: row.label,
      homeValue: inputs.homeValue,
      loanType: inputs.loanType,
      monthlyPayment: monthlyPaymentOf(row.outputs, inputs),
      inputs,
      supersededAt: row.superseded_at,
    };
  });
}

/**
 * Restore a past version by writing it as a new save.
 *
 * Deliberately not a rewind: the current state is snapshotted by the trigger on
 * the way past, so restoring never destroys the thing it replaced either.
 */
export async function restoreVersion(
  id: string,
  version: number,
  ctx: RequestContext,
  userId: string
): Promise<ScenarioSummary> {
  const versions = await listVersions(id, ctx);
  const target = versions.find((v) => v.version === version);
  if (!target) throw new Error("Version not found");

  const current = await getScenario(id, ctx);

  const { data, error } = await db()
    .from(TABLE)
    .update({
      // The name is not restored: it identifies the scenario, and changing it
      // under someone looking at a list is worse than leaving it.
      label: current.label,
      inputs: asJson(target.inputs),
      outputs: asJson({ monthlyPayment: target.monthlyPayment }),
      inputs_version: CURRENT_INPUTS_VERSION,
      created_by: userId,
    })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .select(SUMMARY_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toSummary(data as unknown as Row);
}

/** Which input fields differ between two sets. Drives the compare view. */
export function diffInputs(
  a: MortgageInputs,
  b: MortgageInputs
): { field: keyof MortgageInputs; from: unknown; to: unknown }[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof MortgageInputs>;
  const out: { field: keyof MortgageInputs; from: unknown; to: unknown }[] = [];

  for (const key of keys) {
    const from = a[key];
    const to = b[key];
    // JSON compare so nested values are handled without a deep-equal dependency.
    if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ field: key, from, to });
  }

  return out.sort((x, y) => String(x.field).localeCompare(String(y.field)));
}
