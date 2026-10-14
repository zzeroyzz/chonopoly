import { plaidClient } from "@/lib/plaid";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { invalidateBudgetCache } from "@/lib/budget/budgetService";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function syncPlaidItem(
  userId: string,
  itemId: string,
  accessToken: string
): Promise<{ added: number; modified: number; removed: number }> {
  const db = serviceDb();

  // Read cursor for incremental sync; null = first sync (Plaid returns full history)
  const { data: itemRow } = await db
    .from("plaid_items")
    .select("transactions_cursor")
    .eq("item_id", itemId)
    .eq("user_id", userId)
    .single();

  let cursor: string | null = itemRow?.transactions_cursor ?? null;
  let hasMore = true;
  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      count: 500,
      options: {
        include_personal_finance_category: true,
      },
    });

    const { added, modified, removed, next_cursor, has_more } = res.data;

    if (added.length > 0) {
      const rows = added.map(tx => ({
        user_id:                userId,
        plaid_transaction_id:   tx.transaction_id,
        plaid_account_id:       tx.account_id,
        plaid_item_id:          itemId,
        merchant_name:          tx.merchant_name ?? tx.name ?? null,
        name:                   tx.name ?? null,
        amount:                 tx.amount,
        date:                   tx.date,
        pending:                tx.pending ?? false,
        pending_transaction_id: tx.pending_transaction_id ?? null,
        category_primary:       tx.personal_finance_category?.primary ?? null,
        category_detailed:      tx.personal_finance_category?.detailed ?? null,
        currency_code:          tx.iso_currency_code ?? null,
        synced_at:              new Date().toISOString(),
      }));
      const { error } = await db
        .from("plaid_transactions")
        .upsert(rows, { onConflict: "user_id,plaid_transaction_id" });
      if (error) console.error("[sync] upsert error (added) for item", itemId, error.message);
      else totalAdded += added.length;
    }

    if (modified.length > 0) {
      const rows = modified.map(tx => ({
        user_id:                userId,
        plaid_transaction_id:   tx.transaction_id,
        plaid_account_id:       tx.account_id,
        plaid_item_id:          itemId,
        merchant_name:          tx.merchant_name ?? tx.name ?? null,
        name:                   tx.name ?? null,
        amount:                 tx.amount,
        date:                   tx.date,
        pending:                tx.pending ?? false,
        pending_transaction_id: tx.pending_transaction_id ?? null,
        category_primary:       tx.personal_finance_category?.primary ?? null,
        category_detailed:      tx.personal_finance_category?.detailed ?? null,
        currency_code:          tx.iso_currency_code ?? null,
        synced_at:              new Date().toISOString(),
      }));
      const { error } = await db
        .from("plaid_transactions")
        .upsert(rows, { onConflict: "user_id,plaid_transaction_id" });
      if (error) console.error("[sync] upsert error (modified) for item", itemId, error.message);
      else totalModified += modified.length;
    }

    if (removed.length > 0) {
      const removedIds = removed.map(tx => tx.transaction_id);
      const { error } = await db
        .from("plaid_transactions")
        .delete()
        .eq("user_id", userId)
        .eq("plaid_item_id", itemId)
        .in("plaid_transaction_id", removedIds);
      if (error) console.error("[sync] delete error (removed) for item", itemId, error.message);
      else totalRemoved += removed.length;
    }

    cursor = next_cursor;
    hasMore = has_more;
  }

  await db
    .from("plaid_items")
    .update({ transactions_cursor: cursor, last_synced_at: new Date().toISOString() })
    .eq("item_id", itemId)
    .eq("user_id", userId);

  invalidateBudgetCache({ type: "personal", id: userId });

  // Auto-detect recurring bills: merchants that appear 2+ times at ~monthly intervals
  const sixtyDaysAgo = daysAgo(60);
  const { data: txs } = await db
    .from("plaid_transactions")
    .select("merchant_name, amount, date")
    .eq("user_id", userId)
    .gte("date", sixtyDaysAgo)
    .gt("amount", 0)
    .not("merchant_name", "is", null);

  const merchantMap: Record<string, { dates: string[]; amounts: number[] }> = {};
  for (const tx of txs ?? []) {
    if (!tx.merchant_name) continue;
    if (!merchantMap[tx.merchant_name]) merchantMap[tx.merchant_name] = { dates: [], amounts: [] };
    merchantMap[tx.merchant_name].dates.push(tx.date as string);
    merchantMap[tx.merchant_name].amounts.push(tx.amount as number);
  }

  for (const [merchant, { dates, amounts }] of Object.entries(merchantMap)) {
    if (dates.length < 2) continue;
    const sorted = [...dates].sort();
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1]);
      const d2 = new Date(sorted[i]);
      gaps.push((d2.getTime() - d1.getTime()) / 86400000);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < 20 || avgGap > 45) continue;

    const { data: existing } = await db
      .from("bills")
      .select("id")
      .eq("owner_id", userId)
      .eq("plaid_merchant", merchant)
      .eq("is_active", true)
      .maybeSingle();
    if (existing) continue;

    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const dueDay = new Date(sorted[sorted.length - 1]).getDate();
    await db.from("bills").insert({
      owner_id: userId,
      owner_type: "personal",
      name: merchant,
      amount: Math.round(avgAmount * 100) / 100,
      due_day: dueDay,
      recurrence: "monthly",
      is_auto_detected: true,
      plaid_merchant: merchant,
    });
  }

  return { added: totalAdded, modified: totalModified, removed: totalRemoved };
}
