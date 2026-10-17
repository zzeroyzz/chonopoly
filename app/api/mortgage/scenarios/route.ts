import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { listScenarios, saveScenario } from "@/lib/mortgage/scenarioService";
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
    address?: {
      address_line1?: string;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
      parcel_number?: string | null;
    } | null;
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
  // An address object with no street line is a mistake, not "no house" — the
  // latter is omitting the field entirely.
  if (body.address && !body.address.address_line1?.trim()) {
    return NextResponse.json({ error: "address_line1 is required" }, { status: 400 });
  }

  try {
    const result = await saveScenario(
      {
        label: body.label,
        inputs: body.inputs,
        monthlyPayment: body.monthly_payment,
        // Omitted entirely means quick math with no house yet; an address with
        // a street line routes through upsertProperty.
        address: body.address?.address_line1
          ? {
              addressLine1: body.address.address_line1,
              city: body.address.city,
              state: body.address.state,
              zip: body.address.zip,
              parcelNumber: body.address.parcel_number,
            }
          : null,
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
