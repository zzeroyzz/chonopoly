import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getUsageThisMonth } from "@/lib/comps/compService";
import {
  hasApiKey,
  FREE_PLAN_MONTHLY_REQUESTS,
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
    const usage = await getUsageThisMonth(ctx, FREE_PLAN_MONTHLY_REQUESTS);

    return NextResponse.json({
      connected: hasApiKey(),
      usage,
      warningFraction: QUOTA_WARNING_FRACTION,
      nearLimit: usage.fraction >= QUOTA_WARNING_FRACTION,
      atLimit: usage.used >= usage.limit,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read RentCast usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
