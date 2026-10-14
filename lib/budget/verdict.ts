// Pure verdict functions for the Manage → Status page.
// All date math uses UTC midnights (B5), consistent with the budget system.

import { cycleDueDates } from "@/lib/bills/cycle";
import type { BudgetSummaryRow } from "@/components/budget/types";
import type { Bill } from "@/components/bills/BillsWidget";

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Extracted from BillsPanel.tsx:24 — single source of truth (A1).
// UTC-based per B5; BillsPanel imports this instead of defining its own copy.
// B3 pair alignment:
//   monthly  — "this cycle" = current UTC calendar month (matches current = this month's due_day)
//   weekly   — "this cycle" = within last 7 days (covers any payment on/after current = last due weekday)
//   yearly   — "this cycle" = current UTC calendar year (matches current = this year's Jan due_day)
//   one-time — paid once → forever paid (no cycle concept)
export function isPaidThisCycle(bill: Pick<Bill, "last_paid_at" | "recurrence">): boolean {
  if (!bill.last_paid_at) return false;
  const paid = new Date(bill.last_paid_at);
  const now  = new Date();
  if (bill.recurrence === "monthly")
    return paid.getUTCFullYear() === now.getUTCFullYear() && paid.getUTCMonth() === now.getUTCMonth();
  if (bill.recurrence === "weekly")
    return (now.getTime() - paid.getTime()) / 86_400_000 < 7;
  if (bill.recurrence === "yearly")
    return paid.getUTCFullYear() === now.getUTCFullYear();
  return !!bill.last_paid_at;
}

// Fraction of the budget period that has elapsed, clamped to [0, 1].
export function calcElapsedFraction(row: BudgetSummaryRow, today: Date): number {
  const t     = utcMidnight(today);
  const start = new Date(row.period_start + "T00:00:00Z");
  const end   = new Date(row.period_end   + "T00:00:00Z");
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (t.getTime() - start.getTime()) / total));
}

export type BudgetStatus = "on-track" | "warning" | "danger";

export function budgetRowStatus(row: BudgetSummaryRow): BudgetStatus {
  if (row.over_budget || row.percent_used >= 100) return "danger";
  if (row.percent_used >= 80) return "warning";
  return "on-track";
}

export type Verdict = "ok" | "attention" | "critical";

export interface VerdictResult {
  verdict: Verdict;
  label: string | null;
}

// Overall verdict for the status banner.
// Priority: (1) over-limit budget → "critical"; (2) overdue bill → "attention";
// (3) over-pace budget → "attention"; (4) all clear → "ok".
// Containment for known schema limitations:
//   one-time bills: excluded (rolling monthly semantics — appears perpetually overdue).
//   yearly bills: capped at 30 days past current-cycle due date.
export function computeVerdict(budgets: BudgetSummaryRow[], bills: Bill[], today: Date): VerdictResult {
  // 1. Over-limit
  const overBudgets = budgets.filter(b => b.over_budget || b.percent_used >= 100);
  if (overBudgets.length > 0) {
    const worst = overBudgets.reduce((a, b) => b.percent_used > a.percent_used ? b : a);
    return { verdict: "critical", label: `${worst.name ?? worst.category_name} is over limit` };
  }

  // 2. Overdue bills
  const t = utcMidnight(today);
  const overdueBill = bills.find(bill => {
    if (isPaidThisCycle(bill)) return false;
    const { current } = cycleDueDates(bill, today);
    if (current >= t) return false;
    if (bill.recurrence === "one-time") return false;
    if (bill.recurrence === "yearly") {
      return (t.getTime() - current.getTime()) / 86_400_000 <= 30;
    }
    return true;
  });
  if (overdueBill) {
    return { verdict: "attention", label: `${overdueBill.name} is overdue` };
  }

  // 3. Over-pace: spend fraction exceeds elapsed time fraction.
  // Only meaningful when elapsed > 0 (period has started).
  // Worst offender = highest (spentFrac / elapsed) ratio.
  let worstPaceBudget: BudgetSummaryRow | null = null;
  let worstPaceRatio = 1;
  for (const b of budgets) {
    const elapsed = calcElapsedFraction(b, today);
    if (elapsed <= 0 || b.effective_limit <= 0) continue;
    const spentFrac = b.amount_spent / b.effective_limit;
    if (spentFrac <= elapsed) continue;
    const ratio = spentFrac / elapsed;
    if (ratio > worstPaceRatio) {
      worstPaceRatio = ratio;
      worstPaceBudget = b;
    }
  }
  if (worstPaceBudget) {
    return { verdict: "attention", label: `${worstPaceBudget.name ?? worstPaceBudget.category_name} is over pace` };
  }

  return { verdict: "ok", label: null };
}
