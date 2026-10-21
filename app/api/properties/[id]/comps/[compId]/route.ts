import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getProperty } from "@/lib/property/propertyService";
import { listComps, setCompReview, deleteComp } from "@/lib/comps/compService";
import { calculateArv, subjectOptions } from "@/lib/comps/arv";
import { type CompReview, COMP_REVIEW_ORDER } from "@/lib/comps/types";

/**
 * Review or remove one comp.
 *
 * Both verbs return the recomputed ARV, so the comps list never has to make a
 * second request to find out what the change did to the number.
 */

function isCompReview(value: unknown): value is CompReview {
  return typeof value === "string" && (COMP_REVIEW_ORDER as string[]).includes(value);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Only a plain YYYY-MM-DD reaches a date column. */
function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const trimmed = value.trim();
  return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed;
}

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

  return { ctx, property, userId: user.id };
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
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const review = (body as { review?: unknown }).review;
  if (!isCompReview(review)) {
    return NextResponse.json(
      { error: `review must be one of: ${COMP_REVIEW_ORDER.join(", ")}` },
      { status: 400 }
    );
  }

  // A removed listing approved as sold needs the figure it sold for. The
  // database CHECK enforces it too; this says which field and why.
  const salePrice = numberOrNull((body as { salePrice?: unknown }).salePrice);
  const saleDate = isoDateOrNull((body as { saleDate?: unknown }).saleDate);

  // Absent means "leave them alone"; a string, including an empty one, means
  // "this is what they say now". Anything else is ignored rather than stored.
  const rawNotes = (body as { reviewNotes?: unknown }).reviewNotes;
  const reviewNotes =
    rawNotes === undefined ? undefined : typeof rawNotes === "string" ? rawNotes.trim() || null : undefined;

  const resolved = await resolve(request, id);
  if ("error" in resolved) return resolved.error;

  const comps = await listComps(id, resolved.ctx);
  const target = comps.find((c) => c.id === compId);
  if (target?.status === "removed" && review === "renovated_use" && salePrice === null) {
    return NextResponse.json(
      { error: "Tell us what it sold for. A removed listing's price is what was asked, not what was paid." },
      { status: 400 }
    );
  }

  try {
    await setCompReview(compId, review, resolved.ctx, resolved.userId, {
      sale: { price: salePrice, date: saleDate },
      notes: reviewNotes,
    });
    const updated = await listComps(id, resolved.ctx);
    return NextResponse.json({
      comps: updated,
      arv: calculateArv(updated, resolved.property.sqft ?? null, subjectOptions(resolved.property)),
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
      arv: calculateArv(comps, resolved.property.sqft ?? null, { subjectBeds: resolved.property.beds ?? null }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to remove the comp";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
