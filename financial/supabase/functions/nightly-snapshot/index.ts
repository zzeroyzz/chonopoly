// Edge function — nightly budget snapshot writer
// Schedule: 11:55 PM UTC daily via pg_cron (registered in step5 migration)
// Deploy: supabase functions deploy nightly-snapshot

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM     = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@parkhawkinsproperties.com";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
}

Deno.serve(async () => {
  const today = new Date().toISOString().split("T")[0];

  // ── 1. All active budgets covering today ──────────────────────────────────
  const { data: budgets, error: budgetsErr } = await db
    .from("budgets")
    .select("id, goal_id, owner_id, owner_type, category_id, period_start, period_end, total_limit")
    .eq("status", "active")
    .lte("period_start", today)
    .gte("period_end", today);

  if (budgetsErr) {
    console.error("[nightly-snapshot] failed to fetch budgets:", budgetsErr.message);
    return new Response(JSON.stringify({ error: budgetsErr.message }), { status: 500 });
  }
  if (!budgets?.length) {
    console.log("[nightly-snapshot] no active budgets today");
    return new Response(JSON.stringify({ ok: true, processed: 0 }));
  }

  const budgetIds = budgets.map(b => b.id);
  const goalIds   = [...new Set(budgets.map(b => b.goal_id))];

  // ── 2. goal_accounts batch — which Plaid accounts belong to each goal ────
  const { data: goalAccountRows } = await db
    .from("goal_accounts")
    .select("goal_id, plaid_account_id")
    .in("goal_id", goalIds);

  const goalAccountMap = new Map<string, Set<string>>();
  for (const row of goalAccountRows ?? []) {
    if (!goalAccountMap.has(row.goal_id)) goalAccountMap.set(row.goal_id, new Set());
    goalAccountMap.get(row.goal_id)!.add(row.plaid_account_id);
  }

  const allLinkedAccountIds = [...new Set((goalAccountRows ?? []).map(r => r.plaid_account_id))];

  // ── 3. Transactions — period-to-date across all linked accounts ───────────
  const queryStart = budgets.map(b => b.period_start).reduce((a, b) => (a < b ? a : b));

  const { data: txRows } = await db
    .from("plaid_transactions")
    // R3: category_override ?? category_primary mirrors resolveCategory() in lib/budget/budgetService.ts.
    // Keep this inline resolver and the one in weekly-report/index.ts in sync with that function.
    .select("plaid_account_id, category_primary, category_override, amount, date")
    .in("plaid_account_id", allLinkedAccountIds)
    .gte("date", queryStart)
    .lte("date", today)
    .eq("pending", false)
    .gt("amount", 0);

  const allTx = txRows ?? [];

  // ── 4. Most recent prior snapshot per budget (carry forward notified state) ─
  const { data: prevSnapshotRows } = await db
    .from("budget_daily_snapshots")
    .select("budget_id, notified_80, notified_over")
    .in("budget_id", budgetIds)
    .lt("date", today)
    .order("date", { ascending: false });

  // Deduplicate: first occurrence per budget_id is the most recent (DESC order)
  const prevSnapshotMap = new Map<string, { notified_80: boolean; notified_over: boolean }>();
  for (const s of prevSnapshotRows ?? []) {
    if (!prevSnapshotMap.has(s.budget_id)) {
      prevSnapshotMap.set(s.budget_id, { notified_80: s.notified_80, notified_over: s.notified_over });
    }
  }

  // ── 5. Compute snapshot values and collect notification work ──────────────
  type SnapshotRow = {
    budget_id: string;
    date: string;
    daily_rate: number;
    amount_spent: number;
    remaining_after: number;
    days_remaining_after: number;
    notified_80: boolean;
    notified_over: boolean;
  };

  type NotifyWork = {
    owner_id: string;
    pct: number;
    remaining: number;
    over_by: number;
    newly_80: boolean;
    newly_over: boolean;
  };

  const snapshotRows: SnapshotRow[] = [];
  const notifyMap = new Map<string, NotifyWork>(); // keyed by budget_id

  for (const budget of budgets) {
    const linkedAccounts = goalAccountMap.get(budget.goal_id) ?? new Set<string>();

    const amountSpent = allTx
      .filter(tx =>
        // R3: override-first resolver — mirrors resolveCategory() in lib/budget/budgetService.ts
        (tx.category_override ?? tx.category_primary) === budget.category_id &&
        tx.date >= budget.period_start &&
        tx.date <= today &&
        linkedAccounts.has(tx.plaid_account_id)
      )
      .reduce((s, tx) => s + Number(tx.amount), 0);

    const totalLimit     = Number(budget.total_limit);
    const remainingAfter = totalLimit - amountSpent;

    const todayMs = new Date(today + "T00:00:00Z").getTime();
    const endMs   = new Date(budget.period_end + "T00:00:00Z").getTime();
    const daysRemainingAfter = Math.max(0, Math.round((endMs - todayMs) / 86_400_000));

    const dailyRate = daysRemainingAfter > 0
      ? Math.max(0, remainingAfter) / daysRemainingAfter
      : 0;

    const prev        = prevSnapshotMap.get(budget.id) ?? { notified_80: false, notified_over: false };
    const pct         = totalLimit > 0 ? (amountSpent / totalLimit) * 100 : 0;
    const newN80      = prev.notified_80 || pct >= 80;
    const newNOver    = prev.notified_over || pct >= 100;

    snapshotRows.push({
      budget_id:            budget.id,
      date:                 today,
      daily_rate:           Math.round(dailyRate * 100) / 100,
      amount_spent:         Math.round(amountSpent * 100) / 100,
      remaining_after:      Math.round(remainingAfter * 100) / 100,
      days_remaining_after: daysRemainingAfter,
      notified_80:          newN80,
      notified_over:        newNOver,
    });

    const newly80   = pct >= 80  && !prev.notified_80;
    const newlyOver = pct >= 100 && !prev.notified_over;

    if ((newly80 || newlyOver) && budget.owner_type === "personal") {
      notifyMap.set(budget.id, {
        owner_id:  budget.owner_id,
        pct,
        remaining: Math.max(0, remainingAfter),
        over_by:   Math.max(0, amountSpent - totalLimit),
        newly_80:  newly80,
        newly_over: newlyOver,
      });
    }
  }

  // ── 6. Batch UPSERT all snapshots ─────────────────────────────────────────
  const { error: upsertErr } = await db
    .from("budget_daily_snapshots")
    .upsert(snapshotRows, { onConflict: "budget_id,date" });

  if (upsertErr) {
    console.error("[nightly-snapshot] upsert failed:", upsertErr.message);
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500 });
  }

  // ── 7. Send notification emails for newly-crossed thresholds ─────────────
  for (const [, notify] of notifyMap) {
    const { data: authUser } = await db.auth.admin.getUserById(notify.owner_id);
    const userEmail = authUser?.user?.email;
    if (!userEmail) continue;

    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", notify.owner_id)
      .maybeSingle();
    const name = profile?.username ?? "there";

    if (notify.newly_80) {
      await sendEmail(
        userEmail,
        `Heads up — you've used ${Math.round(notify.pct)}% of your budget`,
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
          <h2 style="margin-bottom:4px;">Spending alert</h2>
          <p>Hey ${name},</p>
          <p>You've used <strong>${Math.round(notify.pct)}%</strong> of your budget this period.
             You have <strong>${fmt(notify.remaining)}</strong> remaining.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Park Hawkins Properties · Budget Tracker</p>
        </div>`
      );
    }

    if (notify.newly_over) {
      await sendEmail(
        userEmail,
        `You're over your budget this period`,
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
          <h2 style="margin-bottom:4px;color:#dc2626;">Over budget</h2>
          <p>Hey ${name},</p>
          <p>You've exceeded your budget by <strong style="color:#dc2626;">${fmt(notify.over_by)}</strong> this period.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Park Hawkins Properties · Budget Tracker</p>
        </div>`
      );
    }
  }

  const result = { ok: true, processed: snapshotRows.length, notified: notifyMap.size };
  console.log(`[nightly-snapshot] done —`, result);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
