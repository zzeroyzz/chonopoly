"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  LayoutGrid, TrendingDown, CalendarDays, Plus,
  Check, Pencil, Trash2, ChevronDown, X,
} from "lucide-react";
import { Account, CATEGORY_META, formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/ui/StatCard";
import type { Bill } from "@/components/bills/BillsWidget";
import BillDetailModal from "@/components/bills/BillDetailModal";
import { BillWizard } from "@/components/bills/BillWizard";
import { isPaidThisCycle } from "@/lib/budget/verdict";
import { isOverdueBill, formatCurrentDue } from "@/lib/bills/cycle";
import { MonthNav } from "@/components/bills/MonthNav";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function getDaysUntil(nextDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDueDate + "T00:00:00");
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function formatDueDate(nextDueDate: string): string {
  return new Date(nextDueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-500/20 text-blue-400",
    "bg-purple-500/20 text-purple-400",
    "bg-emerald-500/20 text-emerald-400",
    "bg-orange-500/20 text-orange-400",
    "bg-pink-500/20 text-pink-400",
    "bg-cyan-500/20 text-cyan-400",
    "bg-yellow-500/20 text-yellow-400",
    "bg-indigo-500/20 text-indigo-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function groupBillsForMonth(
  bills: Bill[],
  today: Date,
  viewedMonth: Date,
): { overdue: Bill[]; dueThisMonth: Bill[]; paid: Bill[] } {
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const billsByDay = buildBillsByDay(bills, year, month, daysInMonth);
  const inMonth = new Set<string>();
  for (const arr of Object.values(billsByDay)) for (const b of arr) inMonth.add(b.id);

  const overdue: Bill[] = [], dueThisMonth: Bill[] = [], paid: Bill[] = [];
  for (const b of bills) {
    if (isPaidThisCycle(b)) { paid.push(b); continue; }
    if (isOverdueBill(b, today)) { overdue.push(b); continue; }
    if (inMonth.has(b.id)) dueThisMonth.push(b);
  }
  return { overdue, dueThisMonth, paid };
}

// DRIFT NOTE: uses local-time arithmetic (new Date(year, month, d)); see cycle.ts header comment.
function buildBillsByDay(
  bills: Bill[], year: number, month: number, daysInMonth: number,
): Record<number, Bill[]> {
  const map: Record<number, Bill[]> = {};
  for (const bill of bills) {
    if (!bill.is_active) continue;
    if (bill.recurrence === "monthly") {
      const d = bill.due_day;
      if (d >= 1 && d <= daysInMonth) map[d] = [...(map[d] ?? []), bill];
    } else if (bill.recurrence === "weekly") {
      const target = bill.due_day % 7;
      for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(year, month, d).getDay() === target)
          map[d] = [...(map[d] ?? []), bill];
      }
    } else if (bill.recurrence === "yearly") {
      if (new Date(bill.created_at).getMonth() === month) {
        const d = bill.due_day;
        if (d >= 1 && d <= daysInMonth) map[d] = [...(map[d] ?? []), bill];
      }
    } else if (bill.recurrence === "one-time") {
      const created = new Date(bill.created_at);
      if (created.getMonth() === month && created.getFullYear() === year) {
        const d = bill.due_day;
        if (d >= 1 && d <= daysInMonth) map[d] = [...(map[d] ?? []), bill];
      }
    }
  }
  return map;
}

const RECURRENCE_OPTIONS = ["monthly", "weekly", "yearly", "one-time"] as const;
const CATEGORY_OPTIONS = Object.entries(CATEGORY_META)
  .filter(([key]) => !["TRANSFER_IN", "TRANSFER_OUT", "OTHER"].includes(key))
  .map(([key, m]) => ({ id: key, name: m.label, hex: m.hex }));

