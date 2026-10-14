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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { debt_id, context_type, context_id } = await request.json();
  if (!debt_id) return NextResponse.json({ error: "Missing debt_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await db()
    .from("debts")
    .delete()
    .eq("id", debt_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
