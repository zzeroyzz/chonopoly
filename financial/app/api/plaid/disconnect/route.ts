import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createClient } from "@/lib/supabase/server";
import { deletePlaidItem, getPlaidItems } from "@/lib/supabase/plaid";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { item_id } = await request.json();
  if (!item_id) return NextResponse.json({ error: "Missing item_id" }, { status: 400 });

  const { data: items } = await getPlaidItems(user.id);
  const item = items.find((i) => i.item_id === item_id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await plaidClient.itemRemove({ access_token: item.access_token }).catch(() => {});
  const error = await deletePlaidItem(user.id, item_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
