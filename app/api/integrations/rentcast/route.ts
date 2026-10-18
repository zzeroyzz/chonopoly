import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getUsage } from "@/lib/rentcast/quota";
import {
  hasApiKey,
  rentCastMode,
  MONTHLY_REQUEST_CAP,
  CACHE_WINDOW_DAYS,
  QUOTA_WARNING_FRACTION,
} from "@/lib/rentcast/client";

/**
 * RentCast's status and this month's usage, for Settings → Integrations.
 *
 * Reports whether a key is configured — never the key itself, not even a
 * masked fragment. There is nothing a user can do with four characters of it
 * except leak the rest.
 */
export async function GET(request: Request) {
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

  try {
    const usage = await getUsage(ctx);

    const fraction = usage.cap > 0 ? usage.used / usage.cap : 0;

    return NextResponse.json({
      connected: hasApiKey(),
      // Mock deployments spend nothing, and the screen should say so rather
      // than implying a live integration.
      mode: rentCastMode(),
      usage: {
        used: usage.used,
        // The cap, not the plan limit — it is the number that actually stops
        // calls, so it is the number to show against.
        limit: usage.cap,
        planLimit: usage.planLimit,
        fraction,
        monthStart: usage.monthStart,
      },
      cap: MONTHLY_REQUEST_CAP,
      cacheWindowDays: CACHE_WINDOW_DAYS,
      warningFraction: QUOTA_WARNING_FRACTION,
      nearLimit: fraction >= QUOTA_WARNING_FRACTION,
      atLimit: usage.atCap,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read RentCast usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
