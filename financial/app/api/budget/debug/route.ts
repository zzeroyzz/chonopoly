import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";
import { getPlaidItems } from "@/lib/supabase/plaid";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  }
  const start = daysAgo(30);
  const end = daysAgo(0);

  const { data: plaidItems } = await getPlaidItems(user.id);

  const totals: Record<string, number> = {};
  const samples: { name: string; amount: number; primary: string | null; date: string }[] = [];

  for (const item of plaidItems) {
    try {
      const res = await plaidClient.transactionsGet({
        access_token: item.access_token,
        start_date: start,
        end_date: end,
        options: { count: 500, include_personal_finance_category: true },
      });
      for (const tx of res.data.transactions) {
        if (tx.amount <= 0) continue;
        const primary = tx.personal_finance_category?.primary ?? "UNKNOWN";
        totals[primary] = (totals[primary] ?? 0) + tx.amount;
        samples.push({ name: tx.name, amount: tx.amount, primary, date: tx.date });
      }
    } catch (err) {
      return NextResponse.json({ error: String(err), plaidItemCount: plaidItems.length, start, end });
    }
  }

  samples.sort((a, b) => b.amount - a.amount);

  return NextResponse.json({ start, end, plaidItemCount: plaidItems.length, totals, transactions: samples });
}
