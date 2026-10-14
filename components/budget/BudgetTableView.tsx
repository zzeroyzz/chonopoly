"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { formatMoney } from "./types";
import { StatCard } from "@/components/ui/StatCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BudgetRow {
  budget_id: string;
  goal_id?: string;
  name: string | null;
  category_name: string;
  category_color: string;
  total_limit: number;
  amount_spent: number;
  percent_used: number;
  over_budget: boolean;
  period_type: string;
  daily_rate: number;
  status: "active" | "paused";
}

interface Props {
  onEdit: () => void;
  goals: { id: string; name: string; icon: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function barColor(pct: number, over: boolean): string {
  if (over || pct >= 100) return "var(--color-danger)";
  if (pct >= 75) return "var(--color-warning)";
  return "var(--color-accent)";
}

// ─── Row dropdown ─────────────────────────────────────────────────────────────

function ActionsDropdown({ onPause, onDelete, onEdit, isPaused }: {
  onPause: () => void;
  onDelete: () => void;
  onEdit: () => void;
  isPaused: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
          <button
            onClick={() => { setOpen(false); onPause(); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle) transition-colors"
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
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

// ─── BudgetTableView ──────────────────────────────────────────────────────────

export default function BudgetTableView({ onEdit, goals }: Props) {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [totals, setTotals] = useState<{ total_budgeted: number; total_spent: number; monthly_income: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const goalNameMap = useMemo(
    () => new Map(goals.map(g => [g.id, { name: g.name, icon: g.icon }])),
    [goals]
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/budget/summary");
    const d = res.ok ? await res.json() : { summaries: [], totals: null };
    setRows((d.summaries ?? []).filter((r: BudgetRow) => r.status === "active"));
    setTotals(d.totals ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pauseRow(budgetId: string, current: "active" | "paused") {
    await fetch("/api/budget/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_id: budgetId, status: current === "active" ? "paused" : "active" }),
    });
    load();
  }

  async function deleteRow(budgetId: string) {
    if (!confirm("Delete this budget?")) return;
    await fetch("/api/budget/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_id: budgetId }),
    });
    load();
  }

  if (loading) return (
    <div className="space-y-px">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-11 skeleton rounded" />
      ))}
    </div>
  );

  if (rows.length === 0) return (
    <p className="text-sm text-(--color-text-tertiary) py-10 text-center">No active budgets.</p>
  );

  const pct = totals && totals.total_budgeted > 0 ? totals.total_spent / totals.total_budgeted : 0;

  return (
    <>
      {totals && (
        <div className="grid gap-3 mb-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total Budgeted" value={`$${formatMoney(totals.total_budgeted)}`} />
          <StatCard
            label="Total Spent"
            value={`$${formatMoney(totals.total_spent)}`}
            variant={pct >= 1 ? "danger" : pct >= 0.8 ? "warning" : "default"}
            subtext={totals.total_budgeted > 0 ? `${Math.round(pct * 100)}% of budget` : undefined}
          />
          <StatCard
            label="Monthly Income"
            value={`$${formatMoney(totals.monthly_income)}`}
            variant={totals.monthly_income > 0 ? "success" : "muted"}
          />
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Category", "Goal", "Period", "Progress", "Spent", "Limit", "Daily Rate", "Status", ""].map(h => (
              <th
                key={h}
              className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) border-b border-(--color-border-default) sticky top-0 bg-(--color-base) z-10 py-2 px-3 text-left font-medium"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.budget_id} className="border-b border-(--color-border-subtle) group hover:bg-(--color-border-subtle)/20 transition-colors">
            {/* Category */}
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full shrink-0" style={{ background: r.category_color }} />
                <span className="text-[13px] text-(--color-text-primary)">{r.name ?? r.category_name}</span>
              </div>
            </td>
            {/* Goal */}
            <td className="px-3 py-2">
              {r.goal_id && goalNameMap.has(r.goal_id) ? (
                <span className="text-[12px] text-(--color-text-secondary)">
                  {goalNameMap.get(r.goal_id)!.icon} {goalNameMap.get(r.goal_id)!.name}
                </span>
              ) : (
                <span className="text-[11px] text-(--color-text-disabled)">—</span>
              )}
            </td>
            {/* Period */}
            <td className="px-3 py-2" style={{ width: 80 }}>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-secondary)">
                {periodLabel(r.period_type)}
              </span>
            </td>
            {/* Progress */}
            <td className="px-3 py-2" style={{ width: 140 }}>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[3px] bg-(--color-border-subtle) rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(r.percent_used, 100)}%`, background: barColor(r.percent_used, r.over_budget) }}
                  />
                </div>
                <span className="text-[10px] font-(--font-mono) text-(--color-text-tertiary) shrink-0 w-8 text-right">
                  {Math.round(r.percent_used)}%
                </span>
              </div>
            </td>
            {/* Spent */}
            <td className="px-3 py-2" style={{ width: 100 }}>
              <span className={`text-[13px] font-(--font-mono) ${r.over_budget ? "text-(--color-danger)" : "text-(--color-text-primary)"}`}>
                ${formatMoney(r.amount_spent)}
              </span>
            </td>
            {/* Limit */}
            <td className="px-3 py-2" style={{ width: 100 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                ${formatMoney(r.total_limit)}
              </span>
            </td>
            {/* Daily Rate */}
            <td className="px-3 py-2" style={{ width: 100 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                ${formatMoney(r.daily_rate)}/d
              </span>
            </td>
            {/* Status */}
            <td className="px-3 py-2" style={{ width: 120 }}>
              {r.status === "paused" ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-tertiary) whitespace-nowrap">Paused</span>
              ) : r.over_budget ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-danger)/15 text-(--color-danger) whitespace-nowrap">Over budget</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success) whitespace-nowrap">On track</span>
              )}
            </td>
            {/* Actions */}
            <td className="px-3 py-2" style={{ width: 40 }}>
              <ActionsDropdown
                isPaused={r.status === "paused"}
                onPause={() => pauseRow(r.budget_id, r.status)}
                onDelete={() => deleteRow(r.budget_id)}
                onEdit={onEdit}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
      </div>
    </>
  );
}
