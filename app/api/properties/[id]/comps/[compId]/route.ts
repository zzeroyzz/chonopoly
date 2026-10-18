import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getProperty } from "@/lib/property/propertyService";
import { listComps, setCompIncluded, deleteComp } from "@/lib/comps/compService";
import { calculateArv } from "@/lib/comps/arv";

/**
 * Tick, untick or remove one comp.
 *
 * Both verbs return the recomputed ARV, so the Comps tab never has to make a
 * second request to find out what the change did to the number.
 */

async function resolve(request: Request, propertyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { searchParams } = new URL(request.url);
  const ctx = await resolveContext(
    searchParams.get("context_type") ?? undefined,
    searchParams.get("context_id") ?? undefined,
    user.id
  );
  if (!ctx) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const property = await getProperty(propertyId, ctx);
  if (!property) {
    return { error: NextResponse.json({ error: "Property not found" }, { status: 404 }) };
  }

  return { ctx, property };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; compId: string }> }
) {
  const { id, compId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || typeof (body as { included?: unknown }).included !== "boolean") {
    return NextResponse.json({ error: "included must be a boolean" }, { status: 400 });
  }
  const included = (body as { included: boolean }).included;

  const resolved = await resolve(request, id);
  if ("error" in resolved) return resolved.error;

  try {
    await setCompIncluded(compId, included, resolved.ctx);
    const comps = await listComps(id, resolved.ctx);
    return NextResponse.json({
      comps,
      arv: calculateArv(comps, resolved.property.sqft ?? null),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update the comp";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; compId: string }> }
) {
  const { id, compId } = await params;

  const resolved = await resolve(request, id);
  if ("error" in resolved) return resolved.error;

  try {
    await deleteComp(compId, resolved.ctx);
    const comps = await listComps(id, resolved.ctx);
    return NextResponse.json({
      comps,
      arv: calculateArv(comps, resolved.property.sqft ?? null),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to remove the comp";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
