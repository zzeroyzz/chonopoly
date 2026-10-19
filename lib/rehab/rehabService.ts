import { createClient } from "@supabase/supabase-js";
import { type RequestContext } from "../context";
import { type Database, type Json } from "../supabase/database.types";
import { getProperty } from "../property/propertyService";
import { emptyEstimate, REHAB_SYSTEMS, type RehabEstimate, type RehabLine } from "./types";

/**
 * The rehab estimate, stored as an analysis of kind `rehab`.
 *
 * Same table as the financing scenarios, so it inherits soft delete, the
 * context filter and — the part that matters — the version trigger, which
 * captures the previous row on every update regardless of kind. Refining a
 * photo estimate after a walkthrough therefore keeps the photo one, which is
 * the whole argument for doing the visit.
 *
 * A separate service rather than a parameter on scenarioService: that one
 * reads and writes `MortgageInputs`, and running a checklist through
 * `readInputs` would spread it over mortgage defaults and mangle it.
 */

function db() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TABLE = "analyses";
const KIND = "rehab";

/**
 * One estimate per house, found by a fixed label.
 *
 * The unique index is on (context, property_id, kind, label), so a constant
 * label makes every save an update — which is what fires the version trigger.
 * A second estimate on one house would be two answers to one question.
 */
const LABEL = "Rehab estimate";

export interface StoredRehab {
  id: string;
  estimate: RehabEstimate;
  /** How many times it has been saved. */
  version: number;
  updatedAt: string;
}

/** Read a stored blob back into a full checklist. */
function readEstimate(stored: unknown): RehabEstimate {
  const base = emptyEstimate();
  if (!stored || typeof stored !== "object") return base;

  const raw = stored as Partial<RehabEstimate>;
  const bySystem = new Map<string, RehabLine>();
  for (const line of raw.lines ?? []) {
    if (line && typeof line === "object" && "system" in line) {
      bySystem.set(String(line.system), line as RehabLine);
    }
  }

  // Rebuilt from the canonical system list rather than trusting the stored
  // order, so a checklist saved before a system was added still opens with
  // every row present.
  return {
    lines: REHAB_SYSTEMS.map((system) => {
      const found = bySystem.get(system);
      return {
        system,
        condition: found?.condition ?? "good",
        cost: typeof found?.cost === "number" ? found.cost : 0,
        note: typeof found?.note === "string" ? found.note : "",
      };
    }),
    source: raw.source === "visit" ? "visit" : "photos",
    visitNotes: typeof raw.visitNotes === "string" ? raw.visitNotes : "",
  };
}

export async function getRehabEstimate(
  propertyId: string,
  ctx: RequestContext
): Promise<StoredRehab | null> {
  const { data, error } = await db()
    .from(TABLE)
    .select("id, inputs, version, updated_at")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .eq("property_id", propertyId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    estimate: readEstimate(data.inputs),
    version: data.version,
    updatedAt: data.updated_at,
  };
}

export async function saveRehabEstimate(
  propertyId: string,
  estimate: RehabEstimate,
  ctx: RequestContext,
  userId: string
): Promise<StoredRehab> {
  const property = await getProperty(propertyId, ctx);
  if (!property) throw new Error("Property not found");

  const existing = await getRehabEstimate(propertyId, ctx);

  const payload = {
    owner_type: ctx.type,
    owner_id: ctx.id,
    kind: KIND,
    property_id: propertyId,
    label: LABEL,
    inputs: estimate as unknown as Json,
    created_by: userId,
  };

  // Update rather than insert when one exists: the trigger snapshots the old
  // row into analysis_versions, so the photo estimate survives the visit.
  const query = existing
    ? db().from(TABLE).update(payload).eq("id", existing.id)
    : db().from(TABLE).insert(payload);

  const { data, error } = await query.select("id, inputs, version, updated_at").single();
  if (error) throw new Error(error.message);

  // Recording the estimate as coming from a visit IS the record that the visit
  // happened — there is no separate "I went" button to forget to press, and
  // the progress checklist reads this column.
  if (estimate.source === "visit" && !property.visit_completed_at) {
    const { error: visitError } = await db()
      .from("properties")
      .update({ visit_completed_at: new Date().toISOString() })
      .eq("id", propertyId)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id);

    // The estimate is saved either way; a missing timestamp costs a checkmark,
    // not the work.
    if (visitError) console.error("Failed to stamp the visit:", visitError.message);
  }

  return {
    id: data.id,
    estimate: readEstimate(data.inputs),
    version: data.version,
    updatedAt: data.updated_at,
  };
}

/**
 * Which houses have an estimate, for the screen's progress checklist.
 *
 * One query for the whole list rather than one per house.
 */
export async function rehabEstimatesByProperty(
  propertyIds: string[],
  ctx: RequestContext
): Promise<Map<string, RehabEstimate>> {
  const out = new Map<string, RehabEstimate>();
  if (propertyIds.length === 0) return out;

  const { data, error } = await db()
    .from(TABLE)
    .select("property_id, inputs")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", KIND)
    .is("archived_at", null)
    .in("property_id", propertyIds);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    if (row.property_id) out.set(row.property_id, readEstimate(row.inputs));
  }
  return out;
}
