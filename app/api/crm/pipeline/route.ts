import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { createEntry, listPipeline, stageCounts } from "@/lib/crm/pipelineService";
import { sortPipeline } from "@/lib/crm/sort";
import { upsertProperty } from "@/lib/property/propertyService";

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
 * Add a lead by hand.
 *
 * Two steps, deliberately: find-or-create the property, then put it on the
 * pipeline. The property is shared — a cash flow analysis may already have made
 * one at this address — so this goes through `upsertProperty` and inherits its
 * dedupe rules rather than inventing a second set. `matchedOn` comes back so the
 * caller can say a merge happened instead of silently reusing a row.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    address_line1?: string;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    parcel_number?: string | null;
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

  if (!body.address_line1?.trim()) {
    return NextResponse.json({ error: "address_line1 required" }, { status: 400 });
  }

  try {
    const { property, matchedOn } = await upsertProperty(
      {
        address_line1: body.address_line1.trim(),
        city: body.city ?? null,
        state: body.state ?? "GA",
        zip: body.zip ?? null,
        parcel_number: body.parcel_number ?? null,
      },
      ctx,
      user.id,
      "crm"
    );

    const entry = await createEntry({ property_id: property.id, source: "manual" }, ctx, user.id);
    return NextResponse.json({ entry, property, matchedOn });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add the lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
