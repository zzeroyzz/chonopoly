"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Transaction, formatMoney } from "./types";

type Tab = "day" | "week" | "month" | "year";

interface DataPoint {
  label: string;
  dailySpend: number;
  cumulative: number;
  prevCumulative: number;
}

interface ActivityChartProps {
  transactions: Transaction[];
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildDailyMap(txs: Transaction[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.amount <= 0) continue;
    map[tx.date] = (map[tx.date] ?? 0) + tx.amount;
  }
  return map;
}

function getMonthData(txs: Transaction[], year: number, month: number, today: Date): DataPoint[] {
  const daily = buildDailyMap(txs);
  const out: DataPoint[] = [];
  let cum = 0, prevCum = 0;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const endDay = isCurrentMonth ? today.getDate() : new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= endDay; d++) {
    const date = new Date(year, month, d);
    const prev = new Date(year, month - 1, d);
    const spend = daily[toDateStr(date)] ?? 0;
    const prevSpend = daily[toDateStr(prev)] ?? 0;
    cum += spend;
    prevCum += prevSpend;
    out.push({
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dailySpend: spend,
      cumulative: cum,
      prevCumulative: prevCum,
    });
  }
  return out;
}

function getWeekData(txs: Transaction[], weekStart: Date, today: Date): DataPoint[] {
  const daily = buildDailyMap(txs);
  const out: DataPoint[] = [];
  let cum = 0, prevCum = 0;
  const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
  const isCurrentWeek = weekStart.getTime() === thisMonday.getTime();
  const daysToShow = isCurrentWeek ? (today.getDay() + 6) % 7 : 6;
  for (let i = 0; i <= daysToShow; i++) {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    const prev = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7);
    const spend = daily[toDateStr(date)] ?? 0;
    const prevSpend = daily[toDateStr(prev)] ?? 0;
    cum += spend;
    prevCum += prevSpend;
    out.push({
      label: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      dailySpend: spend,
      cumulative: cum,
      prevCumulative: prevCum,
    });
  }
  return out;
}

// Transactions have date-only precision. All of a day's spending is placed at
// hour 0 so the cumulative is flat across the day — the honest representation
// of the data we have. For past days, all 24 hours are shown.
function getDayData(txs: Transaction[], selectedDate: Date, today: Date): DataPoint[] {
  const daily = buildDailyMap(txs);
  const dayTotal = daily[toDateStr(selectedDate)] ?? 0;
  const prev = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1);
  const prevTotal = daily[toDateStr(prev)] ?? 0;
  const isToday = toDateStr(selectedDate) === toDateStr(today);
  const endHour = isToday ? today.getHours() : 23;
  const out: DataPoint[] = [];
  for (let h = 0; h <= endHour; h++) {
    const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
    out.push({
      label,
      dailySpend: h === 0 ? dayTotal : 0,
      cumulative: dayTotal,
      prevCumulative: prevTotal,
    });
  }
  return out;
}

interface TooltipEntry { payload: DataPoint }

