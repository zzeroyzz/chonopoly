/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import Link from "next/link";
import {
  LayoutDashboard, LayoutGrid, PieChart, Plus, RefreshCw, Trash2,
  ChevronDown, ChevronRight, ChevronLeft, Search, Wallet,
  ShoppingBag, Plane, UtensilsCrossed, Car, House, HeartPulse,
  Sparkles, Zap, Wrench, TrendingUp, Banknote, Building2, Film,
  CircleDot, ArrowDownLeft, ArrowUpRight, Pencil, Mail, Pause, Play, Target, User, CreditCard, CalendarClock, MoreHorizontal, Receipt, type LucideIcon,
} from "lucide-react";
import { ActiveContext, GoalSummary } from "@/lib/goals/types";
import { loadProfile } from "@/lib/supabase/profile";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { AppShell } from "./shell/AppShell";
import { ContextSwitcher } from "./shell/ContextSwitcher";
import { type ShellNavItem } from "./shell/types";
import dynamic from "next/dynamic";
const SpendingChart = dynamic(() => import("./budget/SpendingChart"), { ssr: false });
const ActivityChart = dynamic(() => import("./budget/ActivityChart"), { ssr: false });
const BillsWidget = dynamic(() => import("./bills/BillsWidget"), { ssr: false });
const BillsPanel = dynamic(() => import("./bills/BillsPanel"), { ssr: false });
const TrendCharts = dynamic(() => import("./budget/TrendCharts"), { ssr: false });
const TeamSetupWizard = dynamic(() => import("./teams/TeamSetupWizard"), { ssr: false });
import TeamSettingsPanel from "./teams/TeamSettingsPanel";
import GoalsPanel from "./GoalsPanel";
import DebtPanel from "./debts/DebtPanel";
import AssetsSection from "./assets/AssetsSection";
import OnboardingModal from "./OnboardingModal";
import ProfilePanel from "./budget/ProfilePanel";
import ManagePanel from "./budget/ManagePanel";
import BudgetWizard, { EditingBudget, WizardSnapshot } from "./budget/BudgetWizard";
import GoalWizard from "@/components/goals/GoalWizard";
import OnboardingChecklist from "./OnboardingChecklist";
import BudgetDrillDown from "./budget/BudgetDrillDown";
import StatusPage from "./budget/StatusPage";
import CategoryPill from "./budget/CategoryPill";
import CategoryPickerModal from "./budget/CategoryPickerModal";
import { StatCard } from "./budget/StatCard";
import DailyDigest from "./budget/DailyDigest";
import {
  Account, ConnectedItem, Transaction, ViewState, BudgetSummaryRow,
  formatDate, formatMoney, getCategoryMeta, CATEGORY_META,
} from "./budget/types";

// ─── Category icon map ────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2,
  CircleDot, ArrowDownLeft, ArrowUpRight,
};

function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? CircleDot;
}

// ─── Shared panel props ───────────────────────────────────────────────────────

interface PanelProps {
  transactions: Transaction[];
  accountMap: Map<string, Account>;
  categoryOverrides: Record<string, string>;
  onChangeCategory: (id: string, cat: string) => void;
  search: string;
  onSearch: (s: string) => void;
}

// ─── Plaid Link button ────────────────────────────────────────────────────────

function PlaidLinkButton({ label = "Connect bank", onSuccess, linkToken }: { label?: string; onSuccess: () => void; linkToken: string | null }) {
  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      await fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken, institution_name: metadata.institution?.name ?? null }),
      });
      onSuccess();
    },
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="flex items-center gap-2 h-8 px-3 text-[12px] text-(--color-text-secondary) border border-(--color-border-default) rounded-[var(--radius-md)] hover:border-(--color-border-strong) hover:text-(--color-text-primary) disabled:opacity-40 transition-colors w-full"
    >
      <Plus size={13} />
      {label}
    </button>
  );
}

// ─── Overview stat card (compact widget in the Overview panel) ─────────────────

function OverviewStatCard({ label, value, color = "text-(--color-text-primary)" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 bg-(--color-elevated) border border-(--color-border-default) rounded-md flex flex-col justify-center px-[14px] shadow-(--shadow-sm)" style={{ height: 64 }}>
      <p className="text-[9px] text-(--color-text-tertiary) uppercase tracking-[0.1em] mb-1">{label}</p>
      <p className={`text-[16px] sm:text-[20px] font-semibold font-(--font-display) truncate ${color}`}>{value}</p>
    </div>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ tx, accountName, overrideCategory, onChangeCategory, compact = false }: {
  tx: Transaction;
  accountName: string;
  overrideCategory?: string;
  onChangeCategory: (id: string, cat: string) => void;
  compact?: boolean;
}) {
  const effectiveCategory = overrideCategory ?? tx.personal_finance_category?.primary;
  const meta = getCategoryMeta(effectiveCategory);
  const isCredit = tx.amount < 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 border-b border-(--color-border-subtle) last:border-0" style={{ height: 52 }}>
        {tx.logo_url ? (
          <img src={tx.logo_url} alt="" className="w-7 h-7 rounded-full object-contain bg-white/5 shrink-0" />
        ) : (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${meta.color}`}>
            {(tx.merchant_name ?? tx.name).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate max-w-[120px]">{tx.merchant_name ?? tx.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <CategoryPill category={effectiveCategory} transactionId={tx.transaction_id} onChangeCategory={onChangeCategory} />
            <span className="text-[10px] text-(--color-text-tertiary) truncate">{formatDate(tx.date)} · {accountName}</span>
          </div>
        </div>
        <p className={`text-[12px] font-(--font-mono) shrink-0 ml-auto ${isCredit ? "text-emerald-400" : "text-white"}`}>
          {isCredit ? "+" : "-"}${formatMoney(Math.abs(tx.amount))}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#1e1e24] border border-[#2e2e38] rounded-xl">
      {tx.logo_url ? (
        <img src={tx.logo_url} alt="" className="w-7 h-7 rounded-full object-contain bg-white/5 shrink-0" />
      ) : (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${meta.color}`}>
          {(tx.merchant_name ?? tx.name).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{tx.merchant_name ?? tx.name}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryPill category={effectiveCategory} transactionId={tx.transaction_id} onChangeCategory={onChangeCategory} />
          <span className="text-[10px] text-[#7a7870]">{formatDate(tx.date)}</span>
          <span className="text-[10px] text-[#55534e] truncate">{accountName}</span>
        </div>
      </div>
      <p className={`text-sm font-(--font-mono) shrink-0 ${isCredit ? "text-emerald-400" : "text-white"}`}>
        {isCredit ? "+" : "-"}${formatMoney(Math.abs(tx.amount))}
      </p>
    </div>
  );
}

// ─── Transaction list ─────────────────────────────────────────────────────────

function TxList({ transactions, accountMap, categoryOverrides, onChangeCategory, compact = false }: {
  transactions: Transaction[];
  accountMap: Map<string, Account>;
  categoryOverrides: Record<string, string>;
  onChangeCategory: (id: string, cat: string) => void;
  compact?: boolean;
}) {
  if (transactions.length === 0) return <p className="text-sm text-[#7a7870] py-8 text-center">No transactions found.</p>;
  return (
    <div className={compact ? "" : "space-y-1"}>
      {transactions.map((t) => (
        <TxRow
          key={t.transaction_id}
          tx={t}
          accountName={accountMap.get(t.account_id)?.name ?? "Unknown"}
          overrideCategory={categoryOverrides[t.transaction_id]}
          onChangeCategory={onChangeCategory}
          compact={compact}
        />
      ))}
    </div>
  );
}

// ─── Net worth card ───────────────────────────────────────────────────────────

function NetWorthCard({ activeContext }: { activeContext: ActiveContext }) {
  const [data, setData] = useState<{
    net_worth: number; total_assets: number; total_debts: number;
    liquid_assets: number; manual_assets: number;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/net-worth?context_type=${activeContext.type}&context_id=${activeContext.id}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => null);
  }, [activeContext.type, activeContext.id]);

  if (!data) return null;

  const isPositive = data.net_worth >= 0;

  return (
    <div className="flex items-center justify-between bg-(--color-surface) border border-(--color-border-default) rounded-md px-4 flex-shrink-0" style={{ height: 52 }} data-testid="net-worth-card">
      <div className="flex items-center">
        <p className="text-[9px] uppercase tracking-[0.12em] text-(--color-text-tertiary) mr-3">NET WORTH</p>
        <p className={`font-(--font-display) text-[22px] font-semibold ${isPositive ? "text-(--color-success)" : "text-(--color-danger)"}`}>
          {isPositive ? "" : "-"}${formatMoney(Math.abs(data.net_worth))}
        </p>
      </div>
      <div className="flex items-center max-md:hidden">
        <p className="text-[9px] text-(--color-text-tertiary) mr-2">Assets − Debts</p>
        <p className="text-[11px] font-(--font-mono) text-(--color-text-secondary)">${formatMoney(data.total_assets)} − ${formatMoney(data.total_debts)}</p>
      </div>
    </div>
  );
}

// ─── Budget health mini widget ────────────────────────────────────────────────

