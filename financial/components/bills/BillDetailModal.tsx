"use client";

import { useEffect } from "react";
import { X, Trash2, Check } from "lucide-react";
import { CATEGORY_META, formatMoney } from "@/components/budget/types";
import type { Bill } from "@/components/bills/BillsWidget";
import { isPaidThisCycle } from "@/lib/budget/verdict";
import { isOverdueBill, formatCurrentDue } from "@/lib/bills/cycle";

// Returns the ISO Monday of the week containing `date` as a "YYYY-MM-DD" key.
function mondayKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon … 7=Sun
  d.setDate(d.getDate() - dow + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeOnTimeStreak(bill: Bill): number | null {
  // yearly / one-time: due_day encodes different semantics — skip streak
  if (bill.recurrence === "yearly" || bill.recurrence === "one-time") return null;
  if (bill.bill_payments.length === 0) return 0;

  if (bill.recurrence === "monthly") {
    // Consecutive months where the payment day ≤ due_day
    let streak = 0;
    for (const p of bill.bill_payments) { // sorted desc by paid_at (API guarantee)
      if (new Date(p.paid_at).getDate() <= bill.due_day) streak++;
      else break;
    }
    return streak;
  }

  if (bill.recurrence === "weekly") {
    // Consecutive calendar weeks (Mon-start) where a payment was made.
    // payments are sorted desc; each adjacent pair must be exactly 7 days apart (Mon keys).
    const weekKeys = bill.bill_payments.map(p => mondayKey(new Date(p.paid_at)));
    let streak = 1;
    for (let i = 1; i < weekKeys.length; i++) {
      const curr = new Date(weekKeys[i - 1]);
      const prev = new Date(weekKeys[i]);
      if ((curr.getTime() - prev.getTime()) / 86400000 === 7) streak++;
      else break;
    }
    return streak;
  }

  return null;
}

const RECURRENCE_LABEL: Record<Bill["recurrence"], string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  yearly: "Yearly",
  "one-time": "One-Time",
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface BillDetailModalProps {
  bill: Bill;
  onClose: () => void;
  onMarkPaid: (b: Bill) => void;
  onMarkUnpaid: (b: Bill) => void;
  onEdit: (b: Bill) => void;
  onDelete: (b: Bill) => void;
  onRemovePayment: (billId: string, paymentId: string) => void;
}

export default function BillDetailModal({
  bill,
  onClose,
  onMarkPaid,
  onMarkUnpaid,
  onEdit,
  onDelete,
  onRemovePayment,
}: BillDetailModalProps) {
  const today = new Date();
  const paid = isPaidThisCycle(bill);
  const overdue = isOverdueBill(bill, today) && !paid;
  const meta = bill.category_id ? CATEGORY_META[bill.category_id] : null;

  const timesPaid = bill.bill_payments.length;
  const totalPaid = bill.bill_payments.reduce((s, p) => s + p.amount, 0);
  const avgAmount = timesPaid > 0 ? totalPaid / timesPaid : 0;
  const lastPaid = timesPaid > 0
    ? new Date(bill.bill_payments[0].paid_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      })
    : "Never";
  const streak = computeOnTimeStreak(bill);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const formatDueDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });

  const insights: { label: string; value: string; mono?: boolean }[] = [
    { label: "Times paid", value: String(timesPaid) },
    { label: "Total paid to date", value: timesPaid > 0 ? `$${formatMoney(totalPaid)}` : "—", mono: true },
    { label: "Average amount", value: timesPaid > 0 ? `$${formatMoney(avgAmount)}` : "—", mono: true },
    { label: "Last paid", value: lastPaid },
    {
      label: "On-time streak",
      value: streak === null
        ? "N/A"
        : streak === 0 ? "0" : `${streak} ${streak === 1 ? "payment" : "payments"}`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[8px]" onClick={onClose} />
      <div className="relative bg-[var(--color-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] p-6 w-full max-w-lg z-50 max-h-[80vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-(--font-display) text-[20px] text-(--color-text-primary) leading-tight">{bill.name}</p>
            <p className="font-(--font-mono) text-[28px] text-(--color-text-primary) mt-1">${formatMoney(bill.amount)}</p>
            {overdue ? (
              <p className="text-[13px] text-(--color-danger) mt-0.5">Overdue since {formatCurrentDue(bill, today)}</p>
            ) : (
              <p className="text-[13px] text-(--color-text-secondary) mt-0.5">Due on {formatDueDate(bill.next_due_date)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors shrink-0 mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="text-[11px] px-2.5 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary)">
            {RECURRENCE_LABEL[bill.recurrence]}
          </span>
          {meta && (
            <span
              className="text-[11px] px-2.5 py-1 rounded-full"
              style={{ background: meta.hex + "22", color: meta.hex }}
            >
              {meta.label}
            </span>
          )}
          {paid && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-(--color-success)/15 text-(--color-success)">
              Paid this cycle
            </span>
          )}
        </div>

        {/* Insights */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-(--color-text-tertiary) font-medium mb-3">Insights</p>
          <div className="grid grid-cols-2 gap-2">
            {insights.map(({ label, value, mono }) => (
              <div key={label} className="bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5">
                <p className="text-[10px] text-(--color-text-tertiary) mb-0.5">{label}</p>
                <p className={`text-[13px] text-(--color-text-primary) ${mono ? "font-(--font-mono)" : ""}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment history */}
        {bill.bill_payments.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-(--color-text-tertiary) font-medium mb-3">Payment history</p>
            <div className="divide-y divide-(--color-border-subtle)">
              {bill.bill_payments.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2">
                  <p className="font-(--font-mono) text-[12px] text-(--color-text-secondary)">
                    {new Date(p.paid_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="font-(--font-mono) text-[12px] text-(--color-text-primary)">${formatMoney(p.amount)}</p>
                    <button
                      onClick={() => onRemovePayment(bill.id, p.id)}
                      title="Remove payment"
                      className="p-0.5 text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-4 border-t border-(--color-border-subtle) space-y-2">
          <div className="flex gap-2">
            {!paid && (
              <button
                onClick={() => onMarkPaid(bill)}
                className="flex-1 py-2 text-sm font-medium rounded-lg bg-(--color-accent) text-black hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <Check size={14} />
                Mark paid
              </button>
            )}
            {paid && bill.bill_payments.length > 0 && (
              <button
                onClick={() => onMarkUnpaid(bill)}
                className="flex-1 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors"
              >
                Undo payment
              </button>
            )}
            <button
              onClick={() => onEdit(bill)}
              className="flex-1 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors"
            >
              Edit
            </button>
          </div>
          <button
            onClick={() => onDelete(bill)}
            className="w-full py-2 text-sm text-(--color-danger) hover:opacity-80 transition-opacity"
          >
            Delete bill
          </button>
        </div>

      </div>
    </div>
  );
}
