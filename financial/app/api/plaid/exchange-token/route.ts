import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createClient } from "@/lib/supabase/server";
import { savePlaidItem } from "@/lib/supabase/plaid";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { public_token, institution_name } = await request.json();
  if (!public_token) return NextResponse.json({ error: "Missing public_token" }, { status: 400 });

  const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
  const { access_token, item_id } = exchange.data;

  const error = await savePlaidItem(user.id, access_token, item_id, institution_name ?? null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