// ─── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ bills }: { bills: Bill[] }) {
  const today = new Date();
  const totalDueMonth = bills
    .filter(b => !isPaidThisCycle(b) && !isOverdueBill(b, today))
    .reduce((s, b) => s + b.amount, 0);
  const totalOverdue = bills
    .filter(b => !isPaidThisCycle(b) && isOverdueBill(b, today))
    .reduce((s, b) => s + b.amount, 0);
  const paidMonth = bills
    .filter(b => isPaidThisCycle(b))
    .reduce((s, b) => s + b.amount, 0);
  const upcoming = bills
    .filter(b => !isPaidThisCycle(b) && !isOverdueBill(b, today))
    .sort((a, b) => getDaysUntil(a.next_due_date) - getDaysUntil(b.next_due_date))[0] ?? null;
  const nextInDays = upcoming ? getDaysUntil(upcoming.next_due_date) : null;

  const nextBillVariant = nextInDays === null
    ? "muted"
    : nextInDays <= 0
      ? "danger"
      : nextInDays <= 3
        ? "warning"
        : "default";

  return (
    <>
      {/* Mobile summary card — 2×2 grid */}
      <div className="lg:hidden rounded-2xl p-4 mb-4 border border-(--color-border-subtle) bg-(--color-elevated)">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Due This Month</span>
            <span className={`text-[18px] font-semibold font-(--font-mono) ${totalDueMonth > 0 ? "text-(--color-warning)" : "text-(--color-text-tertiary)"}`}>${formatMoney(totalDueMonth)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Overdue</span>
            <span className={`text-[18px] font-semibold font-(--font-mono) ${totalOverdue > 0 ? "text-(--color-danger)" : "text-(--color-text-tertiary)"}`}>${formatMoney(totalOverdue)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Paid</span>
            <span className={`text-[18px] font-semibold font-(--font-mono) ${paidMonth > 0 ? "text-(--color-success)" : "text-(--color-text-tertiary)"}`}>${formatMoney(paidMonth)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Next Bill</span>
            <span className="text-[18px] font-semibold font-(--font-mono) text-(--color-text-primary)">
              {nextInDays === null ? "—" : nextInDays === 0 ? "Today" : `${nextInDays}d`}
            </span>
          </div>
        </div>
      </div>
      {/* Desktop stat cards */}
      <div className="hidden lg:grid grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Due This Month"
          value={`$${formatMoney(totalDueMonth)}`}
          variant={totalDueMonth > 0 ? "warning" : "muted"}
        />
        <StatCard
          label="Overdue"
          value={`$${formatMoney(totalOverdue)}`}
          variant={totalOverdue > 0 ? "danger" : "muted"}
        />
        <StatCard
          label="Paid This Cycle"
          value={`$${formatMoney(paidMonth)}`}
          variant={paidMonth > 0 ? "success" : "muted"}
        />
        <StatCard
          label="Next Bill"
          value={nextInDays === null ? "—" : nextInDays === 0 ? "Today" : `${nextInDays}d`}
          variant={nextBillVariant}
        />
      </div>
    </>
  );
}

// ─── Grid view (panel variant) ────────────────────────────────────────────────

function PanelGridView({ bills, viewedMonth, onMarkPaid, onMarkUnpaid, onBillClick }: {
  bills: Bill[];
  viewedMonth: Date;
  onMarkPaid: (b: Bill) => void;
  onMarkUnpaid: (b: Bill) => void;
  onBillClick: (b: Bill) => void;
}) {
  const today = new Date();
  const { overdue, dueThisMonth, paid } = groupBillsForMonth(bills, today, viewedMonth);

  if (bills.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <p className="text-sm text-(--color-text-tertiary)">No bills yet. Add one with +</p>
      </div>
    );
  }

  const sections = [
    { label: "Overdue", items: overdue, labelColor: "text-(--color-danger)" },
    { label: "Due this month", items: dueThisMonth, labelColor: "text-(--color-text-disabled)" },
    { label: "Paid", items: paid, labelColor: "text-(--color-text-disabled)" },
  ].filter(s => s.items.length > 0);

  return (
    <div className="space-y-5">
      {sections.map(({ label, items, labelColor }) => (
        <div key={label}>
          <p className={`text-[10px] uppercase tracking-[0.12em] font-medium mb-2 ${labelColor}`}>{label}</p>
          <div className="divide-y divide-(--color-border-subtle) bg-(--color-elevated) border border-(--color-border-default) rounded-lg overflow-hidden">
            {items.map(b => {
              const paid = isPaidThisCycle(b);
              const isOverdue = isOverdueBill(b, today) && !paid;
              const initial = b.name.charAt(0).toUpperCase();
              const color = avatarColor(b.name);
              return (
                <div key={b.id}>
                  {/* Mobile bill row */}
                  <div className="lg:hidden flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => onBillClick(b)}>
                    <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${color}`}>
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-(--color-text-primary) truncate">{b.name}</p>
                      <p className="text-[12px] text-(--color-text-tertiary)">
                        {paid ? "Paid this cycle" : isOverdue ? `Overdue since ${formatCurrentDue(b, today)}` : `Due ${formatDueDate(b.next_due_date)}`}
                        {b.recurrence !== "one-time" && ` · ${b.recurrence}`}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="text-[18px] font-(--font-mono) font-semibold text-(--color-text-primary)">${formatMoney(b.amount)}</p>
                      {paid && <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success)">Paid</span>}
                      {isOverdue && <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-danger)/15 text-(--color-danger)">Overdue</span>}
                      {!paid && (
                        <button
                          onClick={e => { e.stopPropagation(); onMarkPaid(b); }}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-accent)/15 text-(--color-accent)"
                        >
                          Mark paid
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Desktop bill row — unchanged */}
                  <div className="hidden lg:flex items-center gap-3 px-4 py-3 group cursor-pointer" onClick={() => onBillClick(b)}>
                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${color}`}>
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] text-(--color-text-primary) truncate">{b.name}</p>
                      <p className="text-[12px] text-(--color-text-tertiary)">
                        {paid ? "Paid this cycle" : isOverdue ? `Overdue since ${formatCurrentDue(b, today)}` : `Due ${formatDueDate(b.next_due_date)}`}
                        {b.recurrence !== "one-time" && (
                          <span className="ml-2 capitalize text-(--color-text-disabled)">{b.recurrence}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {paid && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success)">Paid</span>
                      )}
                      {isOverdue && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-danger)/15 text-(--color-danger)">Overdue</span>
                      )}
                      {!paid && (
                        <button
                          onClick={e => { e.stopPropagation(); onMarkPaid(b); }}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-accent) hover:text-(--color-accent) opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Check size={10} />
                          Mark paid
                        </button>
                      )}
                      {paid && b.bill_payments.length > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); onMarkUnpaid(b); }}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-warning) hover:text-(--color-warning) opacity-0 group-hover:opacity-100 transition-all"
                        >
                          Undo
                        </button>
                      )}
                      <p className="text-[15px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(b.amount)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Chart view (panel variant) ───────────────────────────────────────────────

