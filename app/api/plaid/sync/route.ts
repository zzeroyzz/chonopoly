import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlaidItems } from "@/lib/supabase/plaid";
import { syncPlaidItem } from "@/lib/plaid-sync";
import { log } from "@/lib/logger";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: items } = await getPlaidItems(user.id);
  if (!items.length) return NextResponse.json({ added: 0, modified: 0, removed: 0 });

  let added = 0;
  let modified = 0;
  let removed = 0;

  for (const item of items) {
    try {
      const result = await syncPlaidItem(user.id, item.item_id, item.access_token);
      added += result.added;
      modified += result.modified;
      removed += result.removed;
    } catch (err) {
      log("error", "sync failed for item", { itemId: item.item_id, error: err });
    }
  }

  return NextResponse.json({ added, modified, removed });
}
