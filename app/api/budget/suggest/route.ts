import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient } from "@/lib/plaid";
import { getPlaidItems } from "@/lib/supabase/plaid";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category_id");
  if (!categoryId) return NextResponse.json({ error: "Missing category_id" }, { status: 400 });

  const start = daysAgo(90);
  const end   = daysAgo(0);

  const { data: plaidItems } = await getPlaidItems(user.id);
  const byMonth: Record<string, number> = {};

  for (const item of plaidItems) {
    try {
      const res = await plaidClient.transactionsGet({
        access_token: item.access_token,
        start_date: start,
        end_date: end,
        options: { count: 500, include_personal_finance_category: true },
      });
      for (const tx of res.data.transactions) {
        if (tx.personal_finance_category?.primary !== categoryId || tx.amount <= 0) continue;
        const month = tx.date.slice(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] ?? 0) + tx.amount;
      }
    } catch {
      // one bank failing shouldn't block the rest
    }
  }

  const months = Object.values(byMonth);
  // Only suggest if we have data spanning at least 30 days (i.e. at least one month of data)
  if (months.length === 0) return NextResponse.json({ average: null });

  const average = Math.round(months.reduce((s, v) => s + v, 0) / months.length * 100) / 100;
  return NextResponse.json({ average });
}
