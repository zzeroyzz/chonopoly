import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { RequestContext } from "../context";
import {
  type Activity,
  type ActivityType,
  type ContactEmail,
  type ContactPhone,
  type ContactWithChannels,
  type PipelineEntry,
  type PropertyDetail,
  type PropertyLike,
  type Relationship,
  type StageHistoryRow,
  type Task,
} from "./types";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Everything the property detail screen shows, in one call.
 *
 * Contacts hang off the property, not the pipeline entry — who owns a house is
 * a fact about the house, and the same person can turn up on three of them.
 */
export async function getDetail(
  entryId: string,
  ctx: RequestContext
): Promise<PropertyDetail | null> {
  const client = db();

  const { data: entry } = await client
    .from("pipeline_entries")
    .select("*")
    .eq("id", entryId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  if (!entry) return null;
  const typedEntry = entry as PipelineEntry;

  const { data: property } = await client
    .from("properties")
    .select("*")
    .eq("id", typedEntry.property_id)
    .maybeSingle();

  const [links, tasks, activities, history] = await Promise.all([
    client
      .from("property_contacts")
      .select("contact_id, relationship, is_primary")
      .eq("property_id", typedEntry.property_id),
    client
      .from("tasks")
      .select("*")
      .eq("pipeline_entry_id", entryId)
      .order("due_date", { ascending: true }),
    client
      .from("activities")
      .select("*")
      .eq("pipeline_entry_id", entryId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    client
      .from("property_stage_history")
      .select("*")
      .eq("pipeline_entry_id", entryId)
      .order("changed_at", { ascending: false }),
  ]);

  const contactIds = (links.data ?? []).map((l) => l.contact_id as string);
  const contacts = contactIds.length > 0 ? await loadContacts(client, contactIds) : [];

  const linkMeta = new Map(
    (links.data ?? []).map((l) => [
      l.contact_id as string,
      { relationship: l.relationship as Relationship, isPrimary: l.is_primary as boolean },
    ])
  );

  return {
    entry: typedEntry,
    property: (property as PropertyLike) ?? null,
    contacts: contacts.map((c) => ({
      ...c,
      relationship: linkMeta.get(c.id)?.relationship ?? "unknown",
      isPrimary: linkMeta.get(c.id)?.isPrimary ?? false,
    })),
    tasks: (tasks.data ?? []) as Task[],
    activities: (activities.data ?? []) as Activity[],
    history: (history.data ?? []) as StageHistoryRow[],
  };
}

async function loadContacts(
  client: SupabaseClient,
  ids: string[]
): Promise<Omit<ContactWithChannels, "relationship" | "isPrimary">[]> {
  const [contacts, phones, emails] = await Promise.all([
    client.from("contacts").select("*").in("id", ids),
    client.from("contact_phones").select("*").in("contact_id", ids),
    client.from("contact_emails").select("*").in("contact_id", ids),
  ]);

  const byContact = <T extends { contact_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.contact_id) ?? [];
      list.push(r);
      map.set(r.contact_id, list);
    }
    return map;
  };

  const phoneMap = byContact(phones.data as ContactPhone[] | null);
  const emailMap = byContact(emails.data as ContactEmail[] | null);

  return (contacts.data ?? []).map((c) => ({
    id: c.id as string,
    first_name: c.first_name as string | null,
    last_name: c.last_name as string | null,
    company: c.company as string | null,
    mailing_address_line1: c.mailing_address_line1 as string | null,
    mailing_city: c.mailing_city as string | null,
    mailing_state: c.mailing_state as string | null,
    mailing_zip: c.mailing_zip as string | null,
    notes: c.notes as string | null,
    phones: phoneMap.get(c.id as string) ?? [],
    emails: emailMap.get(c.id as string) ?? [],
  }));
}

export interface LogActivityInput {
  pipeline_entry_id: string;
  contact_id?: string | null;
  type: ActivityType;
  direction?: "inbound" | "outbound" | "na";
  outcome?: string | null;
  body?: string | null;
}

/**
 * Record a touch.
 *
 * Attributed by user, always — this is what stops two people dialling the same
 * seller on the same afternoon. Ownership is checked through the entry, since
 * activities carry no owner columns of their own.
 */
export async function logActivity(
  input: LogActivityInput,
  ctx: RequestContext,
  userId: string
): Promise<Activity> {
  const client = db();

  const { data: entry } = await client
    .from("pipeline_entries")
    .select("id")
    .eq("id", input.pipeline_entry_id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  if (!entry) throw new Error("Pipeline entry not found");

  const { data, error } = await client
    .from("activities")
    .insert({
      pipeline_entry_id: input.pipeline_entry_id,
      contact_id: input.contact_id ?? null,
      user_id: userId,
      type: input.type,
      direction: input.direction ?? "outbound",
      outcome: input.outcome ?? null,
      body: input.body ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to log activity: ${error.message}`);
  return data as Activity;
}

export interface CreateTaskInput {
  pipeline_entry_id: string;
  title: string;
  due_date: string;
  assigned_to?: string | null;
}

/**
 * A task somebody typed. `auto_generated` stays false, which is what keeps the
 * cadence from skipping it when the lead leaves the funnel — someone put it
 * there on purpose.
 */
export async function createTask(
  input: CreateTaskInput,
  ctx: RequestContext,
  userId: string
): Promise<Task> {
  const client = db();

  const { data: entry } = await client
    .from("pipeline_entries")
    .select("id")
    .eq("id", input.pipeline_entry_id)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .maybeSingle();

  if (!entry) throw new Error("Pipeline entry not found");

  const { data, error } = await client
    .from("tasks")
    .insert({
      pipeline_entry_id: input.pipeline_entry_id,
      assigned_to: input.assigned_to ?? userId,
      title: input.title,
      due_date: input.due_date,
      auto_generated: false,
      cadence_step: null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data as Task;
}
