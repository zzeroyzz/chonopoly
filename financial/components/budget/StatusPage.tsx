"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  LayoutGrid, Receipt, Target, Wallet,
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2,
  CircleDot, ArrowDownLeft, ArrowUpRight, type LucideIcon,
} from "lucide-react";
import { ActiveContext, GoalSummary } from "@/lib/goals/types";
import { BudgetSummaryRow, formatMoney } from "@/components/budget/types";
import {
  budgetRowStatus, calcElapsedFraction, computeVerdict, isPaidThisCycle,
  type VerdictResult,
} from "@/lib/budget/verdict";
import { cycleDueDates } from "@/lib/bills/cycle";
import type { Bill } from "@/components/bills/BillsWidget";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2,
  CircleDot, ArrowDownLeft, ArrowUpRight,
};

function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? CircleDot;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function fmtDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Sun–Sat bounds for the week containing `today` (UTC)
function currentWeekBounds(today: Date): { weekStart: string; weekEnd: string } {
  const t = utcMidnight(today);
  const sunday = new Date(t);
  sunday.setUTCDate(t.getUTCDate() - t.getUTCDay());
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  return { weekStart: fmtDateStr(sunday), weekEnd: fmtDateStr(saturday) };
}

// Sub-label from row data per C5 — never infers dates from the calendar.
function fmtSubLabel(row: BudgetSummaryRow): string {
  if (row.period_type === "monthly") {
    const month = new Date(row.period_start + "T00:00:00Z")
      .toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    return `monthly · ${month}`;
  }
  if (row.period_type === "weekly") {
    const end = new Date(row.period_end + "T00:00:00Z")
      .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `weekly · ends ${end}`;
  }
  if (row.period_type === "yearly") {
    const year = new Date(row.period_start + "T00:00:00Z").getUTCFullYear();
    return `yearly · ${year}`;
  }
  return row.period_type;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerdictBanner({ result, okSubtext }: { result: VerdictResult; okSubtext: string }) {
  const { verdict, label } = result;
  if (verdict === "ok") {
    return (
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-(--color-success)/8 border border-(--color-success)/20" data-testid="verdict-banner">
        <CheckCircle2 size={16} className="text-(--color-success) shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] text-(--color-success) font-medium">On track this week</p>
          {okSubtext && <p className="text-[11px] mt-0.5" style={{ color: "var(--color-success)", opacity: 0.7 }}>{okSubtext}</p>}
        </div>
      </div>
    );
  }
  if (verdict === "attention") {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-(--color-warning)/8 border border-(--color-warning)/20" data-testid="verdict-banner">
        <AlertTriangle size={16} className="text-(--color-warning) shrink-0" />
        <p className="text-[13px] text-(--color-warning) font-medium">{label ?? "Attention needed"}</p>
      </div>
    );
  }
  // critical
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-(--color-danger)/8 border border-(--color-danger)/20" data-testid="verdict-banner">
      <AlertTriangle size={16} className="text-(--color-danger) shrink-0" />
      <p className="text-[13px] text-(--color-danger) font-medium">{label ?? "One or more budgets are over limit"}</p>
    </div>
  );
}

function BudgetStatusRow({
  row,
  today,
  onClick,
}: {
  row: BudgetSummaryRow;
  today: Date;
  onClick: () => void;
}) {
  const status = budgetRowStatus(row);
  const barColor =
    status === "danger"   ? "var(--color-danger)"
    : status === "warning" ? "var(--color-warning)"
    : "var(--color-success)";
  const pctCapped = Math.min(row.percent_used, 100);
  const elapsed = calcElapsedFraction(row, today);
  const Icon = getCategoryIcon(row.category_icon);
  const remainLabel = row.amount_remaining < 0
    ? `$${formatMoney(Math.abs(row.amount_remaining))} over`
    : `$${formatMoney(row.amount_remaining)} left`;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-(--color-border-subtle)/40 transition-colors text-left"
      data-testid={`status-budget-row-${row.budget_id}`}
    >
      {/* Category icon */}
      <div
        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
        style={{ background: row.category_color + "30", color: row.category_color }}
      >
        <Icon size={14} />
      </div>

      {/* Name + bar + sub-label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between mb-1.5">
          <p className="text-[13px] font-medium text-(--color-text-primary) truncate">{row.name ?? row.category_name}</p>
          <div className="text-right shrink-0 ml-3">
            <p className="text-[12px] font-(--font-mono) font-semibold leading-tight" style={{ color: barColor }}>
              {remainLabel}
            </p>
            <p className="text-[10px] text-(--color-text-tertiary) font-(--font-mono) leading-tight">
              of ${formatMoney(row.effective_limit)}
            </p>
          </div>
        </div>

        {/* Progress bar + pace tick (C7: solid mid-gray, 2px × 12px on 6px bar) */}
        <div className="relative h-[6px] bg-(--color-border-subtle) rounded-full overflow-visible">
          <div
            className="h-full rounded-full"
            style={{ width: `${pctCapped}%`, background: barColor }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-[12px] rounded-sm pointer-events-none"
            style={{ left: `${elapsed * 100}%`, background: "var(--color-text-secondary)" }}
          />
        </div>

        <p className="text-[11px] text-(--color-text-tertiary) mt-1">{fmtSubLabel(row)}</p>
      </div>

      <ChevronRight size={14} className="text-(--color-text-disabled) shrink-0" />
    </button>
  );
}

