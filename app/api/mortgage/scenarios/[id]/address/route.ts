import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { attachAddress } from "@/lib/mortgage/scenarioService";

/**
 * Attach a house to a save that never had one.
 *
 * Everything saved before the property spine has a null `property_id` and a
 * free-text name. This is how those join the spine without retyping the numbers.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "address_line1 is required" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await attachAddress(
      id,
      {
        addressLine1: body.address_line1,
        city: body.city,
        state: body.state,
        zip: body.zip,
        parcelNumber: body.parcel_number,
      },
      ctx,
      user.id
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to attach the address";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 500 });
  }
}