interface ProjectionPoint {
  label: string;
  past: number | null;
  projected: number | null;
  billsDue: string[];
}

function buildProjection(bills: Bill[], accounts: Account[], viewedMonth: Date): ProjectionPoint[] {
  const seed = accounts
    .filter(a => a.type === "depository")
    .reduce((s, a) => s + (a.balances.current ?? 0), 0);

  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const billsByDay = buildBillsByDay(bills, year, month, daysInMonth);
  const points: ProjectionPoint[] = [];
  let running = seed;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    date.setHours(0, 0, 0, 0);
    const isAfterToday = date > today;
    const due = (billsByDay[d] ?? []).filter(b => !isPaidThisCycle(b));
    for (const b of due) running -= b.amount;
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    points.push({
      label,
      past: !isAfterToday ? running : null,
      projected: isAfterToday ? running : null,
      billsDue: due.map(b => b.name),
    });
  }
  return points;
}

function abbrevMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function ChartTooltip({
  active, payload, label,
}: { active?: boolean; payload?: unknown[]; label?: string }) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const point = (payload as any)[0]?.payload as ProjectionPoint;
  const balance = point.past ?? point.projected ?? 0;
  return (
    <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-lg px-3 py-2.5 shadow-xl">
      <p className="text-[10px] text-(--color-text-tertiary) mb-1.5">{label}</p>
      <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(balance)}</p>
      {point.billsDue.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-[#2e2e38]">
          {point.billsDue.map(name => (
            <p key={name} className="text-[11px] text-(--color-success)">{name} due</p>
          ))}
        </div>
      )}
    </div>
  );
}

