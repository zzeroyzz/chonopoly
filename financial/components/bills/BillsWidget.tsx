"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  LayoutGrid, TrendingDown, CalendarDays, Plus,
  Check, X,
} from "lucide-react";
import { Account, CATEGORY_META, formatMoney } from "@/components/budget/types";
import BillDetailModal from "@/components/bills/BillDetailModal";
import { isPaidThisCycle } from "@/lib/budget/verdict";
import { isOverdueBill, formatCurrentDue } from "@/lib/bills/cycle";
import { MonthNav } from "@/components/bills/MonthNav";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Bill {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  recurrence: "monthly" | "weekly" | "yearly" | "one-time";
  category_id: string | null;
  is_auto_detected: boolean;
  plaid_merchant: string | null;
  is_active: boolean;
  last_paid_at: string | null;
  notified_3day: boolean;
  notified_today: boolean;
  created_at: string;
  next_due_date: string; // computed by API, "YYYY-MM-DD"
  bill_payments: { id: string; paid_at: string; amount: number; period: string }[];
}

interface BillsWidgetProps {
  accounts: Account[];
}

type View = "grid" | "chart" | "calendar";

const RECURRENCE_OPTIONS = ["monthly", "weekly", "yearly", "one-time"] as const;

const CATEGORY_OPTIONS = Object.entries(CATEGORY_META)
  .filter(([key]) => !["TRANSFER_IN", "TRANSFER_OUT", "OTHER"].includes(key))
  .map(([key, m]) => ({ id: key, name: m.label, hex: m.hex }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Bill card (grid view) ────────────────────────────────────────────────────

function BillCard({ bill, onMarkPaid, onMarkUnpaid, onBillClick }: {
  bill: Bill;
  onMarkPaid: (b: Bill) => void;
  onMarkUnpaid: (b: Bill) => void;
  onBillClick: (b: Bill) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const today = new Date();
  const paid = isPaidThisCycle(bill);
  const overdue = isOverdueBill(bill, today) && !paid;
  const initial = bill.name.charAt(0).toUpperCase();
  const color = avatarColor(bill.name);

  return (
    <div
      className="flex items-center gap-3 py-2 group cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onBillClick(bill)}
    >
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${color}`}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-(--color-text-primary) truncate">{bill.name}</p>
        <p className="text-[11px] text-(--color-text-tertiary)">
          {paid ? "Paid this cycle" : overdue ? `Overdue since ${formatCurrentDue(bill, today)}` : `Due ${formatDueDate(bill.next_due_date)}`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {paid && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success)">Paid</span>
        )}
        {overdue && !paid && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--color-warning)/15 text-(--color-warning)">Past</span>
        )}
        {hovered && !paid && (
          <button
            onClick={e => { e.stopPropagation(); onMarkPaid(bill); }}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-accent) hover:text-(--color-accent) transition-colors"
          >
            <Check size={9} />
            Mark paid
          </button>
        )}
        {hovered && paid && bill.bill_payments.length > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onMarkUnpaid(bill); }}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-warning) hover:text-(--color-warning) transition-colors"
          >
            Undo
          </button>
        )}
        <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(bill.amount)}</p>
      </div>
    </div>
  );
}

// ─── Grid view ────────────────────────────────────────────────────────────────

function GridView({ bills, currentMonth, onMarkPaid, onMarkUnpaid, onBillClick }: {
  bills: Bill[];
  currentMonth: Date;
  onMarkPaid: (b: Bill) => void;
  onMarkUnpaid: (b: Bill) => void;
  onBillClick: (b: Bill) => void;
}) {
  const today = new Date();
  const { overdue, dueThisMonth, paid } = groupBillsForMonth(bills, today, currentMonth);

  if (bills.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[12px] text-(--color-text-tertiary)">No bills yet. Add one with +</p>
      </div>
    );
  }

  const sections = [
    { label: "Overdue", items: overdue },
    { label: "Due this month", items: dueThisMonth },
    { label: "Paid", items: paid },
  ].filter(s => s.items.length > 0);

  return (
    <div className="flex-1 overflow-y-auto">
      {sections.map(({ label, items }) => (
        <div key={label} className="mb-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-disabled) mb-1">{label}</p>
          <div className="divide-y divide-(--color-border-subtle)">
            {items.map(b => (
              <BillCard
                key={b.id}
                bill={b}
                onMarkPaid={onMarkPaid}
                onMarkUnpaid={onMarkUnpaid}
                onBillClick={onBillClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Chart view ───────────────────────────────────────────────────────────────

interface ProjectionPoint {
  label: string;
  balance: number;
  projected: number | null;
  past: number | null;
  billsDue: string[];
  isToday: boolean;
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
    const isToday = date.getTime() === today.getTime();
    const isAfterToday = date > today;

    const due = (billsByDay[d] ?? []).filter(b => !isPaidThisCycle(b));
    for (const b of due) running -= b.amount;

    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    points.push({
      label,
      balance: isToday ? running : 0,
      past: !isAfterToday ? running : null,
      projected: isAfterToday ? running : null,
      billsDue: due.map(b => b.name),
      isToday,
    });
  }
  return points;
}

function abbrevMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function ChartTooltipContent({
  active, payload, label,
}: {
  active?: boolean;
  payload?: unknown[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const point = (payload as any)[0]?.payload as ProjectionPoint;
  const balance = point.past ?? point.projected ?? 0;
  return (
    <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-lg px-3 py-2.5 shadow-xl">
      <p className="text-[10px] text-(--color-text-tertiary) mb-1.5">{label}</p>
      <p className="text-[12px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(balance)}</p>
      {point.billsDue.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-[#2e2e38]">
          {point.billsDue.map(name => (
            <p key={name} className="text-[10px] text-(--color-success)">{name}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartView({ bills, accounts, currentMonth }: { bills: Bill[]; accounts: Account[]; currentMonth: Date }) {
  const data = buildProjection(bills, accounts, currentMonth);
  const todayIdx = 0;

  return (
    <div className="flex-1 min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} horizontal={true} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            interval={4}
          />
          <YAxis
            tick={{ fill: "var(--color-text-tertiary)", fontSize: 10, fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={abbrevMoney}
            width={44}
          />
          <RechartsTooltip content={(props) => (
            <ChartTooltipContent
              active={props.active}
              payload={props.payload as unknown[]}
              label={props.label as string}
            />
          )} />
          <ReferenceLine x={data[todayIdx]?.label} stroke="var(--color-border-strong)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopLeft", fill: "var(--color-text-tertiary)", fontSize: 9 }} />
          {/* Solid line: today only (index 0) */}
          <Line
            dataKey="past"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {/* Dashed line: projected (index 1–30) */}
          <Line
            dataKey="projected"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={(props: { cx?: number; cy?: number; payload: ProjectionPoint }) =>
              props.payload.billsDue.length > 0 && props.cx != null && props.cy != null
                ? <circle key={`dot-${props.cx}`} cx={props.cx} cy={props.cy} r={4} fill="var(--color-success)" />
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

// ─── Calendar view ────────────────────────────────────────────────────────────

// DRIFT NOTE: uses local-time arithmetic (new Date(year, month, d)); see cycle.ts header comment.
function buildBillsByDay(
  bills: Bill[],
  year: number,
  month: number,
  daysInMonth: number,
): Record<number, Bill[]> {
  const map: Record<number, Bill[]> = {};

  for (const bill of bills) {
    if (!bill.is_active) continue;

    if (bill.recurrence === "monthly") {
      const d = bill.due_day;
      if (d >= 1 && d <= daysInMonth) map[d] = [...(map[d] ?? []), bill];

    } else if (bill.recurrence === "weekly") {
      // due_day is stored as ISO weekday; map to JS Sunday-based getDay()
      const target = bill.due_day % 7;
      for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(year, month, d).getDay() === target) {
          map[d] = [...(map[d] ?? []), bill];
        }
      }

    } else if (bill.recurrence === "yearly") {
      // Show in the month the bill was created
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

function CalendarView({ bills, currentMonth, onBillClick }: {
  bills: Bill[];
  currentMonth: Date;
  onBillClick: (b: Bill) => void;
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
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

  function abbrevAmt(n: number): string {
    if (n >= 100000) return `$${Math.round(n / 1000)}k`;
    if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }

  function pillClasses(paid: boolean, dueToday: boolean, overdue: boolean): string {
    if (paid) return "bg-(--color-success)/10 text-(--color-success) border border-(--color-success)/20";
    if (dueToday) return "bg-(--color-warning)/20 text-(--color-warning) border border-(--color-warning)/40";
    if (overdue) return "bg-(--color-danger)/15 text-(--color-danger) border border-(--color-danger)/30";
    return "bg-(--color-accent)/15 text-(--color-accent) border border-(--color-accent)/30";
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Month nav is rendered at widget level above all views */}

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1 shrink-0">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <p key={d} className="text-[9px] text-(--color-text-disabled) text-center">{d}</p>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1 flex-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`flex flex-col min-h-[52px] px-0.5 ${day !== null && billsByDay[day]?.length ? "cursor-pointer" : "cursor-default"}`}
            onClick={() => { if (day !== null && billsByDay[day]?.length) onBillClick(billsByDay[day][0]); }}
          >
            {day !== null && (
              <>
                <div className="flex justify-center mb-0.5">
                  <span className={`text-[13px] w-6 h-6 flex items-center justify-center
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
                          <span className="truncate min-w-0">{paid ? "✓ " : ""}{b.name}</span>
                          <span className="shrink-0">{abbrevAmt(b.amount)}</span>
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

function AddBillForm({ onSave, onCancel, initial }: {
  onSave: () => void;
  onCancel: () => void;
  initial?: Partial<Bill>;
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
          <p className="text-[15px] font-semibold text-(--color-text-primary)">{isEdit ? "Edit bill" : "Add bill"}</p>
          <button onClick={onCancel} className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Bill name"
            className="w-full bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
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
              className="flex-1 bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
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
              className="w-20 bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
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
          <button onClick={onCancel} className="flex-1 py-2 text-sm text-[#7a7870] border border-[#2e2e38] rounded-lg hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !amount}
            className="flex-1 py-2 text-sm font-semibold bg-white text-black rounded-lg disabled:opacity-40 hover:bg-white/90 transition-colors"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BillsWidget ──────────────────────────────────────────────────────────────

export default function BillsWidget({ accounts }: BillsWidgetProps) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeView, setActiveView] = useState<View>("grid");
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  useEffect(() => { setCurrentMonth(new Date()); }, []);

  const loadBills = useCallback(async () => {
    const res = await fetch("/api/bills");
    const d = res.ok ? await res.json() : { bills: [] };
    setBills(d.bills ?? []);
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  const selectedBill = bills.find(b => b.id === selectedBillId) ?? null;
  const editingBill = bills.find(b => b.id === editingBillId) ?? null;

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
    await fetch("/api/bills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: bill.id }),
    });
    setSelectedBillId(null);
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

  const viewButtons: { view: View; icon: React.ReactNode; label: string }[] = [
    { view: "grid", icon: <LayoutGrid size={14} />, label: "Grid" },
    { view: "chart", icon: <TrendingDown size={14} />, label: "Chart" },
    { view: "calendar", icon: <CalendarDays size={14} />, label: "Calendar" },
  ];

  return (
    <div className="h-full bg-(--color-elevated) border border-(--color-border-default) rounded-md flex flex-col overflow-hidden" style={{ padding: "10px 14px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-[9px] font-medium text-(--color-text-secondary) uppercase tracking-[0.1em]">Bills</p>
        <div className="flex items-center gap-1">
          {viewButtons.map(({ view, icon, label }) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              aria-label={label}
              className={`p-1.5 rounded-md transition-colors ${activeView === view ? "bg-(--color-border-default) text-(--color-text-primary)" : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"}`}
            >
              {icon}
            </button>
          ))}
          <button
            onClick={() => setShowAddForm(true)}
            aria-label="Add bill"
            className="p-1.5 rounded-md text-(--color-accent) hover:bg-(--color-accent)/10 transition-colors ml-1"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Month navigator — shared across all three views */}
      {currentMonth && (
        <div className="mb-2 shrink-0">
          <MonthNav month={currentMonth} onChange={setCurrentMonth} size="sm" />
        </div>
      )}

      {/* View content */}
      {activeView === "grid" && currentMonth && (
        <GridView
          bills={bills}
          currentMonth={currentMonth}
          onMarkPaid={markPaid}
          onMarkUnpaid={markUnpaid}
          onBillClick={b => setSelectedBillId(b.id)}
        />
      )}
      {activeView === "chart" && currentMonth && <ChartView bills={bills} accounts={accounts} currentMonth={currentMonth} />}
      {activeView === "calendar" && currentMonth && (
        <CalendarView bills={bills} currentMonth={currentMonth} onBillClick={b => setSelectedBillId(b.id)} />
      )}

      {/* Add form */}
      {showAddForm && (
        <AddBillForm
          onSave={() => { setShowAddForm(false); loadBills(); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Edit form (from detail modal) */}
      {editingBill && (
        <AddBillForm
          initial={editingBill}
          onSave={() => { setEditingBillId(null); loadBills(); }}
          onCancel={() => setEditingBillId(null)}
        />
      )}

      {/* Bill detail modal */}
      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          onClose={() => setSelectedBillId(null)}
          onMarkPaid={markPaid}
          onMarkUnpaid={markUnpaid}
          onEdit={b => { setSelectedBillId(null); setEditingBillId(b.id); }}
          onDelete={deleteBill}
          onRemovePayment={removePayment}
        />
      )}
    </div>
  );
}
