"use client";

import {
  BarChart, Bar, AreaChart, Area, XAxis, ReferenceLine,
  ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import { Transaction } from "./types";

interface TrendChartsProps {
  transactions: Transaction[];
}

function last6MonthsData(transactions: Transaction[]) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
    const monthTxs = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === month.getFullYear() &&
             d.getMonth() === month.getMonth();
    });
    const income = monthTxs
      .filter(t => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = monthTxs
      .filter(t => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    return {
      month: month.toLocaleDateString("en-US", { month: "short" }),
      income,
      expenses,
      savingsRate: income - expenses,
      hasData: monthTxs.length > 0,
      isCurrentMonth,
      partialDay: isCurrentMonth ? now.getDate() : null,
    };
  });
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function TrendCharts({ transactions }: TrendChartsProps) {
  const data = last6MonthsData(transactions);
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const spendingChange = prev.expenses > 0
    ? ((last.expenses - prev.expenses) / prev.expenses) * 100
    : 0;

  return (
    <>
      {/* Row 6 Left — Savings Rate Trend */}
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-lg) px-4 py-4" style={{ gridColumn: "1 / 7" }}>
        <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary) mb-3">Savings Rate Trend</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine y={0} stroke="var(--color-border-default)" strokeDasharray="3 3" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[0];
                return (
                  <div className="bg-(--color-elevated) border border-(--color-border-default) rounded p-2 text-[11px]">
                    <p className="text-(--color-text-primary) font-medium mb-1">{d.month}</p>
                    <p className="text-(--color-text-secondary)">Income: ${formatMoney(d.income)}</p>
                    <p className="text-(--color-text-secondary)">Expenses: ${formatMoney(d.expenses)}</p>
                    <p className={d.savingsRate >= 0 ? "text-(--color-success)" : "text-(--color-danger)"}>
                      Net: {d.savingsRate >= 0 ? "+" : "-"}${formatMoney(Math.abs(d.savingsRate))}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="savingsRate" radius={[3, 3, 0, 0]} minPointSize={3} background={{ fill: "rgba(255,255,255,0.03)", radius: 3 }}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.savingsRate >= 0 ? "var(--color-success)" : "var(--color-danger)"}
                  fillOpacity={entry.hasData ? 0.7 : 0.2}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Row 6 Right — Spending Trend */}
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-lg) px-4 py-4" style={{ gridColumn: "7 / 13" }}>
        <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary) mb-3">Spending Trend</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="spendingFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.1} />
                <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[0];
                const spentLabel = d.isCurrentMonth && d.partialDay
                  ? `Spent: $${formatMoney(d.expenses)} (partial — ${d.month} 1–${d.partialDay})`
                  : `Spent: $${formatMoney(d.expenses)}`;
                return (
                  <div className="bg-(--color-elevated) border border-(--color-border-default) rounded p-2 text-[11px]">
                    <p className="text-(--color-text-primary) font-medium">{d.month}{d.isCurrentMonth ? " (in progress)" : ""}</p>
                    <p className="text-(--color-text-secondary)">{spentLabel}</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#spendingFill)"
              dot={{ fill: "var(--color-accent)", r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className={`text-[11px] font-(--font-mono) mt-2 ${spendingChange >= 0 ? "text-(--color-danger)" : "text-(--color-success)"}`}>
          {spendingChange >= 0 ? "↑" : "↓"} Spending {spendingChange >= 0 ? "up" : "down"} {Math.abs(spendingChange).toFixed(1)}% vs last month
        </p>
      </div>
    </>
  );
}
