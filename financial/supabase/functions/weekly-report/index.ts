// Edge function — weekly budget report email
// Schedule: Tuesday 14:00 UTC via pg_cron (registered in 20260702000001_weekly_report migration)
// Closed week: Sunday–Saturday ending last Saturday (2 days prior to send)
// Deploy: supabase functions deploy weekly-report

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM    = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@parkhawkinsproperties.com";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

// R3: This predicate is duplicated from lib/budget/budgetService.ts matchesBudget.
// Deno edge functions cannot import from lib/. Keep this copy, the one in
// nightly-snapshot/index.ts, and the source in budgetService.ts in sync.
// Now uses override-first resolution matching resolveCategory() in budgetService.ts.
function matchesBudget(
  tx: { plaid_account_id: string; category_primary: string | null; category_override?: string | null; amount: number; date: string },
  categoryId: string,
  periodStart: string,
  periodEnd: string,
  linkedAccountIds: Set<string>
): boolean {
  return (
    tx.amount > 0 &&
    (tx.category_override ?? tx.category_primary) === categoryId &&
    tx.date >= periodStart &&
    tx.date <= periodEnd &&
    linkedAccountIds.has(tx.plaid_account_id)
  );
}

// Closed week: Sunday–Saturday ending last Saturday.
// Closed week: Sun–Sat ending last Saturday.
// Saturday guard: (day+1)%7 = 0 on Saturday, which would return today (partial week) — use 7 instead.
function closedWeek(now: Date): { weekStart: string; weekEnd: string } {
  const sat = new Date(now);
  const daysBack = sat.getUTCDay() === 6 ? 7 : (sat.getUTCDay() + 1) % 7;
  sat.setUTCDate(sat.getUTCDate() - daysBack);
  const sun = new Date(sat);
  sun.setUTCDate(sat.getUTCDate() - 6);
  return { weekStart: fmtDate(sun), weekEnd: fmtDate(sat) };
}

function priorWeek(weekStart: string, weekEnd: string): { weekStart: string; weekEnd: string } {
  const s = new Date(weekStart + "T00:00:00Z");
  const e = new Date(weekEnd + "T00:00:00Z");
  s.setUTCDate(s.getUTCDate() - 7);
  e.setUTCDate(e.getUTCDate() - 7);
  return { weekStart: fmtDate(s), weekEnd: fmtDate(e) };
}

type BudgetRow = {
  id: string;
  goal_id: string;
  owner_id: string;
  owner_type: string;
  category_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  total_limit: number;
};

type TxRow = {
  plaid_account_id: string;
  category_primary: string | null;
  category_override: string | null;
  amount: number;
  date: string;
  merchant_name: string | null;
};

// Fix 2: one row per category — prefer the row whose window contains prefDate;
// fallback to the row with the latest period_end if none contains it.
function dedupByCategory(budgets: BudgetRow[], prefDate: string): BudgetRow[] {
  const byCategory = new Map<string, BudgetRow>();
  for (const b of budgets) {
    const existing = byCategory.get(b.category_id);
    if (!existing) { byCategory.set(b.category_id, b); continue; }
    const bContains = b.period_start <= prefDate && b.period_end >= prefDate;
    const exContains = existing.period_start <= prefDate && existing.period_end >= prefDate;
    if (bContains && !exContains) { byCategory.set(b.category_id, b); }
    else if (!bContains && !exContains && b.period_end > existing.period_end) { byCategory.set(b.category_id, b); }
  }
  return [...byCategory.values()];
}

// Fix 1: capDate = min(period_end, weekEnd) so non-weekly budgets show period-to-date spend.
async function spendForBudgets(
  budgets: BudgetRow[],
  transactions: TxRow[],
  goalAccountMap: Map<string, Set<string>>,
  capDate: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const b of budgets) {
    const linked = goalAccountMap.get(b.goal_id) ?? new Set();
    const effectiveEnd = b.period_end < capDate ? b.period_end : capDate;
    const sum = transactions
      .filter(tx => matchesBudget(tx, b.category_id, b.period_start, effectiveEnd, linked))
      .reduce((s, tx) => s + tx.amount, 0);
    result.set(b.id, sum);
  }
  return result;
}