function BudgetHealthMini({ activeContext, onNavigate }: { activeContext: ActiveContext; onNavigate: (v: ViewState) => void }) {
  const [rows, setRows] = useState<BudgetSummaryRow[]>([]);

  useEffect(() => {
    fetch(`/api/budget/summary?context_type=${activeContext.type}&context_id=${activeContext.id}`)
      .then(r => r.ok ? r.json() : { summaries: [] })
      .then(d => setRows((d.summaries ?? []).filter((s: BudgetSummaryRow) => s.status === "active")))
      .catch(() => {});
  }, [activeContext.type, activeContext.id]);

  const top3 = [...rows].sort((a, b) => b.percent_used - a.percent_used).slice(0, 3);

  return (
    <div className="h-full bg-(--color-elevated) border border-(--color-border-default) rounded-md flex flex-col overflow-hidden" style={{ padding: '10px 14px' }}>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="text-[9px] font-medium text-(--color-text-secondary) uppercase tracking-[0.1em]">Budget Health</p>
        <button onClick={() => onNavigate("budgets")} className="text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">View all →</button>
      </div>
      {top3.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-[12px] text-(--color-text-tertiary)">No budgets yet</p>
          <button onClick={() => onNavigate("budgets")} className="text-[11px] text-(--color-accent) hover:opacity-80 transition-opacity">Create one →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {top3.map(s => {
            const Icon = getCategoryIcon(s.category_icon);
            return (
              <div key={s.budget_id} className="flex items-center gap-2 h-9">
                <div className="w-[16px] h-[16px] rounded-full shrink-0 flex items-center justify-center" style={{ background: s.category_color + "22", color: s.category_color }}>
                  <Icon size={9} />
                </div>
                <span className="text-[11px] text-(--color-text-primary) truncate flex-1">{s.category_name}</span>
                <div className="w-[60px] h-[3px] bg-(--color-border-subtle) rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(s.percent_used, 100)}%`,
                      background: s.percent_used >= 100 ? "var(--color-danger)" : s.percent_used >= 75 ? "var(--color-warning)" : "var(--color-accent)",
                    }}
                  />
                </div>
                <span className="text-[10px] font-(--font-mono) text-(--color-text-secondary) shrink-0 w-14 text-right">${formatMoney(s.daily_rate)}/d</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Goal progress mini widget ────────────────────────────────────────────────

function GoalProgressMini({ goals: allGoals, onNavigate }: { goals: GoalSummary[]; onNavigate: (v: ViewState) => void }) {
  const goals = allGoals.filter(g => g.status === "active");

  const slots = goals.slice(0, 3);
  const placeholders = Math.max(0, 3 - slots.length);

  if (goals.length === 0) {
    return (
      <div className="h-full bg-(--color-elevated) border border-(--color-border-default) rounded-md flex flex-col overflow-hidden" style={{ padding: '10px 14px' }}>
        <div className="flex items-center justify-between mb-2 shrink-0">
          <p className="text-[9px] font-medium text-(--color-text-secondary) uppercase tracking-[0.1em]">Goals</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <button onClick={() => onNavigate("goals")} className="text-[12px] text-(--color-accent) hover:opacity-80 transition-opacity">Set a savings goal →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-(--color-elevated) border border-(--color-border-default) rounded-md flex flex-col overflow-hidden" style={{ padding: '10px 14px' }}>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="text-[9px] font-medium text-(--color-text-secondary) uppercase tracking-[0.1em]">Goals</p>
        <button onClick={() => onNavigate("goals")} className="text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">View all →</button>
      </div>
      <div className="flex gap-2 flex-1 min-h-0">
        {slots.map(g => (
          <div key={g.id} className="flex-1 bg-(--color-elevated) border border-(--color-border-subtle) rounded-(--radius-sm) p-2 flex flex-col overflow-hidden min-w-0">
            <span className="text-[20px] leading-none">{g.icon}</span>
            <p className="text-[11px] font-medium text-(--color-text-primary) truncate mt-1">{g.name}</p>
            <div className="w-full h-[3px] bg-(--color-border-subtle) rounded-full overflow-hidden mt-[6px]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(g.percent_complete, 100)}%`,
                  background: "linear-gradient(90deg, var(--color-accent), var(--color-success))",
                }}
              />
            </div>
            <p className="text-[9px] font-(--font-mono) text-(--color-text-tertiary) mt-1">{Math.round(g.percent_complete)}% saved</p>
          </div>
        ))}
        {Array.from({ length: placeholders }).map((_, i) => (
          <button
            key={`ph-${i}`}
            onClick={() => onNavigate("goals")}
            className="flex-1 bg-(--color-elevated) border border-dashed border-(--color-border-default) rounded-(--radius-sm) p-2 flex items-center justify-center text-(--color-text-tertiary) hover:border-(--color-border-strong) hover:text-(--color-text-secondary) transition-colors min-w-0"
          >
            <Plus size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Overview panel ───────────────────────────────────────────────────────────

function OverviewPanel({ transactions, accountMap, categoryOverrides, onChangeCategory, spending, totalBalance, totalSpent, totalIncome, onViewAll, activeContext, onNavigate, accounts }: PanelProps & {
  spending: Record<string, number>;
  totalBalance: number;
  totalSpent: number;
  totalIncome: number;
  onViewAll: () => void;
  activeContext: ActiveContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigate: (view: any) => void;
  accounts: Account[];
}) {
  return (
    <>
      <OnboardingChecklist activeContext={activeContext} onNavigate={onNavigate} />

      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">

        {/* Row 1: Three stat cards — desktop only; mobile shows hero block instead */}
        <div className="hidden lg:grid grid-cols-3 gap-2 flex-shrink-0">
          <OverviewStatCard label="Liquid cash"  value={`$${formatMoney(totalBalance)}`} />
          <OverviewStatCard label="Spent (30d)"  value={`$${formatMoney(totalSpent)}`}  color="text-(--color-danger)" />
          <OverviewStatCard label="Income (30d)" value={`$${formatMoney(totalIncome)}`} color="text-(--color-success)" />
        </div>

        {/* Row 3: Spending chart + Recent transactions */}
        <div className="flex gap-2 flex-1 min-h-0 max-lg:flex-col">
          <div className="flex-1 min-w-0 bg-(--color-surface) border border-(--color-border-default) rounded-md flex flex-col overflow-hidden" style={{ padding: '12px 16px' }}>
            <ActivityChart transactions={transactions} />
          </div>

          {/* lg:w-80 (320px) replaces removed inline style={{ width: 320 }} */}
          <div className="bg-(--color-surface) border border-(--color-border-default) rounded-md flex flex-col overflow-hidden flex-shrink-0 lg:w-80 max-lg:w-full max-lg:h-auto" style={{ padding: '12px 14px' }}>
            <DailyDigest
              transactions={transactions}
              categoryOverrides={categoryOverrides}
              onViewAll={onViewAll}
              onRecategorize={onChangeCategory}
            />
          </div>
        </div>

        {/* Row 4: Bills widget */}
        <div className="flex-shrink-0" style={{ height: 240 }}>
          <BillsWidget accounts={accounts} />
        </div>

      </div>
    </>
  );
}

// ─── Transactions panel ───────────────────────────────────────────────────────

function TransactionsPanel({ transactions, accountMap, categoryOverrides, onChangeCategory, search, onSearch }: PanelProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "merchant-asc">("date-desc");
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [pickerOpenForTxId, setPickerOpenForTxId] = useState<string | null>(null);
  const [showMoreCategories, setShowMoreCategories] = useState(false);

  // Reset to page 1 whenever any filter or page-size changes — intersection of all three filters
  useEffect(() => { setCurrentPage(1); }, [categoryFilter, accountFilter, search, itemsPerPage]);

  // Close actions menu on outside click
  useEffect(() => {
    if (!openActionsId) return;
    function handler() { setOpenActionsId(null); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openActionsId]);

  // ── Derived: category groups ──────────────────────────────────────────────
  const categoryGroups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of transactions) {
      const cat = categoryOverrides[t.transaction_id] ?? t.personal_finance_category?.primary ?? "OTHER";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [transactions, categoryOverrides]);

  // ── Derived: account groups ───────────────────────────────────────────────
  const accountGroups = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const t of transactions) {
      if (!seen.has(t.account_id)) {
        seen.add(t.account_id);
        const acct = accountMap.get(t.account_id);
        if (acct) result.push({ id: t.account_id, name: acct.name });
      }
    }
    return result;
  }, [transactions, accountMap]);

  // ── Derived: filtered + sorted transactions (all three filters intersect) ─
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions
      .filter(t => {
        const cat = categoryOverrides[t.transaction_id] ?? t.personal_finance_category?.primary ?? "OTHER";
        if (categoryFilter && cat !== categoryFilter) return false;
        if (accountFilter && t.account_id !== accountFilter) return false;
        if (q && !(t.merchant_name ?? t.name).toLowerCase().includes(q)) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        switch (sortBy) {
          case "date-asc":      return a.date.localeCompare(b.date);
          case "amount-desc":   return Math.abs(b.amount) - Math.abs(a.amount);
          case "amount-asc":    return Math.abs(a.amount) - Math.abs(b.amount);
          case "merchant-asc":  return (a.merchant_name ?? a.name).localeCompare(b.merchant_name ?? b.name);
          default:              return b.date.localeCompare(a.date); // date-desc
        }
      });
  }, [transactions, categoryOverrides, categoryFilter, accountFilter, search, sortBy]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const pagedTransactions = filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const hasFilters = !!categoryFilter || !!accountFilter || !!search.trim();

  const VISIBLE_CATS = 5;
  const visibleCats = showMoreCategories ? categoryGroups : categoryGroups.slice(0, VISIBLE_CATS);
  const hiddenCatCount = Math.max(0, categoryGroups.length - VISIBLE_CATS);

  // ── Pagination helpers ────────────────────────────────────────────────────
  function pageNumbers(): (number | "…")[] {
    const pages: (number | "…")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (currentPage > 3) pages.push("…");
    for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  }

  const pillBase = "h-7 px-3 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap flex-shrink-0";
  const pillActive = "bg-(--color-accent) text-black";
  const pillInactive = "text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle)";

  return (
    <div className="flex flex-col gap-4 pb-8">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="font-(--font-display) text-[20px] font-semibold text-(--color-text-primary)">Transactions</p>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-(--color-text-tertiary)">Items per page:</span>
          <select
            value={itemsPerPage}
            onChange={e => { setItemsPerPage(Number(e.target.value)); }}
            className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-md) px-2 py-1 text-[12px] text-(--color-text-primary) outline-none"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* ── Category filter tabs ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`${pillBase} ${!categoryFilter ? pillActive : pillInactive}`}
        >
          All
          <span className="ml-1 opacity-60 font-normal">{transactions.length}</span>
        </button>
        {visibleCats.map(([cat, count]) => {
          const meta = getCategoryMeta(cat);
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(prev => prev === cat ? null : cat)}
              className={`${pillBase} ${categoryFilter === cat ? pillActive : pillInactive}`}
            >
              {meta.label}
              <span className="ml-1 opacity-60 font-normal">{count}</span>
            </button>
          );
        })}
        {!showMoreCategories && hiddenCatCount > 0 && (
          <button
            onClick={() => setShowMoreCategories(true)}
            className={`${pillBase} ${pillInactive}`}
          >
            More ▾ ({hiddenCatCount})
          </button>
        )}
      </div>

      {/* ── Account filter tabs ─────────────────────────────────────────── */}
      {accountGroups.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setAccountFilter(null)}
            className={`${pillBase} ${!accountFilter ? pillActive : pillInactive}`}
          >
            All Accounts
          </button>
          {accountGroups.map(acct => (
            <button
              key={acct.id}
              onClick={() => setAccountFilter(prev => prev === acct.id ? null : acct.id)}
              className={`${pillBase} ${accountFilter === acct.id ? pillActive : pillInactive}`}
            >
              {acct.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Search + sort row ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)" />
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-md) h-9 pl-9 pr-4 text-[13px] text-(--color-text-primary) placeholder:text-(--color-text-disabled) outline-none focus:border-(--color-border-strong)"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-md) h-9 px-3 text-[13px] text-(--color-text-primary) outline-none shrink-0"
        >
          <option value="date-desc">Date (newest first)</option>
          <option value="date-asc">Date (oldest first)</option>
          <option value="amount-desc">Amount (highest)</option>
          <option value="amount-asc">Amount (lowest)</option>
          <option value="merchant-asc">Merchant (A–Z)</option>
        </select>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center gap-0 border-b border-(--color-border-default) bg-(--color-surface) sticky top-0 z-10 px-2">
          <div className="w-10 shrink-0" />
          <div
            className="flex-1 min-w-0 py-2.5 text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) font-medium cursor-pointer hover:text-(--color-text-primary) select-none flex items-center gap-1"
            onClick={() => setSortBy(prev => prev === "merchant-asc" ? "date-desc" : "merchant-asc")}
          >
            Merchant
            {sortBy === "merchant-asc" && <span className="text-[9px]">▲</span>}
          </div>
          <div className="w-40 shrink-0 py-2.5 text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) font-medium max-lg:hidden">
            Category
          </div>
          <div
            className="w-24 shrink-0 py-2.5 text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) font-medium cursor-pointer hover:text-(--color-text-primary) select-none flex items-center gap-1"
            onClick={() => setSortBy(prev => prev === "date-desc" ? "date-asc" : "date-desc")}
          >
            Date
            {sortBy === "date-desc" && <span className="text-[9px]">▼</span>}
            {sortBy === "date-asc" && <span className="text-[9px]">▲</span>}
          </div>
          <div className="w-36 shrink-0 py-2.5 text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) font-medium max-lg:hidden">
            Account
          </div>
          <div
            className="w-24 shrink-0 py-2.5 text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) font-medium text-right cursor-pointer hover:text-(--color-text-primary) select-none flex items-center justify-end gap-1"
            onClick={() => setSortBy(prev => prev === "amount-desc" ? "amount-asc" : "amount-desc")}
          >
            Amount
            {sortBy === "amount-desc" && <span className="text-[9px]">▼</span>}
            {sortBy === "amount-asc" && <span className="text-[9px]">▲</span>}
          </div>
          <div className="w-10 shrink-0" />
        </div>

        {/* Empty states */}
        {filteredTransactions.length === 0 && !hasFilters && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-(--color-text-tertiary)">
            <Receipt size={48} strokeWidth={1.2} />
            <p className="text-[15px] font-medium text-(--color-text-primary)">No transactions yet</p>
            <p className="text-[13px]">Sync your bank to see transactions</p>
          </div>
        )}
        {filteredTransactions.length === 0 && hasFilters && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-(--color-text-tertiary)">
            <Search size={48} strokeWidth={1.2} />
            <p className="text-[15px] font-medium text-(--color-text-primary)">No transactions match your filters</p>
            <button
              onClick={() => { setCategoryFilter(null); setAccountFilter(null); onSearch(""); }}
              className="text-[13px] text-(--color-accent) hover:opacity-80 transition-opacity"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Rows */}
        {pagedTransactions.map(tx => {
          const effectiveCategory = categoryOverrides[tx.transaction_id] ?? tx.personal_finance_category?.primary;
          const meta = getCategoryMeta(effectiveCategory);
          const isCredit = tx.amount < 0;
          const acct = accountMap.get(tx.account_id);
          const actionsOpen = openActionsId === tx.transaction_id;
          const dateObj = new Date(tx.date + "T00:00:00");
          const isCurrentYear = dateObj.getFullYear() === new Date().getFullYear();
          const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(!isCurrentYear && { year: "numeric" }) });

          return (
            <div
              key={tx.transaction_id}
              className="flex items-center gap-0 border-b border-(--color-border-subtle) hover:bg-(--color-border-subtle)/30 transition-colors group px-2"
              style={{ height: 52 }}
            >
              {/* Avatar */}
              <div className="w-10 shrink-0 flex items-center">
                {tx.logo_url ? (
                  <img src={tx.logo_url} alt="" className="w-8 h-8 rounded-full object-contain bg-white/5" />
                ) : (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${meta.color}`}>
                    {(tx.merchant_name ?? tx.name).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Merchant */}
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[13px] font-medium text-(--color-text-primary) truncate">{tx.merchant_name ?? tx.name}</p>
                {/* E4: compact category indicator — mobile only, same effectiveCategory logic as filter tabs */}
                <p className="text-[10px] text-(--color-text-tertiary) truncate lg:hidden">{meta.label}</p>
              </div>

              {/* Category */}
              <div className="w-40 shrink-0 pr-3 max-lg:hidden">
                <CategoryPill
                  category={effectiveCategory}
                  transactionId={tx.transaction_id}
                  onChangeCategory={onChangeCategory}
                />
              </div>

              {/* Date */}
              <div className="w-24 shrink-0 pr-3">
                <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary)">{dateStr}</span>
              </div>

              {/* Account */}
              <div className="w-36 shrink-0 pr-3 max-lg:hidden">
                <span className="text-[11px] text-(--color-text-tertiary) truncate block">{acct?.name ?? "—"}</span>
              </div>

              {/* Amount */}
              <div className="w-24 shrink-0 text-right pr-3">
                <span className={`text-[13px] font-(--font-mono) font-medium ${isCredit ? "text-(--color-success)" : "text-(--color-text-primary)"}`}>
                  {isCredit ? "+" : "-"}${formatMoney(Math.abs(tx.amount))}
                </span>
              </div>

              {/* Actions */}
              <div className="w-10 shrink-0 flex items-center justify-center relative">
                <button
                  onClick={e => { e.stopPropagation(); setOpenActionsId(prev => prev === tx.transaction_id ? null : tx.transaction_id); }}
                  className="opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity text-(--color-text-tertiary) hover:text-(--color-text-primary) p-1 rounded"
                >
                  <MoreHorizontal size={14} />
                </button>
                {actionsOpen && (
                  <div
                    className="absolute right-0 top-8 z-20 w-40 bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-md) shadow-lg overflow-hidden"
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <button
                      onMouseDown={() => { setPickerOpenForTxId(tx.transaction_id); setOpenActionsId(null); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-(--color-text-primary) hover:bg-(--color-elevated) transition-colors"
                    >
                      Change category
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Category picker modal — all widths. Row menu "Change category" at any viewport. ── */}
      {/* onMouseDown on the button fires before the mousedown-close handler removes it from the DOM. */}
      {/* All modal close paths (backdrop, Escape, selection) call onClose → clears pickerOpenForTxId. */}
      {pickerOpenForTxId !== null && (() => {
        const pickerTx = transactions.find(t => t.transaction_id === pickerOpenForTxId);
        const pickerCategory = categoryOverrides[pickerOpenForTxId] ?? pickerTx?.personal_finance_category?.primary;
        return (
          <CategoryPickerModal
            transactionId={pickerOpenForTxId}
            currentCategory={pickerCategory}
            onSelect={onChangeCategory}
            onClose={() => setPickerOpenForTxId(null)}
          />
        );
      })()}

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {filteredTransactions.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[12px] text-(--color-text-secondary) font-(--font-mono)">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredTransactions.length)}–{Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center text-(--color-text-secondary) hover:text-(--color-text-primary) disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers().map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-[12px] text-(--color-text-tertiary)">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-7 h-7 flex items-center justify-center text-[12px] rounded-(--radius-sm) transition-colors ${p === currentPage ? "bg-(--color-accent) text-black font-medium" : "text-(--color-text-secondary) hover:text-(--color-text-primary)"}`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="w-7 h-7 flex items-center justify-center text-(--color-text-secondary) hover:text-(--color-text-primary) disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── All accounts panel ───────────────────────────────────────────────────────

// ─── Budgets panel ────────────────────────────────────────────────────────────

function BudgetsPanel({ onGoTo, triggerCreateRef, activeContext, goals }: {
  onGoTo: (view: ViewState) => void;
  triggerCreateRef?: React.MutableRefObject<(() => void) | null>;
  activeContext: ActiveContext;
  goals: GoalSummary[];
}) {
  const [summaries, setSummaries] = useState<BudgetSummaryRow[]>([]);
  const [totals, setTotals] = useState<{ total_budgeted: number; total_spent: number; monthly_income: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [wizardSnapshot, setWizardSnapshot] = useState<WizardSnapshot | null>(null);
  const [wizardInitialStep, setWizardInitialStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<EditingBudget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const goalsCount = goals.length;
  const goalNameMap = useMemo(
    () => new Map(goals.map(g => [g.id, { name: g.name, icon: g.icon }])),
    [goals]
  );

  const loadSummaries = useCallback(async () => {
    const res = await fetch("/api/budget/summary");
    const d = res.ok ? await res.json() : { summaries: [], totals: null };
    setSummaries(d.summaries ?? []);
    setTotals(d.totals ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  async function pauseBudget(budgetId: string, currentStatus: "active" | "paused") {
    await fetch("/api/budget/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_id: budgetId, status: currentStatus === "active" ? "paused" : "active" }),
    });
    loadSummaries();
  }

  async function deleteBudget(budgetId: string) {
    setDeletingId(budgetId);
    await fetch("/api/budget/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_id: budgetId }),
    });
    await loadSummaries();
    setDeletingId(null);
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function bulkDelete() {
    await fetch("/api/budget/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_ids: [...selected] }),
    });
    setSelectMode(false);
    setSelected(new Set());
    await loadSummaries();
  }

  async function bulkPause() {
    await Promise.all([...selected].map(id =>
      fetch("/api/budget/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget_id: id, status: "paused" }),
      })
    ));
    setSelectMode(false);
    setSelected(new Set());
    await loadSummaries();
  }

  if (triggerCreateRef) triggerCreateRef.current = () => { setEditingBudget(null); setWizardOpen(true); };

  if (loading) return <div className="flex items-center justify-center py-16"><RefreshCw size={16} className="animate-spin text-[#7a7870]" /></div>;

  const selectedBudget = selectedBudgetId ? summaries.find(s => s.budget_id === selectedBudgetId) ?? null : null;

  if (selectedBudget) {
    return (
      <BudgetDrillDown
        budget={selectedBudget}
        contextType={activeContext.type}
        contextId={activeContext.id}
        onBack={() => setSelectedBudgetId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {totals && summaries.length > 0 && (() => {
        const pct = totals.total_budgeted > 0 ? totals.total_spent / totals.total_budgeted : 0;
        return (
          <>
            {/* Mobile summary card */}
            <div className="lg:hidden rounded-2xl p-4 mb-4 border border-(--color-border-subtle) bg-(--color-elevated)">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Budgeted</span>
                  <span className="text-[18px] font-semibold font-(--font-mono) text-(--color-text-primary)">${formatMoney(totals.total_budgeted)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Spent</span>
                  <span className={`text-[18px] font-semibold font-(--font-mono) ${pct >= 1 ? "text-(--color-danger)" : pct >= 0.8 ? "text-(--color-warning)" : "text-(--color-text-primary)"}`}>${formatMoney(totals.total_spent)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Income</span>
                  <span className={`text-[18px] font-semibold font-(--font-mono) ${totals.monthly_income > 0 ? "text-(--color-success)" : "text-(--color-text-tertiary)"}`}>${formatMoney(totals.monthly_income)}</span>
                </div>
              </div>
            </div>
            {/* Desktop stat cards */}
            <div className="hidden lg:grid grid-cols-3 gap-3 mb-5">
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
          </>
        );
      })()}

      {summaries.length === 0 && !wizardOpen && (
        goalsCount === 0 ? (
          <div className="text-center py-20 text-(--color-text-secondary)">
            <div className="w-16 h-16 rounded-(--radius-xl) bg-(--color-elevated) border border-(--color-border-default) flex items-center justify-center mx-auto mb-5">
              <Target size={28} className="text-(--color-text-tertiary)" />
            </div>
            <p className="text-(--color-text-primary) font-semibold text-base mb-2">Create a savings goal first</p>
            <p className="text-sm mb-6 max-w-xs mx-auto">Budgets are linked to savings goals. Set up a goal before adding a budget.</p>
            <button onClick={() => onGoTo("goals")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-(--color-accent) text-(--color-base) text-sm font-semibold rounded-(--radius-md) hover:opacity-90 transition-opacity mx-auto">
              <Plus size={14} /> Set up a goal first
            </button>
          </div>
        ) : (
          <div className="text-center py-20 text-(--color-text-secondary)">
            <div className="w-16 h-16 rounded-(--radius-xl) bg-(--color-elevated) border border-(--color-border-default) flex items-center justify-center mx-auto mb-5">
              <Wallet size={28} className="text-(--color-text-tertiary)" />
            </div>
            <p className="text-(--color-text-primary) font-semibold text-base mb-2">No budgets yet</p>
            <p className="text-sm mb-6 max-w-xs mx-auto">Set a spending limit per category to start tracking where your money goes.</p>
            <button onClick={() => { setEditingBudget(null); setWizardOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-(--color-accent) text-(--color-base) text-sm font-semibold rounded-(--radius-md) hover:opacity-90 transition-opacity mx-auto">
              <Plus size={14} /> Create your first budget
            </button>
          </div>
        )
      )}

      {summaries.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-1">
            <span />
            {selectMode ? (
              <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} className="text-xs text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors">Cancel</button>
            ) : (
              <button onClick={() => setSelectMode(true)} className="text-xs text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors">Select</button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-[10px]">
            {summaries.map((s) => (
              <div
                key={s.budget_id}
                onClick={() => selectMode ? toggleSelect(s.budget_id) : setSelectedBudgetId(s.budget_id)}
                className={`rounded-2xl lg:rounded-md border border-l-[3px] p-4 lg:px-5 lg:py-4 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 shadow-(--shadow-sm) hover:shadow-(--shadow-md) ${s.status === "paused" ? "opacity-50" : ""} ${selectMode && selected.has(s.budget_id) ? "border-(--color-accent)" : "border-(--color-border-default)"}`}
                style={{
                  borderLeftColor: s.over_budget
                    ? "var(--color-danger)"
                    : s.percent_used >= 80
                      ? "var(--color-warning, #f59e0b)"
                      : s.amount_spent === 0
                        ? "var(--color-border-default)"
                        : "var(--color-accent)",
                  background: s.over_budget
                    ? "linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, transparent 60%)"
                    : "var(--color-surface)",
                }}
              >
                {/* Mobile card layout */}
                <div className="lg:hidden">
                  {/* Row 1: Avatar | Name + period | Percentage */}
                  <div className="flex items-center gap-3 mb-2">
                    {selectMode ? (
                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected.has(s.budget_id) ? "border-(--color-accent) bg-(--color-accent)" : "border-(--color-border-strong)"}`}>
                        {selected.has(s.budget_id) && <span className="text-(--color-base) text-[10px] font-bold">✓</span>}
                      </div>
                    ) : (() => { const Icon = getCategoryIcon(s.category_icon); return (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: s.category_color + "40", color: s.category_color }}
                      >
                        <Icon size={18} />
                      </div>
                    ); })()}
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-(--color-text-primary) truncate">{s.name ?? s.category_name}</p>
                      <p className="text-[12px] text-(--color-text-tertiary) capitalize">{s.period_type}</p>
                    </div>
                    <span className={`shrink-0 text-[18px] font-semibold font-(--font-mono) ${s.percent_used >= 100 ? "text-(--color-danger)" : s.percent_used >= 80 ? "text-(--color-warning)" : "text-(--color-accent)"}`}>
                      {Math.round(s.percent_used)}%
                    </span>
                  </div>
                  {/* Row 2: Progress bar */}
                  <div className="h-[6px] bg-(--color-border-subtle) rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full progress-bar-animate"
                      style={{
                        "--bar-width": `${Math.min(s.percent_used, 100)}%`,
                        background: s.percent_used >= 100 ? "var(--color-danger)" : s.percent_used >= 80 ? "var(--color-warning, #f59e0b)" : "var(--color-accent)",
                      } as React.CSSProperties}
                    />
                  </div>
                  {/* Row 2.5: Goal chip */}
                  {(() => { const g = goalNameMap.get(s.goal_id); return g ? (
                    <p className="text-[10px] text-(--color-text-tertiary) mb-1.5">{g.icon} {g.name}</p>
                  ) : null; })()}
                  {/* Row 3: Spent / limit · status */}
                  <div className="flex items-center justify-between text-[12px] text-(--color-text-tertiary)">
                    <span className="font-(--font-mono)">${formatMoney(s.amount_spent)} / ${formatMoney(s.effective_limit)}</span>
                    <span className={s.over_budget ? "text-(--color-danger)" : ""}>
                      {s.over_budget ? `$${formatMoney(s.amount_spent - s.effective_limit)} over` : s.status === "paused" ? "Paused" : `${s.days_remaining}d left`}
                    </span>
                  </div>
                </div>

                {/* Desktop card layout — unchanged */}
                <div className="hidden lg:block">
                  {/* Row 1 — Header: icon/checkbox + name + pills | action buttons */}
                  <div className="flex items-center gap-3 mb-3">
                    {selectMode ? (
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected.has(s.budget_id) ? "border-(--color-accent) bg-(--color-accent)" : "border-(--color-border-strong)"}`}>
                        {selected.has(s.budget_id) && <span className="text-(--color-base) text-[10px] font-bold">✓</span>}
                      </div>
                    ) : (() => { const Icon = getCategoryIcon(s.category_icon); return (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: s.category_color + "40", color: s.category_color }}
                      >
                        <Icon size={16} />
                      </div>
                    ); })()}
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <p className="text-[14px] font-semibold text-(--color-text-primary)">{s.name ?? s.category_name}</p>
                        {s.status === "paused" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-(--radius-pill) bg-(--color-overlay) text-(--color-text-tertiary)">Paused</span>
                        )}
                        {(s.notified_80 || s.notified_over) && (
                          <span title={s.notified_over ? "Over budget alert sent" : "80% alert sent"} className="text-(--color-text-tertiary)">
                            <Mail size={11} />
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-(--radius-pill) bg-(--color-overlay) text-(--color-text-secondary) capitalize">
                          {s.period_type}
                        </span>
                        {s.transaction_count > 0 && (
                          <span className="text-[10px] text-(--color-text-tertiary)">{s.transaction_count} txn{s.transaction_count !== 1 ? "s" : ""}</span>
                        )}
                        {(() => { const g = goalNameMap.get(s.goal_id); return g ? (
                          <span className="inline-flex items-center gap-1 max-w-[120px] px-1.5 py-0.5 rounded-(--radius-pill) bg-(--color-overlay) text-(--color-text-secondary) text-[10px] overflow-hidden">
                            <span className="shrink-0">{g.icon}</span>
                            <span className="truncate min-w-0">{g.name}</span>
                          </span>
                        ) : null; })()}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); pauseBudget(s.budget_id, s.status); }}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-(--color-text-tertiary) hover:text-(--color-text-primary) hover:bg-white/5 transition-colors"
                          title={s.status === "paused" ? "Resume budget" : "Pause budget"}
                        >
                          {s.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingBudget(s); setWizardOpen(true); }}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-(--color-text-tertiary) hover:text-(--color-text-primary) hover:bg-white/5 transition-colors"
                          title="Edit budget"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteBudget(s.budget_id); }}
                          disabled={deletingId === s.budget_id}
                          className="w-7 h-7 flex items-center justify-center rounded-md text-(--color-text-tertiary) hover:text-(--color-danger) hover:bg-red-500/5 disabled:opacity-40 transition-colors"
                          title="Delete budget"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 2 — Progress bar + spent/limit + percentage */}
                  <div className="mb-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="w-full lg:flex-1 lg:w-auto h-[6px] bg-(--color-border-subtle) rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full progress-bar-animate"
                          style={{
                            "--bar-width": `${Math.min(s.percent_used, 100)}%`,
                            background: s.percent_used >= 100 ? "var(--color-danger)" : s.percent_used >= 80 ? "var(--color-warning, #f59e0b)" : "var(--color-accent)",
                          } as React.CSSProperties}
                        />
                      </div>
                      <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary) shrink-0">
                        ${formatMoney(s.amount_spent)} / ${formatMoney(s.effective_limit)}
                      </span>
                      <span className={`text-[13px] font-semibold shrink-0 ml-auto lg:ml-0 ${s.percent_used >= 100 ? "text-(--color-danger)" : s.percent_used >= 80 ? "text-(--color-warning)" : "text-(--color-accent)"}`}>
                        {Math.round(s.percent_used)}%
                      </span>
                    </div>
                  </div>

                  {/* Row 3 — Daily rate / over amount | days remaining */}
                  <div className="flex items-center justify-between">
                    <div>
                      {s.over_budget ? (
                        <p className="text-[13px] font-semibold text-(--color-danger)">${formatMoney(s.amount_spent - s.effective_limit)} over limit</p>
                      ) : s.status === "paused" ? (
                        <p className="text-[13px] text-(--color-text-tertiary)">Paused</p>
                      ) : (
                        <p>
                          <span className="text-[13px] font-semibold text-(--color-text-primary)">${formatMoney(s.daily_rate)}/day</span>
                          <span className="text-[11px] text-(--color-text-tertiary) ml-1">remaining</span>
                        </p>
                      )}
                    </div>
                    <p className={`text-[11px] ${s.days_remaining < 5 ? "text-(--color-danger)" : "text-(--color-text-tertiary)"}`}>
                      {s.days_remaining === 0 ? "ends today" : `${s.days_remaining}d left`} · ends {formatDate(s.period_end)}
                    </p>
                  </div>

                  {/* Nudge — subtle inline row */}
                  {/* mobile: nudge hidden — acceptable tradeoff */}
                  {s.days_remaining < 2 && s.amount_remaining > 0 && !s.nudge_sent && s.status !== "paused" && (
                    <div className="mt-3 pt-3 border-t border-(--color-border-subtle) flex items-center gap-2 nudge-appear">
                      <span className="text-[13px]">💡</span>
                      <p className="flex-1 text-[12px] text-(--color-text-secondary) leading-snug">
                        Period ends soon — move <span className="font-(--font-mono)">${formatMoney(s.amount_remaining)}</span> to your savings goal?
                      </p>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await fetch("/api/budget/nudge", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ budget_name: s.name ?? s.category_name, amount_remaining: s.amount_remaining }),
                          });
                          setSummaries(prev => prev.map(b => b.budget_id === s.budget_id ? { ...b, nudge_sent: true } : b));
                        }}
                        className="shrink-0 text-[12px] font-medium text-(--color-accent) hover:opacity-80 transition-opacity cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {selectMode && selected.size > 0 && (
            <div className="flex gap-2">
              <button onClick={bulkPause} className="flex-1 py-2 text-xs font-medium bg-(--color-elevated) border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) rounded-(--radius-md) transition-colors">
                Pause selected ({selected.size})
              </button>
              <button onClick={bulkDelete} className="flex-1 py-2 text-xs font-medium bg-red-500/10 border border-red-500/20 text-(--color-danger) hover:bg-red-500/20 rounded-(--radius-md) transition-colors">
                Delete selected ({selected.size})
              </button>
            </div>
          )}
        </>
      )}

      {goalWizardOpen && (
        <GoalWizard
          activeContext={activeContext}
          skipBudgetStep={true}
          onClose={() => { setGoalWizardOpen(false); setWizardOpen(true); }}
          onCreated={(goalId) => {
            setWizardSnapshot(prev => prev ? { ...prev, goalId } : null);
            setGoalWizardOpen(false);
            setWizardOpen(true);
          }}
        />
      )}

      {wizardOpen && (
        <BudgetWizard
          editingBudget={editingBudget}
          activeContext={activeContext}
          initialStep={wizardInitialStep}
          initialName={wizardSnapshot?.name}
          initialCategoryId={wizardSnapshot?.categoryId}
          initialGoalId={wizardSnapshot?.goalId}
          initialPeriodType={wizardSnapshot?.periodType}
          initialLimit={wizardSnapshot?.limit}
          initialRollover={wizardSnapshot?.rollover}
          onClose={() => { setWizardOpen(false); setEditingBudget(null); setWizardSnapshot(null); setWizardInitialStep(1); }}
          onCreated={() => { setWizardOpen(false); setEditingBudget(null); setWizardSnapshot(null); setWizardInitialStep(1); loadSummaries(); }}
          onOpenGoalWizard={(snapshot) => { setWizardSnapshot(snapshot); setWizardInitialStep(2); setWizardOpen(false); setGoalWizardOpen(true); }}
        />
      )}
    </div>
  );
}

// ─── Analytics panel ──────────────────────────────────────────────────────────

const categoryColors = Object.values(CATEGORY_META).map((m) => m.hex);

function hashMerchantColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return categoryColors[Math.abs(hash) % categoryColors.length];
}

type Period = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  switch (period) {
    case 'DAY': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'WEEK': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'MONTH': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end };
    }
    case 'QUARTER': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { start, end };
    }
    case 'YEAR': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start, end };
    }
  }
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', opts);
  const endStr   = end.toLocaleDateString('en-US', opts);
  const year     = end.getFullYear();
  if (startStr === endStr) return `${startStr}, ${year}`;
  return `${startStr} – ${endStr}, ${year}`;
}

