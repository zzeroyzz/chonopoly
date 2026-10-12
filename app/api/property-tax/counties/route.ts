import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCountyTaxRates } from "@/lib/census/propertyTax";

/**
 * Effective property tax rate for every county in a state, from Census ACS.
 *
 * County rather than ZIP: millage is levied by county, a ZIP can straddle two,
 * and this matches the "average county tax rate" the public calculators show.
 *
 * Returns 204 when no key is configured so the caller degrades to manual entry.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Default to Georgia — the owner's market. Two-digit state FIPS.
  const state = new URL(request.url).searchParams.get("state") ?? "13";
  if (!/^\d{2}$/.test(state)) {
    return NextResponse.json({ error: "A two digit state FIPS is required" }, { status: 400 });
  }

  const apiKey = process.env.CENSUS_API_KEY;
  if (!apiKey) return new NextResponse(null, { status: 204 });

  try {
    const counties = await fetchCountyTaxRates(state, apiKey);
    if (counties.length === 0) return new NextResponse(null, { status: 204 });

    return NextResponse.json({
      source: "U.S. Census Bureau, ACS 5-Year Estimates",
      vintage: "2023",
      counties,
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