function buildReportHtml(
  name: string,
  weekLabel: string,
  budgetLines: { category: string; period_type: string; period_start: string; spent: number; limit: number; priorSpent: number | null }[],
  savingsGoal: { name: string; current_balance: number; target_amount: number } | null
): string {
  const totalSpent = budgetLines.reduce((s, l) => s + l.spent, 0);
  const totalLimit = budgetLines.reduce((s, l) => s + l.limit, 0);
  const overallOnTrack = totalSpent <= totalLimit;

  const budgetRows = budgetLines.map(l => {
    const pct = l.limit > 0 ? Math.round((l.spent / l.limit) * 100) : 0;
    const over = l.spent > l.limit;
    const delta = l.priorSpent !== null
      ? ` <span style="color:#9ca3af; font-size:11px;">(${l.spent >= l.priorSpent ? "+" : ""}${fmt(l.spent - l.priorSpent)} vs last week)</span>`
      : "";
    const monthLabel = new Date(l.period_start + "T00:00:00Z").toLocaleString("en-US", { month: "long" });
    const catLabel = l.period_type !== "weekly" ? `${l.category} (${monthLabel})` : l.category;
    return `
      <tr>
        <td style="padding:8px 0; color:#555; font-size:13px;">${catLabel}</td>
        <td style="text-align:right; font-size:13px; color:${over ? "#dc2626" : "#111"}; font-weight:${over ? "700" : "400"};">
          ${fmt(l.spent)} / ${fmt(l.limit)}${delta}
        </td>
        <td style="text-align:right; font-size:12px; color:${over ? "#dc2626" : "#16a34a"};">
          ${over ? "over" : `${pct}%`}
        </td>
      </tr>`;
  }).join("");

  const savingsSection = savingsGoal ? (() => {
    const pct = savingsGoal.target_amount > 0
      ? Math.min(100, Math.round((savingsGoal.current_balance / savingsGoal.target_amount) * 100))
      : 0;
    return `
      <h3 style="margin:24px 0 8px; font-size:14px; color:#555;">Savings goal — ${savingsGoal.name}</h3>
      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0; color:#555; font-size:13px;">Current balance</td>
          <td style="text-align:right; font-weight:600;">${fmt(savingsGoal.current_balance)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#555; font-size:13px;">Target</td>
          <td style="text-align:right; font-weight:600;">${fmt(savingsGoal.target_amount)}</td>
        </tr>
        <tr style="border-top:1px solid #e5e7eb;">
          <td style="padding:8px 0; font-weight:600;">Progress</td>
          <td style="text-align:right; font-weight:700; color:#16a34a;">${pct}%</td>
        </tr>
      </table>`;
  })() : "";

  return `
    <div style="font-family:sans-serif; max-width:520px; margin:0 auto; color:#111;">
      <h2 style="margin-bottom:4px;">Your week in review</h2>
      <p>Hey ${name},</p>
      <p style="color:#555; font-size:13px;">Week of ${weekLabel} · ${overallOnTrack ? "✅ On track" : "⚠️ Over budget"} — ${fmt(totalSpent)} of ${fmt(totalLimit)}</p>

      <h3 style="margin:20px 0 8px; font-size:14px; color:#555;">Budgets</h3>
      <table style="width:100%; border-collapse:collapse;">
        ${budgetRows}
        <tr style="border-top:2px solid #111;">
          <td style="padding:8px 0; font-weight:600;">Total</td>
          <td style="text-align:right; font-weight:700; color:${overallOnTrack ? "#16a34a" : "#dc2626"};">${fmt(totalSpent)} / ${fmt(totalLimit)}</td>
          <td></td>
        </tr>
      </table>

      ${savingsSection}

      <p style="margin-top:24px;">
        <a href="https://chonopoly.vercel.app/finances" style="color:#00d4aa;">Open your finances →</a>
      </p>
      <p style="color:#9ca3af; font-size:12px; margin-top:16px;">Park Hawkins Properties · Finance Tracker</p>
    </div>`;
}

