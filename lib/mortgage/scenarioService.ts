import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { type RequestContext } from "../context";
import { type MortgageInputs } from "./types";
import { defaultInputs } from "./defaults";
import { snapshotOf, type ProfileSnapshot } from "./resolveInputs";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TABLE = "mortgage_scenarios";
const VERSIONS = "mortgage_scenario_versions";

/**
 * The shape `inputs` is stored in. Bump when a rename lands, and handle the old
 * number in `readInputs` — the point of the column is that a stored blob
 * outlives the type that wrote it.
 */
export const CURRENT_INPUTS_VERSION = 1;

export interface ScenarioSummary {
  id: string;
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
  home_value: number;
  loan_type: string;
  monthly_payment: number;
  version: number;
  updated_at: string;
  profile_snapshot?: unknown;
  inputs?: unknown;
  inputs_version?: number;
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

function toSummary(row: Row): ScenarioSummary {
  return {
    id: row.id,
    label: row.label,
    homeValue: Number(row.home_value),
    loanType: row.loan_type,
    monthlyPayment: Number(row.monthly_payment),
    version: row.version,
    updatedAt: row.updated_at,
    profileSnapshot: (row.profile_snapshot as ProfileSnapshot | null) ?? null,
  };
}

const SUMMARY_COLUMNS =
  "id, label, home_value, loan_type, monthly_payment, version, updated_at, profile_snapshot";

/**
 * Scenarios for one context, newest first.
 *
 * The service-role key bypasses RLS, so the owner filter in each query here is
 * the actual boundary — not a convenience. Soft-deleted rows are excluded
 * everywhere except `listDeleted`.
 */
export async function listScenarios(ctx: RequestContext): Promise<ScenarioSummary[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(SUMMARY_COLUMNS)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toSummary(r as Row));
}

export async function getScenario(id: string, ctx: RequestContext): Promise<Scenario> {
  const { data, error } = await db()
    .from(TABLE)
    .select(`${SUMMARY_COLUMNS}, inputs, inputs_version`)
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Scenario not found");

  const row = data as Row;
  return { ...toSummary(row), inputs: readInputs(row.inputs, row.inputs_version ?? 1) };
}

export interface SaveScenarioInput {
  label: string;
  inputs: MortgageInputs;
  monthlyPayment: number;
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
): Promise<ScenarioSummary> {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required");

  const existing = await db()
    .from(TABLE)
    .select("id")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .is("deleted_at", null)
    .ilike("label", label)
    .maybeSingle();

  const payload = {
    owner_type: ctx.type,
    owner_id: ctx.id,
    label,
    home_value: input.inputs.homeValue,
    loan_type: input.inputs.loanType,
    monthly_payment: input.monthlyPayment,
    inputs: input.inputs,
    inputs_version: CURRENT_INPUTS_VERSION,
    // Profile and defaults keys only — never the whole object. startMonth
    // resolves to "today", so a full snapshot would mark every scenario stale
    // on the first of the month.
    profile_snapshot: snapshotOf(input.inputs),
    created_by: userId,
  };

  const query = existing.data?.id
    ? db().from(TABLE).update(payload).eq("id", existing.data.id)
    : db().from(TABLE).insert(payload);

  const { data, error } = await query.select(SUMMARY_COLUMNS).single();
  if (error) throw new Error(error.message);
  return toSummary(data as Row);
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
    .is("deleted_at", null)
    .select(SUMMARY_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Scenario not found");
  return toSummary(data as Row);
}

/**
 * Soft delete. The row and its history stay, so a teammate's delete is
 * recoverable — which is the whole reason the column exists.
 */
export async function deleteScenario(id: string, ctx: RequestContext): Promise<void> {
  const { data, error } = await db()
    .from(TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .is("deleted_at", null)
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
    .select("id, version, label, home_value, loan_type, monthly_payment, inputs, inputs_version, superseded_at")
    .eq("scenario_id", id)
    .order("version", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const row = r as Row & { superseded_at: string };
    return {
      id: row.id,
      version: row.version,
      label: row.label,
      homeValue: Number(row.home_value),
      loanType: row.loan_type,
      monthlyPayment: Number(row.monthly_payment),
      inputs: readInputs(row.inputs, row.inputs_version ?? 1),
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
      home_value: target.homeValue,
      loan_type: target.loanType,
      monthly_payment: target.monthlyPayment,
      inputs: target.inputs,
      inputs_version: CURRENT_INPUTS_VERSION,
      created_by: userId,
    })
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .is("deleted_at", null)
    .select(SUMMARY_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toSummary(data as Row);
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
