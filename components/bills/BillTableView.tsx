"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/ui/StatCard";
import type { Bill } from "@/components/bills/BillsWidget";
import { isPaidThisCycle } from "@/lib/budget/verdict";
import { isOverdueBill } from "@/lib/bills/cycle";

// getDaysUntil: only used for Next Bill stat (next_due_date from API is always ≥ today)
function getDaysUntil(nextDueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(nextDueDate + "T00:00:00");
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function recurrenceLabel(r: string): string {
  if (r === "one-time") return "One-time";
  return r.charAt(0).toUpperCase() + r.slice(1);
}

// ─── Row dropdown ─────────────────────────────────────────────────────────────

function ActionsDropdown({ bill, onMarkPaid, onMarkUnpaid, onDelete, onEdit }: {
  bill: Bill;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const paid = isPaidThisCycle(bill);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-(--color-elevated) border border-(--color-border-default) rounded-md shadow-lg py-1 w-36">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle) transition-colors"
          >
            Edit
          </button>
          {!paid ? (
            <button
              onClick={() => { setOpen(false); onMarkPaid(); }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle) transition-colors"
            >
              Mark paid
            </button>
          ) : bill.bill_payments.length > 0 && (
            <button
              onClick={() => { setOpen(false); onMarkUnpaid(); }}
              className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle) transition-colors"
            >
              Undo payment
            </button>
          )}
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-danger) hover:bg-(--color-danger)/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── BillTableView ────────────────────────────────────────────────────────────

interface Props { onEdit: () => void }

export default function BillTableView({ onEdit }: Props) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/bills");
    const d = res.ok ? await res.json() : { bills: [] };
    setBills(d.bills ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

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
    load();
  }

  async function markUnpaid(bill: Bill) {
    if (!bill.bill_payments.length) return;
    await fetch("/api/bills/mark-paid", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: bill.id, payment_id: bill.bill_payments[0].id }),
    });
    load();
  }

  async function deleteBill(bill: Bill) {
    if (!confirm(`Delete "${bill.name}"?`)) return;
    await fetch("/api/bills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: bill.id }),
    });
    load();
  }

  if (loading) return (
    <div className="space-y-px">
      {[...Array(4)].map((_, i) => <div key={i} className="h-11 skeleton rounded" />)}
    </div>
  );

  if (bills.length === 0) return (
    <p className="text-sm text-(--color-text-tertiary) py-10 text-center">No bills yet.</p>
  );

  const today = new Date();
  const totalDueMonth = bills.filter(b => !isPaidThisCycle(b) && !isOverdueBill(b, today)).reduce((s, b) => s + b.amount, 0);
  const totalOverdue = bills.filter(b => !isPaidThisCycle(b) && isOverdueBill(b, today)).reduce((s, b) => s + b.amount, 0);
  const paidMonth = bills.filter(b => isPaidThisCycle(b)).reduce((s, b) => s + b.amount, 0);
  const upcoming = bills.filter(b => !isPaidThisCycle(b) && !isOverdueBill(b, today)).sort((a, b) => getDaysUntil(a.next_due_date) - getDaysUntil(b.next_due_date))[0] ?? null;
  const nextInDays = upcoming ? getDaysUntil(upcoming.next_due_date) : null;
  const nextBillVariant = nextInDays === null ? "muted" as const : nextInDays <= 0 ? "danger" as const : nextInDays <= 3 ? "warning" as const : "default" as const;

  return (
    <>
      <div className="grid gap-3 mb-5 grid-cols-2 md:grid-cols-4">
        <StatCard label="Due This Month" value={`$${formatMoney(totalDueMonth)}`} variant={totalDueMonth > 0 ? "warning" : "muted"} />
        <StatCard label="Overdue" value={`$${formatMoney(totalOverdue)}`} variant={totalOverdue > 0 ? "danger" : "muted"} />
        <StatCard label="Paid This Cycle" value={`$${formatMoney(paidMonth)}`} variant={paidMonth > 0 ? "success" : "muted"} />
        <StatCard label="Next Bill" value={nextInDays === null ? "—" : nextInDays === 0 ? "Today" : `${nextInDays}d`} variant={nextBillVariant} />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Bill", "Amount", "Due Day", "Recurrence", "Status", "Last Paid", ""].map(h => (
            <th key={h} className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) border-b border-(--color-border-default) sticky top-0 bg-(--color-base) z-10 py-2 px-3 text-left font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {bills.map(b => {
          const paid = isPaidThisCycle(b);
          const isOverdue = isOverdueBill(b, today) && !paid;
          const color = avatarColor(b.name);

          return (
            <tr key={b.id} className="border-b border-(--color-border-subtle) group hover:bg-(--color-border-subtle)/20 transition-colors">
              {/* Bill */}
              <td className="px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${color}`}>
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[13px] text-(--color-text-primary)">{b.name}</span>
                </div>
              </td>
              {/* Amount */}
              <td className="px-3 py-2" style={{ width: 100 }}>
                <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(b.amount)}</span>
              </td>
              {/* Due Day */}
              <td className="px-3 py-2" style={{ width: 80 }}>
                <span className="text-[13px] text-(--color-text-secondary)">{ordinal(b.due_day)}</span>
              </td>
              {/* Recurrence */}
              <td className="px-3 py-2" style={{ width: 100 }}>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-secondary)">
                  {recurrenceLabel(b.recurrence)}
                </span>
              </td>
              {/* Status */}
              <td className="px-3 py-2" style={{ width: 80 }}>
                {paid ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success)">Paid</span>
                ) : isOverdue ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-danger)/15 text-(--color-danger)">Overdue</span>
                ) : (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-accent)/15 text-(--color-accent)">Upcoming</span>
                )}
              </td>
              {/* Last Paid */}
              <td className="px-3 py-2" style={{ width: 120 }}>
                <span className="text-[13px] font-(--font-mono) text-(--color-text-tertiary)">
                  {b.last_paid_at ? fmtDate(b.last_paid_at) : "Never"}
                </span>
              </td>
              {/* Actions */}
              <td className="px-3 py-2" style={{ width: 40 }}>
                <ActionsDropdown
                  bill={b}
                  onMarkPaid={() => markPaid(b)}
                  onMarkUnpaid={() => markUnpaid(b)}
                  onDelete={() => deleteBill(b)}
                  onEdit={onEdit}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
      </div>
    </>
  );
}
