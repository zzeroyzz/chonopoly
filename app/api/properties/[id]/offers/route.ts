import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { listOffers, saveOffer, OFFER_STATUSES, type OfferStatus } from "@/lib/offers/offerService";

/** Offers on one house. History, not a single current figure. */

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = new URL(request.url).searchParams;
  const ctx = await resolveContext(
    search.get("context_type") ?? undefined,
    search.get("context_id") ?? undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    // `available: false` means the table is not there yet, which the UI
    // reports as "run the migration" rather than as a failure.
    return NextResponse.json(await listOffers(id, ctx));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load offers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    amount?: unknown;
    offered_on?: unknown;
    status?: unknown;
    note?: unknown;
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

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "An offer needs an amount" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "drafted";
  if (!(OFFER_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `"${status}" is not an offer status` }, { status: 400 });
  }

  const { id } = await params;
  try {
    const offer = await saveOffer(
      id,
      {
        amount,
        offeredOn: typeof body.offered_on === "string" ? body.offered_on : undefined,
        status: status as OfferStatus,
        note: typeof body.note === "string" ? body.note : null,
      },
      ctx,
      user.id
    );
    return NextResponse.json({ offer });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save the offer";
    const status2 = message.includes("migration") ? 409 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status: status2 });
  }
}