// Only internal transfers excluded per J. Scott framework — loans, fees, etc. are real expenses
const EXCLUDED_TRANSFER_CATEGORIES = new Set([
  'TRANSFER_OUT',
  'TRANSFER_IN',
]);

// Income = actual earnings only (not negative-amount transfers)
const INCOME_CATEGORIES = new Set([
  'INCOME',
]);

function AnalyticsPanel({
  transactions,
  accounts,
  onGoTo,
  goals,
}: {
  transactions: Transaction[];
  accounts: Account[];
  onGoTo: (view: ViewState) => void;
  goals: GoalSummary[];
}) {
  const [period, setPeriod] = useState<Period>('MONTH');

  const dpGoal = goals.find(g =>
    g.name?.toLowerCase().includes("down payment") ||
    g.name?.toLowerCase().includes("down") ||
    g.goal_type === "down_payment"
  );
  const goalTarget = dpGoal?.target_amount ?? 30000;
  const goalTargetLoading = false;

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function trailingAvgIncome(txns: Transaction[]): number {
    const now = new Date();
    const monthTotals: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      const monthIncome = txns
        .filter(t => {
          const d = new Date(t.date + 'T00:00:00');
          return d >= monthStart && d <= monthEnd &&
                 t.amount < 0 &&
                 INCOME_CATEGORIES.has(t.personal_finance_category?.primary ?? '');
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      if (monthIncome > 0) monthTotals.push(monthIncome);
    }
    return monthTotals.length > 0
      ? monthTotals.reduce((a, b) => a + b, 0) / monthTotals.length
      : 0;
  }

  function calcLiquidAssets(accts: Account[]): number {
    return accts
      .filter(a => ["checking", "savings", "money market"].includes(a.subtype?.toLowerCase() ?? ""))
      .reduce((sum, a) => sum + (a.balances.current ?? 0), 0);
  }

  // Period-filtered expense helpers
  const { start, end } = getPeriodRange(period);
  const isInPeriod = (tx: Transaction) => {
    const d = new Date(tx.date + 'T00:00:00');
    return d >= start && d <= end;
  };
  const isExpense = (tx: Transaction) =>
    tx.amount > 0 &&
    !EXCLUDED_TRANSFER_CATEGORIES.has(tx.personal_finance_category?.primary ?? '');
  const isIncome = (tx: Transaction) =>
    tx.amount < 0 &&
    INCOME_CATEGORIES.has(tx.personal_finance_category?.primary ?? '');

  const periodTxs       = transactions.filter(isInPeriod);
  const periodExpenses  = periodTxs.filter(isExpense);
  const periodIncomeTxs = periodTxs.filter(isIncome);

  // Category breakdown — period-filtered, transfers excluded
  const periodSpending = periodExpenses.reduce<Record<string, number>>((acc, t) => {
    const key = t.personal_finance_category?.primary ?? 'OTHER';
    acc[key] = (acc[key] ?? 0) + t.amount;
    return acc;
  }, {});
  const sorted = Object.entries(periodSpending).sort((a, b) => b[1] - a[1]);
  const total  = sorted.reduce((s, [, v]) => s + v, 0);

  // Top merchants — period-filtered, transfers excluded
  const merchantMap = new Map<string, number>();
  for (const t of periodExpenses) {
    const name = t.merchant_name ?? t.name;
    merchantMap.set(name, (merchantMap.get(name) ?? 0) + t.amount);
  }
  const topMerchants = [...merchantMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Spending by weekday — period-filtered, transfers excluded
  const dayAmounts = DAYS.map((_, i) => {
    const jsDay = i === 6 ? 0 : i + 1;
    return periodExpenses
      .filter(t => new Date(t.date + 'T00:00:00').getDay() === jsDay)
      .reduce((s, t) => s + t.amount, 0);
  });
  const maxDayAmount = Math.max(...dayAmounts, 0);

  // J. Scott framework: trailing income (3-mo avg) vs period expenses
  const trailingIncome    = trailingAvgIncome(transactions);
  const totalSpentPeriod  = periodExpenses.reduce((s, t) => s + t.amount, 0);
  const totalIncomePeriod = periodIncomeTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
  const savingsDollar     = trailingIncome - totalSpentPeriod;
  const savingsRatePct    = trailingIncome > 0 ? (savingsDollar / trailingIncome) * 100 : null;
  const netPositive       = savingsDollar >= 0;

  // TODO: when period !== MONTH, this understates monthly reserve. Fix in follow-up session.
  const monthly_expenses  = totalSpentPeriod;
  const liquid_assets     = calcLiquidAssets(accounts);
  const required_reserve  = monthly_expenses * 3;
  const investable_assets = liquid_assets - required_reserve;

  const noSpendingData = sorted.length === 0;

  const periodLabel = period === 'DAY' ? 'Today' : period === 'WEEK' ? 'This Week' : period === 'MONTH' ? 'This Month' : period === 'QUARTER' ? 'This Quarter' : 'This Year';

  const srColor = savingsDollar > 0 ? "text-(--color-success)" : savingsDollar < 0 ? "text-(--color-danger)" : "text-(--color-text-primary)";
  const invColor = investable_assets >= 0 ? "text-(--color-success)" : "text-(--color-danger)";

  return (
    <div className="analytics-bento-grid" style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gridAutoRows: "auto", gap: "12px", padding: "20px", alignContent: "start", minHeight: "calc(100vh - 56px)" }}>

      {/* Row 1 — Financial Health */}
      {/* Left — Savings Rate */}
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-md) p-4" style={{ gridColumn: "1 / 8" }}>
          <p className="text-[10px] uppercase tracking-[0.1em] text-(--color-text-tertiary)">Are you saving money?</p>
          <div className="flex items-baseline gap-3 mt-2">
            <p className={`font-(--font-display) text-[48px] font-bold leading-none ${srColor}`}>
              {savingsRatePct === null ? '—' : `${savingsRatePct < 0 ? '-' : ''}${Math.abs(savingsRatePct).toFixed(1)}%`}
            </p>
            <p className={`text-[20px] font-(--font-mono) leading-none ${srColor}`}>
              {savingsDollar >= 0 ? '+' : '−'}${formatMoney(Math.abs(savingsDollar))}/mo
            </p>
          </div>
          <p className="text-[12px] text-(--color-text-secondary) mt-1">
            of your income saved {period === 'MONTH' ? 'this month' : period === 'WEEK' ? 'this week' : period === 'DAY' ? 'today' : `this ${period.charAt(0) + period.slice(1).toLowerCase()}`}
          </p>
          <div className="flex gap-6 mt-4 pt-4 border-t border-(--color-border-subtle)">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary) mb-0.5">Avg Monthly Income</p>
              <p className="text-[16px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(trailingIncome)}</p>
              <p className="text-[10px] text-(--color-text-tertiary) mt-0.5">3-month average · varies monthly</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary) mb-0.5">
                {periodLabel} Expenses
              </p>
              <p className="text-[16px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(totalSpentPeriod)}</p>
              <p className="text-[10px] text-(--color-text-tertiary) mt-0.5">transfers not included</p>
            </div>
          </div>
        </div>

      {/* Row 1 Right — Investable Assets */}
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-md) p-4" style={{ gridColumn: "8 / 13" }}>
          <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary)">Investable Assets</p>
          <p className={`font-(--font-display) text-[28px] font-bold leading-none mt-2 ${invColor}`}>
            {investable_assets < 0 ? "-" : ""}${formatMoney(Math.abs(investable_assets))}
          </p>
          <p className="text-[12px] text-(--color-text-secondary) mt-1">
            {investable_assets >= 0
              ? `You can responsibly invest $${formatMoney(investable_assets)} today`
              : `Build your reserve — $${formatMoney(Math.abs(investable_assets))} short`}
          </p>
          <p className="text-[11px] text-(--color-text-tertiary) mt-1">
            ${formatMoney(liquid_assets)} liquid − ${formatMoney(required_reserve)} reserve (3 × ${formatMoney(monthly_expenses)}/mo)
          </p>
          <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-(--color-border-subtle)">
            <div className="flex justify-between text-[12px]">
              <span className="text-(--color-text-secondary)">Liquid assets</span>
              <span className="font-(--font-mono) text-(--color-text-primary)">${formatMoney(liquid_assets)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-(--color-text-secondary)">3mo reserve <span className="text-(--color-text-tertiary)">(3 × ${formatMoney(monthly_expenses)}/mo)</span></span>
              <span className="font-(--font-mono) text-(--color-text-primary)">${formatMoney(required_reserve)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className={investable_assets >= 0 ? "text-(--color-success)" : "text-(--color-danger)"}>Investable</span>
              <span className={`font-(--font-mono) ${investable_assets >= 0 ? "text-(--color-success)" : "text-(--color-danger)"}`}>
                {investable_assets < 0 ? "-" : ""}${formatMoney(Math.abs(investable_assets))}
              </span>
            </div>
          </div>
        </div>

      {/* Row 2 — Period selector + stats */}
      <div className="px-4 py-4" style={{ gridColumn: "1 / 13" }}>
        <div className="flex gap-1.5 mb-4">
          {(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-(--radius-pill) text-[11px] font-medium transition-colors ${
                period === p
                  ? "bg-(--color-accent) text-(--color-base)"
                  : "bg-(--color-overlay) text-(--color-text-secondary) hover:text-(--color-text-primary)"
              }`}
            >
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-(--color-text-tertiary) mt-2 mb-4">
          {formatDateRange(start, end)} · {periodExpenses.length} transaction{periodExpenses.length !== 1 ? 's' : ''}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-(--color-surface) rounded-(--radius-md) px-3 py-3">
            <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-[0.08em] mb-1">Spent ({periodLabel})</p>
            <p className="text-lg font-semibold font-(--font-mono) text-(--color-text-primary)">${formatMoney(totalSpentPeriod)}</p>
          </div>
          <div className="bg-(--color-surface) rounded-(--radius-md) px-3 py-3">
            <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-[0.08em] mb-1">Avg Monthly Income</p>
            <p className="text-lg font-semibold font-(--font-mono) text-(--color-text-primary)">${formatMoney(trailingIncome)}</p>
          </div>
        </div>
      </div>

      {/* Row 3 — Main data row (3-col, locked height) */}
      <div className="analytics-chart-row" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gridTemplateRows: "420px", gap: "12px", alignItems: "stretch" }}>

        {/* Col 1 — By Category */}
        <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md overflow-hidden flex flex-col relative">
          <div className="px-4 pt-4 pb-1 shrink-0">
            <h2 className="text-[10px] font-medium text-(--color-text-tertiary) uppercase tracking-[0.1em]">Where your money went</h2>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {noSpendingData ? (
              <p className="text-[12px] text-(--color-text-tertiary) text-center py-8">No spending this period</p>
            ) : sorted.map(([key, amount]) => {
              const meta = getCategoryMeta(key);
              const pct = total > 0 ? (amount / total) * 100 : 0;
              return (
                <div key={key} className="px-4 py-3 border-b border-(--color-border-subtle) last:border-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.hex }} />
                      <span className="text-[13px] text-(--color-text-primary)">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-(--color-text-tertiary)">{Math.round(pct)}%</span>
                      <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(amount)}</span>
                    </div>
                  </div>
                  <div className="w-full h-[3px] bg-(--color-overlay) rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-[600ms] ease-out"
                      style={{ width: `${pct}%`, background: meta.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {!noSpendingData && <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8" style={{ background: "linear-gradient(to bottom, transparent, var(--color-elevated))" }} />}
        </div>

        {/* Col 2 — Distribution (featured) */}
        <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md px-4 py-4 flex flex-col overflow-hidden">
          <h2 className="text-[10px] font-medium text-(--color-text-tertiary) uppercase tracking-[0.1em] mb-3 shrink-0">Distribution</h2>
          {noSpendingData
            ? <p className="text-[12px] text-(--color-text-tertiary) text-center py-8">No spending this period</p>
            : <SpendingChart spending={periodSpending} />}
        </div>

        {/* Col 3 — Top Merchants */}
        {topMerchants.length > 0 ? (
          <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md overflow-hidden flex flex-col">
            <div className="px-4 pt-4 pb-1 shrink-0">
              <h2 className="text-[10px] font-medium text-(--color-text-tertiary) uppercase tracking-[0.1em]">Top merchants {periodLabel.toLowerCase()}</h2>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {topMerchants.map(([name, amt]) => {
                const color = hashMerchantColor(name);
                const maxAmt = topMerchants[0][1];
                const pct = maxAmt > 0 ? (amt / maxAmt) * 100 : 100;
                return (
                  <div key={name} className="flex items-center gap-3 px-4 py-3 border-b border-(--color-border-subtle) last:border-0">
                    <div
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-(--color-base)"
                      style={{ background: color }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-(--color-text-primary) truncate">{name}</p>
                      <div className="w-full h-[3px] bg-(--color-overlay) rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full rounded-full transition-all duration-[600ms] ease-out"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                    </div>
                    <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary) shrink-0">${formatMoney(amt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md" />
        )}

      </div>

      {/* Row 4 — Spending by day (full-width slim) */}
      <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md px-4 py-3 overflow-hidden" style={{ gridColumn: "1 / -1", height: "140px" }}>
        <h2 className="text-[10px] font-medium text-(--color-text-tertiary) uppercase tracking-[0.1em] mb-2">Spending by day of week</h2>
        {noSpendingData ? (
          <p className="text-[12px] text-(--color-text-tertiary) text-center py-4">No spending this period</p>
        ) : <div className="flex items-end gap-2 h-[76px]">
          {DAYS.map((day, i) => {
            const amt = dayAmounts[i];
            const opacity = maxDayAmount > 0 ? 0.2 + 0.8 * (amt / maxDayAmount) : 0.2;
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-[3px] transition-all duration-500"
                  style={{
                    height: maxDayAmount > 0 ? `${Math.max(8, (amt / maxDayAmount) * 48)}px` : "8px",
                    background: `rgba(0, 212, 170, ${opacity})`,
                  }}
                />
                <span className="text-[9px] text-(--color-text-tertiary) uppercase">{day}</span>
              </div>
            );
          })}
        </div>}
      </div>

      {/* Row 5 — Investment Readiness */}
      {!goalTargetLoading && (() => {
        const target = goalTarget ?? 30000;
        const months_to_goal = savingsDollar > 0
          ? Math.ceil((target - Math.max(investable_assets, 0)) / savingsDollar)
          : null;
        const progressPct = Math.min(100, Math.max(0, (Math.max(investable_assets, 0) / target) * 100));
        const readyDate = months_to_goal != null && months_to_goal > 0
          ? new Date(new Date().getFullYear(), new Date().getMonth() + months_to_goal, 1)
            .toLocaleDateString("en-US", { month: "long", year: "numeric" })
          : null;
        const insight = savingsDollar <= 0
          ? "Focus on getting your savings rate positive before investing. A negative savings rate means you're spending more than you earn — investing now would accelerate financial risk."
          : investable_assets < monthly_expenses * 3
            ? `Build your 3-month emergency reserve first ($${formatMoney(required_reserve - liquid_assets > 0 ? required_reserve - liquid_assets : 0)} needed). This protects you from having to sell an investment at the wrong time.`
            : "You have a positive savings rate and sufficient investable assets. You're positioned to explore real estate deals.";
        return (
          <div className="bg-(--color-surface) border border-(--color-border-default) rounded-(--radius-lg) p-5" style={{ gridColumn: "1 / 13" }}>
            {/* Row A — Narrative */}
            <div className="grid gap-6 mb-6 analytics-readiness-narrative" style={{ gridTemplateColumns: "1fr 1fr" }}>

              {/* Row A Left — Label + heading + state message */}
              <div className="flex flex-col">
                <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary) mb-3">Investment Readiness</p>
                <p className="text-[13px] font-semibold text-(--color-text-primary)">When can you invest?</p>
                <p className="text-[11px] text-(--color-text-tertiary) mt-0.5 mb-3">Based on your current savings rate and goals</p>
                {savingsDollar <= 0 ? (
                  <p className="font-(--font-display) text-[24px] font-bold text-(--color-danger)">Fix your savings rate first</p>
                ) : investable_assets >= target ? (
                  <p className="font-(--font-display) text-[24px] font-bold text-(--color-success)">You&apos;re ready to invest now!</p>
                ) : months_to_goal != null && months_to_goal > 0 ? (
                  <>
                    <p className="font-(--font-display) text-[48px] font-bold leading-none text-(--color-accent)">{months_to_goal}</p>
                    <p className="text-[13px] text-(--color-text-secondary) mt-1">months</p>
                    {readyDate && <p className="text-[12px] text-(--color-text-tertiary) mt-1">Ready by {readyDate}</p>}
                    <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">at your current rate of ${formatMoney(savingsDollar)}/mo</p>
                  </>
                ) : null}
              </div>

              {/* Row A Right — Playbook insight + CTA */}
              <div className="flex flex-col justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary) mb-2">From the playbook</p>
                  <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">{insight}</p>
                </div>
                <button
                  onClick={() => onGoTo("goals")}
                  className="mt-4 px-3 py-2 rounded-(--radius-md) text-[12px] font-medium bg-(--color-accent) text-(--color-base) hover:opacity-90 transition-opacity self-start"
                >
                  {investable_assets < target ? "+ Set a savings goal" : "View goals →"}
                </button>
              </div>

            </div>

            {/* Row B — Progress bar + stat chips */}
            <div>
              <div className="relative mb-2">
                <div className="w-full h-2 bg-(--color-overlay) rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${progressPct}%`,
                      background: progressPct < 30
                        ? "var(--color-danger)"
                        : progressPct < 70
                          ? "var(--color-accent)"
                          : "var(--color-success)",
                    }}
                  />
                </div>
                {[25, 50, 75, 100].map(m => (
                  <div
                    key={m}
                    className="absolute top-0 w-px h-2 bg-(--color-base)"
                    style={{ left: `${m}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-(--color-text-tertiary) mb-4">
                {[25, 50, 75, 100].map(m => (
                  <span key={m}>{m}%</span>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  ["Current investable assets", `$${formatMoney(Math.max(investable_assets, 0))}`],
                  ["Monthly savings rate", `$${formatMoney(savingsDollar)} / mo`],
                  ["Down payment target", `$${formatMoney(target)}`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-(--color-overlay) rounded-(--radius-md) px-3 py-2.5">
                    <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-[0.08em] mb-1">{label}</p>
                    <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Row 6 — Trends */}
      <TrendCharts transactions={transactions} />
    </div>
  );
}

// ─── Account panel ────────────────────────────────────────────────────────────

function AccountPanel({ accountId, transactions, accountMap, categoryOverrides, onChangeCategory, search, onSearch }: PanelProps & { accountId: string }) {
  const acct = accountMap.get(accountId);
  if (!acct) return <p className="text-sm text-[#7a7870]">Account not found.</p>;

  const acctTx = transactions.filter((t) => t.account_id === accountId);
  const filtered = search.trim()
    ? acctTx.filter((t) => (t.merchant_name ?? t.name).toLowerCase().includes(search.toLowerCase()))
    : acctTx;

  const acctSpending = acctTx
    .filter((t) => t.amount > 0)
    .reduce<Record<string, number>>((acc, t) => {
      const key = categoryOverrides[t.transaction_id] ?? t.personal_finance_category?.primary ?? "OTHER";
      acc[key] = (acc[key] ?? 0) + t.amount;
      return acc;
    }, {});

  return (
    <div className="space-y-5">
      <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-5 py-4">
        <p className="text-xs text-[#7a7870] mb-1 capitalize">{acct.institution_name} · {acct.subtype ?? acct.type}</p>
        <p className="text-2xl font-semibold font-(--font-mono)">${formatMoney(acct.balances.current ?? 0)}</p>
        <p className="text-xs text-[#7a7870] mt-1">{acct.name}</p>
        {acct.balances.available != null && acct.balances.available !== acct.balances.current && (
          <p className="text-xs text-[#55534e] mt-0.5">Available: ${formatMoney(acct.balances.available)}</p>
        )}
      </div>

      {Object.keys(acctSpending).length > 0 && (
        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-4 py-4">
          <h2 className="text-xs font-medium text-[#7a7870] uppercase tracking-widest mb-2">Spending breakdown</h2>
          <SpendingChart spending={acctSpending} />
        </div>
      )}

      <div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7a7870]" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search transactions…"
            className="w-full bg-[#1e1e24] border border-[#2e2e38] rounded-xl pl-9 pr-4 py-2.5 text-sm placeholder-[#55534e] focus:outline-none focus:border-white/20"
          />
        </div>
        <TxList transactions={filtered} accountMap={accountMap} categoryOverrides={categoryOverrides} onChangeCategory={onChangeCategory} />
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function BudgetClient({ initialConnected, userId }: { initialConnected: ConnectedItem[]; userId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [connected, setConnected] = useState(initialConnected);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(initialConnected.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);
  const [view, setView] = useState<ViewState>(() => {
    const tab = searchParams.get("tab");
    const accountId = searchParams.get("accountId");
    if (tab === "account" && accountId) return { type: "account", accountId };
    const VALID_TABS = ["overview","manage","budgets","goals","debts","bills","transactions","analytics","profile"] as const;
    if (tab && (VALID_TABS as readonly string[]).includes(tab)) return tab as ViewState;
    return "overview";
  });
  const [mobileOverviewTab, setMobileOverviewTab] = useState<'activity' | 'recent' | 'bills' | 'budgets'>('activity');
  // Prevents desktop OverviewPanel (and its OnboardingChecklist) from mounting on mobile
  const [isDesktop, setIsDesktop] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({});
  const [pendingDebtLink, setPendingDebtLink] = useState<string | null>(null);
  const budgetCreateRef = useRef<(() => void) | null>(null);
  const [search, setSearch] = useState("");
  const [userProfile, setUserProfile] = useState<{ name: string; avatarUrl: string | null; avatarColor: string | null; onboardingComplete: boolean } | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<number | null>(null);
  const [expandedBanks, setExpandedBanks] = useState<Record<string, boolean>>({});

  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [activeContext, setActiveContext] = useState<ActiveContext>({ type: "personal", id: userId });
  const [teamWizardOpen, setTeamWizardOpen] = useState(false);
  const [goals, setGoals] = useState<GoalSummary[]>([]);

  // Manage tab sub-navigation: status (default) → all | drilldown | goals | bills
  type ManageSubView = "status" | "all" | "drilldown" | "goals" | "bills";
  const [manageSubView, setManageSubView] = useState<ManageSubView>("status");
  const [drillDownBudget, setDrillDownBudget] = useState<BudgetSummaryRow | null>(null);

  useEffect(() => {
    if (!userId) return;
    // Restore saved context from localStorage, fall back to personal
    try {
      const stored = localStorage.getItem("financeContext");
      if (stored) {
        const parsed = JSON.parse(stored) as ActiveContext;
        setActiveContext(parsed);
      } else {
        setActiveContext({ type: "personal", id: userId });
      }
    } catch {
      setActiveContext({ type: "personal", id: userId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    fetch("/api/teams/mine")
      .then(r => r.ok ? r.json() : { teams: [] })
      .then(d => setTeams(d.teams ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/goals/summary?context_type=${activeContext.type}&context_id=${activeContext.id}`)
      .then(r => r.ok ? r.json() : { goals: [] })
      .then((d: { goals?: GoalSummary[] }) => setGoals(d.goals ?? []))
      .catch(() => {});
  }, [activeContext.type, activeContext.id]);

  useEffect(() => {
    loadProfile().then(p => {
      setUserProfile({ name: p.username ?? "", avatarUrl: p.avatar_url ?? null, avatarColor: p.avatar_color ?? null, onboardingComplete: p.onboarding_complete });
    }).catch(() => {});
    fetch("/api/onboarding")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.onboarding) return;
        const ob = d.onboarding;
        const keys = ["connected_bank", "added_savings_goal", "added_debt", "added_asset", "set_up_budget"] as const;
        setOnboardingCompleted(keys.filter(k => ob[k]).length);
      }).catch(() => {});
  }, []);

  const switchContext = useCallback((ctx: ActiveContext) => {
    setActiveContext(ctx);
    try { localStorage.setItem("financeContext", JSON.stringify(ctx)); } catch { /* ignore */ }
  }, []);

  const resetToPersonal = useCallback(() => {
    switchContext({ type: "personal", id: userId });
  }, [switchContext, userId]);

  const contextLabel = activeContext.type === "personal"
    ? "Personal"
    : (teams.find(t => t.id === activeContext.id)?.name ?? "Team");

  const activeTeamName = activeContext.type === "team"
    ? (teams.find(t => t.id === activeContext.id)?.name ?? "Team")
    : null;
  const contextOwner = activeTeamName ?? "Your";
  const contextOwnerLower = activeTeamName?.toLowerCase() ?? "your";

  useEffect(() => {
    fetch("/api/plaid/create-link-token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setLinkToken(d.link_token ?? null))
      .catch(() => {});
  }, []);

  const [syncing, setSyncing] = useState(false);

  // Signals the next fetchTick effect to use ?live=true (accountsBalanceGet)
  const liveRef = useRef(false);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setLoading(true);
    await fetch("/api/plaid/sync", { method: "POST" });
    setSyncing(false);
    liveRef.current = true;
    setFetchTick((n) => n + 1);
  }, []);

  // Track desktop viewport to prevent OverviewPanel (and OnboardingChecklist) from mounting on mobile
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const fn = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Re-verify connected Plaid items client-side so Playwright tests can mock rest/v1/plaid_items
  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.from("plaid_items").select("item_id, institution_name").then(({ data }) => {
      if (data) setConnected(data.map(row => ({ itemId: row.item_id as string, institutionName: row.institution_name as string | null })));
    });
  }, []);

  // Silently sync transactions on mount if last sync was >30 minutes ago
  useEffect(() => {
    const syncIfStale = async () => {
      const supabase = createSupabaseClient();
      const { data } = await supabase
        .from("plaid_items")
        .select("last_synced_at")
        .eq("user_id", userId)
        .limit(1)
        .single();
      const lastSync = data?.last_synced_at ? new Date(data.last_synced_at as string) : null;
      const isStale = !lastSync || (Date.now() - lastSync.getTime()) > 30 * 60 * 1000;
      if (isStale) {
        await fetch("/api/plaid/sync", { method: "POST" });
        setFetchTick((n) => n + 1);
      }
    };
    syncIfStale();
  }, [userId]);

  useEffect(() => {
    if (connected.length === 0) return;
    let alive = true;
    const live = liveRef.current;
    liveRef.current = false;
    fetch(`/api/plaid/transactions${live ? '?live=true' : ''}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load"); return r.json(); })
      .then((d) => {
        if (!alive) return;
        setAccounts(d.accounts);
        setTransactions(d.transactions);
        // Populate persisted overrides so category labels survive a reload
        const initial: Record<string, string> = {};
        for (const tx of (d.transactions ?? []) as Array<{ transaction_id: string; category_override: string | null }>) {
          if (tx.category_override) initial[tx.transaction_id] = tx.category_override;
        }
        setCategoryOverrides(initial);
        setLoading(false);
        setError(null);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [fetchTick, connected.length]);

  async function disconnect(itemId: string) {
    await fetch("/api/plaid/disconnect", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: itemId }),
    });
    const remaining = connected.filter((c) => c.itemId !== itemId);
    setConnected(remaining);
    if (remaining.length === 0) { setAccounts([]); setTransactions([]); }
    else refresh();
  }

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.account_id, a])), [accounts]);

  const bankGroups = useMemo(() => {
    const groups: Record<string, { institutionName: string; itemId: string; accounts: Account[] }> = {};
    for (const a of accounts) {
      if (!groups[a.item_id]) groups[a.item_id] = { institutionName: a.institution_name ?? "Bank", itemId: a.item_id, accounts: [] };
      groups[a.item_id].accounts.push(a);
    }
    return Object.values(groups);
  }, [accounts]);

  const spending = useMemo(() =>
    transactions.filter((t) => t.amount > 0).reduce<Record<string, number>>((acc, t) => {
      const key = categoryOverrides[t.transaction_id] ?? t.personal_finance_category?.primary ?? "OTHER";
      acc[key] = (acc[key] ?? 0) + t.amount;
      return acc;
    }, {}),
    [transactions, categoryOverrides]
  );

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + (a.balances.current ?? 0), 0), [accounts]);
  const totalSpent   = useMemo(() => transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), [transactions]);
  const totalIncome  = useMemo(() => transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0), [transactions]);

  async function changeCategory(txId: string, cat: string) {
    const prev = categoryOverrides[txId];
    // Optimistic update
    setCategoryOverrides((o) => ({ ...o, [txId]: cat }));
    const res = await fetch(`/api/transactions/${txId}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat }),
    });
    if (!res.ok) {
      // Revert on failure — no toast UI exists in v1
      setCategoryOverrides((o) => {
        const next = { ...o };
        if (prev === undefined) delete next[txId]; else next[txId] = prev;
        return next;
      });
    }
  }

  function navTo(v: ViewState) {
    if (v === "manage") setManageSubView("status");
    setView(v);
    setSearch("");
    if (typeof v === "string") {
      router.replace(`/finances?tab=${v}`, { scroll: false });
    } else {
      router.replace(`/finances?tab=account&accountId=${v.accountId}`, { scroll: false });
    }
  }

  const isAccountView = typeof view === "object" && view.type === "account";
  const activeAccountId = isAccountView ? (view as { type: "account"; accountId: string }).accountId : null;

  const navItems: ShellNavItem[] = [
    { id: "overview",     icon: <LayoutDashboard size={16} />, label: "Overview" },
    { id: "manage",       icon: <LayoutGrid size={16} />,      label: "Manage" },
    { id: "transactions", icon: <Search size={16} />,          label: "Transactions" },
    { id: "analytics",    icon: <PieChart size={16} />,        label: "Analytics" },
    { id: "profile",      icon: <User size={16} />,            label: "Profile" },
  ];

  const panelProps: PanelProps = { transactions, accountMap, categoryOverrides, onChangeCategory: changeCategory, search, onSearch: setSearch };

  const viewTitle =
    view === "overview"     ? "Overview" :
    view === "manage"       ? "Manage" :
    view === "budgets"      ? "Budgets" :
    view === "goals"        ? "Goals" :
    view === "debts"        ? "Debts & Assets" :
    view === "bills"        ? "Bills" :
    view === "transactions" ? "Transactions" :
    view === "analytics"    ? "Analytics" :
    view === "profile"      ? "Profile" :
    accountMap.get(activeAccountId ?? "")?.name ?? "Account";

  // Blocking gate: hold on the onboarding modal until profile is confirmed complete
  if (userProfile && !userProfile.onboardingComplete) {
    return (
      <div className="fixed inset-0 bg-(--color-base) z-50 flex items-center justify-center" data-testid="onboarding-gate">
        <OnboardingModal
          activeContext={activeContext}
          onNavigate={() => {}}
          onComplete={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <AppShell
      sectionLabel="Finances"
      appName="Park Properties"
      mobileBadge={activeTeamName}
      userProfile={userProfile}
      onboardingCompleted={onboardingCompleted}
      onProfileClick={() => navTo("profile")}
      navItems={navItems}
      activeNavId={typeof view === "string" ? view : null}
      onNavigate={(id) => navTo(id as ViewState)}
      mobileActions={
        <>
          {connected.length > 0 && (
            <button
              onClick={refresh}
              disabled={loading || syncing}
              aria-label="Refresh data"
              className="flex items-center justify-center w-8 h-8 text-(--color-text-secondary) hover:text-(--color-text-primary) disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={16} className={syncing || loading ? "animate-spin text-(--color-accent)" : ""} />
            </button>
          )}
        </>
      }
      contextSwitcher={
        <ContextSwitcher
          userId={userId}
          activeContext={activeContext}
          teams={teams}
          contextLabel={contextLabel}
          switchContext={switchContext}
          resetToPersonal={resetToPersonal}
          onNewTeam={() => setTeamWizardOpen(true)}
          onTeamSettings={() => navTo("team-settings")}
        />
      }
      sidebarContent={
        <>
        {bankGroups.length > 0 && (
          <>
            <p className="pt-2 pb-1.5 text-[10px] text-(--color-text-disabled) uppercase tracking-[0.1em]">Accounts</p>
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">Total</span>
              <span className="text-[12px] font-semibold font-(--font-mono) text-(--color-text-primary)">${formatMoney(totalBalance)}</span>
            </div>
            {bankGroups.map((bank, bankIdx) => {
              const expanded = expandedBanks[bank.itemId] !== false;
              return (
                <div key={bank.itemId} className={bankIdx > 0 ? "mt-2 pt-2 border-t border-(--color-border-subtle)" : ""}>
                  <button
                    onClick={() => setExpandedBanks((p) => ({ ...p, [bank.itemId]: !expanded }))}
                    className="w-full flex items-center justify-between py-1.5 text-[12px] font-medium text-(--color-text-primary) hover:text-(--color-text-primary) transition-colors"
                  >
                    <span>{bank.institutionName}</span>
                    {expanded ? <ChevronDown size={11} className="text-(--color-text-tertiary)" /> : <ChevronRight size={11} className="text-(--color-text-tertiary)" />}
                  </button>
                  {expanded && bank.accounts.map((a) => (
                    <button
                      key={a.account_id}
                      onClick={() => { navTo({ type: "account", accountId: a.account_id }); }}
                      className={`w-full flex items-center justify-between pl-4 pr-0 py-1.5 text-[12px] transition-colors ${
                        isAccountView && activeAccountId === a.account_id
                          ? "text-(--color-text-primary) font-medium"
                          : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
                      }`}
                    >
                      <span className="truncate min-w-0">{a.name}</span>
                      <span className="font-(--font-mono) text-[11px] ml-2 shrink-0 text-(--color-text-secondary)">${formatMoney(a.balances.current ?? 0)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </>
        )}
        </>
      }
      sidebarFooter={
        <>
        {connected.length > 0 && (
          <button onClick={refresh} disabled={loading || syncing} className="flex items-center gap-2 h-8 text-[12px] text-(--color-text-secondary) hover:text-(--color-text-primary) disabled:opacity-40 transition-colors">
            <RefreshCw size={14} className={syncing || loading ? "animate-spin text-(--color-accent)" : ""} />
            Refresh
          </button>
        )}
        <PlaidLinkButton onSuccess={() => window.location.reload()} linkToken={linkToken} />

        {/* TODO: remove before deploy */}
        {/* {process.env.NODE_ENV === 'development' && (
          <button
            onClick={() => setUserProfile(prev => prev ? { ...prev, onboardingComplete: false } : prev)}
            className="w-full text-left px-3 py-2 text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) border border-dashed border-(--color-border-subtle) rounded-md transition-colors"
          >
            ⚙ Preview Onboarding
          </button>
        )} */}
        </>
      }
      overlays={
        <>
  {teamWizardOpen && (
    <TeamSetupWizard
      userId={userId}
      onComplete={(team) => {
        setTeams(prev => [...prev, team]);
        switchContext({ type: "team", id: team.id });
        setTeamWizardOpen(false);
      }}
      onClose={() => setTeamWizardOpen(false)}
    />
  )}
        </>
      }
    >
        {view === "overview" && connected.length > 0 && !loading ? (
          <>
            {error && <p className="mb-4 shrink-0 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mx-5 mt-4">{error}</p>}

            {/* ── Mobile Overview ── lg:hidden ─────────────────────────────── */}
            <div className="lg:hidden flex flex-col flex-1 min-h-0 overflow-hidden">

              {/* Section 1: Hero balance */}
              <div className="px-5 pt-4 pb-2 flex-shrink-0">
                <p className="text-[11px] uppercase tracking-[0.12em] text-(--color-accent) font-medium mb-1">Liquid Cash</p>
                <p className="text-[52px] font-bold font-(--font-mono) text-(--color-text-primary) leading-none">
                  ${formatMoney(totalBalance)}
                </p>
                {accounts[0] && (
                  <p className="text-[13px] text-(--color-text-tertiary) mt-1">
                    {accounts[0].institution_name} · {accounts[0].subtype ?? accounts[0].type}
                  </p>
                )}
                <div className="border-t border-(--color-border-subtle) my-4" />
                <div className="flex justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-(--color-text-tertiary)">Spent (30D)</p>
                    <p className={`text-[15px] font-semibold font-(--font-mono) ${totalSpent > 0 ? 'text-(--color-danger)' : ''}`}>
                      ${formatMoney(totalSpent)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-(--color-text-tertiary)">Income (30D)</p>
                    <p className={`text-[15px] font-semibold font-(--font-mono) ${totalIncome > 0 ? 'text-(--color-success)' : ''}`}>
                      ${formatMoney(totalIncome)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-(--color-text-tertiary)">Net</p>
                    {(() => {
                      const net = totalIncome - totalSpent;
                      return (
                        <p className={`text-[15px] font-semibold font-(--font-mono) ${net >= 0 ? 'text-(--color-accent)' : 'text-(--color-danger)'}`}>
                          {net >= 0 ? '+' : '-'}${formatMoney(Math.abs(net))}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Section 2: Tab strip */}
              <nav
                className="flex overflow-x-auto scrollbar-none border-b border-(--color-border-subtle) flex-shrink-0"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              >
                <div className="flex gap-1.5 px-4 py-2">
                  {(['activity', 'recent', 'bills', 'budgets'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setMobileOverviewTab(tab)}
                      className={`inline-flex items-center px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0 border transition-colors ${
                        mobileOverviewTab === tab
                          ? 'bg-(--color-accent)/15 text-(--color-accent) border-(--color-accent)/30'
                          : 'text-(--color-text-secondary) border-transparent'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </nav>

              {/* Section 3: Tab content */}
              <div className="flex-1 overflow-y-auto pb-20">
                {mobileOverviewTab === 'activity' && (
                  <div className="p-4 w-full" style={{ height: 400, minHeight: 400 }}>
                    <ActivityChart transactions={transactions} />
                  </div>
                )}
                {mobileOverviewTab === 'recent' && (
                  <div className="p-4 w-full">
                    <DailyDigest
                      transactions={transactions}
                      categoryOverrides={categoryOverrides}
                      onViewAll={() => navTo("transactions")}
                      onRecategorize={changeCategory}
                    />
                  </div>
                )}
                {mobileOverviewTab === 'bills' && (
                  <div className="p-4">
                    <BillsWidget accounts={accounts} />
                  </div>
                )}
                {mobileOverviewTab === 'budgets' && (
                  <div className="p-4">
                    <BudgetsPanel onGoTo={navTo} activeContext={activeContext} goals={goals} />
                  </div>
                )}
              </div>
            </div>

            {/* ── Desktop Overview — only mounts on desktop; gated via JS so OnboardingChecklist effects don't fire on mobile ── */}
            {isDesktop && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-5 py-4 lg:pb-4">
                <OverviewPanel {...panelProps} spending={spending} totalBalance={totalBalance} totalSpent={totalSpent} totalIncome={totalIncome} onViewAll={() => navTo("transactions")} activeContext={activeContext} onNavigate={navTo} accounts={accounts} />
              </div>
            )}
          </>
        ) : (
          <div className="overflow-y-auto flex-1 w-full px-6 py-8 pb-22 lg:pb-8">
            {view !== "profile" && view !== "transactions" && view !== "manage" && view !== "overview" && <h1 className="text-[18px] font-semibold mb-6 text-(--color-text-primary)">{viewTitle}</h1>}
            {error && <p className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</p>}
            {view === "overview" && connected.length === 0 && (
              <div className="text-center py-24 text-(--color-text-secondary)">
                <p className="text-lg font-medium text-(--color-text-primary) mb-2">No banks connected</p>
                <p className="text-sm mb-6">Connect your bank to see transactions and spending.</p>
                <PlaidLinkButton onSuccess={() => window.location.reload()} linkToken={linkToken} />
              </div>
            )}
            {view === "analytics" && connected.length > 0 && !loading && (
              <AnalyticsPanel transactions={transactions} accounts={accounts} onGoTo={navTo} goals={goals} />
            )}
            <div className={view === "analytics" ? "hidden" : (view === "profile" || view === "transactions" || view === "manage") ? "" : "max-w-2xl mx-auto"}>
            {/* Budgets and Goals have their own data fetching */}
            {view === "budgets" && <BudgetsPanel onGoTo={navTo} activeContext={activeContext} goals={goals} />}
            {view === "goals"   && <GoalsPanel activeContext={activeContext} contextLabel={contextLabel} onReset={resetToPersonal} />}
            {view === "debts"   && (
              <div className="space-y-8">
                <DebtPanel activeContext={activeContext} contextLabel={contextLabel} onAddAssetForDebt={(id) => { setPendingDebtLink(id); }} />
                <div className="border-t border-(--color-border-subtle) pt-6">
                  <AssetsSection activeContext={activeContext} openWithDebtId={pendingDebtLink} onClearOpenWithDebt={() => setPendingDebtLink(null)} />
                </div>
              </div>
            )}
            {view === "bills" && <BillsPanel accounts={accounts} />}
            {view === "profile" && <ProfilePanel activeContext={activeContext} onNavigate={navTo} teams={teams} switchContext={switchContext} onAddTeam={() => setTeamWizardOpen(true)} />}
            {view === "team-settings" && activeContext.type === "team" && (
              <TeamSettingsPanel
                teamId={activeContext.id}
                userId={userId}
                onBack={() => navTo("overview")}
                onTeamDeleted={() => { setTeams(prev => prev.filter(t => t.id !== activeContext.id)); resetToPersonal(); navTo("overview"); }}
                onTeamLeft={() => { setTeams(prev => prev.filter(t => t.id !== activeContext.id)); resetToPersonal(); }}
              />
            )}
            {view === "manage" && manageSubView === "status" && (
              <StatusPage
                activeContext={activeContext}
                goals={goals}
                onManageAll={() => setManageSubView("all")}
                onBudgetDrillDown={(budget) => { setDrillDownBudget(budget); setManageSubView("drilldown"); }}
                onViewAllGoals={() => setManageSubView("goals")}
                onViewAllBills={() => setManageSubView("bills")}
              />
            )}
            {view === "manage" && manageSubView === "all" && (
              <ManagePanel
                activeContext={activeContext}
                onNavigate={navTo}
                contextLabel={contextLabel}
                onReset={resetToPersonal}
                pendingDebtLink={pendingDebtLink}
                setPendingDebtLink={setPendingDebtLink}
                budgetsPanelSlot={<BudgetsPanel onGoTo={navTo} triggerCreateRef={budgetCreateRef} activeContext={activeContext} goals={goals} />}
                budgetCreateRef={budgetCreateRef}
                accounts={accounts}
                goals={goals}
                onBack={() => setManageSubView("status")}
              />
            )}
            {view === "manage" && manageSubView === "goals" && (
              <div>
                <button
                  onClick={() => setManageSubView("status")}
                  className="flex items-center gap-1.5 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors px-4 py-3 border-b border-(--color-border-subtle) w-full"
                >
                  <ChevronLeft size={15} />
                  Back
                </button>
                <GoalsPanel activeContext={activeContext} contextLabel={contextLabel} onReset={resetToPersonal} />
              </div>
            )}
            {view === "manage" && manageSubView === "bills" && (
              <div>
                <button
                  onClick={() => setManageSubView("status")}
                  className="flex items-center gap-1.5 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors px-4 py-3 border-b border-(--color-border-subtle) w-full"
                >
                  <ChevronLeft size={15} />
                  Back
                </button>
                <BillsPanel accounts={accounts} />
              </div>
            )}
            {view === "manage" && manageSubView === "drilldown" && drillDownBudget && (
              <BudgetDrillDown
                budget={drillDownBudget}
                contextType={activeContext.type}
                contextId={activeContext.id}
                onBack={() => setManageSubView("status")}
              />
            )}

            {typeof view === "string" && !["budgets", "goals", "debts", "bills", "manage", "overview", "analytics", "profile"].includes(view) && !isAccountView && connected.length === 0 && (
              <div className="text-center py-24 text-(--color-text-secondary)">
                <p className="text-lg font-medium text-(--color-text-primary) mb-2">No banks connected</p>
                <p className="text-sm mb-6">Connect your bank to see transactions and spending.</p>
                <PlaidLinkButton onSuccess={() => window.location.reload()} linkToken={linkToken} />
              </div>
            )}

            {loading && transactions.length === 0 && connected.length > 0 && typeof view === "string" && !["budgets", "goals", "bills", "manage", "overview", "analytics", "profile"].includes(view) && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 skeleton" />
                ))}
              </div>
            )}

            {!loading && connected.length > 0 && (
              <>
                {view === "transactions" && <TransactionsPanel {...panelProps} />}
                {isAccountView && activeAccountId && <AccountPanel {...panelProps} accountId={activeAccountId} />}
              </>
            )}
          </div>
          </div>
        )}
    </AppShell>
  );
}
