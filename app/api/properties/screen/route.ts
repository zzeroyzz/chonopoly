import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { loadScreenRows } from "@/lib/screen/screenService";

/**
 * Every house with its numbers and both verdicts.
 *
 * Computed on read rather than stored. The verdicts depend on the buyer
 * profile, which changes, and a stored verdict would be stale the moment
 * someone's income or cash position moved — silently, which is the worst way
 * for a verdict to be wrong.
 */
export async function GET(request: Request) {
  try {
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

    return NextResponse.json({ rows: await loadScreenRows(ctx, user.id) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load the screen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
