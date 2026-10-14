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

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveContext(undefined, undefined, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: items } = await getPlaidItems(user.id);

  if (items?.length) {
    type CachedItem = typeof items[0] & { balances_refreshed_at: string | null };
    const typed = items as CachedItem[];

    // Throttle guard — if all items were refreshed within the last 30 seconds, reject.
    const now = Date.now();
    const allRecent = typed.every(i => {
      if (!i.balances_refreshed_at) return false;
      return now - new Date(i.balances_refreshed_at).getTime() < 30_000;
    });
    if (allRecent) {
      const latest = typed
        .map(i => i.balances_refreshed_at!)
        .sort()
        .reverse()[0];
      return NextResponse.json({ error: "refreshed_recently", refreshed_at: latest }, { status: 429 });
    }
  }

  // User-triggered refresh — await all items.
  const [{ assets }, debts] = await Promise.all([
    getAssetSummary(user.id, ctx),
    getDebtSummary(user.id, ctx),
  ]);

  let liquid_assets = 0;
  let liquid_accounts: LiquidAccount[] = [];

  if (items?.length) {
    const result = await refreshLiquidBalances(user.id, items, db());
    liquid_assets   = result.total;
    liquid_accounts = result.accounts;
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
    refreshed_at: new Date().toISOString(),
    source: "live",
  });
}
