import { createClient as createServiceClient } from "@supabase/supabase-js";

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function savePlaidItem(
  userId: string,
  accessToken: string,
  itemId: string,
  institutionName: string | null
) {
  const { error } = await serviceClient()
    .from("plaid_items")
    .upsert(
      { user_id: userId, access_token: accessToken, item_id: itemId, institution_name: institutionName, updated_at: new Date().toISOString() },
      { onConflict: "user_id,item_id" }
    );
  return error;
}

export async function getPlaidItems(userId: string) {
  const { data, error } = await serviceClient()
    .from("plaid_items")
    .select("id, access_token, item_id, institution_name, last_synced_at, transactions_cursor, liquid_balance, liquid_accounts_json, balances_refreshed_at")
    .eq("user_id", userId);
  return { data: data ?? [], error };
}

export async function deletePlaidItem(userId: string, itemId: string) {
  const { error } = await serviceClient()
    .from("plaid_items")
    .delete()
    .eq("user_id", userId)
    .eq("item_id", itemId);
  return error;
}