function CustomTooltip({
  active,
  payload,
  label,
  activeTab,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  activeTab: Tab;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const delta = point.cumulative - point.prevCumulative;
  const over = delta > 0;
  const compLabel =
    activeTab === "day" ? "Previous day" :
    activeTab === "week" ? "Same time last week" :
    "Same time last month";

  return (
    <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-lg px-3 py-2.5 shadow-xl">
      <p className="text-[10px] text-(--color-text-tertiary) mb-2 font-medium">{label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-6">
          <span className="text-[10px] text-(--color-text-secondary)">Daily spend</span>
          <span className="text-[10px] font-(--font-mono) text-(--color-accent)">${formatMoney(point.dailySpend)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[10px] text-(--color-text-secondary)">Total so far</span>
          <span className="text-[10px] font-(--font-mono) text-(--color-accent)">${formatMoney(point.cumulative)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[10px] text-(--color-text-tertiary)">{compLabel}</span>
          <span className="text-[10px] font-(--font-mono) text-(--color-text-tertiary)">${formatMoney(point.prevCumulative)}</span>
        </div>
        {delta !== 0 && (
          <div className="flex justify-between gap-6 pt-1.5 border-t border-[#2e2e38]">
            <span className="text-[10px] text-(--color-text-tertiary)">vs prev period</span>
            <span className={`text-[10px] font-(--font-mono) flex items-center gap-0.5 ${over ? "text-(--color-danger)" : "text-(--color-success)"}`}>
              {over ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
              ${formatMoney(Math.abs(delta))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS: Tab[] = ["day", "week", "month", "year"];

export default function ActivityChart({ transactions }: ActivityChartProps) {
  const [activeTab, setActiveTab] = useState<Tab>("month");

  // Hydration-safe: all date state initialized after mount only
  const [today, setToday] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);

  // Stable ref so the init effect can read transactions without being in deps
  const txsRef = useRef(transactions);
  txsRef.current = transactions;

  useEffect(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setToday(now);
    setSelectedDate(new Date(now));

    const daysFromMon = (now.getDay() + 6) % 7;
    setSelectedWeekStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMon));

    // FIX 4: auto-fall-back to previous month if current month has < 3 days of data
    const daily = buildDailyMap(txsRef.current);
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const count = Object.keys(daily).filter(k => k.startsWith(prefix)).length;
    if (count < 3) {
      setSelectedMonth(
        now.getMonth() === 0
          ? { year: now.getFullYear() - 1, month: 11 }
          : { year: now.getFullYear(), month: now.getMonth() - 1 }
      );
    } else {
      setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
    }
  }, []); // intentionally empty — runs once on mount

  const data = useMemo<DataPoint[]>(() => {
    if (!today) return [];
    if (activeTab === "year") return [];
    if (activeTab === "day" && selectedDate) return getDayData(transactions, selectedDate, today);
    if (activeTab === "week" && selectedWeekStart) return getWeekData(transactions, selectedWeekStart, today);
    if (activeTab === "month" && selectedMonth) return getMonthData(transactions, selectedMonth.year, selectedMonth.month, today);
    return [];
  }, [activeTab, transactions, today, selectedDate, selectedWeekStart, selectedMonth]);

  const periodLabel = useMemo<string>(() => {
    if (!today) return "";
    if (activeTab === "day" && selectedDate) {
      return toDateStr(selectedDate) === toDateStr(today)
        ? "Today"
        : selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    if (activeTab === "week" && selectedWeekStart) {
      const end = new Date(selectedWeekStart.getFullYear(), selectedWeekStart.getMonth(), selectedWeekStart.getDate() + 6);
      const s = selectedWeekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const e = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${s} – ${e}`;
    }
    if (activeTab === "month" && selectedMonth) {
      return new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return activeTab === "year" ? "This year" : "";
  }, [activeTab, today, selectedDate, selectedWeekStart, selectedMonth]);

  const canGoNext = useMemo<boolean>(() => {
    if (!today) return false;
    if (activeTab === "day" && selectedDate) {
      return toDateStr(selectedDate) !== toDateStr(today);
    }
    if (activeTab === "week" && selectedWeekStart) {
      const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
      return selectedWeekStart.getTime() !== thisMonday.getTime();
    }
    if (activeTab === "month" && selectedMonth) {
      return !(selectedMonth.year === today.getFullYear() && selectedMonth.month === today.getMonth());
    }
    return false;
  }, [activeTab, today, selectedDate, selectedWeekStart, selectedMonth]);

  function goBack() {
    if (activeTab === "day" && selectedDate) {
      setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1));
    } else if (activeTab === "week" && selectedWeekStart) {
      setSelectedWeekStart(new Date(selectedWeekStart.getFullYear(), selectedWeekStart.getMonth(), selectedWeekStart.getDate() - 7));
    } else if (activeTab === "month" && selectedMonth) {
      setSelectedMonth(
        selectedMonth.month === 0
          ? { year: selectedMonth.year - 1, month: 11 }
          : { year: selectedMonth.year, month: selectedMonth.month - 1 }
      );
    }
  }

  function goForward() {
    if (!canGoNext) return;
    if (activeTab === "day" && selectedDate) {
      setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1));
    } else if (activeTab === "week" && selectedWeekStart) {
      setSelectedWeekStart(new Date(selectedWeekStart.getFullYear(), selectedWeekStart.getMonth(), selectedWeekStart.getDate() + 7));
    } else if (activeTab === "month" && selectedMonth) {
      setSelectedMonth(
        selectedMonth.month === 11
          ? { year: selectedMonth.year + 1, month: 0 }
          : { year: selectedMonth.year, month: selectedMonth.month + 1 }
      );
    }
  }

  const totalSpent = data.length > 0 ? data[data.length - 1].cumulative : 0;
  const prevTotal = data.length > 0 ? data[data.length - 1].prevCumulative : 0;
  const delta = totalSpent - prevTotal;
  const over = delta > 0;
  const hasData = data.some(p => p.dailySpend > 0 || p.cumulative > 0);

  return (
    <div className="flex flex-col h-full">

      {/* Headline stats + tab row */}
      <div className="flex items-start justify-between mb-2 shrink-0">
        <div>
          <div className="flex items-baseline gap-2">
            <p className="font-(--font-display) text-[22px] text-(--color-text-primary)">${formatMoney(totalSpent)}</p>
            {prevTotal > 0 && delta !== 0 && (
              <span className={`text-[10px] font-(--font-mono) flex items-center gap-0.5 ${over ? "text-(--color-danger)" : "text-(--color-success)"}`}>
                {over ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                ${formatMoney(Math.abs(delta))}
              </span>
            )}
          </div>
          <p className="text-[9px] text-(--color-text-tertiary) uppercase tracking-[0.08em] mt-0.5">
            {periodLabel || (activeTab === "year" ? "This year" : "—")}
          </p>
        </div>

        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-2.5 py-1 text-[9px] uppercase tracking-[0.08em] rounded-full transition-colors ${
                activeTab === t
                  ? "bg-(--color-border-default) text-(--color-text-primary)"
                  : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Period navigator */}
      {today && activeTab !== "year" && (
        <div className="flex items-center justify-between mb-2 shrink-0" style={{ height: 28 }}>
          <button
            onClick={goBack}
            className="p-1 text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <p className="text-[13px] font-medium text-(--color-text-primary)">{periodLabel}</p>
          <button
            onClick={goForward}
            disabled={!canGoNext}
            className={`p-1 transition-colors ${canGoNext ? "text-(--color-text-secondary) hover:text-(--color-text-primary)" : "text-(--color-text-disabled) cursor-not-allowed"}`}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {activeTab === "year" ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[12px] text-(--color-text-tertiary)">Coming soon</p>
          </div>
        ) : !today ? null : !hasData ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[12px] text-(--color-text-tertiary)">No transactions for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--color-border-subtle)"
                vertical={true}
                horizontal={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 10, fontFamily: "var(--font-mono)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${Math.round(v)}`}
                width={44}
              />
              <RechartsTooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={props.payload as unknown as TooltipEntry[] | undefined}
                    label={props.label as string | undefined}
                    activeTab={activeTab}
                  />
                )}
              />

              {/* Previous period — thin gray comparison line */}
              <Area
                type="monotone"
                dataKey="prevCumulative"
                stroke="var(--color-text-tertiary)"
                strokeWidth={1}
                strokeOpacity={0.5}
                fill="none"
                dot={false}
              />

              {/* Daily spend — thin, semi-transparent, shows behavioral spikes */}
              <Area
                type="monotone"
                dataKey="dailySpend"
                stroke="var(--color-accent)"
                strokeWidth={1}
                strokeOpacity={0.5}
                fill="none"
                dot={false}
              />

              {/* Cumulative — thick, gradient fill, primary line */}
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="var(--color-accent)"
                strokeWidth={2}
                fill="url(#activityGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "var(--color-accent)",
                  stroke: "var(--color-accent)",
                  strokeWidth: 8,
                  strokeOpacity: 0.2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