Deno.serve(async () => {
  // Loud fail on missing email credentials — do not silently no-op
  if (!RESEND_API_KEY) {
    console.error("[weekly-report] RESEND_API_KEY is not set — cannot send emails");
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), { status: 500 });
  }

  const now = new Date();
  const { weekStart, weekEnd } = closedWeek(now);
  const prior = priorWeek(weekStart, weekEnd);

  console.log(`[weekly-report] closed week: ${weekStart} → ${weekEnd}`);

  // Profiles opted in and not yet sent for this week
  const { data: profiles, error: profilesErr } = await db
    .from("profiles")
    .select("id, username")
    .eq("weekly_report_enabled", true)
    .or(`weekly_report_sent_date.is.null,weekly_report_sent_date.lt.${weekEnd}`);

  if (profilesErr) {
    console.error("[weekly-report] profiles query failed:", profilesErr.message);
    return new Response(JSON.stringify({ error: profilesErr.message }), { status: 500 });
  }

  console.log(`[weekly-report] profiles matched: ${profiles?.length ?? 0}`);

  let sent = 0;
  const results: string[] = [];

  for (const profile of profiles ?? []) {
    // Resolve email from auth
    const { data: authData } = await db.auth.admin.getUserById(profile.id);
    const email = authData?.user?.email;
    if (!email) {
      console.warn(`[weekly-report] no email for profile ${profile.id}, skipping`);
      continue;
    }

    // Active budgets for this user covering the closed week
    const { data: rawBudgets } = await db
      .from("budgets")
      .select("id, goal_id, owner_id, owner_type, category_id, period_type, period_start, period_end, total_limit")
      .eq("owner_id", profile.id)
      .eq("owner_type", "personal")
      .in("status", ["active", "paused"])
      .lte("period_start", weekEnd)
      .gte("period_end", weekStart);

    // Fix 2: one row per category — prefer row containing weekEnd, fallback to latest period_end
    const budgets = dedupByCategory(rawBudgets ?? [], weekEnd);

    if (!budgets.length) {
      console.log(`[weekly-report] no budgets for ${profile.id} covering ${weekStart}–${weekEnd}, skipping`);
      continue;
    }

    const goalIds = [...new Set(budgets.map(b => b.goal_id))];

    // Spending accounts for those goals
    const { data: goalAccounts } = await db
      .from("goal_accounts")
      .select("goal_id, plaid_account_id")
      .in("goal_id", goalIds)
      .eq("account_role", "spending");

    const goalAccountMap = new Map<string, Set<string>>();
    for (const row of goalAccounts ?? []) {
      if (!goalAccountMap.has(row.goal_id)) goalAccountMap.set(row.goal_id, new Set());
      goalAccountMap.get(row.goal_id)!.add(row.plaid_account_id);
    }

    const allAccountIds = [...new Set(
      [...goalAccountMap.values()].flatMap(s => [...s])
    )];

    // Transactions covering the closed week (plus prior week for delta)
    const { data: txs } = await db
      .from("plaid_transactions")
      // R3: category_override fetched here — mirrors resolveCategory() in lib/budget/budgetService.ts
      .select("plaid_account_id, category_primary, category_override, amount, date, merchant_name")
      .in("plaid_account_id", allAccountIds)
      .gte("date", prior.weekStart)
      .lte("date", weekEnd)
      .eq("pending", false);

    const currentTxs = (txs ?? []).filter(tx => tx.date >= weekStart && tx.date <= weekEnd);
    const priorTxs   = (txs ?? []).filter(tx => tx.date >= prior.weekStart && tx.date <= prior.weekEnd);

    // Budget rows for prior week (same goal/category/period_type, paused)
    const { data: rawPriorBudgets } = await db
      .from("budgets")
      .select("id, goal_id, owner_id, owner_type, category_id, period_type, period_start, period_end, total_limit")
      .eq("owner_id", profile.id)
      .eq("owner_type", "personal")
      .in("status", ["active", "paused"])
      .lte("period_start", prior.weekEnd)
      .gte("period_end", prior.weekStart);

    const priorBudgets = dedupByCategory(rawPriorBudgets ?? [], prior.weekEnd);

    const currentSpend = await spendForBudgets(budgets, currentTxs, goalAccountMap, weekEnd);
    const priorSpend   = await spendForBudgets(priorBudgets, priorTxs, goalAccountMap, prior.weekEnd);

    // Build per-budget lines keyed by category_id
    const priorByCategory = new Map<string, number>();
    for (const b of priorBudgets ?? []) {
      const s = priorSpend.get(b.id) ?? 0;
      priorByCategory.set(b.category_id, (priorByCategory.get(b.category_id) ?? 0) + s);
    }

    const budgetLines = budgets.map(b => ({
      category:     b.category_id,
      period_type:  b.period_type,
      period_start: b.period_start,
      spent:        currentSpend.get(b.id) ?? 0,
      limit:        b.total_limit,
      priorSpent:   priorByCategory.get(b.category_id) ?? null,
    }));

    // Active savings goal
    const { data: goal } = await db
      .from("savings_goals")
      .select("name, current_balance, target_amount")
      .eq("owner_id", profile.id)
      .eq("owner_type", "personal")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const weekLabel = new Date(weekStart + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long", day: "numeric",
    }) + " – " + new Date(weekEnd + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

    const html = buildReportHtml(
      profile.username ?? "there",
      weekLabel,
      budgetLines,
      goal ?? null
    );

    const subject = `Your week in review — ${weekLabel}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: email, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[weekly-report] Resend failed for ${email}: ${res.status} ${body}`);
      results.push(`${email}: FAILED (${res.status})`);
      continue;
    }

    // Idempotency: mark sent so duplicate cron fires don't re-send
    await db.from("profiles").update({ weekly_report_sent_date: weekEnd }).eq("id", profile.id);

    const budgetSummary = budgetLines.map(l =>
      `${l.category}: ${fmt(l.spent)} / ${fmt(l.limit)}`
    ).join(", ");

    console.log(`[weekly-report] sent to ${email} | budgets: ${budgetSummary}`);
    results.push(`${email}: OK | ${budgetSummary}${goal ? ` | goal "${goal.name}" ${Math.round((goal.current_balance / goal.target_amount) * 100)}%` : ""}`);
    sent++;
  }

  // R4: Log results as text so manual invoke is verifiable
  console.log(`[weekly-report] done — sent: ${sent}/${profiles?.length ?? 0}`);
  return new Response(
    JSON.stringify({ ok: true, week: { weekStart, weekEnd }, sent, results }),
    { status: 200 }
  );
});
