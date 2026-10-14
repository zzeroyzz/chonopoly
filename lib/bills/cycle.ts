// Single source of truth for bill due-date arithmetic.
// Used by app/api/bills/route.ts (next_due_date field) and lib/budget/verdict.ts
// (overdue detection). UTC midnights throughout — no local-time setHours().
//
// Branch semantics mirror the original computeNextDueDate in route.ts, branch-for-branch:
//   monthly  — due_day = day of month (1–31)
//   weekly   — due_day = ISO weekday (1=Mon … 7=Sun)
//   yearly   — due_day = day of January (e.g. due_day 15 → Jan 15 each year)
//   one-time — due_day = day of current month; no advancement (once-ever bill)
//
// DRIFT NOTE: calendar display helpers (buildBillsByDay in BillsPanel/BillsWidget) use
// local-time Date arithmetic (new Date(year, month, d)). For DST-safe rendering this is
// equivalent at midnight local time, but if any of that code ever runs server-side near a
// DST boundary it should switch to Date.UTC() to match this file.

export type CycleBill = {
  due_day: number;
  recurrence: string;
};

export type CycleDates = {
  /** Pre-advancement candidate: the current-cycle due date (may be in the past). */
  current: Date;
  /** Post-advancement candidate: next upcoming due date (always ≥ today). */
  next: Date;
};

export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function cycleDueDates(bill: CycleBill, today: Date): CycleDates {
  const t = utcMidnight(today);

  if (bill.recurrence === "monthly") {
    const current = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), bill.due_day));
    // JS Date handles month overflow: month+1=12 → Jan of next year
    const next = current < t
      ? new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, bill.due_day))
      : new Date(current.getTime());
    return { current, next };
  }

  if (bill.recurrence === "weekly") {
    const isoDay   = Math.min(7, Math.max(1, bill.due_day));
    const todayIso = t.getUTCDay() === 0 ? 7 : t.getUTCDay(); // 1=Mon … 7=Sun
    const daysBack  = (todayIso - isoDay + 7) % 7; // 0 if today IS the due day
    const daysUntil = daysBack === 0 ? 0 : 7 - daysBack;
    const current = new Date(t.getTime());
    current.setUTCDate(t.getUTCDate() - daysBack);
    const next = new Date(t.getTime());
    next.setUTCDate(t.getUTCDate() + daysUntil);
    return { current, next };
  }

  if (bill.recurrence === "yearly") {
    // due_day = day of January (original route.ts: new Date(year, 0, due_day))
    const current = new Date(Date.UTC(t.getUTCFullYear(), 0, bill.due_day));
    const next = current < t
      ? new Date(Date.UTC(t.getUTCFullYear() + 1, 0, bill.due_day))
      : new Date(current.getTime());
    return { current, next };
  }

  // one-time: no advancement — returns this month's due_day regardless of past/future
  const current = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), bill.due_day));
  return { current, next: new Date(current.getTime()) };
}

// Returns true when the current-cycle due date is in the past.
// Containment: one-time bills are never overdue; yearly bills expire after 30 days.
export function isOverdueBill(bill: CycleBill, today: Date): boolean {
  if (bill.recurrence === "one-time") return false;
  const { current } = cycleDueDates(bill, today);
  const t = utcMidnight(today);
  if (current >= t) return false;
  if (bill.recurrence === "yearly") {
    // Cap at 30 days — yearly bills >30 days past are no longer surfaced as overdue
    return (t.getTime() - current.getTime()) / 86400000 <= 30;
  }
  return true;
}

// Short human-readable current-cycle due date, e.g. "Jan 15"
export function formatCurrentDue(bill: CycleBill, today: Date): string {
  const { current } = cycleDueDates(bill, today);
  return current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
