"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/ui/StatCard";
import { ActiveContext } from "@/lib/goals/types";
import { DebtSummary, DEBT_TYPE_META } from "@/lib/debts/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPayoffDate(iso: string): string {
  return "~" + new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function aprColor(apr: number): string {
  if (apr >= 20) return "text-(--color-danger)";
  if (apr >= 10) return "text-(--color-warning)";
  return "text-(--color-success)";
}

// ─── DebtTableView ────────────────────────────────────────────────────────────

interface Props {
  activeContext: ActiveContext;
  onEdit: () => void;
}

export default function DebtTableView({ activeContext, onEdit: _onEdit }: Props) {
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/debts/summary?${ctxParams}`);
    const d = res.ok ? await res.json() : { debts: [] };
    setDebts(d.debts ?? []);
    setLoading(false);
  }, [ctxParams]);

  useEffect(() => { load(); }, [load]);

  const activeDebts = debts.filter(d => d.status === "active");

  async function moveDebt(debt: DebtSummary, dir: "up" | "down") {
    const idx = activeDebts.findIndex(d => d.id === debt.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= activeDebts.length) return;
    setReordering(true);
    const a = activeDebts[idx], b = activeDebts[swapIdx];
    await Promise.all([
      fetch("/api/debts/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debt_id: a.id, priority_order: b.priority_order, context_type: activeContext.type, context_id: activeContext.id }) }),
      fetch("/api/debts/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debt_id: b.id, priority_order: a.priority_order, context_type: activeContext.type, context_id: activeContext.id }) }),
    ]);
    await load();
    setReordering(false);
  }

  async function deleteDebt(id: string) {
    if (!confirm("Delete this debt? This cannot be undone.")) return;
    setDeletingId(id);
    await fetch("/api/debts/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debt_id: id, context_type: activeContext.type, context_id: activeContext.id }),
    });
    await load();
    setDeletingId(null);
  }

  if (loading) return (
    <div className="space-y-px">
      {[...Array(4)].map((_, i) => <div key={i} className="h-11 skeleton rounded" />)}
    </div>
  );

  if (activeDebts.length === 0) return (
    <p className="text-sm text-(--color-text-tertiary) py-10 text-center">No active debts.</p>
  );

  const totalOwed = activeDebts.reduce((s, d) => s + d.current_balance, 0);
  const totalMonthlyPayment = activeDebts.reduce((s, d) => s + d.minimum_payment, 0);

  return (
    <>
      <div className="grid gap-3 mb-5 grid-cols-1 sm:grid-cols-2">
        <StatCard label="Total Owed" value={`$${formatMoney(totalOwed)}`} variant="danger" />
        <StatCard label="Monthly Payment" value={`$${formatMoney(totalMonthlyPayment)}`} />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Debt", "Type", "Balance", "APR", "Monthly Interest", "Min Payment", "Payoff Date", ""].map(h => (
            <th key={h} className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) border-b border-(--color-border-default) sticky top-0 bg-(--color-base) z-10 py-2 px-3 text-left font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {activeDebts.map((d, idx) => (
          <tr key={d.id} className="border-b border-(--color-border-subtle) group hover:bg-(--color-border-subtle)/20 transition-colors">
            {/* Debt */}
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[18px] leading-none">{d.icon}</span>
                <span className="text-[13px] text-(--color-text-primary)">{d.name}</span>
              </div>
            </td>
            {/* Type */}
            <td className="px-3 py-2" style={{ width: 100 }}>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-secondary)">
                {DEBT_TYPE_META[d.debt_type]?.label ?? d.debt_type}
              </span>
            </td>
            {/* Balance */}
            <td className="px-3 py-2" style={{ width: 110 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-danger)">${formatMoney(d.current_balance)}</span>
            </td>
            {/* APR */}
            <td className="px-3 py-2" style={{ width: 70 }}>
              <span className={`text-[13px] font-(--font-mono) ${aprColor(d.interest_rate)}`}>{d.interest_rate}%</span>
            </td>
            {/* Monthly Interest */}
            <td className="px-3 py-2" style={{ width: 120 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-danger)">${formatMoney(d.monthly_interest)}</span>
            </td>
            {/* Min Payment */}
            <td className="px-3 py-2" style={{ width: 110 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">${formatMoney(d.minimum_payment)}/mo</span>
            </td>
            {/* Payoff Date */}
            <td className="px-3 py-2" style={{ width: 110 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-text-tertiary)">
                {d.projected_payoff_date ? fmtPayoffDate(d.projected_payoff_date) : "—"}
              </span>
            </td>
            {/* Actions: reorder arrows inline + delete */}
            <td className="px-3 py-2" style={{ width: 40 }}>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex flex-col gap-0.5">
                  <button
                    disabled={idx === 0 || reordering}
                    onClick={() => moveDebt(d, "up")}
                    className="text-(--color-text-tertiary) hover:text-(--color-text-primary) disabled:opacity-20 transition-colors"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    disabled={idx === activeDebts.length - 1 || reordering}
                    onClick={() => moveDebt(d, "down")}
                    className="text-(--color-text-tertiary) hover:text-(--color-text-primary) disabled:opacity-20 transition-colors"
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
                <button
                  onClick={() => deleteDebt(d.id)}
                  disabled={deletingId === d.id}
                  className="p-1 text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors disabled:opacity-30"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
      </div>
    </>
  );
}
