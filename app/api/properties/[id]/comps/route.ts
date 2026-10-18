import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getProperty } from "@/lib/property/propertyService";
import { listComps, addManualComp } from "@/lib/comps/compService";
import { calculateArv } from "@/lib/comps/arv";
import { type CompStatus, type ManualCompInput } from "@/lib/comps/types";

/**
 * A property's comps, and the ARV they produce.
 *
 * The ARV is computed on read rather than stored on the row. It depends on
 * which comps are ticked, and a stored copy would be wrong the moment someone
 * unticks one. The `valuations` table holds an ARV only once it has been
 * committed as the property's figure, which is a separate, deliberate act.
 */

const statusFor = (value: unknown): CompStatus =>
  value === "active" || value === "removed" ? value : "sold";

/**
 * A date column will take almost anything and store something surprising, so
 * only a plain YYYY-MM-DD gets through. Anything else becomes null rather than
 * a 400 — a mistyped date should not lose the comp.
 */
function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const trimmed = value.trim();
  return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;

  try {
    const property = await getProperty(id, ctx);
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const comps = await listComps(id, ctx);
    return NextResponse.json({
      comps,
      arv: calculateArv(comps, property.sqft ?? null),
      subjectSqft: property.sqft ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load comps";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Add a comp by hand — an agent's closed sale, which RentCast cannot confirm. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  const ctx = await resolveContext(
    typeof payload.context_type === "string" ? payload.context_type : undefined,
    typeof payload.context_id === "string" ? payload.context_id : undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Validated at the boundary, naming the field rather than the value.
  const address = typeof payload.formattedAddress === "string" ? payload.formattedAddress.trim() : "";
  if (!address) {
    return NextResponse.json({ error: "formattedAddress is required" }, { status: 400 });
  }

  const price = numberOrNull(payload.price);
  if (price === null || price <= 0) {
    return NextResponse.json({ error: "price must be a number above zero" }, { status: 400 });
  }

  const input: ManualCompInput = {
    formattedAddress: address,
    price,
    sqft: numberOrNull(payload.sqft),
    beds: numberOrNull(payload.beds),
    baths: numberOrNull(payload.baths),
    yearBuilt: numberOrNull(payload.yearBuilt),
    status: statusFor(payload.status),
    saleDate: isoDateOrNull(payload.saleDate),
    notes: typeof payload.notes === "string" && payload.notes.trim() ? payload.notes.trim() : null,
  };

  const { id } = await params;

  try {
    const property = await getProperty(id, ctx);
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const comp = await addManualComp(id, input, ctx, user.id);
    const comps = await listComps(id, ctx);

    return NextResponse.json(
      { comp, comps, arv: calculateArv(comps, property.sqft ?? null) },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add the comp";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
