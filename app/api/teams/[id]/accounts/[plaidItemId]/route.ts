import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function db() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Params = { params: Promise<{ id: string; plaidItemId: string }> };

const ADMIN_ROLES = ["org_owner", "org_admin"] as const;

function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

// DELETE /api/teams/[id]/accounts/[plaidItemId] — unshare a plaid account from the team
export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, plaidItemId } = await params;

  // Fetch the shared account row to check ownership
  const { data: sharedAccount } = await db()
    .from("team_shared_accounts")
    .select("owner_user_id")
    .eq("team_id", id)
    .eq("plaid_item_id", plaidItemId)
    .maybeSingle();

  if (!sharedAccount) {
    return NextResponse.json({ error: "Shared account not found" }, { status: 404 });
  }

  const isOwner = sharedAccount.owner_user_id === user.id;

  if (!isOwner) {
    // Check if caller is an admin
    const { data: membership } = await db()
      .from("team_members")
      .select("role")
      .eq("team_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership || !isAdminRole(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { error } = await db()
    .from("team_shared_accounts")
    .delete()
    .eq("team_id", id)
    .eq("plaid_item_id", plaidItemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
