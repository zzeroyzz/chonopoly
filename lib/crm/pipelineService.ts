import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { RequestContext } from "../context";
import { type LeadSource, type PipelineEntry, type PipelineRow, type Stage, type Task } from "./types";
import { isTerminal } from "./stages";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * The pipeline data layer.
 *
 * Every function here is owner-scoped with the same `owner_type` / `owner_id`
 * pair every other table uses. The service-role key bypasses RLS, so the scope
 * filter in each query is the actual boundary — not a convenience.
 */

export interface CreateEntryInput {
  property_id: string;
  stage?: Stage;
  assigned_to?: string | null;
  source?: LeadSource;
}

/**
 * Put a property on the pipeline.
 *
 * A property row is not a lead — a cash flow analysis can create the property
 * without anyone having to work it. This is the step that makes it a lead, and
 * it's separate for exactly that reason.
 *
 * One entry per property per owner, enforced by a unique index. A revived dead
 * lead reuses its entry, so hitting the conflict returns the existing row
 * rather than erroring.
 */
export async function createEntry(
  input: CreateEntryInput,
  ctx: RequestContext,
  userId: string
): Promise<PipelineEntry> {
  const client = db();

  const { data: existing } = await client
    .from("pipeline_entries")
    .select("*")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("property_id", input.property_id)
    .maybeSingle();

  if (existing) return existing as PipelineEntry;

  const { data, error } = await client
    .from("pipeline_entries")
    .insert({
      owner_type: ctx.type,
      owner_id: ctx.id,
      property_id: input.property_id,
      stage: input.stage ?? "new_lead",
      assigned_to: input.assigned_to ?? userId,
      source: input.source ?? "manual",
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create pipeline entry: ${error.message}`);
  return data as PipelineEntry;
}

export async function getEntry(id: string, ctx: RequestContext): Promise<PipelineEntry | null> {
  const { data } = await db()
    .from("pipeline_entries")
    .select("*")
    .eq("id", id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  return (data as PipelineEntry) ?? null;
}

interface JoinedEntry extends PipelineEntry {
  properties: { address_line1: string; city: string | null } | null;
  tasks: Task[] | null;
}

/**
 * Every lead with the two things the list row needs: the address and the open
 * tasks. One query rather than a fan-out — the list is small enough that paging
 * it would cost more than it saves, and N+1 on a phone is what it would become.
 *
 * Closed and dead are excluded unless asked for. They're the only thing hidden.
 */
export async function listPipeline(
  ctx: RequestContext,
  opts: { includeTerminal?: boolean } = {}
): Promise<PipelineRow[]> {
  const { data, error } = await db()
    .from("pipeline_entries")
    .select(
      `*,
       properties!inner ( address_line1, city ),
       tasks ( * )`
    )
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("tasks.status", "open");

  if (error) throw new Error(`Failed to list pipeline: ${error.message}`);

  const rows = (data ?? []) as JoinedEntry[];

  return rows
    .filter((r) => opts.includeTerminal || !isTerminal(r.stage))
    .map((r) => {
      const { properties, tasks, ...entry } = r;
      return {
        entry: entry as PipelineEntry,
        addressLine1: properties?.address_line1 ?? "",
        city: properties?.city ?? null,
        openTasks: (tasks ?? []).slice().sort((a, b) => (a.due_date < b.due_date ? -1 : 1)),
      };
    });
}

/**
 * Move a lead to another stage.
 *
 * Delegates to `crm_change_stage`, which writes the history row and handles the
 * cadence in the same statement. Do not reimplement any of that here — the
 * whole point of the RPC is that the stage change and the follow-up task can't
 * come apart.
 *
 * The ownership check happens first because the RPC is SECURITY DEFINER and
 * takes an entry id on faith.
 */
export async function changeStage(
  entryId: string,
  toStage: Stage,
  ctx: RequestContext,
  userId: string,
  note?: string
): Promise<PipelineEntry> {
  const owned = await getEntry(entryId, ctx);
  if (!owned) throw new Error("Pipeline entry not found");

  const { data, error } = await db().rpc("crm_change_stage", {
    p_entry_id: entryId,
    p_to_stage: toStage,
    p_user_id: userId,
    p_note: note ?? null,
  });

  if (error) throw new Error(`Failed to change stage: ${error.message}`);
  return data as PipelineEntry;
}

/**
 * Mark a task done. The RPC generates the next cadence rung when there is one.
 *
 * Ownership is checked through the task's entry, since tasks carry no owner
 * columns of their own.
 */
export async function completeTask(
  taskId: string,
  ctx: RequestContext,
  userId: string
): Promise<Task> {
  const client = db();

  const { data: task } = await client
    .from("tasks")
    .select("id, pipeline_entry_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) throw new Error("Task not found");

  const owned = await getEntry(task.pipeline_entry_id as string, ctx);
  if (!owned) throw new Error("Task not found");

  const { data, error } = await client.rpc("crm_complete_task", {
    p_task_id: taskId,
    p_user_id: userId,
  });

  if (error) throw new Error(`Failed to complete task: ${error.message}`);
  return data as Task;
}

/** Open tasks for one user, soonest first. Backs the My tasks screen. */
export async function listMyTasks(ctx: RequestContext, userId: string): Promise<Task[]> {
  const rows = await listPipeline(ctx, { includeTerminal: false });
  return rows
    .flatMap((r) => r.openTasks)
    .filter((t) => t.assigned_to === userId || t.assigned_to === null)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
}

export async function stageCounts(ctx: RequestContext): Promise<Record<Stage, number>> {
  const { data, error } = await db()
    .from("pipeline_entries")
    .select("stage")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id);

  if (error) throw new Error(`Failed to count stages: ${error.message}`);

  const counts = {
    new_lead: 0,
    contacted: 0,
    qualified: 0,
    offer: 0,
    under_contract: 0,
    closed: 0,
    dead: 0,
  } as Record<Stage, number>;

  for (const row of (data ?? []) as { stage: Stage }[]) {
    counts[row.stage] = (counts[row.stage] ?? 0) + 1;
  }
  return counts;
}
