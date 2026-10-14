import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveContext } from "@/lib/context";

function db() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { asset_id, name, icon, asset_type, current_value, linked_debt_id, context_type, context_id } = await request.json();
  if (!asset_id) return NextResponse.json({ error: "Missing asset_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Enforce no double-linking (exclude current asset from the check)
  if (linked_debt_id !== undefined && linked_debt_id !== null) {
    const { data: existing } = await db()
      .from("assets")
      .select("id")
      .eq("linked_debt_id", linked_debt_id)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id)
      .neq("id", asset_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "This debt is already linked to another asset." }, { status: 409 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (name          !== undefined) patch.name          = name;
  if (icon          !== undefined) patch.icon          = icon;
  if (asset_type    !== undefined) patch.asset_type    = asset_type;
  if (current_value !== undefined) patch.current_value = Number(current_value);
  // Allow explicitly setting linked_debt_id to null (unlink) or a new value
  if (linked_debt_id !== undefined) patch.linked_debt_id = linked_debt_id;

  const { error } = await db()
    .from("assets")
    .update(patch)
    .eq("id", asset_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
