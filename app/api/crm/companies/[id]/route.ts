import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getCompany, addHouseToPortfolio } from "@/lib/crm/companyService";

/** One company and the houses in its portfolio. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const detail = await getCompany(ctx, id);
    if (!detail) {
      return NextResponse.json({ error: "That company isn't here." }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load the company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Put a house you've already added into this company's portfolio. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request wasn't readable." }, { status: 400 });
  }

  const propertyId = (body as { propertyId?: unknown })?.propertyId;
  if (typeof propertyId !== "string" || propertyId.length === 0) {
    return NextResponse.json({ error: "Which house?" }, { status: 400 });
  }

  try {
    await addHouseToPortfolio(ctx, id, propertyId);
    const detail = await getCompany(ctx, id);
    return NextResponse.json({ detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add the house";
    const notFound = message === "Company not found" || message === "House not found";
    return NextResponse.json({ error: message }, { status: notFound ? 404 : 500 });
  }
}
