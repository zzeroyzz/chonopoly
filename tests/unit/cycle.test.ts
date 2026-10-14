import { cycleDueDates, isOverdueBill } from "@/lib/bills/cycle";

// All dates constructed at UTC midnight to match the library's utcMidnight() contract.
function d(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

// ─── cycleDueDates — monthly ──────────────────────────────────────────────────

describe("cycleDueDates — monthly", () => {
  test("due day in the future this month: current = this month, next = this month", () => {
    const { current, next } = cycleDueDates({ due_day: 20, recurrence: "monthly" }, d("2026-07-10"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 20)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 6, 20)).toISOString());
  });

  test("due day in the past this month: current = this month, next = next month", () => {
    const { current, next } = cycleDueDates({ due_day: 5, recurrence: "monthly" }, d("2026-07-10"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 5)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 7, 5)).toISOString());
  });

  test("due day = today: current = today, no advance", () => {
    const { current, next } = cycleDueDates({ due_day: 15, recurrence: "monthly" }, d("2026-07-15"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 15)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 6, 15)).toISOString());
  });

  test("month overflow: due_day 31 in February advances to March 3 (JS overflow)", () => {
    // Due day 31, today is Feb 10. current = Feb 31 = March 3 via JS overflow.
    const { current } = cycleDueDates({ due_day: 31, recurrence: "monthly" }, d("2026-02-10"));
    // JS: new Date(Date.UTC(2026, 1, 31)) = 2026-03-03
    expect(current.getUTCMonth()).toBe(2); // March
  });

  test("December → next wraps to January of next year", () => {
    const { next } = cycleDueDates({ due_day: 5, recurrence: "monthly" }, d("2026-12-10"));
    expect(next.getUTCFullYear()).toBe(2027);
    expect(next.getUTCMonth()).toBe(0);
  });
});

// ─── cycleDueDates — weekly ───────────────────────────────────────────────────

describe("cycleDueDates — weekly", () => {
  // 2026-07-13 is Monday (ISO weekday 1)
  test("due weekday = today: current = today, next = today (0 days forward)", () => {
    const { current, next } = cycleDueDates({ due_day: 1, recurrence: "weekly" }, d("2026-07-13"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 13)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 6, 13)).toISOString());
  });

  // 2026-07-15 is Wednesday (ISO weekday 3). Due Monday (1) was 2 days ago.
  test("due weekday in the past: current = last Mon, next = this coming Mon", () => {
    const { current, next } = cycleDueDates({ due_day: 1, recurrence: "weekly" }, d("2026-07-15"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 13)).toISOString()); // last Mon
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 6, 20)).toISOString());    // next Mon
  });

  // 2026-07-13 is Monday. Due Friday (5) is in 4 days.
  test("due weekday in the future: current = last Friday, next = this Friday", () => {
    const { current, next } = cycleDueDates({ due_day: 5, recurrence: "weekly" }, d("2026-07-13"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 10)).toISOString()); // last Fri
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 6, 17)).toISOString());    // this Fri
  });

  // Sunday: ISO weekday 7. 2026-07-12 is Sunday.
  test("Sunday due day handled correctly (ISO 7)", () => {
    const { current } = cycleDueDates({ due_day: 7, recurrence: "weekly" }, d("2026-07-12"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 12)).toISOString());
  });
});

// ─── cycleDueDates — yearly ───────────────────────────────────────────────────

describe("cycleDueDates — yearly", () => {
  test("before Jan 15: current = Jan 15 this year, no advance", () => {
    const { current, next } = cycleDueDates({ due_day: 15, recurrence: "yearly" }, d("2026-01-10"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
  });

  test("after Jan 15: current = Jan 15 this year, next = Jan 15 next year", () => {
    const { current, next } = cycleDueDates({ due_day: 15, recurrence: "yearly" }, d("2026-07-10"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2027, 0, 15)).toISOString());
  });

  test("on Jan 15: current = today, no advance", () => {
    const { current, next } = cycleDueDates({ due_day: 15, recurrence: "yearly" }, d("2026-01-15"));
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
  });
});

// ─── cycleDueDates — one-time ─────────────────────────────────────────────────

describe("cycleDueDates — one-time", () => {
  test("no advancement: current = next = this month's due_day", () => {
    const { current, next } = cycleDueDates({ due_day: 20, recurrence: "one-time" }, d("2026-07-25"));
    // due_day 20 in July, even though today is the 25th — no advance
    expect(current.toISOString()).toBe(new Date(Date.UTC(2026, 6, 20)).toISOString());
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 6, 20)).toISOString());
  });
});

// ─── isOverdueBill ────────────────────────────────────────────────────────────

describe("isOverdueBill", () => {
  test("monthly bill past due_day this month → overdue", () => {
    expect(isOverdueBill({ due_day: 1, recurrence: "monthly" }, d("2026-07-15"))).toBe(true);
  });

  test("monthly bill due in the future → not overdue", () => {
    expect(isOverdueBill({ due_day: 20, recurrence: "monthly" }, d("2026-07-15"))).toBe(false);
  });

  test("monthly bill due today → not overdue (not strictly past)", () => {
    expect(isOverdueBill({ due_day: 15, recurrence: "monthly" }, d("2026-07-15"))).toBe(false);
  });

  test("one-time bill is never overdue", () => {
    expect(isOverdueBill({ due_day: 1, recurrence: "one-time" }, d("2026-07-15"))).toBe(false);
  });

  test("yearly bill 5 days past Jan due_day → overdue (within 30-day cap)", () => {
    expect(isOverdueBill({ due_day: 10, recurrence: "yearly" }, d("2026-01-15"))).toBe(true);
  });

  test("yearly bill 35 days past → NOT overdue (beyond 30-day cap)", () => {
    expect(isOverdueBill({ due_day: 1, recurrence: "yearly" }, d("2026-02-05"))).toBe(false);
  });

  test("weekly bill: due day was yesterday → overdue", () => {
    // today = Wednesday (3), due_day = Tuesday (2). last Tuesday was yesterday.
    expect(isOverdueBill({ due_day: 2, recurrence: "weekly" }, d("2026-07-15"))).toBe(true);
  });

  test("weekly bill: due day is today → not overdue", () => {
    // today = Wednesday (3), due_day = Wednesday (3)
    expect(isOverdueBill({ due_day: 3, recurrence: "weekly" }, d("2026-07-15"))).toBe(false);
  });
});

