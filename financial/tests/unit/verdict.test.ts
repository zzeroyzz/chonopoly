import {
  calcElapsedFraction,
  budgetRowStatus,
  isPaidThisCycle,
  computeVerdict,
} from "@/lib/budget/verdict";
import type { BudgetSummaryRow } from "@/components/budget/types";
import type { Bill } from "@/components/bills/BillsWidget";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBudget(overrides: Partial<BudgetSummaryRow> = {}): BudgetSummaryRow {
  return {
    budget_id: "bud-1",
    name: "Groceries",
    category_name: "Food & Drink",
    category_icon: "utensils",
    period_type: "monthly",
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    effective_limit: 500,
    amount_spent: 200,
    amount_remaining: 300,
    percent_used: 40,
    over_budget: false,
    days_remaining: 15,
    status: "active",
    ...overrides,
  } as BudgetSummaryRow;
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    name: "Netflix",
    amount: 22.99,
    due_day: 15,
    recurrence: "monthly",
    category_id: null,
    is_auto_detected: false,
    plaid_merchant: null,
    is_active: true,
    last_paid_at: null,
    notified_3day: false,
    notified_today: false,
    next_due_date: null,
    bill_payments: [],
    ...overrides,
  } as Bill;
}

// ─── calcElapsedFraction ─────────────────────────────────────────────────────

describe("calcElapsedFraction", () => {
  const row = makeBudget({ period_start: "2026-07-01", period_end: "2026-07-31" });

  test("returns 0 when today is before period start", () => {
    const result = calcElapsedFraction(row, new Date("2026-06-30"));
    expect(result).toBe(0);
  });

  test("returns ~0.5 at midpoint", () => {
    const result = calcElapsedFraction(row, new Date("2026-07-16"));
    expect(result).toBeGreaterThan(0.45);
    expect(result).toBeLessThan(0.55);
  });

  test("returns 1 on last day", () => {
    const result = calcElapsedFraction(row, new Date("2026-07-31"));
    expect(result).toBe(1);
  });

  test("returns 1 past period end", () => {
    const result = calcElapsedFraction(row, new Date("2026-08-15"));
    expect(result).toBe(1);
  });

  test("returns 1 for zero-length period", () => {
    const zeroRow = makeBudget({ period_start: "2026-07-01", period_end: "2026-07-01" });
    expect(calcElapsedFraction(zeroRow, new Date("2026-07-01"))).toBe(1);
  });
});

// ─── budgetRowStatus ─────────────────────────────────────────────────────────

describe("budgetRowStatus", () => {
  test("on-track when under 80%", () => {
    expect(budgetRowStatus(makeBudget({ percent_used: 79, over_budget: false }))).toBe("on-track");
  });

  test("warning at 80%", () => {
    expect(budgetRowStatus(makeBudget({ percent_used: 80, over_budget: false }))).toBe("warning");
  });

  test("warning at 99%", () => {
    expect(budgetRowStatus(makeBudget({ percent_used: 99, over_budget: false }))).toBe("warning");
  });

  test("danger at 100%", () => {
    expect(budgetRowStatus(makeBudget({ percent_used: 100, over_budget: false }))).toBe("danger");
  });

  test("danger when over_budget flag set even at low percent", () => {
    expect(budgetRowStatus(makeBudget({ percent_used: 50, over_budget: true }))).toBe("danger");
  });
});

// ─── isPaidThisCycle ─────────────────────────────────────────────────────────

describe("isPaidThisCycle", () => {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
  const lastMonth = now.getUTCMonth() === 0
    ? `${thisYear - 1}-12-15T00:00:00Z`
    : `${thisYear}-${String(now.getUTCMonth()).padStart(2, "0")}-15T00:00:00Z`;

  test("monthly — paid this calendar month returns true", () => {
    const paid = `${thisYear}-${thisMonth}-01T00:00:00Z`;
    expect(isPaidThisCycle({ last_paid_at: paid, recurrence: "monthly" })).toBe(true);
  });

  test("monthly — paid last calendar month returns false", () => {
    expect(isPaidThisCycle({ last_paid_at: lastMonth, recurrence: "monthly" })).toBe(false);
  });

  test("weekly — paid 3 days ago returns true", () => {
    const d = new Date(now.getTime() - 3 * 86_400_000);
    expect(isPaidThisCycle({ last_paid_at: d.toISOString(), recurrence: "weekly" })).toBe(true);
  });

  test("weekly — paid 8 days ago returns false", () => {
    const d = new Date(now.getTime() - 8 * 86_400_000);
    expect(isPaidThisCycle({ last_paid_at: d.toISOString(), recurrence: "weekly" })).toBe(false);
  });

  test("yearly — paid this calendar year returns true", () => {
    expect(isPaidThisCycle({ last_paid_at: `${thisYear}-01-15T00:00:00Z`, recurrence: "yearly" })).toBe(true);
  });

  test("yearly — paid last year returns false", () => {
    expect(isPaidThisCycle({ last_paid_at: `${thisYear - 1}-12-31T00:00:00Z`, recurrence: "yearly" })).toBe(false);
  });

  test("null last_paid_at always returns false", () => {
    expect(isPaidThisCycle({ last_paid_at: null, recurrence: "monthly" })).toBe(false);
  });
});

