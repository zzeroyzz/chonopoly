import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createClient } from "@/lib/supabase/server";
import { getPlaidItems } from "@/lib/supabase/plaid";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: items, error: itemsError } = await getPlaidItems(user.id);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  if (!items.length) return NextResponse.json({ transactions: [], accounts: [] });

  const url = new URL(request.url, 'http://localhost');
  const rawDays = parseInt(url.searchParams.get('days') ?? '30', 10);
  const days = isNaN(rawDays) || rawDays < 1 ? 30 : Math.min(rawDays, 90);

  const db = serviceDb();

  // Read transactions from local DB — no Plaid call; use POST /api/plaid/sync to populate
  const startDate = daysAgo(days);
  const activeItemIds = items.filter(i => !i.access_token.startsWith('access-sandbox-')).map(i => i.item_id);
  const { data: txRows } = await db
    .from("plaid_transactions")
    .select("plaid_transaction_id, plaid_account_id, merchant_name, amount, date, category_primary, category_detailed, category_override, pending, currency_code")
    .eq("user_id", user.id)
    .in("plaid_item_id", activeItemIds)
    .gte("date", startDate)
    .order("date", { ascending: false });

  const transactions = (txRows ?? []).map(tx => ({
    transaction_id: tx.plaid_transaction_id,
    account_id:     tx.plaid_account_id,
    merchant_name:  tx.merchant_name,
    name:           tx.merchant_name,
    amount:         tx.amount,
    date:           tx.date,
    pending:        tx.pending,
    iso_currency_code: tx.currency_code,
    personal_finance_category: tx.category_primary
      ? { primary: tx.category_primary, detailed: tx.category_detailed ?? tx.category_primary }
      : null,
    category_override: tx.category_override ?? null,
  }));

  const live = url.searchParams.get('live') === 'true';

  // Skip sandbox rows — they fail silently against production API endpoints
  const activeItems = items.filter(i => !i.access_token.startsWith('access-sandbox-'));

  // live=true (manual Refresh) → accountsBalanceGet forces a real-time pull from the institution
  // default → accountsGet returns Plaid-cached balances (fast)
  const accountResults = await Promise.all(
    activeItems.map(item =>
      (live ? plaidClient.accountsBalanceGet({ access_token: item.access_token })
             : plaidClient.accountsGet({ access_token: item.access_token }))
        .then(r => r.data.accounts.map(a => ({
          account_id:       a.account_id,
          item_id:          item.item_id,
          name:             a.name,
          type:             a.type,
          subtype:          a.subtype,
          balances:         a.balances,
          institution_name: item.institution_name,
        })))
        .catch(() => [])
    )
  );
  const accounts = accountResults.flat();

  return NextResponse.json({ accounts, transactions });
}
