import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { attachToProperty } from "@/lib/mortgage/scenarioService";

/**
 * Point an unassigned save at a house that already exists.
 *
 * Everything saved before the property spine has a null `property_id` and a
 * free-text name. This is how those join the spine without retyping the numbers.
 *
 * Takes `property_id`, never an address. This endpoint used to run typed text
 * through `upsertProperty`, which made it a second way to create a property —
 * and a spelling that normalised differently created a house rather than
 * matching the one on file. Add is the only door now, so an address sent here
 * is refused rather than quietly ignored.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    property_id?: string;
    address_line1?: string;
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

  // Loud, not ignored: a caller still sending an address is working from the
  // old contract and needs to know the house must exist first.
  if (body.address_line1 !== undefined) {
    return NextResponse.json(
      { error: "Send property_id. Houses are created from Add, not from here." },
      { status: 400 }
    );
  }

  if (!body.property_id?.trim()) {
    return NextResponse.json({ error: "property_id is required" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await attachToProperty(id, body.property_id, ctx);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to attach the house";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
