import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { AssetSummary } from "./types";
import { RequestContext } from "../context";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getAssetSummary(userId: string, ctx: RequestContext): Promise<{
  assets: AssetSummary[];
  claimed_debt_ids: string[];
}> {
  void userId;
  const { data: rows } = await db()
    .from("assets")
    .select("id, name, icon, asset_type, current_value, is_liquid, linked_debt_id, created_at, debts(id, name, current_balance)")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("created_at", { ascending: true });

  if (!rows?.length) return { assets: [], claimed_debt_ids: [] };

  const assets: AssetSummary[] = rows.map(row => {
    const debt = Array.isArray(row.debts) ? row.debts[0] : row.debts;
    const debtBalance = debt ? Number(debt.current_balance) : null;
    return {
      id:                  row.id,
      name:                row.name,
      icon:                row.icon,
      asset_type:          row.asset_type as AssetSummary["asset_type"],
      current_value:       Number(row.current_value),
      is_liquid:           Boolean(row.is_liquid),
      linked_debt_id:      row.linked_debt_id ?? null,
      linked_debt_name:    debt ? debt.name : null,
      linked_debt_balance: debtBalance,
      net_equity:          Number(row.current_value) - (debtBalance ?? 0),
      created_at:          row.created_at,
    };
  });

  const claimed_debt_ids = assets
    .filter(a => a.linked_debt_id !== null)
    .map(a => a.linked_debt_id!);

  return { assets, claimed_debt_ids };
}
