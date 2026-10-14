import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveContext } from "@/lib/context";
import { getAssetSummary } from "@/lib/assets/assetService";
import { getDebtSummary } from "@/lib/debts/debtService";
import { getPlaidItems } from "@/lib/supabase/plaid";
import { refreshLiquidBalances, type LiquidAccount } from "@/lib/plaidRefreshBalances";

function db() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const context_type = searchParams.get("context_type") ?? undefined;
  const context_id   = searchParams.get("context_id")   ?? undefined;

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ assets }, debts] = await Promise.all([
    getAssetSummary(user.id, ctx),
    getDebtSummary(user.id, ctx),
  ]);

  let liquid_assets = 0;
  let liquid_accounts: LiquidAccount[] = [];
  let source: "cache" | "stale" = "cache";
  let refreshed_at: string | null = null;

  const { data: items } = await getPlaidItems(user.id);

  if (items?.length) {
    type CachedItem = typeof items[0] & {
      liquid_balance: number | null;
      liquid_accounts_json: LiquidAccount[] | null;
      balances_refreshed_at: string | null;
    };

    const typed = items as CachedItem[];
    const staleItems = typed.filter(i => !i.balances_refreshed_at);

    if (staleItems.length > 0) {
      // First load for these items: await a live refresh so the user sees correct balances.
      source = "stale";
      const result = await refreshLiquidBalances(user.id, staleItems, db());
      liquid_assets  += result.total;
      liquid_accounts = [...liquid_accounts, ...result.accounts];
    }

    // Read from cache for items that already have a populated balances_refreshed_at.
    const cachedItems = typed.filter(i => !!i.balances_refreshed_at);
    for (const item of cachedItems) {
      liquid_assets += item.liquid_balance ?? 0;
      for (const a of item.liquid_accounts_json ?? []) liquid_accounts.push(a);
    }

    // refreshed_at = oldest cached timestamp (signals how stale the data is)
    const timestamps = cachedItems
      .map(i => i.balances_refreshed_at!)
      .sort();
    refreshed_at = timestamps[0] ?? null;
  }

  const manual_assets  = assets.reduce((s, a) => s + a.current_value, 0);
  const total_assets   = liquid_assets + manual_assets;
  const total_debts    = debts.filter(d => d.status === "active").reduce((s, d) => s + d.current_balance, 0);
  const net_worth      = total_assets - total_debts;

  return NextResponse.json({
    liquid_assets,
    manual_assets,
    total_assets,
    total_debts,
    net_worth,
    liquid_accounts,
    assets,
    debts: debts.filter(d => d.status === "active"),
    refreshed_at,
    source,
  });
}