// ─── StatusPage ───────────────────────────────────────────────────────────────

interface StatusPageProps {
  activeContext: ActiveContext;
  goals: GoalSummary[];
  onManageAll: () => void;
  onBudgetDrillDown: (budget: BudgetSummaryRow) => void;
  onViewAllGoals: () => void;
  onViewAllBills: () => void;
}

export default function StatusPage({
  activeContext,
  goals,
  onManageAll,
  onBudgetDrillDown,
  onViewAllGoals,
  onViewAllBills,
}: StatusPageProps) {
  const [budgets, setBudgets] = useState<BudgetSummaryRow[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [netWorth, setNetWorth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/budget/summary").then(r => r.ok ? r.json() : { summaries: [] }),
      fetch(`/api/bills?context_type=${activeContext.type}&context_id=${activeContext.id}`)
        .then(r => r.ok ? r.json() : { bills: [] }),
      fetch("/api/net-worth").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([budgetData, billsData, nwData]) => {
      setBudgets((budgetData.summaries ?? []).filter((s: BudgetSummaryRow) => s.status === "active"));
      setBills(billsData.bills ?? []);
      setNetWorth(nwData?.net_worth ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeContext.type, activeContext.id]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse p-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-(--color-elevated)" />)}
      </div>
    );
  }

  const today = new Date();
  const verdictResult = computeVerdict(budgets, bills, today);

  // Sub-text for ok banner
  const totalRemaining = budgets.reduce((s, b) => s + b.amount_remaining, 0);
  const minDaysLeft = budgets.length > 0 ? Math.min(...budgets.map(b => b.days_remaining)) : 0;
  const okSubtext = budgets.length > 0
    ? `$${formatMoney(totalRemaining)} left across ${budgets.length} budget${budgets.length !== 1 ? "s" : ""} · ${minDaysLeft} day${minDaysLeft !== 1 ? "s" : ""} left`
    : "";

  // Sort: danger → warning → on-track, then by soonest period_end
  const sortedBudgets = [...budgets].sort((a, b) => {
    const order = { danger: 0, warning: 1, "on-track": 2 };
    const sa = order[budgetRowStatus(a)];
    const sb = order[budgetRowStatus(b)];
    if (sa !== sb) return sa - sb;
    return a.period_end.localeCompare(b.period_end);
  });

  // Bills due within current Sun–Sat week, unpaid (B4)
  const { weekStart, weekEnd } = currentWeekBounds(today);
  const billsDueThisWeek = bills.filter(bill => {
    if (isPaidThisCycle(bill)) return false;
    const { current } = cycleDueDates(bill, today);
    const ds = fmtDateStr(utcMidnight(current));
    return ds >= weekStart && ds <= weekEnd;
  });

  const hasBudgets = sortedBudgets.length > 0;
  const hasGoals = goals.length > 0;
  const showLongGame = hasGoals || netWorth !== null;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20 lg:pb-8" data-testid="status-page">
      {/* Verdict banner */}
      <VerdictBanner result={verdictResult} okSubtext={okSubtext} />

      {/* Budget rows — header has no action link (C6: Manage all moved to bottom row) */}
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-xl overflow-hidden">
        <div className="flex items-center px-4 py-3 border-b border-(--color-border-subtle)">
          <Wallet size={14} className="text-(--color-text-tertiary) mr-2" />
          <span className="text-[12px] font-semibold text-(--color-text-primary) uppercase tracking-[0.08em]">Budgets</span>
        </div>

        {hasBudgets ? (
          <div className="divide-y divide-(--color-border-subtle)">
            {sortedBudgets.map(row => (
              <BudgetStatusRow
                key={row.budget_id}
                row={row}
                today={today}
                onClick={() => onBudgetDrillDown(row)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-12 px-6 text-center">
            <Wallet size={28} className="text-(--color-text-disabled) mb-3" />
            <p className="text-[14px] font-medium text-(--color-text-primary) mb-1">No budgets yet</p>
            <p className="text-[12px] text-(--color-text-tertiary) mb-4">Set a spending limit per category to start tracking.</p>
            <button
              onClick={onManageAll}
              className="px-4 py-2 text-[12px] font-semibold bg-(--color-accent) text-(--color-base) rounded-(--radius-md) hover:opacity-90 transition-opacity"
            >
              Create first budget
            </button>
          </div>
        )}
      </div>

      {/* Bills this week — taps into bills sub-view (C1) */}
      <button
        onClick={onViewAllBills}
        className="w-full flex items-center gap-3 bg-(--color-surface) border border-(--color-border-default) rounded-xl px-4 py-4 hover:bg-(--color-border-subtle)/30 transition-colors text-left"
        data-testid="bills-week-row"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-(--color-warning)/15">
          <Receipt size={14} className="text-(--color-warning)" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-(--color-text-primary)">Bills due this week</p>
          <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">
            {billsDueThisWeek.length === 0
              ? "All caught up"
              : `${billsDueThisWeek.length} unpaid bill${billsDueThisWeek.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {billsDueThisWeek.length > 0 && (
          <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-(--color-warning)/15 text-(--color-warning)">
            {billsDueThisWeek.length}
          </span>
        )}
        <ChevronRight size={14} className="text-(--color-text-disabled) shrink-0" />
      </button>

      {/* Long game: goals + net worth (C4: net worth inside this card, after goal rows) */}
      {showLongGame && (
        <div className="bg-(--color-surface) border border-(--color-border-default) rounded-xl overflow-hidden">
          <div className="flex items-center px-4 py-3 border-b border-(--color-border-subtle)">
            <Target size={14} className="text-(--color-text-tertiary) mr-2" />
            <span className="text-[12px] font-semibold text-(--color-text-primary) uppercase tracking-[0.08em]">Long game</span>
          </div>
          <div className="divide-y divide-(--color-border-subtle)">
            {goals.slice(0, 4).map(goal => {
              const pct = Math.min(100, Math.round(goal.percent_complete));
              return (
                <div key={goal.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="text-[18px] shrink-0">{goal.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[13px] font-medium text-(--color-text-primary) truncate">{goal.name}</p>
                      <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary) shrink-0 ml-2">{pct}%</span>
                    </div>
                    <div className="h-[4px] bg-(--color-border-subtle) rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-(--color-accent)"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {goal.target_date && (
                      <p className="text-[11px] text-(--color-text-disabled) mt-1">
                        Target: {new Date(goal.target_date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* View all goals — row chevron (C6: no header link) */}
            {hasGoals && (
              <button
                onClick={onViewAllGoals}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-(--color-border-subtle)/40 transition-colors text-left"
                data-testid="view-all-goals-btn"
              >
                <span className="flex-1 text-[12px] text-(--color-accent) font-medium">View all goals</span>
                <ChevronRight size={14} className="text-(--color-text-disabled) shrink-0" />
              </button>
            )}

            {/* Net worth (C4: display-only, no navigation) */}
            {netWorth !== null && (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--color-accent)18" }}>
                  <TrendingUp size={14} className="text-(--color-accent)" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-(--color-text-primary)">Net worth</p>
                  <p className="text-[12px] font-(--font-mono) text-(--color-text-secondary) mt-0.5">
                    {netWorth < 0 ? "-" : ""}${formatMoney(Math.abs(netWorth))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manage all — single bottom row (C6: replaces Budgets-header link) */}
      <button
        onClick={onManageAll}
        className="w-full flex items-center gap-3 bg-(--color-surface) border border-(--color-border-default) rounded-xl px-4 py-4 hover:bg-(--color-border-subtle)/30 transition-colors text-left"
        data-testid="manage-all-btn"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--color-accent)18" }}>
          <LayoutGrid size={14} className="text-(--color-accent)" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-(--color-text-primary)">Manage all</p>
          <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">Budgets · goals · bills · debts · assets</p>
        </div>
        <ChevronRight size={14} className="text-(--color-text-disabled) shrink-0" />
      </button>
    </div>
  );
}
