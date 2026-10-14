import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function db() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Params = { params: Promise<{ id: string }> };

// GET /api/teams/[id]/accounts — list shared accounts for a team; caller must be a member
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify caller is a member
  const { data: membership } = await db()
    .from("team_members")
    .select("role")
    .eq("team_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch shared accounts and join with plaid_items for institution_name
  const { data: rows, error } = await db()
    .from("team_shared_accounts")
    .select("id, plaid_item_id, owner_user_id, shared_at, plaid_items(institution_name)")
    .eq("team_id", id)
    .order("shared_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type PlaidItemsJoin = { institution_name: string | null } | { institution_name: string | null }[] | null;

  const accounts = (rows ?? []).map((row) => {
    const join = row.plaid_items as PlaidItemsJoin;
    const institution_name = Array.isArray(join)
      ? (join[0]?.institution_name ?? null)
      : (join?.institution_name ?? null);

    return {
      id: row.id,
      plaid_item_id: row.plaid_item_id,
      owner_user_id: row.owner_user_id,
      shared_at: row.shared_at,
      institution_name,
    };
  });

  return NextResponse.json({ accounts });
}

// POST /api/teams/[id]/accounts — share a plaid account with the team
export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify caller is a member
  const { data: membership } = await db()
    .from("team_members")
    .select("role")
    .eq("team_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await request.json();
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { plaid_item_id } = body as Record<string, unknown>;
  if (typeof plaid_item_id !== "string" || !plaid_item_id.trim()) {
    return NextResponse.json({ error: "Missing required field: plaid_item_id" }, { status: 400 });
  }

  // Verify caller owns the plaid_items row (match on item_id text field)
  const { data: plaidItem } = await db()
    .from("plaid_items")
    .select("id")
    .eq("item_id", plaid_item_id.trim())
    .eq("user_id", user.id)
    .maybeSingle();

  if (!plaidItem) {
    return NextResponse.json(
      { error: "Plaid account not found or not owned by caller" },
      { status: 403 }
    );
  }

  const { error: insertError } = await db().from("team_shared_accounts").insert({
    team_id: id,
    plaid_item_id: plaid_item_id.trim(),
    owner_user_id: user.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
