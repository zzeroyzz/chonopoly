import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Freddie Mac Primary Mortgage Market Survey, via the FRED API.
 * Weekly series, released Thursdays.
 *
 * Reference only — nothing here fills the calculator's rate field. The user
 * reads these and types what they want.
 *
 * Needs FRED_API_KEY in .env.local (free: fred.stlouisfed.org/docs/api/api_key.html).
 * Without it this returns 204 and the widget renders nothing.
 */
const SERIES = [
  { id: "MORTGAGE30US", label: "30-year fixed" },
  { id: "MORTGAGE15US", label: "15-year fixed" },
] as const;

interface FredObservation {
  date: string;
  value: string;
}

async function latestObservation(seriesId: string, apiKey: string) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) return null;

  const json = (await res.json()) as { observations?: FredObservation[] };
  const obs = json.observations?.[0];
  if (!obs || obs.value === ".") return null;

  const rate = Number(obs.value);
  if (!Number.isFinite(rate)) return null;

  return { rate, observedAt: obs.date };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return new NextResponse(null, { status: 204 });

  try {
    const results = await Promise.all(
      SERIES.map(async (s) => {
        const obs = await latestObservation(s.id, apiKey);
        return obs ? { seriesId: s.id, label: s.label, ...obs } : null;
      })
    );

    const rates = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (rates.length === 0) return new NextResponse(null, { status: 204 });

    return NextResponse.json({
      source: "Freddie Mac Primary Mortgage Market Survey (via FRED)",
      rates,
    });
  } catch {
    // Reference data — a failure here should never surface as an error.
    return new NextResponse(null, { status: 204 });
  }
}
