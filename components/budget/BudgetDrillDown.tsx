"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, X,
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2,
  CircleDot, ArrowDownLeft, ArrowUpRight, type LucideIcon,
} from "lucide-react";
import { formatDate, formatMoney, CATEGORY_META } from "./types";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2,
  CircleDot, ArrowDownLeft, ArrowUpRight,
};

function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? CircleDot;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function snapToSunday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return addDays(dateStr, -d.getUTCDay());
}

function nextSaturdayFrom(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return addDays(dateStr, (6 - d.getUTCDay() + 7) % 7);
}

function windowRangeLabel(start: string, end: string): string {
  const s = new Date(start + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const e = new Date(end   + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${s} – ${e}`;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface BudgetRow {
  budget_id: string;
  goal_id: string;
  category_name: string;
  category_color: string;
  category_icon: string;
  total_limit: number;
  amount_spent: number;
  amount_remaining: number;
  daily_rate: number;
  over_budget: boolean;
  period_type: string;
  period_start: string;
  period_end: string;
  days_remaining: number;
  status: "active" | "paused";
}

interface SnapshotRow {
  date: string;
  daily_rate: number;
  amount_spent: number;
  remaining_after: number;
  days_remaining_after: number;
}

interface TxRow {
  id: string;
  merchant_name: string | null;
  name: string | null;
  date: string;
  amount: number;
}

interface HistoryRow {
  id: string;
  period_start: string;
  period_end: string;
  total_limit: number;
}

interface WindowEntry {
  start: string;
  end: string;
  tracked: boolean;
  totalLimit?: number;
}

interface Props {
  budget: BudgetRow;
  contextType: string;
  contextId: string;
  onBack: () => void;
}

type Tab = "daily" | "weekly" | "monthly";

function isoWeekLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${formatDate(monday.toISOString().split("T")[0])} – ${formatDate(sunday.toISOString().split("T")[0])}`;
}

function monthLabel(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BudgetDrillDown({ budget, contextType, contextId, onBack }: Props) {
  // ── Navigator state ──
  const [viewedStart, setViewedStart] = useState(budget.period_start);
  const [viewedEnd,   setViewedEnd]   = useState(budget.period_end);
  const isCurrentPeriod = viewedStart === budget.period_start && viewedEnd === budget.period_end;

  // ── Historical rows ──
  const [historicalRows, setHistoricalRows] = useState<HistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  // ── Transactions for viewed window ──
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [txSum, setTxSum] = useState<number | null>(null);
  const [txLoading, setTxLoading] = useState(true);

  // ── Picker ──
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Snapshots (existing breakdown tabs) ──
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("daily");

  const ctxParams = `context_type=${contextType}&context_id=${contextId}`;

  // ── Fetch history on mount ──
  useEffect(() => {
    setHistLoading(true);
    fetch(`/api/budget/history?budget_id=${budget.budget_id}&${ctxParams}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(d => { setHistoricalRows(d.rows ?? []); setHistLoading(false); })
      .catch(() => setHistLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.budget_id]);

  // ── Fetch transactions when viewed window changes ──
  useEffect(() => {
    setTxLoading(true);
    setTxSum(null);
    fetch(`/api/budget/transactions?budget_id=${budget.budget_id}&period_start=${viewedStart}&period_end=${viewedEnd}&${ctxParams}`)
      .then(r => r.ok ? r.json() : { transactions: [], sum: 0 })
      .then(d => {
        setTransactions(d.transactions ?? []);
        setTxSum(d.sum ?? 0);
        setTxLoading(false);
      })
      .catch(() => { setTransactions([]); setTxSum(0); setTxLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget.budget_id, viewedStart, viewedEnd]);

  // ── Fetch snapshots (existing, current period only) ──
  useEffect(() => {
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    fetch(`/api/budget/snapshots?budget_id=${budget.budget_id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => { setSnapshots(d.snapshots ?? []); setSnapshotsLoading(false); })
      .catch(e => { setSnapshotsError(String(e)); setSnapshotsLoading(false); });
  }, [budget.budget_id]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const oldestAllowed = useMemo(() => {
    if (historicalRows.length > 0) {
      return [...historicalRows].sort((a, b) => a.period_start.localeCompare(b.period_start))[0].period_start;
    }
    return addDays(budget.period_start, -8 * 7);
  }, [historicalRows, budget.period_start]);

  const canGoBack    = !histLoading && viewedStart > oldestAllowed;
  const canGoForward = viewedStart !== budget.period_start;

  const goBack = useCallback(() => {
    const newEnd = addDays(viewedStart, -1);
    // Exact match in historical rows
    const exactMatch = historicalRows.find(r => r.period_end === newEnd);
    if (exactMatch) {
      setViewedStart(exactMatch.period_start);
      setViewedEnd(exactMatch.period_end);
      return;
    }
    // Compute Sun-Sat window and check for genesis overlap
    const sundayStart = snapToSunday(newEnd);
    const overlapRow  = historicalRows.find(r => r.period_end >= sundayStart && r.period_end < newEnd);
    const newStart    = overlapRow ? addDays(overlapRow.period_end, 1) : sundayStart;
    setViewedStart(newStart);
    setViewedEnd(newEnd);
  }, [viewedStart, historicalRows]);

  const goForward = useCallback(() => {
    const newStart = addDays(viewedEnd, 1);
    if (newStart >= budget.period_start) {
      setViewedStart(budget.period_start);
      setViewedEnd(budget.period_end);
      return;
    }
    const newEnd = nextSaturdayFrom(newStart);
    if (newEnd >= budget.period_end) {
      setViewedStart(budget.period_start);
      setViewedEnd(budget.period_end);
    } else {
      setViewedStart(newStart);
      setViewedEnd(newEnd);
    }
  }, [viewedEnd, budget.period_start, budget.period_end]);

  // ── All windows list (for picker) ─────────────────────────────────────────

  const allWindows = useMemo<WindowEntry[]>(() => {
    if (histLoading) return [];

    const sorted = [...historicalRows].sort((a, b) => a.period_start.localeCompare(b.period_start));
    const genesis = sorted[0] ?? null;

    if (!genesis) {
      return [{ start: budget.period_start, end: budget.period_end, tracked: true, totalLimit: budget.total_limit }];
    }

    const windows: WindowEntry[] = [];
    let cur = { start: genesis.period_start, end: genesis.period_end };
    let safety = 0;

    while (safety++ < 200) {
      const histRow = sorted.find(r => r.period_start === cur.start && r.period_end === cur.end);
      const isCurrent = cur.start === budget.period_start;

      windows.push({
        start: cur.start,
        end: cur.end,
        tracked: isCurrent || !!histRow,
        totalLimit: isCurrent ? budget.total_limit : histRow?.total_limit,
      });

      if (isCurrent) break;

      const newStart = addDays(cur.end, 1);
      if (newStart >= budget.period_start) {
        cur = { start: budget.period_start, end: budget.period_end };
      } else {
        const newEnd = nextSaturdayFrom(newStart);
        cur = newEnd >= budget.period_end
          ? { start: budget.period_start, end: budget.period_end }
          : { start: newStart, end: newEnd };
      }
    }

    return windows;
  }, [historicalRows, histLoading, budget.period_start, budget.period_end, budget.total_limit]);

  // ── Derived header values ─────────────────────────────────────────────────

  const viewedRow = historicalRows.find(r => r.period_start === viewedStart && r.period_end === viewedEnd);
  const headerTracked = isCurrentPeriod || !!viewedRow;

  // R1: current period header uses live txSum; past periods use txSum vs historical limit
  const headerSpent     = txSum !== null ? txSum : budget.amount_spent;
  const headerLimit     = isCurrentPeriod ? budget.total_limit : (viewedRow?.total_limit ?? null);
  const headerOver      = headerLimit !== null && headerSpent > headerLimit;
  const headerPct       = headerLimit != null && headerLimit > 0 ? (headerSpent / headerLimit) * 100 : 0;
  const headerRemaining = headerLimit != null ? Math.max(0, headerLimit - headerSpent) : 0;
  const headerDaysLeft  = isCurrentPeriod ? budget.days_remaining : 0;
  const headerDailyRate = isCurrentPeriod && headerDaysLeft > 0 ? headerRemaining / headerDaysLeft : 0;

  const Icon = getCategoryIcon(budget.category_icon);

  // ── Snapshot-derived breakdown (unchanged from original) ──────────────────

  const chronological = [...snapshots].reverse();
  const dailyRows = chronological.map((s, i) => {
    const prevAmountSpent = i === 0 ? 0 : chronological[i - 1].amount_spent;
    return { ...s, spent_that_day: Math.max(0, s.amount_spent - prevAmountSpent) };
  }).reverse();

  const weeklyRows = (() => {
    const map = new Map<string, { label: string; total: number }>();
    for (const row of dailyRows) {
      const weekKey = isoWeekLabel(row.date.slice(0, 10));
      const existing = map.get(weekKey);
      if (existing) { existing.total += row.spent_that_day; }
      else { map.set(weekKey, { label: weekKey, total: row.spent_that_day }); }
    }
    return [...map.values()];
  })();

  const monthlyRows = (() => {
    if (budget.period_type !== "yearly") {
      const total = chronological.reduce((s, r, i) => {
        const prev = i === 0 ? 0 : chronological[i - 1].amount_spent;
        return s + Math.max(0, r.amount_spent - prev);
      }, 0);
      return [{ label: `${budget.period_type} period total`, total }];
    }
    const map = new Map<string, { label: string; total: number }>();
    for (const row of dailyRows) {
      const mKey = row.date.slice(0, 7);
      const label = monthLabel(row.date);
      const existing = map.get(mKey);
      if (existing) { existing.total += row.spent_that_day; }
      else { map.set(mKey, { label, total: row.spent_that_day }); }
    }
    return [...map.values()];
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  const periodLabel = windowRangeLabel(viewedStart, viewedEnd);

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-[#7a7870] hover:text-white transition-colors"
      >
        <ChevronLeft size={15} />
        Back
      </button>

      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="p-1.5 text-[#7a7870] hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors rounded"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 text-sm font-medium text-white hover:text-[#7a7870] transition-colors"
        >
          {periodLabel}
          {isCurrentPeriod && (
            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">current</span>
          )}
          <ChevronDown size={13} className="text-[#7a7870] ml-0.5" />
        </button>

        <button
          onClick={goForward}
          disabled={!canGoForward}
          className="p-1.5 text-[#7a7870] hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors rounded"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Header card */}
      <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: budget.category_color + "22", color: budget.category_color }}
          >
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-semibold">{budget.category_name}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/6 text-[#7a7870] capitalize">{budget.period_type}</span>
              {isCurrentPeriod && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                  {budget.status}
                </span>
              )}
            </div>

            <div className="mt-3">
              {headerTracked ? (
                <>
                  {headerOver ? (
                    <p className="text-2xl font-(--font-mono) font-semibold text-red-400">
                      ${formatMoney(headerSpent - (headerLimit ?? 0))} over
                    </p>
                  ) : isCurrentPeriod ? (
                    <p className="text-2xl font-(--font-mono) font-semibold">
                      ${formatMoney(headerDailyRate)}<span className="text-base font-normal text-[#7a7870]">/day</span>
                    </p>
                  ) : (
                    <p className="text-2xl font-(--font-mono) font-semibold text-[#55534e]">
                      Period ended
                    </p>
                  )}
                  <p className="text-sm text-[#7a7870] mt-1">
                    <span className={headerOver ? "text-red-400" : headerPct >= 75 ? "text-yellow-400" : "text-white"}>
                      ${formatMoney(headerSpent)}
                    </span>
                    {headerLimit != null && (
                      <>
                        <span className="text-[#55534e]"> spent of </span>
                        ${formatMoney(headerLimit)}
                      </>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-(--font-mono) font-semibold text-[#7a7870]">
                    ${formatMoney(headerSpent)}
                  </p>
                  <p className="text-sm text-[#55534e] mt-1">No budget was set for this period</p>
                </>
              )}

              {isCurrentPeriod && (
                <p className="text-xs text-[#55534e] mt-1">
                  {headerDaysLeft === 0 ? "ends today" : `${headerDaysLeft}d left`}
                  {" · ends "}{formatDate(budget.period_end)}
                </p>
              )}
            </div>

            {/* Progress bar — only for tracked periods with a limit */}
            {headerTracked && headerLimit != null && (
              <div className="h-1 bg-[#2e2e38] rounded-full overflow-hidden mt-3">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(headerPct, 100)}%`,
                    background: headerOver ? "#ef4444" : headerPct >= 75 ? "#eab308" : budget.category_color,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction list */}
      <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2e2e38]">
          <p className="text-xs font-medium text-[#7a7870] uppercase tracking-[0.08em]">Transactions</p>
        </div>

        {txLoading && (
          <div className="divide-y divide-[#2e2e38]">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-[#2e2e38] animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-[#2e2e38] rounded animate-pulse w-32" />
                  <div className="h-2.5 bg-[#2e2e38] rounded animate-pulse w-20" />
                </div>
                <div className="h-3 bg-[#2e2e38] rounded animate-pulse w-14" />
              </div>
            ))}
          </div>
        )}

        {!txLoading && transactions.length === 0 && (
          <p className="px-4 py-8 text-sm text-[#7a7870] text-center">No transactions found for this period</p>
        )}

        {!txLoading && transactions.length > 0 && (
          <div className="divide-y divide-[#2e2e38]">
            {transactions.map(tx => {
              const displayName = tx.merchant_name ?? tx.name ?? "—";
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: budget.category_color + "22", color: budget.category_color }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{displayName}</p>
                    <p className="text-[11px] text-[#55534e] mt-0.5">{formatDate(tx.date)}</p>
                  </div>
                  <p className="text-[13px] font-(--font-mono) shrink-0">${formatMoney(tx.amount)}</p>
                </div>
              );
            })}

            {/* Footer sum */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#16161b]">
              <p className="text-xs font-medium text-[#7a7870]">Total</p>
              <p className="text-sm font-(--font-mono) font-semibold">
                ${formatMoney(txSum ?? 0)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Snapshot breakdown section — current period only */}
      {isCurrentPeriod && (
        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl overflow-hidden">
          <div className="flex border-b border-[#2e2e38]">
            {(["daily", "weekly", "monthly"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${tab === t ? "text-white border-b-2 border-white -mb-px" : "text-[#7a7870] hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {snapshotsLoading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-[#1e1e24] rounded animate-pulse" />
              ))}
            </div>
          )}

          {snapshotsError && (
            <p className="px-4 py-6 text-sm text-red-400">{snapshotsError}</p>
          )}

          {!snapshotsLoading && !snapshotsError && snapshots.length === 0 && (
            <p className="px-4 py-8 text-sm text-[#7a7870] text-center leading-relaxed max-w-sm mx-auto">
              Snapshots are calculated nightly. Check back tomorrow for a day-by-day breakdown.
            </p>
          )}

          {!snapshotsLoading && !snapshotsError && snapshots.length > 0 && (
            <div className="divide-y divide-[#2e2e38]">
              {tab === "daily" && dailyRows.map(row => (
                <div key={row.date} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs text-white">{formatDate(row.date)}</p>
                    <p className="text-[10px] text-[#55534e] mt-0.5">${formatMoney(row.daily_rate)}/day remaining pace</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-(--font-mono)">${formatMoney(row.spent_that_day)}</p>
                    <p className="text-[10px] text-[#55534e] mt-0.5">${formatMoney(row.remaining_after)} left</p>
                  </div>
                </div>
              ))}

              {tab === "weekly" && weeklyRows.map((row, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <p className="text-xs text-white">{row.label}</p>
                  <p className="text-sm font-(--font-mono)">${formatMoney(row.total)}</p>
                </div>
              ))}

              {tab === "monthly" && monthlyRows.map((row, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <p className="text-xs text-white">{row.label}</p>
                  <p className="text-sm font-(--font-mono)">${formatMoney(row.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Week picker modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-(--color-surface) border border-(--color-border-default) rounded-xl w-80 max-h-[70vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-border-default) shrink-0">
              <p className="text-sm font-semibold">Jump to week</p>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-(--color-border-subtle)">
              {[...allWindows].reverse().map(w => {
                const isViewed = w.start === viewedStart && w.end === viewedEnd;
                return (
                  <button
                    key={w.start}
                    onClick={() => { setViewedStart(w.start); setViewedEnd(w.end); setPickerOpen(false); }}
                    className={`w-full text-left px-4 py-3 transition-colors ${isViewed ? "bg-(--color-elevated)" : "hover:bg-(--color-elevated)/60"}`}
                  >
                    <p className="text-[13px] font-medium">{windowRangeLabel(w.start, w.end)}</p>
                    {!w.tracked && (
                      <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">untracked</p>
                    )}
                    {w.start === budget.period_start && (
                      <p className="text-[11px] text-emerald-400 mt-0.5">current</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
