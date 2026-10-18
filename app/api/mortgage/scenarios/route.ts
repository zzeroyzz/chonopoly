import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { listScenarios, saveScenario } from "@/lib/mortgage/scenarioService";
import { getProperty } from "@/lib/property/propertyService";
import { type MortgageInputs } from "@/lib/mortgage/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const ctx = await resolveContext(params.get("context_type"), params.get("context_id"), user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // property_id scopes the list to one house, which is what the property
    // page's Numbers tab asks for.
    const propertyId = params.get("property_id") ?? undefined;
    return NextResponse.json({ scenarios: await listScenarios(ctx, { propertyId }) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list scenarios";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    label?: string;
    inputs?: MortgageInputs;
    monthly_payment?: number;
    /** The house this analysis belongs to. Omit for quick math with no house. */
    property_id?: string | null;
    /** Accepted only to be refused — see below. */
    address?: unknown;
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

  // Validated here so a bad value comes back as a 400 naming the field, rather
  // than a 500 carrying Postgres text from the CHECK constraint.
  if (!body.label?.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  if (!body.inputs || typeof body.inputs !== "object") {
    return NextResponse.json({ error: "inputs is required" }, { status: 400 });
  }
  if (typeof body.monthly_payment !== "number" || !Number.isFinite(body.monthly_payment)) {
    return NextResponse.json({ error: "monthly_payment must be a number" }, { status: 400 });
  }
  // Saving an analysis cannot create a house, so an address has nothing to do
  // here. Refused loudly rather than ignored: a caller still sending one is
  // working from the old contract, where this call could make a property and
  // a second spelling of one address made a second house. Add is the only door.
  if (body.address !== undefined && body.address !== null) {
    return NextResponse.json(
      { error: "Send property_id. Houses are created from Add, not from a save." },
      { status: 400 }
    );
  }

  // The house has to be one of the caller's, or a bound save would be a way to
  // write an analysis onto someone else's property.
  if (body.property_id) {
    const property = await getProperty(body.property_id, ctx);
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
  }

  try {
    const result = await saveScenario(
      {
        label: body.label,
        inputs: body.inputs,
        monthlyPayment: body.monthly_payment,
        // Null means quick math with no house yet, which lands under
        // "Unassigned" and can be pointed at a house later.
        propertyId: body.property_id ?? null,
      },
      ctx,
      user.id
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save scenario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
