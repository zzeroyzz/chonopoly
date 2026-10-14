"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Plus, RefreshCw, Target, Trash2, Pause, Play, RotateCcw, ChevronLeft, Pencil, Building2, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatMoney, CATEGORY_META } from "./budget/types";
import { StatCard } from "./ui/StatCard";
import { GoalSummary, LinkedAccount, PlaidAccountInfo, ActiveContext } from "@/lib/goals/types";
import GoalWizard from "./goals/GoalWizard";

const GOAL_ICONS = ["🎯", "🏠", "🚗", "✈️", "💍", "🎓", "💻", "🌴", "🏋️", "💰", "🛒", "🎁"];

const INLINE_BUDGET_CATEGORIES = Object.entries(CATEGORY_META)
  .filter(([key]) => !["TRANSFER_IN", "TRANSFER_OUT", "OTHER", "INCOME"].includes(key))
  .map(([key, m]) => ({ id: key, name: m.label, color: m.hex }));

function computePeriodBounds(): { period_start: string; period_end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { period_start: toISO(start), period_end: toISO(end) };
}

interface LinkedBudgetRow {
  budget_id: string;
  category_name: string;
  category_color: string;
  total_limit: number;
  amount_spent: number;
  amount_remaining: number;
  percent_used: number;
  over_budget: boolean;
  period_type: string;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CheckMark() {
  return (
    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
      <path d="M1 3L3 5L7 1" stroke="var(--color-base)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Account picker row (reused in create + detail picker) ────────────────────

function AccountRow({ account, selected, onToggle }: {
  account: PlaidAccountInfo;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md border text-left transition-colors ${
        selected ? "border-(--color-accent) bg-[rgba(0,212,170,0.1)]" : "border-(--color-border-default) hover:border-(--color-border-strong)"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Building2 size={13} className="text-(--color-text-secondary) shrink-0" />
        <div>
          <p className="text-xs font-medium text-(--color-text-primary)">{account.account_name}</p>
          <p className="text-[10px] text-(--color-text-tertiary)">
            {account.institution_name}{account.account_subtype ? ` · ${account.account_subtype}` : ""}
          </p>
        </div>
      </div>
      {selected && (
        <div className="w-4 h-4 rounded-full bg-(--color-accent) flex items-center justify-center shrink-0">
          <CheckMark />
        </div>
      )}
    </button>
  );
}

// ─── Linked account row in detail view ────────────────────────────────────────

function LinkedAccountRow({ account, removeDisabled, removing, onRemove }: {
  account: LinkedAccount;
  removeDisabled: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Building2 size={13} className="text-(--color-text-secondary) shrink-0" />
        <div>
          <p className="text-xs font-medium text-(--color-text-primary)">{account.account_name || "Account"}</p>
          <p className="text-[10px] text-(--color-text-tertiary)">
            {account.institution_name ?? ""}{account.account_subtype ? ` · ${account.account_subtype}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {account.cached_balance != null && (
          <span className="text-[10px] font-(--font-mono) text-(--color-text-secondary)">${formatMoney(account.cached_balance)}</span>
        )}
        <button
          onClick={onRemove}
          disabled={removeDisabled || removing}
          data-testid={`remove-account-${account.id}`}
          title={removeDisabled ? "Cannot remove the last spending account" : "Remove account"}
          className="text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {removing ? <RefreshCw size={11} className="animate-spin" /> : <X size={11} />}
        </button>
      </div>
    </div>
  );
}

// ─── Goal card ────────────────────────────────────────────────────────────────

function GoalCard({ goal, onSync, onPause, onDelete, onEdit, onOpen, isNew }: {
  goal: GoalSummary;
  onSync: () => void;
  onPause: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  isNew?: boolean;
}) {
  const days = goal.target_date ? daysUntil(goal.target_date) : null;
  const isPaused = goal.status === "paused";
  const isAchieved = goal.status === "achieved";

  return (
    <div
      className={`border rounded-2xl lg:rounded-md p-4 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 shadow-(--shadow-sm) hover:shadow-(--shadow-md) ${isPaused ? "opacity-50" : ""} ${isNew ? "ring-2 ring-(--color-accent)/20" : ""} ${isAchieved ? "bg-[rgba(34,197,94,0.05)] border-(--color-border-default)" : "bg-(--color-surface) border-(--color-border-default)"}`}
      onClick={onOpen}
    >
      {/* Mobile goal card layout */}
      <div className="lg:hidden">
        {/* Row 1: Emoji | Name + status | Percentage */}
        <div className="flex items-center gap-3 mb-2">
          <span
            className="text-[32px] leading-none w-10 h-10 flex items-center justify-center shrink-0"
            style={{ filter: (isAchieved || (!isPaused && goal.behind_by === 0)) ? "drop-shadow(0 0 8px rgba(0,212,170,0.5))" : undefined }}
          >
            {goal.icon}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-(--color-text-primary) truncate">{goal.name}</p>
            <p className="text-[12px] text-(--color-text-tertiary)">
              {goal.current_balance != null && `$${formatMoney(goal.current_balance)} saved`}
              {isAchieved && " · Achieved"}
              {isPaused && " · Paused"}
              {!isAchieved && !isPaused && goal.behind_by > 0 && ` · Behind $${formatMoney(goal.behind_by)}`}
              {!isAchieved && !isPaused && goal.behind_by === 0 && " · On track"}
            </p>
          </div>
          <span className={`shrink-0 text-[18px] font-semibold font-(--font-mono) ${isAchieved ? "text-(--color-success)" : "text-(--color-accent)"}`}>
            {Math.round(goal.percent_complete)}%
          </span>
        </div>
        {/* Row 2: Progress bar */}
        <div className="h-1.5 bg-(--color-border-subtle) rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full progress-bar-animate"
            style={{
              "--bar-width": `${Math.min(goal.percent_complete, 100)}%`,
              background: isAchieved ? "var(--color-success)" : "linear-gradient(90deg, var(--color-accent), var(--color-success))",
            } as React.CSSProperties}
          />
        </div>
        {/* Row 3: $saved / $target · days until date */}
        <div className="flex items-center justify-between text-[12px] text-(--color-text-tertiary)">
          <span className="font-(--font-mono)">
            ${formatMoney(goal.current_balance)}
            {goal.target_amount != null && <span className="text-(--color-text-disabled)"> / ${formatMoney(goal.target_amount)}</span>}
          </span>
          <span>
            {goal.target_date
              ? (isAchieved ? "Goal reached" : days != null && days > 0 ? `${days}d until ${fmtDate(goal.target_date)}` : "Past target date")
              : "No target date"}
          </span>
        </div>
      </div>

      {/* Desktop goal card layout — unchanged */}
      <div className="hidden lg:block space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span
              className="text-[32px] leading-none"
              style={{
                filter: (isAchieved || (!isPaused && goal.behind_by === 0))
                  ? "drop-shadow(0 0 8px rgba(0,212,170,0.5))"
                  : undefined,
              }}
            >
              {goal.icon}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-(--color-text-primary)">{goal.name}</p>
                {isAchieved && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(34,197,94,0.12)] text-(--color-success)">Achieved ✓</span>}
                {isPaused && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--color-overlay) text-(--color-text-tertiary)">Paused</span>}
                {!isAchieved && !isPaused && goal.behind_by > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(245,158,11,0.12)] text-(--color-warning)">
                    Behind by ${formatMoney(goal.behind_by)}
                  </span>
                )}
                {!isAchieved && !isPaused && goal.behind_by === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(34,197,94,0.12)] text-(--color-success)">On track</span>
                )}
              </div>
              {!isAchieved && !isPaused && goal.behind_by > 0 && (
                <p className="text-[10px] text-(--color-text-secondary) mt-0.5">
                  You should have ${formatMoney(goal.expected_balance)} saved by now to stay on track.
                </p>
              )}
              <p className="text-xs text-(--color-text-secondary) mt-0.5">
                <span className="text-(--color-text-primary) font-(--font-mono)">${formatMoney(goal.current_balance)}</span>
                {goal.target_amount != null && (
                  <span className="text-(--color-text-tertiary)"> / ${formatMoney(goal.target_amount)}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 ml-2" onClick={e => e.stopPropagation()}>
            <button onClick={onSync} className="flex flex-col items-center gap-0.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
              <RotateCcw size={12} />
              <span className="text-[9px]">Sync</span>
            </button>
            <button onClick={onEdit} className="flex flex-col items-center gap-0.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
              <Pencil size={12} />
              <span className="text-[9px]">Edit</span>
            </button>
            <button onClick={onPause} className="flex flex-col items-center gap-0.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              <span className="text-[9px]">{isPaused ? "Resume" : "Pause"}</span>
            </button>
            <button onClick={onDelete} className="flex flex-col items-center gap-0.5 text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors">
              <Trash2 size={12} />
              <span className="text-[9px]">Delete</span>
            </button>
          </div>
        </div>

        <div className="h-1.5 bg-(--color-border-subtle) rounded-full overflow-hidden">
          <div
            className="h-full rounded-full progress-bar-animate"
            style={{
              "--bar-width": `${Math.min(goal.percent_complete, 100)}%`,
              background: isAchieved
                ? "var(--color-success)"
                : "linear-gradient(90deg, var(--color-accent), var(--color-success))",
            } as React.CSSProperties}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-(--color-text-secondary)">
          <span>{Math.round(goal.percent_complete)}% saved</span>
          {goal.target_date ? (
            <span>
              {isAchieved
                ? "Goal reached"
                : days != null && days > 0
                  ? `${days}d until ${fmtDate(goal.target_date)}`
                  : "Past target date"}
            </span>
          ) : (
            <span>No target date</span>
          )}
        </div>

        {!isAchieved && (
          <div className="flex items-center justify-between text-[10px] text-(--color-text-tertiary) border-t border-(--color-border-subtle) pt-2">
            <span>
              {goal.projected_completion_date
                ? `Est. completion ${fmtDate(goal.projected_completion_date)}`
                : "Check back in 7 days for projections."}
            </span>
            {goal.weekly_avg_growth > 0 && (
              <span>+${formatMoney(goal.weekly_avg_growth)}/wk avg</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GoalsPanel ───────────────────────────────────────────────────────────────

export interface GoalsPanelHandle { triggerCreate: () => void }

interface GoalsPanelProps {
  activeContext: ActiveContext;
  contextLabel?: string;
  onReset?: () => void;
}

const GoalsPanel = forwardRef<GoalsPanelHandle, GoalsPanelProps>(
  function GoalsPanel({ activeContext, contextLabel: _contextLabel, onReset }, ref) {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [saving, setSaving] = useState(false);

  useImperativeHandle(ref, () => ({ triggerCreate: () => setWizardOpen(true) }));

  // Wizard state (replaces inline create form for new goals)
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newGoalId, setNewGoalId] = useState<string | null>(null);

  // Edit form state (wizard handles create; this handles edit only)
  const [editingGoal, setEditingGoal] = useState<GoalSummary | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // Detail view state
  const [detailGoalId, setDetailGoalId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<{ balance: number; recorded_at: string }[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Detail view linked accounts — separated by role
  const [savingsAccount, setSavingsAccount] = useState<LinkedAccount | null>(null);
  const [spendingAccounts, setSpendingAccounts] = useState<LinkedAccount[]>([]);
  const [linkedAccountsLoading, setLinkedAccountsLoading] = useState(false);

  // Detail view linked budgets + analytics
  const [detailBudgets, setDetailBudgets] = useState<LinkedBudgetRow[]>([]);

  // Inline budget creation from detail view
  const [showInlineBudgetForm, setShowInlineBudgetForm] = useState(false);
  const [inlineBudgetCategory, setInlineBudgetCategory] = useState<string | null>(null);
  const [inlineBudgetAmount, setInlineBudgetAmount] = useState("");
  const [inlineBudgetSaving, setInlineBudgetSaving] = useState(false);

  // Detail view account picker state
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [pickerRole, setPickerRole] = useState<"savings" | "spending">("spending");
  const [pickerAccounts, setPickerAccounts] = useState<PlaidAccountInfo[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedPickerIds, setSelectedPickerIds] = useState<Set<string>>(new Set());
  const [pickerConfirming, setPickerConfirming] = useState(false);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);
  const [savingsPeriod, setSavingsPeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly">("daily");

  const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const loadGoals = useCallback(async () => {
    const res = await fetch(`/api/goals/summary?${ctxParams}`);
    if (res.status === 403) { onResetRef.current?.(); return; }
    const d = res.ok ? await res.json() : { goals: [] };
    setGoals(d.goals ?? []);
    setLoading(false);
  }, [ctxParams]);

  useEffect(() => {
    setLoading(true);
    loadGoals();
  }, [loadGoals]);

  function openCreate(goal?: GoalSummary) {
    if (goal) {
      // Edit path — use inline form
      setEditingGoal(goal);
      setName(goal.name);
      setIcon(goal.icon);
      setTargetAmount(goal.target_amount != null ? String(goal.target_amount) : "");
      setTargetDate(goal.target_date ?? "");
      setView("create");
    } else {
      // Create path — open wizard
      setWizardOpen(true);
    }
  }

  function closeCreate() {
    setEditingGoal(null);
    setView("list");
  }

  async function openDetail(goalId: string) {
    setDetailGoalId(goalId);
    setDetailHistory([]);
    setSavingsAccount(null);
    setSpendingAccounts([]);
    setDetailBudgets([]);
    setDetailLoading(true);
    setLinkedAccountsLoading(true);
    setShowAccountPicker(false);
    setShowInlineBudgetForm(false);
    setInlineBudgetCategory(null);
    setInlineBudgetAmount("");
    setView("detail");
    const [histRes, accRes, budgetRes] = await Promise.all([
      fetch(`/api/goals/history?goal_id=${goalId}&${ctxParams}`),
      fetch(`/api/goals/accounts?goal_id=${goalId}&${ctxParams}`),
      fetch(`/api/budget/summary?goal_id=${goalId}&${ctxParams}`),
    ]);
    const histData   = histRes.ok   ? await histRes.json()   : { history: [] };
    const accData    = accRes.ok    ? await accRes.json()    : { savings: null, spending: [] };
    const budgetData = budgetRes.ok ? await budgetRes.json() : { summaries: [] };
    setDetailHistory(histData.history ?? []);
    setSavingsAccount(accData.savings ?? null);
    setSpendingAccounts(accData.spending ?? []);
    setDetailBudgets(budgetData.summaries ?? []);
    setDetailLoading(false);
    setLinkedAccountsLoading(false);
  }

  async function saveGoal() {
    if (!name || !editingGoal) return;
    setSaving(true);
    await fetch("/api/goals/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: editingGoal.id,
        name, icon,
        target_amount: targetAmount ? Number(targetAmount) : null,
        target_date: targetDate || null,
        context_type: activeContext.type,
        context_id: activeContext.id,
      }),
    });
    await loadGoals();
    closeCreate();
    setSaving(false);
  }

  async function syncGoal(goalId: string) {
    await fetch("/api/goals/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_id: goalId, context_type: activeContext.type, context_id: activeContext.id }),
    });
    loadGoals();
  }

  async function pauseGoal(goalId: string, currentStatus: GoalSummary["status"]) {
    await fetch("/api/goals/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_id: goalId, status: currentStatus === "paused" ? "active" : "paused", context_type: activeContext.type, context_id: activeContext.id }),
    });
    loadGoals();
  }

  async function deleteGoal(goalId: string) {
    await fetch("/api/goals/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_id: goalId, context_type: activeContext.type, context_id: activeContext.id }),
    });
    loadGoals();
  }

  async function openAccountPicker() {
    setShowAccountPicker(true);
    setSelectedPickerIds(new Set());
    setPickerRole("spending");
    setPickerLoading(true);
    const res = await fetch("/api/plaid/accounts");
    const d = res.ok ? await res.json() : { accounts: [] };
    // Exclude accounts already linked in either role
    const linked = new Set([
      ...(savingsAccount ? [savingsAccount.plaid_account_id] : []),
      ...spendingAccounts.map(a => a.plaid_account_id),
    ]);
    setPickerAccounts((d.accounts ?? []).filter((a: PlaidAccountInfo) => !linked.has(a.plaid_account_id)));
    setPickerLoading(false);
  }

  async function confirmAddAccounts() {
    if (!detailGoalId || selectedPickerIds.size === 0) return;
    setPickerConfirming(true);
    const toLink = (pickerRole === "savings"
      ? pickerAccounts.filter(a => !isCredit(a))
      : pickerAccounts
    ).filter(a => selectedPickerIds.has(a.plaid_account_id));

    await Promise.all(toLink.map(a =>
      fetch("/api/goals/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_id: detailGoalId,
          plaid_account_id: a.plaid_account_id,
          plaid_item_id: a.plaid_item_id,
          account_role: pickerRole,
          context_type: activeContext.type,
          context_id: activeContext.id,
        }),
      })
    ));

    const res = await fetch(`/api/goals/accounts?goal_id=${detailGoalId}&${ctxParams}`);
    const d = res.ok ? await res.json() : { savings: null, spending: [] };
    setSavingsAccount(d.savings ?? null);
    setSpendingAccounts(d.spending ?? []);
    setShowAccountPicker(false);
    setPickerConfirming(false);
    loadGoals();
  }

  async function removeAccount(goalAccountId: string) {
    setRemovingAccountId(goalAccountId);
    await fetch("/api/goals/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_account_id: goalAccountId, context_type: activeContext.type, context_id: activeContext.id }),
    });
    // Update local state immediately; loadGoals refreshes balances
    setSavingsAccount(prev => prev?.id === goalAccountId ? null : prev);
    setSpendingAccounts(prev => prev.filter(a => a.id !== goalAccountId));
    setRemovingAccountId(null);
    loadGoals();
  }

  async function addInlineBudget() {
    if (!inlineBudgetCategory || !inlineBudgetAmount || !detailGoalId) return;
    setInlineBudgetSaving(true);
    const { period_start, period_end } = computePeriodBounds();
    await fetch("/api/budget/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: detailGoalId,
        category_id: inlineBudgetCategory,
        total_limit: Number(inlineBudgetAmount),
        rollover_enabled: false,
        period_type: "monthly",
        period_start,
        period_end,
        recurring: true,
        context_type: activeContext.type,
        context_id: activeContext.id,
      }),
    });
    // Refresh budget list
    const res = await fetch(`/api/budget/summary?goal_id=${detailGoalId}&${ctxParams}`);
    const d = res.ok ? await res.json() : { summaries: [] };
    setDetailBudgets(d.summaries ?? []);
    setShowInlineBudgetForm(false);
    setInlineBudgetCategory(null);
    setInlineBudgetAmount("");
    setInlineBudgetSaving(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw size={16} className="animate-spin text-(--color-text-secondary)" />
    </div>
  );

  // ── Create / edit form ───────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={closeCreate} className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-semibold text-(--color-text-primary)">{editingGoal ? "Edit goal" : "New savings goal"}</p>
        </div>

        <div>
          <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Icon</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map(e => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition-colors ${icon === e ? "border-(--color-border-strong) bg-(--color-overlay)" : "border-(--color-border-default) hover:border-(--color-border-strong)"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Goal name</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
            className="w-full bg-(--color-surface) border border-(--color-border-default) rounded-md px-3 py-2 text-sm text-(--color-text-primary) placeholder-(--color-text-disabled) focus:outline-none focus:border-(--color-border-strong)"
          />
        </div>

        <div>
          <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Target amount <span className="normal-case text-(--color-text-tertiary)">(optional)</span></p>
          <div className="flex items-center gap-2">
            <span className="text-(--color-text-secondary)">$</span>
            <input
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              placeholder="0.00"
              type="number"
              min="1"
              step="0.01"
              className="flex-1 bg-(--color-surface) border border-(--color-border-default) rounded-md px-3 py-2 text-sm text-(--color-text-primary) placeholder-(--color-text-disabled) focus:outline-none focus:border-(--color-border-strong)"
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Target date <span className="normal-case text-(--color-text-tertiary)">(optional)</span></p>
          <input
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            type="date"
            min={new Date().toISOString().split("T")[0]}
            className="w-full bg-(--color-surface) border border-(--color-border-default) rounded-md px-3 py-2 text-sm text-(--color-text-primary) focus:outline-none focus:border-(--color-border-strong) scheme-dark"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={closeCreate} className="flex-1 py-2 text-sm text-(--color-text-secondary) border border-(--color-border-default) rounded-md hover:text-(--color-text-primary) transition-colors">Cancel</button>
          <button
            onClick={saveGoal}
            disabled={saving || !name}
            className="flex-1 py-2 text-sm font-semibold bg-(--color-accent) text-(--color-base) rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    );
  }

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (view === "detail") {
    const detailGoal = goals.find(g => g.id === detailGoalId);
    const chartData = detailHistory.map(h => ({
      date: fmtDateShort(h.recorded_at),
      balance: Number(h.balance),
    }));

    // For the add-account picker: filter accounts based on role
    const filteredPickerAccounts = pickerRole === "savings"
      ? pickerAccounts.filter(a => !isCredit(a))
      : pickerAccounts;

    // Analytics calculations
    const daysLeft = detailGoal?.target_date ? daysUntil(detailGoal.target_date) : null;
    const remaining = (detailGoal?.target_amount != null && detailGoal?.current_balance != null)
      ? detailGoal.target_amount - detailGoal.current_balance
      : null;
    const dailyNeeded = (remaining != null && daysLeft != null && daysLeft > 0)
      ? remaining / daysLeft
      : null;
    const currentDailyRate = (detailGoal?.weekly_avg_growth ?? 0) > 0
      ? (detailGoal!.weekly_avg_growth / 7)
      : null;

    const periodMultiplier = savingsPeriod === "weekly" ? 7 : savingsPeriod === "monthly" ? 30 : savingsPeriod === "quarterly" ? 91 : 1;
    const periodLabel = savingsPeriod === "weekly" ? "week" : savingsPeriod === "monthly" ? "month" : savingsPeriod === "quarterly" ? "quarter" : "day";
    const scaledNeeded = dailyNeeded !== null ? dailyNeeded * periodMultiplier : null;
    const scaledRate = currentDailyRate !== null ? currentDailyRate * periodMultiplier : null;

    // Total delay from over-budget budgets (only computed when dailyNeeded > 0)
    const totalDelayDays = (dailyNeeded != null && dailyNeeded > 0)
      ? detailBudgets
          .filter(b => b.over_budget)
          .reduce((sum, b) => sum + (b.amount_spent - b.total_limit) / dailyNeeded!, 0)
      : null;

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div>
            <p className="text-sm font-semibold text-(--color-text-primary)">{detailGoal?.icon} {detailGoal?.name}</p>
            {detailGoal && (
              <p className="text-xs text-(--color-text-secondary)">
                <span className="text-(--color-text-primary) font-(--font-mono)">${formatMoney(detailGoal.current_balance)}</span>
                {detailGoal.target_amount != null && (
                  <>{" "}&nbsp;·&nbsp; {Math.round(detailGoal.percent_complete)}% of ${formatMoney(detailGoal.target_amount)}</>
                )}
              </p>
            )}
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={14} className="animate-spin text-(--color-text-secondary)" />
          </div>
        ) : chartData.length < 2 ? (
          <div className="text-center py-8 text-(--color-text-tertiary) text-sm" data-testid="no-history-msg">
            Not enough history to display chart yet.
          </div>
        ) : (
          <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md p-4">
            <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-4">Balance history</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: "#55556A", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fill: "#55556A", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ background: "var(--color-elevated)", border: "1px solid var(--color-border-strong)", borderRadius: 10, color: "#fff", fontSize: 12 }}
                  formatter={(v) => [`$${formatMoney(Number(v) || 0)}`, "Balance"]}
                  labelStyle={{ color: "#8888A0" }}
                />
                <Line type="monotone" dataKey="balance" stroke="#00D4AA" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#00D4AA" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Linked accounts */}
        <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md p-4 space-y-4" data-testid="linked-accounts-section">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Linked accounts</p>
            {!showAccountPicker && (
              <button
                onClick={openAccountPicker}
                data-testid="add-account-btn"
                className="text-[10px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors flex items-center gap-1"
              >
                <Plus size={10} /> Add account
              </button>
            )}
          </div>

          {linkedAccountsLoading ? (
            <div className="space-y-2">
              <div className="h-10 rounded-md skeleton" />
              <div className="h-10 rounded-md skeleton" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Savings sub-section */}
              <div>
                <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Savings</p>
                {savingsAccount ? (
                  <div data-testid="savings-account-row">
                    <LinkedAccountRow
                      account={savingsAccount}
                      removeDisabled={false}
                      removing={removingAccountId === savingsAccount.id}
                      onRemove={() => removeAccount(savingsAccount.id)}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-(--color-text-tertiary)">No savings account linked.</p>
                )}
              </div>

              {/* Spending sub-section */}
              <div>
                <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Spending</p>
                {spendingAccounts.length === 0 ? (
                  <p className="text-xs text-(--color-text-tertiary)">No spending accounts linked.</p>
                ) : (
                  <div className="space-y-2.5" data-testid="spending-accounts-list">
                    {spendingAccounts.map(a => (
                      <LinkedAccountRow
                        key={a.id}
                        account={a}
                        removeDisabled={spendingAccounts.length <= 1}
                        removing={removingAccountId === a.id}
                        onRemove={() => removeAccount(a.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inline account picker */}
          {showAccountPicker && (
            <div className="border-t border-(--color-border-subtle) pt-3 space-y-3" data-testid="detail-account-picker">
              {/* Role toggle */}
              <div className="flex gap-2">
                {(["savings", "spending"] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => { setPickerRole(role); setSelectedPickerIds(new Set()); }}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition-colors capitalize ${
                      pickerRole === role
                        ? "border-(--color-accent) bg-[rgba(0,212,170,0.1)] text-(--color-accent)"
                        : "border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary)"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">
                {pickerRole === "savings" ? "Select savings account" : "Select spending accounts"}
              </p>

              {pickerLoading ? (
                <div className="flex items-center gap-2 text-(--color-text-tertiary) text-xs">
                  <RefreshCw size={12} className="animate-spin" /> Loading…
                </div>
              ) : filteredPickerAccounts.length === 0 ? (
                <p className="text-xs text-(--color-text-tertiary)">
                  {pickerRole === "savings" ? "No eligible savings accounts to link." : "No additional accounts to link."}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredPickerAccounts.map(a => (
                    <AccountRow
                      key={a.plaid_account_id}
                      account={a}
                      selected={selectedPickerIds.has(a.plaid_account_id)}
                      onToggle={() => {
                        if (pickerRole === "savings") {
                          // Single-select for savings
                          setSelectedPickerIds(new Set([a.plaid_account_id]));
                        } else {
                          setSelectedPickerIds(prev => {
                            const next = new Set(prev);
                            prev.has(a.plaid_account_id) ? next.delete(a.plaid_account_id) : next.add(a.plaid_account_id);
                            return next;
                          });
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowAccountPicker(false); setSelectedPickerIds(new Set()); }}
                  className="flex-1 py-1.5 text-xs text-(--color-text-secondary) border border-(--color-border-default) rounded-md hover:text-(--color-text-primary) transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAddAccounts}
                  disabled={selectedPickerIds.size === 0 || pickerConfirming}
                  data-testid="confirm-add-accounts-btn"
                  className="flex-1 py-1.5 text-xs font-semibold bg-(--color-accent) text-(--color-base) rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {pickerConfirming
                    ? "Linking…"
                    : pickerRole === "savings"
                      ? "Set as savings"
                      : `Link ${selectedPickerIds.size > 0 ? selectedPickerIds.size : ""} account${selectedPickerIds.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Performance analytics */}
        <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md p-4 space-y-4" data-testid="analytics-section">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Performance</p>
            {scaledNeeded !== null && (
              <div className="flex gap-0.5 bg-(--color-surface) rounded-lg p-0.5">
                {(["daily", "weekly", "monthly", "quarterly"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setSavingsPeriod(p)}
                    className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${savingsPeriod === p ? "bg-(--color-overlay) text-(--color-text-primary)" : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"}`}
                  >
                    {p === "daily" ? "Day" : p === "weekly" ? "Wk" : p === "monthly" ? "Mo" : "Qtr"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {scaledNeeded !== null ? (
            <div className="space-y-3">
              {/* Hero metric cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-(--color-surface) rounded-md p-3 space-y-1">
                  <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Need to save</p>
                  <p className="text-xl font-semibold font-(--font-mono) text-(--color-text-primary) leading-tight">${formatMoney(scaledNeeded)}</p>
                  <p className="text-[10px] text-(--color-text-secondary)">per {periodLabel}</p>
                </div>
                {scaledRate !== null ? (
                  <div className={`rounded-md p-3 space-y-1 ${scaledRate >= scaledNeeded ? "bg-[rgba(34,197,94,0.08)]" : "bg-[rgba(245,158,11,0.08)]"}`}>
                    <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Your pace</p>
                    <p className={`text-xl font-semibold font-(--font-mono) leading-tight ${scaledRate >= scaledNeeded ? "text-(--color-success)" : "text-(--color-warning)"}`}>
                      ${formatMoney(scaledRate)}
                    </p>
                    <p className={`text-[10px] font-medium ${scaledRate >= scaledNeeded ? "text-(--color-success)" : "text-(--color-warning)"}`}>
                      {scaledRate >= scaledNeeded ? "✓ On track" : "↓ Behind"}
                    </p>
                  </div>
                ) : (
                  <div className="bg-(--color-surface) rounded-md p-3 space-y-1">
                    <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Your pace</p>
                    <p className="text-sm text-(--color-text-tertiary) pt-1">No history yet</p>
                  </div>
                )}
              </div>

              {totalDelayDays !== null && totalDelayDays > 0.5 && (
                <div className="px-3 py-2 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] rounded-md text-[11px] text-(--color-warning)">
                  Overspending delays your goal by ~{Math.round(totalDelayDays)} day{Math.round(totalDelayDays) !== 1 ? "s" : ""}.
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-(--color-text-tertiary)">No target date set — add one to see projections.</p>
          )}

          {/* Linked budgets sub-section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Linked budgets</p>
              {detailBudgets.length > 0 && !showInlineBudgetForm && (
                <button
                  onClick={() => setShowInlineBudgetForm(true)}
                  className="text-[10px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors flex items-center gap-1"
                  data-testid="inline-budget-btn"
                >
                  <Plus size={10} /> Link a budget
                </button>
              )}
            </div>

            {detailBudgets.length === 0 && !showInlineBudgetForm ? (
              <div className="space-y-2">
                <p className="text-xs text-(--color-text-tertiary)">No budgets linked yet.</p>
                <button
                  onClick={() => setShowInlineBudgetForm(true)}
                  className="flex items-center gap-1 text-xs text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                  data-testid="inline-budget-btn"
                >
                  <Plus size={11} /> Link a budget
                </button>
              </div>
            ) : detailBudgets.length > 0 && !showInlineBudgetForm ? (
              <div className="space-y-2.5">
                {detailBudgets.map(b => {
                  const overageDelay = (dailyNeeded != null && dailyNeeded > 0 && b.over_budget)
                    ? Math.round((b.amount_spent - b.total_limit) / dailyNeeded)
                    : 0;
                  return (
                    <div key={b.budget_id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: b.category_color }} />
                          <span className="text-(--color-text-primary)">{b.category_name}</span>
                          <span className="text-(--color-text-tertiary) capitalize text-[10px]">{b.period_type}</span>
                        </div>
                        <span className={`font-(--font-mono) text-[11px] ${b.over_budget ? "text-(--color-danger)" : "text-(--color-text-secondary)"}`}>
                          ${formatMoney(b.amount_spent)} / ${formatMoney(b.total_limit)}
                        </span>
                      </div>
                      <div className="h-1 bg-(--color-border-subtle) rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(b.percent_used, 100)}%`,
                            background: b.percent_used >= 100 ? "var(--color-danger)" : b.percent_used >= 75 ? "var(--color-warning)" : b.category_color,
                          }}
                        />
                      </div>
                      {b.over_budget && overageDelay > 0 && (
                        <p className="text-[10px] text-(--color-warning)">
                          Over by ${formatMoney(b.amount_spent - b.total_limit)} · delays goal ~{overageDelay} day{overageDelay !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Inline budget creation form */}
            {showInlineBudgetForm && (
              <div className="space-y-3 border-t border-(--color-border-subtle) pt-3" data-testid="inline-budget-form">
                <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {INLINE_BUDGET_CATEGORIES.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setInlineBudgetCategory(c.id)}
                      disabled={detailBudgets.some(b => b.category_name === c.name)}
                      className={`flex items-center px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                        inlineBudgetCategory === c.id ? "text-(--color-text-primary)" : "border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary)"
                      }`}
                      style={inlineBudgetCategory === c.id ? { borderColor: c.color, background: c.color + "22" } : {}}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-1.5">Monthly limit</p>
                  <div className="flex items-center gap-2">
                    <span className="text-(--color-text-secondary)">$</span>
                    <input
                      value={inlineBudgetAmount}
                      onChange={e => setInlineBudgetAmount(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      min="1"
                      step="0.01"
                      className="flex-1 bg-(--color-surface) border border-(--color-border-default) rounded-md px-3 py-2 text-sm text-(--color-text-primary) placeholder-(--color-text-disabled) focus:outline-none focus:border-(--color-border-strong)"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowInlineBudgetForm(false); setInlineBudgetCategory(null); setInlineBudgetAmount(""); }}
                    className="flex-1 py-1.5 text-xs text-(--color-text-secondary) border border-(--color-border-default) rounded-md hover:text-(--color-text-primary) transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addInlineBudget}
                    disabled={!inlineBudgetCategory || !inlineBudgetAmount || inlineBudgetSaving}
                    className="flex-1 py-1.5 text-xs font-semibold bg-(--color-accent) text-(--color-base) rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity"
                    data-testid="inline-budget-save-btn"
                  >
                    {inlineBudgetSaving ? "Saving…" : "Add budget"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Goals list ───────────────────────────────────────────────────────────────
  const activeGoals   = goals.filter(g => g.status !== "achieved");
  const achievedGoals = goals.filter(g => g.status === "achieved");
  const totalSaved  = activeGoals.reduce((s, g) => s + g.current_balance, 0);
  const totalTarget = activeGoals.reduce((s, g) => s + (g.target_amount ?? 0), 0);

  return (
    <>
      <div className="space-y-5">
        {goals.length > 0 && (() => {
          const n = totalTarget > 0 ? 3 : 2;
          return (
            <>
              {/* Mobile summary card */}
              <div className="lg:hidden rounded-2xl p-4 mb-4 border border-(--color-border-subtle) bg-(--color-elevated)">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Saved</span>
                    <span className={`text-[18px] font-semibold font-(--font-mono) ${totalSaved > 0 ? "text-(--color-success)" : "text-(--color-text-tertiary)"}`}>${formatMoney(totalSaved)}</span>
                  </div>
                  {totalTarget > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Target</span>
                      <span className="text-[18px] font-semibold font-(--font-mono) text-(--color-text-primary)">${formatMoney(totalTarget)}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-tertiary)">Active</span>
                    <span className="text-[18px] font-semibold font-(--font-mono) text-(--color-text-primary)">{String(activeGoals.length)}</span>
                  </div>
                </div>
              </div>
              {/* Desktop stat cards */}
              <div className={`hidden lg:grid gap-3 mb-5 ${{ 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' }[n] ?? 'lg:grid-cols-2'}`}>
                <StatCard
                  label="Total Saved"
                  value={`$${formatMoney(totalSaved)}`}
                  variant={totalSaved > 0 ? "success" : "muted"}
                />
                {totalTarget > 0 && (
                  <StatCard label="Total Target" value={`$${formatMoney(totalTarget)}`} />
                )}
                <StatCard label="Active Goals" value={String(activeGoals.length)} />
              </div>
            </>
          );
        })()}

        {goals.length === 0 && (
          <div className="text-center py-20 text-(--color-text-secondary)">
            <div className="w-16 h-16 rounded-xl bg-(--color-elevated) border border-(--color-border-default) flex items-center justify-center mx-auto mb-5">
              <Target size={28} className="text-(--color-text-tertiary)" />
            </div>
            <p className="text-(--color-text-primary) font-semibold text-base mb-2">No savings goals yet</p>
            <p className="text-sm mb-6 max-w-xs mx-auto">Create a goal to start tracking your savings progress.</p>
            <button onClick={() => openCreate()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-(--color-accent) text-(--color-base) text-sm font-semibold rounded-md hover:opacity-90 transition-opacity mx-auto">
              <Plus size={14} /> Create your first goal
            </button>
          </div>
        )}

        {activeGoals.length > 0 && (
          <div className="space-y-3">
            {activeGoals.map(g => (
              <GoalCard
                key={g.id}
                goal={g}
                onSync={() => syncGoal(g.id)}
                onPause={() => pauseGoal(g.id, g.status)}
                onDelete={() => deleteGoal(g.id)}
                onEdit={() => openCreate(g)}
                onOpen={() => openDetail(g.id)}
                isNew={g.id === newGoalId}
              />
            ))}
          </div>
        )}

        {goals.length > 0 && (
          <button onClick={() => openCreate()} className="flex items-center gap-2 px-4 py-2 bg-(--color-overlay) text-(--color-text-primary) text-sm font-medium rounded-md hover:bg-(--color-elevated) transition-colors border border-(--color-border-default)">
            <Plus size={13} /> Add goal
          </button>
        )}

        {achievedGoals.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-medium text-(--color-text-secondary) uppercase tracking-widest px-1">Achieved</p>
            {achievedGoals.map(g => (
              <GoalCard
                key={g.id}
                goal={g}
                onSync={() => syncGoal(g.id)}
                onPause={() => pauseGoal(g.id, g.status)}
                onDelete={() => deleteGoal(g.id)}
                onEdit={() => openCreate(g)}
                onOpen={() => openDetail(g.id)}
                isNew={g.id === newGoalId}
              />
            ))}
          </div>
        )}
      </div>

      {wizardOpen && (
        <GoalWizard
          activeContext={activeContext}
          onClose={() => setWizardOpen(false)}
          onCreated={(goalId) => {
            setNewGoalId(goalId);
            setWizardOpen(false);
            loadGoals().then(() => {
              setTimeout(() => setNewGoalId(null), 1500);
            });
          }}
        />
      )}
    </>
  );
});

export default GoalsPanel;

// Credit cards are not eligible as savings accounts
function isCredit(a: PlaidAccountInfo): boolean {
  return a.account_subtype === "credit" || a.account_subtype === "credit card";
}
