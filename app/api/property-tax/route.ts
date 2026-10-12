import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCountyTaxRates, resolveZipToCounty, isValidZip } from "@/lib/census/propertyTax";

/**
 * Property tax rate for a ZIP.
 *
 * Resolves the ZIP to its county via the Census Geocoder, then returns that
 * county's effective rate from ACS — county because millage is levied there, and
 * because it matches the figure the public tax calculators publish.
 *
 * Also returns every county in the resolved state so the caller can offer an
 * override without a second round trip. A ZIP can straddle counties, so the
 * resolved one is a starting point, not a verdict.
 *
 * 204 when no key is configured or nothing resolves — the caller falls back to
 * manual entry rather than surfacing an error.
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
    const resolved = await resolveZipToCounty(zip);
    if (!resolved) return new NextResponse(null, { status: 204 });

    const counties = await fetchCountyTaxRates(resolved.stateFips, apiKey);
    const match = counties.find((c) => c.fips === resolved.fips);
    if (!match) return new NextResponse(null, { status: 204 });

    return NextResponse.json({
      zip: zip.trim(),
      resolved: match,
      counties,
      source: "U.S. Census Bureau, ACS 5-Year Estimates",
      vintage: "2023",
    });
  } catch {
    // Reference data — a lookup failure should never block manual entry.
    return new NextResponse(null, { status: 204 });
  }
}
