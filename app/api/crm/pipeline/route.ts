import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { createEntry, listPipeline, stageCounts } from "@/lib/crm/pipelineService";
import { sortPipeline } from "@/lib/crm/sort";
import { getProperty } from "@/lib/property/propertyService";

/**
 * The pipeline list.
 *
 * Sorted server-side so the order is the same everywhere it's read — the list,
 * the dashboard, and anything later that needs "what's at the top".
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ctx = await resolveContext(
    searchParams.get("context_type") ?? undefined,
    searchParams.get("context_id") ?? undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const includeTerminal = searchParams.get("include_terminal") === "1";

  try {
    const rows = await listPipeline(ctx, { includeTerminal });
    const counts = await stageCounts(ctx);
    return NextResponse.json({ rows: sortPipeline(rows), counts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load pipeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Put an existing house on the pipeline.
 *
 * Named by id, never by address. This used to take an address and run it
 * through `upsertProperty`, which made the pipeline a second door through
 * which a property could be created — the one thing Add is meant to be alone
 * in doing. The hand-entry form that called it that way is gone; the Activity
 * tab's "Add to pipeline" is what calls it now, for a house that already
 * exists and simply is not being tracked yet.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    /** A house that already exists. Adding to the pipeline never creates one. */
    property_id?: string;
    context_type?: string;
    context_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext(body.context_type, body.context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!body.property_id?.trim()) {
    return NextResponse.json({ error: "property_id is required" }, { status: 400 });
  }

  // The house has to be one of the caller's. This used to take an address and
  // run it through upsertProperty, which made the pipeline a second door
  // through which a property could be created — the one thing Add is supposed
  // to be alone in doing.
  const property = await getProperty(body.property_id, ctx);
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  try {
    const entry = await createEntry({ property_id: property.id, source: "manual" }, ctx, user.id);
    return NextResponse.json({ entry, property });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add it to the pipeline";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
