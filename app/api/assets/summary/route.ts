import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAssetSummary } from "@/lib/assets/assetService";
import { resolveContext } from "@/lib/context";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const context_type = searchParams.get("context_type") ?? undefined;
  const context_id   = searchParams.get("context_id")   ?? undefined;

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await getAssetSummary(user.id, ctx);
  return NextResponse.json(result);
}
