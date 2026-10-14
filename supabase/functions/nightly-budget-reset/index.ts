// Edge function — nightly budget period reset
// Schedule: midnight UTC daily via pg_cron (registered in step5 migration)
// Deploy: supabase functions deploy nightly-budget-reset

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM     = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@parkhawkinsproperties.com";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Compute the start and end dates for the period that follows currentEnd.
function nextPeriodBounds(periodType: string, currentEnd: string): { start: string; end: string } {
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  const endDate = new Date(currentEnd + "T00:00:00Z");
  const nextDay = new Date(endDate.getTime() + 86_400_000);

  switch (periodType) {
    case "daily":
      return { start: toISO(nextDay), end: toISO(nextDay) };

    case "weekly":
      // Assumes current period ends on Sunday; next period Mon–Sun
      return { start: toISO(nextDay), end: toISO(new Date(nextDay.getTime() + 6 * 86_400_000)) };

    case "monthly": {
      const y = nextDay.getUTCFullYear();
      const m = nextDay.getUTCMonth(); // 0-indexed
      return { start: toISO(nextDay), end: toISO(new Date(Date.UTC(y, m + 1, 0))) };
    }

    case "quarterly": {
      const y = nextDay.getUTCFullYear();
      const m = nextDay.getUTCMonth(); // 0-indexed, first month of new quarter
      const endMonth   = m + 2;
      const endYear    = y + Math.floor(endMonth / 12);
      const normalised = endMonth % 12;
      return { start: toISO(nextDay), end: toISO(new Date(Date.UTC(endYear, normalised + 1, 0))) };
    }

    case "yearly": {
      const y = nextDay.getUTCFullYear();
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }

    default:
      throw new Error(`Unknown period_type: ${periodType}`);
  }
}

// Safety cap: maximum periods to advance per budget in one invoke.
// Prevents infinite loops on corrupt period_type or runaway catch-up.
const CATCH_UP_LIMIT = 24;