function PanelChartView({ bills, accounts, viewedMonth }: { bills: Bill[]; accounts: Account[]; viewedMonth: Date }) {
  const data = buildProjection(bills, accounts, viewedMonth);
  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const todayPoint = data.find(p => p.label === todayLabel);
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={abbrevMoney}
            width={52}
          />
          <RechartsTooltip content={(p) => (
            <ChartTooltip active={p.active} payload={p.payload as unknown[]} label={p.label as string} />
          )} />
          {todayPoint && (
            <ReferenceLine
              x={todayPoint.label}
              stroke="var(--color-border-strong)"
              strokeDasharray="3 3"
              label={{ value: "Today", position: "insideTopLeft", fill: "var(--color-text-tertiary)", fontSize: 10 }}
            />
          )}
          <Line dataKey="past" stroke="var(--color-accent)" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line
            dataKey="projected"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            strokeDasharray="5 5"
            dot={(props: { cx?: number; cy?: number; payload: ProjectionPoint }) =>
              props.payload.billsDue.length > 0 && props.cx != null && props.cy != null
                ? <circle key={`dot-${props.cx}`} cx={props.cx} cy={props.cy} r={5} fill="var(--color-success)" />
                : <g key={`dot-${props.cx}`} />
            }
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Calendar view (panel variant) ────────────────────────────────────────────

function PanelCalendarView({ bills, viewedMonth, onBillClick }: {
  bills: Bill[];
  viewedMonth: Date;
  onBillClick: (b: Bill) => void;
}) {
  const year = viewedMonth.getFullYear();
  const month = viewedMonth.getMonth();
  const today = new Date();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const billsByDay = buildBillsByDay(bills, year, month, daysInMonth);

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const isPast = (d: number) =>
    new Date(year, month, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

  function pillClasses(paid: boolean, dueToday: boolean, overdue: boolean): string {
    if (paid) return "bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20";
    if (dueToday) return "bg-(--color-warning)/20 text-(--color-warning) border border-(--color-warning)/40";
    if (overdue) return "bg-(--color-danger)/15 text-(--color-danger) border border-(--color-danger)/30";
    return "bg-(--color-accent)/15 text-(--color-accent) border border-(--color-accent)/30";
  }

  function abbrevAmt(n: number): string {
    if (n >= 100000) return `$${Math.round(n / 1000)}k`;
    if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <p key={d} className="text-[11px] text-(--color-text-disabled) text-center">{d}</p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`flex flex-col min-h-[52px] px-0.5 py-1 ${day !== null && billsByDay[day]?.length ? "cursor-pointer" : "cursor-default"}`}
            onClick={() => { if (day !== null && billsByDay[day]?.length) onBillClick(billsByDay[day][0]); }}
          >
            {day !== null && (
              <>
                <div className="flex justify-center mb-0.5">
                  <span className={`text-sm w-7 h-7 flex items-center justify-center
                    ${isToday(day) ? "bg-(--color-accent) text-black rounded-full font-semibold" : ""}
                    ${isPast(day) && !isToday(day) ? "text-(--color-text-disabled)" : !isToday(day) ? "text-(--color-text-primary)" : ""}
                  `}>
                    {day}
                  </span>
                </div>
                {billsByDay[day]?.length > 0 && (
                  <div className="flex flex-col gap-0.5 w-full">
                    {billsByDay[day].slice(0, 2).map(b => {
                      const paid = isPaidThisCycle(b);
                      return (
                        <div
                          key={b.id}
                          onClick={e => { e.stopPropagation(); onBillClick(b); }}
                          className={`min-h-[18px] rounded-(--radius-pill) px-1.5 text-[10px] font-medium flex items-center justify-between gap-1 overflow-hidden cursor-pointer touch-manipulation ${pillClasses(paid, isToday(day), isPast(day) && !paid)}`}
                        >
                          h
                          <span>${formatMoney(b.amount)}</span>
                        </div>
                      );
                    })}
                    {billsByDay[day].length > 2 && (
                      <span className="text-[9px] text-(--color-text-tertiary) pl-1">+{billsByDay[day].length - 2} more</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Add / Edit bill form ─────────────────────────────────────────────────────

function BillForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Bill>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [dueDay, setDueDay] = useState(initial?.due_day ? String(initial.due_day) : "1");
  const [recurrence, setRecurrence] = useState<typeof RECURRENCE_OPTIONS[number]>(initial?.recurrence ?? "monthly");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [saving, setSaving] = useState(false);

  const isEdit = !!initial?.id;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function handleSave() {
    const amt = parseFloat(amount);
    const day = parseInt(dueDay, 10);
    if (!name || isNaN(amt) || amt <= 0 || isNaN(day) || day < 1 || day > 31) return;
    setSaving(true);
    if (isEdit) {
      await fetch("/api/bills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: initial!.id, name, amount: amt, due_day: day, recurrence, category_id: categoryId }),
      });
    } else {
      await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount: amt, due_day: day, recurrence, category_id: categoryId }),
      });
    }
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[8px]" onClick={onCancel} />
      <div className="relative bg-[var(--color-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6 w-full max-w-md shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-semibold text-(--color-text-primary)">{isEdit ? "Edit bill" : "Add bill"}</p>
          <button onClick={onCancel} className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Bill name"
            className="w-full bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
          />

          <div className="flex items-center gap-2">
            <span className="text-sm text-(--color-text-tertiary)">$</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="flex-1 bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[12px] text-(--color-text-secondary) shrink-0">Day of month</label>
            <input
              type="number"
              value={dueDay}
              onChange={e => setDueDay(e.target.value)}
              min="1"
              max="31"
              className="w-24 bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {RECURRENCE_OPTIONS.map(r => (
              <button
                key={r}
                onClick={() => setRecurrence(r)}
                className={`px-3 py-1.5 rounded-full text-xs border capitalize transition-colors ${recurrence === r ? "border-white/30 bg-white/10 text-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white"}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map(c => (
              <button
                key={c.id}
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${categoryId === c.id ? "text-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white"}`}
                style={categoryId === c.id ? { borderColor: c.hex, background: c.hex + "22", color: c.hex } : {}}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-lg hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !amount}
            className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-lg disabled:opacity-40 hover:bg-white/90 transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bills list (all bills, with edit/delete/payment history) ─────────────────

function BillsList({ bills, onEdit, onDelete, onMarkPaid, onMarkUnpaid, onRefresh, onBillClick }: {
  bills: Bill[];
  onEdit: (b: Bill) => void;
  onDelete: (b: Bill) => void;
  onMarkPaid: (b: Bill) => void;
  onMarkUnpaid: (b: Bill) => void;
  onRefresh: () => void;
  onBillClick: (b: Bill) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function removePayment(bill_id: string, payment_id: string) {
    await fetch("/api/bills/mark-paid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id, payment_id }),
    });
    onRefresh();
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (bills.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-(--color-text-tertiary) font-medium mb-3">All bills</p>
      <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-lg overflow-hidden divide-y divide-(--color-border-subtle)">
        {bills.map(b => {
          const paid = isPaidThisCycle(b);
          const today = new Date();
          const isOverdue = isOverdueBill(b, today) && !paid;
          const isExpanded = expanded.has(b.id);
          const color = avatarColor(b.name);
          const meta = b.category_id ? CATEGORY_META[b.category_id] : null;

          return (
            <div key={b.id} data-testid={`bill-row-${b.id}`}>
              {/* Mobile bill row */}
              <div className="lg:hidden flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => onBillClick(b)}>
                <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${color}`}>
                  {b.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-(--color-text-primary) truncate">{b.name}</p>
                  <p className="text-[12px] text-(--color-text-tertiary) capitalize">
                    {paid ? "Paid this cycle" : isOverdue ? `Overdue since ${formatCurrentDue(b, today)}` : `Due ${formatDueDate(b.next_due_date)}`}
                    {b.recurrence !== "one-time" && ` · ${b.recurrence}`}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <p className="text-[18px] font-(--font-mono) font-semibold text-(--color-text-primary)">${formatMoney(b.amount)}</p>
                  {paid && <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success)">Paid</span>}
                  {isOverdue && <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-danger)/15 text-(--color-danger)">Overdue</span>}
                  {!paid && (
                    <button
                      onClick={e => { e.stopPropagation(); onMarkPaid(b); }}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-accent)/15 text-(--color-accent)"
                    >
                      Mark paid
                    </button>
                  )}
                </div>
              </div>
              {/* Desktop bill row — unchanged */}
              <div className="hidden lg:flex items-center gap-3 px-4 py-3 group cursor-pointer" onClick={() => onBillClick(b)}>
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${color}`}>
                  {b.name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] text-(--color-text-primary) truncate">{b.name}</p>
                    {meta && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: meta.hex + "22", color: meta.hex }}
                      >
                        {meta.label}
                      </span>
                    )}
                    {b.is_auto_detected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-tertiary) shrink-0">
                        Auto
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-(--color-text-tertiary) capitalize">
                    {b.recurrence} · Day {b.due_day}
                    {paid ? " · Paid this cycle" : isOverdue ? ` · Overdue since ${formatCurrentDue(b, today)}` : ` · Due ${formatDueDate(b.next_due_date)}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {paid && <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success)">Paid</span>}
                  {isOverdue && <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-danger)/15 text-(--color-danger)">Overdue</span>}
                  <p className="text-[15px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(b.amount)}</p>

                  {/* Actions – visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!paid && (
                      <button
                        onClick={e => { e.stopPropagation(); onMarkPaid(b); }}
                        title="Mark paid"
                        className="p-1.5 rounded-md text-(--color-text-tertiary) hover:text-(--color-success) hover:bg-(--color-success)/10 transition-colors"
                      >
                        <Check size={13} />
                      </button>
                    )}
                    {paid && b.bill_payments.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); onMarkUnpaid(b); }}
                        title="Undo payment"
                        className="p-1.5 rounded-md text-[11px] text-(--color-text-tertiary) hover:text-(--color-warning) hover:bg-(--color-warning)/10 transition-colors"
                      >
                        Undo
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(b); }}
                      title="Edit"
                      data-testid="bill-edit-btn"
                      className="p-1.5 rounded-md text-(--color-text-tertiary) hover:text-(--color-text-primary) hover:bg-(--color-elevated) transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(b); }}
                      title="Delete"
                      className="p-1.5 rounded-md text-(--color-text-tertiary) hover:text-(--color-danger) hover:bg-(--color-danger)/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {b.bill_payments.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleExpand(b.id); }}
                      data-testid="bill-expand-btn"
                      className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
                    >
                      <ChevronDown size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              </div>

              {isExpanded && b.bill_payments.length > 0 && (
                <div className="px-4 pb-3 pt-0 ml-11 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.1em] text-(--color-text-disabled) mb-2">Payment history</p>
                  {b.bill_payments.map(p => (
                    <div key={p.id} className="flex justify-between items-center">
                      <p className="text-[12px] text-(--color-text-tertiary)">
                        {new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        <span className="ml-2 text-(--color-text-disabled)">{p.period}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-(--font-mono) text-(--color-text-secondary)">${formatMoney(p.amount)}</p>
                        <button
                          onClick={() => removePayment(b.id, p.id)}
                          title="Remove payment"
                          className="p-0.5 text-(--color-text-disabled) hover:text-(--color-danger) transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BillsPanel ───────────────────────────────────────────────────────────────

type PanelView = "grid" | "chart" | "calendar";

export interface BillsPanelHandle { triggerCreate: () => void }
interface BillsPanelOwnProps { accounts?: Account[] }

const BillsPanel = forwardRef<BillsPanelHandle, BillsPanelOwnProps>(
  function BillsPanel({ accounts: accountsProp }, ref) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>(accountsProp ?? []);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<PanelView>("grid");
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewedMonth, setViewedMonth] = useState<Date | null>(null);

  useImperativeHandle(ref, () => ({ triggerCreate: () => setShowAddForm(true) }));
  useEffect(() => { setViewedMonth(new Date()); }, []);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  const selectedBill = bills.find(b => b.id === selectedBillId) ?? null;

  const loadBills = useCallback(async () => {
    const res = await fetch("/api/bills");
    const d = res.ok ? await res.json() : { bills: [] };
    setBills(d.bills ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const billsRes = await fetch("/api/bills");
      const billsData = billsRes.ok ? await billsRes.json() : { bills: [] };
      setBills(billsData.bills ?? []);
      if (!accountsProp) {
        // Fallback: fetch accounts independently when not provided by parent
        const txRes = await fetch("/api/plaid/transactions");
        const txData = txRes.ok ? await txRes.json() : { accounts: [] };
        setAccounts(txData.accounts ?? []);
      }
      setLoading(false);
    }
    init();
  // accountsProp intentionally excluded — only used as seed on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markUnpaid(bill: Bill) {
    if (!bill.bill_payments.length) return;
    await fetch("/api/bills/mark-paid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: bill.id, payment_id: bill.bill_payments[0].id }),
    });
    loadBills();
  }

  async function markPaid(bill: Bill) {
    const today = new Date();
    const period = bill.recurrence === "monthly"
      ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
      : bill.recurrence === "weekly"
      ? `${today.getFullYear()}-${String(Math.ceil(today.getDate() / 7)).padStart(2, "0")}`
      : bill.recurrence === "yearly"
      ? String(today.getFullYear())
      : today.toISOString().split("T")[0];

    await fetch("/api/bills/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: bill.id, amount: bill.amount, period }),
    });
    loadBills();
  }

  async function deleteBill(bill: Bill) {
    setDeletingId(bill.id);
    setSelectedBillId(null);
    await fetch("/api/bills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: bill.id }),
    });
    setDeletingId(null);
    loadBills();
  }

  async function removePayment(billId: string, paymentId: string) {
    await fetch("/api/bills/mark-paid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: billId, payment_id: paymentId }),
    });
    loadBills();
  }

  const viewButtons: { view: PanelView; icon: React.ReactNode; label: string }[] = [
    { view: "grid", icon: <LayoutGrid size={15} />, label: "Grid" },
    { view: "chart", icon: <TrendingDown size={15} />, label: "Chart" },
    { view: "calendar", icon: <CalendarDays size={15} />, label: "Calendar" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-(--color-text-tertiary)">Loading bills…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <SummaryBar bills={bills} />

      {/* View switcher */}
      <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-(--color-border-subtle) px-4 py-3">
          <div className="flex items-center gap-1">
            {viewButtons.map(({ view, icon, label }) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${activeView === view ? "bg-(--color-border-default) text-(--color-text-primary)" : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"}`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-(--color-accent) hover:bg-(--color-accent)/10 transition-colors"
          >
            <Plus size={14} />
            Add bill
          </button>
        </div>

        {viewedMonth && (
          <div className="px-4 py-2 border-b border-(--color-border-subtle)">
            <MonthNav month={viewedMonth} onChange={setViewedMonth} size="sm" />
          </div>
        )}

        <div className="p-4">
          {activeView === "grid" && viewedMonth && <PanelGridView bills={bills} viewedMonth={viewedMonth} onMarkPaid={markPaid} onMarkUnpaid={markUnpaid} onBillClick={b => setSelectedBillId(b.id)} />}
          {activeView === "chart" && viewedMonth && <PanelChartView bills={bills} accounts={accounts} viewedMonth={viewedMonth} />}
          {activeView === "calendar" && viewedMonth && <PanelCalendarView bills={bills} viewedMonth={viewedMonth} onBillClick={b => setSelectedBillId(b.id)} />}
        </div>
      </div>

      {/* Full bills list */}
      <BillsList
        bills={bills}
        onEdit={b => setEditingBill(b)}
        onDelete={b => {
          void deletingId;
          deleteBill(b);
        }}
        onMarkPaid={markPaid}
        onMarkUnpaid={markUnpaid}
        onRefresh={loadBills}
        onBillClick={b => setSelectedBillId(b.id)}
      />

      {/* Bill detail modal */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          onClose={() => setSelectedBillId(null)}
          onMarkPaid={b => { markPaid(b); }}
          onMarkUnpaid={b => { markUnpaid(b); }}
          onEdit={b => { setSelectedBillId(null); setEditingBill(b); }}
          onDelete={b => deleteBill(b)}
          onRemovePayment={removePayment}
        />
      )}

      {/* Add wizard */}
      {showAddForm && (
        <BillWizard
          showDebtStep={true}
          onSuccess={(_bill: Bill) => { setShowAddForm(false); loadBills(); }}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Edit form */}
      {editingBill && (
        <BillForm
          initial={editingBill}
          onSave={() => { setEditingBill(null); loadBills(); }}
          onCancel={() => setEditingBill(null)}
        />
      )}
    </div>
  );
});

export default BillsPanel;