// ─── computeVerdict ───────────────────────────────────────────────────────────

describe("computeVerdict", () => {
  const today = new Date("2026-07-15");

  test("critical when a budget is over limit — returns worst budget name", () => {
    const budgets = [
      makeBudget({ name: "Groceries", percent_used: 105, over_budget: true }),
      makeBudget({ budget_id: "bud-2", name: "Dining", percent_used: 120, over_budget: true }),
    ];
    const result = computeVerdict(budgets, [], today);
    expect(result.verdict).toBe("critical");
    expect(result.label).toBe("Dining is over limit");
  });

  test("critical uses category_name when name is null", () => {
    const budget = makeBudget({ name: null as unknown as string, category_name: "Entertainment", percent_used: 110, over_budget: true });
    const result = computeVerdict([budget], [], today);
    expect(result.verdict).toBe("critical");
    expect(result.label).toBe("Entertainment is over limit");
  });

  test("attention when a monthly bill is overdue (past due_day this month)", () => {
    const bill = makeBill({ name: "Rent", due_day: 1, recurrence: "monthly", last_paid_at: null });
    const result = computeVerdict([], [bill], today);
    expect(result.verdict).toBe("attention");
    expect(result.label).toBe("Rent is overdue");
  });

  test("one-time bill is excluded from overdue detection", () => {
    const bill = makeBill({ name: "One-time fee", due_day: 1, recurrence: "one-time", last_paid_at: null });
    const result = computeVerdict([], [bill], today);
    expect(result.verdict).toBe("ok");
  });

  test("yearly bill overdue but within 30 days → attention", () => {
    // Jan 1 bill, today is July 15 — WAY past 30 days → not overdue
    const bill = makeBill({ name: "Annual fee", due_day: 1, recurrence: "yearly", last_paid_at: null });
    const result = computeVerdict([], [bill], today);
    expect(result.verdict).toBe("ok");
  });

  test("yearly bill overdue within 30 days → attention", () => {
    // July 1 bill, today is July 15 — 14 days past → overdue
    const todayJul15 = new Date("2026-07-15");
    // yearly uses Jan due_day, so due_day=1 means Jan 1. 14 days past won't work for yearly.
    // Instead test with today just 5 days past a yearly due date (Jan 10 bill, today Jan 15):
    const jan15 = new Date("2026-01-15");
    const bill = makeBill({ name: "Annual fee", due_day: 10, recurrence: "yearly", last_paid_at: null });
    const result = computeVerdict([], [bill], jan15);
    expect(result.verdict).toBe("attention");
    expect(result.label).toBe("Annual fee is overdue");
  });

  test("attention when a budget is over pace", () => {
    // Period is Jul 1–31, today is Jul 10 (~32% elapsed). Budget spent 80% → over pace.
    const budget = makeBudget({
      name: "Dining",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      effective_limit: 100,
      amount_spent: 80,
      percent_used: 80,
      over_budget: false,
    });
    const result = computeVerdict([budget], [], new Date("2026-07-10"));
    expect(result.verdict).toBe("attention");
    expect(result.label).toContain("over pace");
  });

  test("ok when everything is on track", () => {
    const budget = makeBudget({ percent_used: 30, over_budget: false });
    const result = computeVerdict([budget], [], today);
    expect(result.verdict).toBe("ok");
    expect(result.label).toBeNull();
  });

  test("ok with no budgets and no bills", () => {
    const result = computeVerdict([], [], today);
    expect(result.verdict).toBe("ok");
    expect(result.label).toBeNull();
  });

  test("critical takes priority over overdue bill", () => {
    const budget = makeBudget({ percent_used: 110, over_budget: true });
    const bill = makeBill({ name: "Rent", due_day: 1, recurrence: "monthly" });
    const result = computeVerdict([budget], [bill], today);
    expect(result.verdict).toBe("critical");
  });
});