Deno.serve(async () => {
  const today = new Date().toISOString().split("T")[0];

  // ── 1. Active recurring budgets whose period has already ended ────────────
  // Fixed: .lt (not .eq) so budgets frozen mid-week by a missed cron are caught.
  const { data: budgets, error: budgetsErr } = await db
    .from("budgets")
    .select("id, goal_id, owner_id, owner_type, category_id, period_type, period_end, total_limit, rollover_enabled")
    .eq("status", "active")
    .eq("recurring", true)
    .lt("period_end", today);

  if (budgetsErr) {
    console.error("[nightly-budget-reset] failed to fetch budgets:", budgetsErr.message);
    return new Response(JSON.stringify({ error: budgetsErr.message }), { status: 500 });
  }
  if (!budgets?.length) {
    console.log("[nightly-budget-reset] no budgets resetting today");
    return new Response(JSON.stringify({ ok: true, reset: 0 }));
  }

  const budgetIds = budgets.map(b => b.id);

  // ── 2. Today's snapshots (for rollover / nudge amount calculation) ─────────
  const { data: snapshotRows } = await db
    .from("budget_daily_snapshots")
    .select("budget_id, amount_spent, remaining_after")
    .in("budget_id", budgetIds)
    .eq("date", today);

  const snapshotMap = new Map(
    (snapshotRows ?? []).map(s => [s.budget_id, s])
  );

  // ── 3. Parent goals (for goal_type check on savings nudge) ────────────────
  const goalIds = [...new Set(budgets.map(b => b.goal_id))];
  const { data: goalRows } = await db
    .from("savings_goals")
    .select("id, goal_type, name")
    .in("id", goalIds);

  const goalMap = new Map((goalRows ?? []).map(g => [g.id, g]));

  // ── 4. Create new budget periods and mark old ones paused ─────────────────
  const newBudgetInserts: Array<Record<string, unknown>> = [];
  const nudgeWork: Array<{ owner_id: string; goal_name: string; unspent: number }> = [];

  for (const budget of budgets) {
    const snapshot  = snapshotMap.get(budget.id);
    const remaining = snapshot ? Number(snapshot.remaining_after) : Number(budget.total_limit);
    const totalLimit = Number(budget.total_limit);

    // Rollover applied only to the first new period; catch-up steps use full limit.
    const rolloverAmount = budget.rollover_enabled && remaining > 0 ? remaining : 0;

    let currentEnd = budget.period_end;
    let step = 0;

    // Catch-up loop: advance through all missed periods until we reach or pass today.
    while (currentEnd < today && step < CATCH_UP_LIMIT) {
      const { start: periodStart, end: periodEnd } = nextPeriodBounds(budget.period_type, currentEnd);
      const stepLimit = step === 0
        ? Math.round((totalLimit + rolloverAmount) * 100) / 100
        : totalLimit;

      newBudgetInserts.push({
        goal_id:          budget.goal_id,
        owner_type:       budget.owner_type,
        owner_id:         budget.owner_id,
        category_id:      budget.category_id,
        period_type:      budget.period_type,
        period_start:     periodStart,
        period_end:       periodEnd,
        total_limit:      stepLimit,
        recurring:        true,
        rollover_enabled: budget.rollover_enabled,
        status:           "active",
      });

      currentEnd = periodEnd;
      step++;
    }

    if (step >= CATCH_UP_LIMIT) {
      console.warn(`[nightly-budget-reset] catch-up limit hit for budget ${budget.id} — investigate period_type`);
    }

    // Queue nudge email if: no rollover, money left over, parent goal is savings type
    const goal = goalMap.get(budget.goal_id);
    if (!budget.rollover_enabled && remaining > 0 && goal?.goal_type === "savings") {
      nudgeWork.push({
        owner_id:  budget.owner_id,
        goal_name: goal.name,
        unspent:   remaining,
      });
    }
  }

  // Batch-upsert new budget periods.
  // ON CONFLICT DO NOTHING (ignoreDuplicates) makes re-invokes safe against
  // the budgets_unique_period index (goal_id, owner_id, owner_type, category_id, period_type, period_start).
  const { error: insertErr } = await db.from("budgets").upsert(newBudgetInserts, {
    onConflict: "goal_id,owner_id,owner_type,category_id,period_type,period_start",
    ignoreDuplicates: true,
  });
  if (insertErr) {
    console.error("[nightly-budget-reset] upsert failed:", insertErr.message);
    return new Response(JSON.stringify({ error: insertErr.message }), { status: 500 });
  }

  // Batch-pause old budgets (unchanged — idempotent as-is)
  const { error: pauseErr } = await db
    .from("budgets")
    .update({ status: "paused" })
    .in("id", budgetIds);
  if (pauseErr) {
    console.error("[nightly-budget-reset] pause failed:", pauseErr.message);
    return new Response(JSON.stringify({ error: pauseErr.message }), { status: 500 });
  }

  // ── 5. Savings nudge emails ───────────────────────────────────────────────
  let nudgesSent = 0;

  if (RESEND_API_KEY) {
    for (const { owner_id, goal_name, unspent } of nudgeWork) {
      const { data: authUser } = await db.auth.admin.getUserById(owner_id);
      const userEmail = authUser?.user?.email;
      if (!userEmail) {
        console.warn(`[nightly-budget-reset] no email for owner_id ${owner_id}, skipping nudge`);
        continue;
      }

      const { data: profile } = await db
        .from("profiles")
        .select("username")
        .eq("id", owner_id)
        .maybeSingle();
      const name = profile?.username ?? "there";

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: userEmail,
          subject: `Your ${goal_name} budget has ${fmt(unspent)} unspent — consider saving it`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
            <h2 style="margin-bottom:4px;">Your budget period ends soon 💰</h2>
            <p>Hey ${name},</p>
            <p>Your <strong>${goal_name}</strong> budget period just wrapped up and you had
               <strong>${fmt(unspent)}</strong> left unspent.</p>
            <p>Consider transferring <strong>${fmt(unspent)}</strong> to your savings account —
               small transfers add up over time.</p>
            <p style="color:#555;font-size:14px;">This is a reminder only. No money has been moved automatically.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Park Hawkins Properties · Budget Tracker</p>
          </div>`,
        }),
      });

      nudgesSent++;
    }
  }

  const result = { ok: true, reset: budgets.length, nudges_sent: nudgesSent };
  console.log(`[nightly-budget-reset] done —`, result);
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
