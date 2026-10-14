import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { createClient } from "@/lib/supabase/server";
import { getPlaidItems } from "@/lib/supabase/plaid";
import { log } from "@/lib/logger";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: items, error: itemsError } = await getPlaidItems(user.id);
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  if (!items.length) return NextResponse.json({ accounts: [] });

  const accountResults = await Promise.all(
    items.map(item =>
      plaidClient.accountsGet({ access_token: item.access_token })
        .then(r => r.data.accounts.map(a => ({
          plaid_account_id: a.account_id,
          plaid_item_id:    item.item_id,
          account_name:     a.name,
          institution_name: item.institution_name,
          account_subtype:  a.subtype ?? null,
          current_balance:  a.balances.current ?? 0,
        })))
        .catch((err) => {
          log('error', 'Plaid accountsGet failed in accounts route', {
            route: '/api/plaid/accounts',
            itemId: item.item_id,
            institution: item.institution_name,
            error: (err as { response?: { data?: unknown } })?.response?.data ?? err,
          });
          return [];
        })
    )
  );

  return NextResponse.json({ accounts: accountResults.flat() });
}
