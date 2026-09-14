import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPropertyTaxRate, isValidZip } from "@/lib/census/propertyTax";

/**
 * Effective property tax rate for a ZIP, from Census ACS.
 *
 * Shared by the mortgage calculator and (later) Cash Flow Analysis — one client,
 * one route. Returns 204 when no key is configured or the ZIP has no usable
 * data, so the caller degrades to manual entry rather than surfacing an error.
 *
 * Needs CENSUS_API_KEY in .env.local (free: api.census.gov/data/key_signup.html).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const zip = new URL(request.url).searchParams.get("zip") ?? "";
  if (!isValidZip(zip)) {
    return NextResponse.json({ error: "A five digit ZIP is required" }, { status: 400 });
  }

  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) return new NextResponse(null, { status: 204 });

  try {
    const estimate = await fetchPropertyTaxRate(zip, apiKey);
    if (!estimate) return new NextResponse(null, { status: 204 });
    return NextResponse.json(estimate);
  } catch {
    // Reference data — a lookup failure should never block manual entry.
    return new NextResponse(null, { status: 204 });
  }
}
