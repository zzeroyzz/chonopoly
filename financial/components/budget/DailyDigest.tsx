"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CategoryPill from "./CategoryPill";
import { CATEGORY_META, formatMoney, Transaction } from "./types";

interface DailyDigestProps {
  transactions: Transaction[];
  categoryOverrides: Record<string, string>;
  onViewAll: () => void;
  onRecategorize: (txId: string, newCategoryId: string) => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DailyDigest({ transactions, categoryOverrides, onViewAll, onRecategorize }: DailyDigestProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Hydration-safe: default to yesterday before 10am, today otherwise
  useEffect(() => {
    const now = new Date();
    const d = new Date(now);
    if (now.getHours() < 10) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  function dateLabel(d: Date): string {
    if (isSameDay(d, today))     return "Today";
    if (isSameDay(d, yesterday)) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const minTxDate = transactions.length > 0
    ? transactions.reduce((min, tx) => tx.date < min ? tx.date : min, transactions[0].date)
    : null;

  const prevDayStr = selectedDate ? toDateStr(new Date(selectedDate.getTime() - 86400000)) : null;
  const leftDisabled = !selectedDate || !prevDayStr || !minTxDate || prevDayStr < minTxDate;
  const rightDisabled = !selectedDate || selectedDate.getTime() >= today.getTime();

  function goBack() {
    setSelectedDate(prev => {
      if (!prev) return prev;
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  }

  function goForward() {
    setSelectedDate(prev => {
      if (!prev) return prev;
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      if (d > today) return prev;
      return d;
    });
  }
  console.log(transactions, "transactions")
  // Data computation — pure, render-time
  const dateStr = selectedDate ? toDateStr(selectedDate) : null;
  const dayTxs = dateStr ? transactions.filter(tx => tx.date === dateStr) : [];

  // Group by effective category, respecting user overrides
  type TxGroup = { category: string; txs: Transaction[]; total: number };
  const groupMap = new Map<string, TxGroup>();
  for (const tx of dayTxs) {
    const cat = categoryOverrides[tx.transaction_id] ?? tx.personal_finance_category?.primary ?? "OTHER";
    if (!groupMap.has(cat)) groupMap.set(cat, { category: cat, txs: [], total: 0 });
    const g = groupMap.get(cat)!;
    g.txs.push(tx);
    g.total += tx.amount;
  }
  const groups = [...groupMap.values()].sort((a, b) => b.total - a.total);

  const totalSpent = dayTxs.reduce((s, tx) => s + (tx.amount > 0 ? tx.amount : 0), 0);
  const totalIncome = dayTxs.reduce((s, tx) => s + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0);
  const netSpent = totalSpent - totalIncome;

  const hasData = selectedDate !== null && minTxDate !== null && dateStr !== null && dateStr >= minTxDate;
  const isZeroSpend = hasData && dayTxs.length === 0;
  const noData = selectedDate !== null && !hasData;


  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="text-[9px] font-medium text-(--color-text-secondary) uppercase tracking-[0.1em]">Recent</p>
        <div className="flex items-center gap-0.5">
          <button
            onClick={goBack}
            disabled={leftDisabled}
            className="p-0.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronLeft size={12} />
          </button>
          <span className="text-[11px] text-(--color-text-secondary) min-w-[60px] text-center select-none">
            {selectedDate ? dateLabel(selectedDate) : "—"}
          </span>
          <button
            onClick={goForward}
            disabled={rightDisabled}
            className="p-0.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronRight size={12} />
          </button>
        </div>
        <button onClick={onViewAll} className="text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
          View all →
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {noData && (
          <p className="text-[12px] text-(--color-text-tertiary) text-center py-8">
            No transaction data for this date
          </p>
        )}

        {isZeroSpend && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-[24px] mb-2">🎉</p>
            <p className="text-[13px] font-medium text-(--color-text-primary)">
              No spending on {dateLabel(selectedDate!)}
            </p>
            <p className="text-[11px] text-(--color-text-secondary) mt-1">
              {"A good day for your wallet"}
            </p>
          </div>
        )}

        {hasData && !isZeroSpend && (
          <div>
            {groups.map(({ category, txs, total }) => {
              const catLabel = CATEGORY_META[category]?.label ?? category.replace(/_/g, " ");
              return (
                <div key={category} className="mb-3">
                  {/* Category header */}
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-(--color-text-secondary)">{catLabel}</p>
                    <p className="font-(--font-mono) text-[11px] text-(--color-text-secondary)">${formatMoney(total)}</p>
                  </div>
                  {/* Transaction rows */}
                  {txs.map(tx => {
                    const effectiveCategory = categoryOverrides[tx.transaction_id] ?? tx.personal_finance_category?.primary ?? "OTHER";
                    const isCredit = tx.amount < 0;
                    return (
                      <div key={tx.transaction_id} className="flex items-center gap-2 py-0.5">
                        <CategoryPill
                          category={effectiveCategory}
                          transactionId={tx.transaction_id}
                          onChangeCategory={onRecategorize}
                        />
                        <p className="text-[12px] text-(--color-text-primary) truncate flex-1 min-w-0">
                          {tx.merchant_name ?? tx.name}
                        </p>
                        <p className={`font-(--font-mono) text-[12px] shrink-0 ${isCredit ? "text-(--color-success)" : "text-(--color-text-primary)"}`}>
                          {isCredit ? "+" : ""}${formatMoney(Math.abs(tx.amount))}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Total row */}
            <div className="border-t border-(--color-border-subtle) mt-2 pt-2 flex items-center justify-between">
              <p className="text-[12px] text-(--color-text-secondary)">Total spent</p>
              <p className={`font-(--font-display) text-[16px] ${netSpent <= 0 ? "text-(--color-success)" : "text-(--color-text-primary)"}`}>
                ${formatMoney(totalSpent)}
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
