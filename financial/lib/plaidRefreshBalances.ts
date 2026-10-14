import { SupabaseClient } from "@supabase/supabase-js";
import { plaidClient } from "@/lib/plaid";
import { log } from "@/lib/logger";

type PlaidItem = {
  id: string;
  access_token: string;
  item_id: string;
  institution_name: string | null;
};

export type LiquidAccount = {
  name: string;
  balance: number;
  subtype: string | null;
};

// Coalesces concurrent refresh requests for the same user into one live call.
const inFlightRefresh = new Map<string, Promise<void>>();

// Retries a Plaid call with jittered exponential backoff on RATE_LIMIT_EXCEEDED.
// Max 3 attempts; delays: ~500ms, ~1000ms (each ±25% jitter).
async function withBackoff<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const code = (err as { response?: { data?: { error_code?: string } } })
      ?.response?.data?.error_code;
    if (code === "RATE_LIMIT_EXCEEDED" && attempt < 2) {
      const base = 500 * Math.pow(2, attempt);
      const jitter = base * 0.25 * (Math.random() * 2 - 1);
      await new Promise(r => setTimeout(r, base + jitter));
      return withBackoff(fn, attempt + 1);
    }
    throw err;
  }
}

// Fetches live balances for all items serially (avoids bursting Plaid's rate limit)
// and writes the results to plaid_items cache columns.
// Returns the aggregated liquid balance and account list across all items.
export async function refreshLiquidBalances(
  userId: string,
  items: PlaidItem[],
  db: SupabaseClient
): Promise<{ total: number; accounts: LiquidAccount[] }> {
  if (inFlightRefresh.has(userId)) {
    await inFlightRefresh.get(userId)!;
    // After coalesced refresh completes, re-read from DB
    const { data } = await db
      .from("plaid_items")
      .select("liquid_balance, liquid_accounts_json")
      .eq("user_id", userId);
    let total = 0;
    const accounts: LiquidAccount[] = [];
    for (const row of data ?? []) {
      total += (row.liquid_balance as number) ?? 0;
      for (const a of (row.liquid_accounts_json as LiquidAccount[]) ?? []) accounts.push(a);
    }
    return { total, accounts };
  }

  let resolveWork!: () => void;
  const workPromise = new Promise<void>(r => { resolveWork = r; });
  inFlightRefresh.set(userId, workPromise);

  const allAccounts: LiquidAccount[] = [];
  let allTotal = 0;

  try {
    for (const item of items) {
      try {
        const r = await withBackoff(() =>
          plaidClient.accountsGet({ access_token: item.access_token })
        );
        const liquid: LiquidAccount[] = r.data.accounts
          .filter(a => ["depository", "investment"].includes(a.type))
          .map(a => ({ name: a.name, balance: a.balances.current ?? 0, subtype: a.subtype ?? null }));
        const total = liquid.reduce((s, a) => s + a.balance, 0);
        allTotal += total;
        for (const a of liquid) allAccounts.push(a);
        await db.from("plaid_items").update({
          liquid_balance:        total,
          liquid_accounts_json:  liquid,
          balances_refreshed_at: new Date().toISOString(),
        }).eq("id", item.id);
      } catch (err) {
        log("error", "refreshLiquidBalances failed for item", {
          itemId: item.item_id,
          institution: item.institution_name,
          error: (err as { response?: { data?: unknown } })?.response?.data ?? err,
        });
        // Continue to next item — partial cache is better than no cache.
      }
    }
  } finally {
    inFlightRefresh.delete(userId);
    resolveWork();
  }

  return { total: allTotal, accounts: allAccounts };
}
