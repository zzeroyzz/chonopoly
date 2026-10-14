"use client";

import { useEffect, useRef, useState } from "react";
import { X, Building2, ChevronRight, RefreshCw } from "lucide-react";
import { PlaidAccountInfo, ActiveContext } from "@/lib/goals/types";
import { formatMoney, CATEGORY_META } from "../budget/types";

const GOAL_ICONS = ["🎯", "🏠", "🚗", "✈️", "💍", "🎓", "💻", "🌴", "🏋️", "💰", "🛒", "🎁"];

const STEP6_CATEGORIES = Object.entries(CATEGORY_META)
  .filter(([key]) => !["TRANSFER_IN", "TRANSFER_OUT", "OTHER"].includes(key))
  .map(([key, m]) => ({ id: key, name: m.label, color: m.hex }));

function computePeriodBounds(periodType: "daily" | "weekly" | "monthly" | "quarterly"): { period_start: string; period_end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  switch (periodType) {
    case "daily":
      return { period_start: toISO(now), period_end: toISO(now) };
    case "weekly": {
      const dow = (now.getDay() + 6) % 7;
      const monday = new Date(now); monday.setDate(now.getDate() - dow);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { period_start: toISO(monday), period_end: toISO(sunday) };
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { period_start: toISO(start), period_end: toISO(end) };
    }
    case "monthly":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { period_start: toISO(start), period_end: toISO(end) };
    }
  }
}

function CheckMark() {
  return (
    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
      <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccountRow({ account, selected, onToggle }: {
  account: PlaidAccountInfo;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
        selected ? "border-white/30 bg-white/8" : "border-[#2e2e38] hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Building2 size={13} className="text-[#7a7870] shrink-0" />
        <div>
          <p className="text-xs font-medium text-white">{account.account_name}</p>
          <p className="text-[10px] text-[#55534e]">
            {account.institution_name}{account.account_subtype ? ` · ${account.account_subtype}` : ""}
          </p>
        </div>
      </div>
      {selected && (
        <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center shrink-0">
          <CheckMark />
        </div>
      )}
    </button>
  );
}

function isCredit(a: PlaidAccountInfo): boolean {
  return a.account_subtype === "credit" || a.account_subtype === "credit card";
}

interface GoalWizardProps {
  onClose: () => void;
  onCreated: (goalId: string) => void;
  activeContext: ActiveContext;
  skipBudgetStep?: boolean;
  zIndex?: number;
}

export default function GoalWizard({ onClose, onCreated, activeContext, skipBudgetStep = false, zIndex = 50 }: GoalWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [phase, setPhase] = useState<"idle" | "exiting" | "entering">("idle");
  const nextStepRef = useRef<number>(1);

  // Goal fields
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [savingsAccount, setSavingsAccount] = useState<PlaidAccountInfo | null>(null);
  const [spendingIds, setSpendingIds] = useState<Set<string>>(new Set());

  const [accounts, setAccounts] = useState<PlaidAccountInfo[]>([]);
  const [accLoading, setAccLoading] = useState(false);
  const [accLoaded, setAccLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  // Step 6 — optional budget creation after goal is saved
  const [createdGoalId, setCreatedGoalId] = useState<string | null>(null);
  const [addedBudgets, setAddedBudgets] = useState<{ categoryId: string; categoryName: string; limit: number; periodType: string }[]>([]);
  const [budgetCategoryId, setBudgetCategoryId] = useState<string | null>(null);
  const [budgetPeriodType, setBudgetPeriodType] = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);

  const step4Initialized = useRef(false);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (step >= 3 && !accLoaded && !accLoading) {
      setAccLoading(true);
      fetch("/api/plaid/accounts")
        .then(r => r.ok ? r.json() : { accounts: [] })
        .then(d => { setAccounts(d.accounts ?? []); setAccLoaded(true); setAccLoading(false); })
        .catch(() => setAccLoading(false));
    }
  }, [step, accLoaded, accLoading]);

  useEffect(() => {
    if (step === 4 && !step4Initialized.current && accounts.length > 0) {
      step4Initialized.current = true;
      setSpendingIds(new Set(
        accounts
          .filter(a => a.plaid_account_id !== savingsAccount?.plaid_account_id)
          .map(a => a.plaid_account_id)
      ));
    }
  }, [step, accounts, savingsAccount]);

  function advance(targetStep: number, dir: "forward" | "back") {
    if (phase !== "idle") return;
    nextStepRef.current = targetStep;
    setDirection(dir);
    setPhase("exiting");
  }

  function handleAnimEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (phase === "exiting") {
      setStep(nextStepRef.current as 1 | 2 | 3 | 4 | 5 | 6);
      setPhase("entering");
    } else if (phase === "entering") {
      setPhase("idle");
    }
  }

  function handleClose() {
    // Goal already created on step 6 — closing is equivalent to skipping budgets
    if (step === 6 && createdGoalId) {
      onCreated(createdGoalId);
      return;
    }
    if (name.length > 0) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  }

  async function submit() {
    if (!savingsAccount) return;
    setSaving(true);
    setError(null);
    const body = {
      name,
      icon,
      target_amount: targetAmount ? Number(targetAmount) : null,
      target_date: targetDate || null,
      savings_account: {
        plaid_account_id: savingsAccount.plaid_account_id,
        plaid_item_id: savingsAccount.plaid_item_id,
      },
      spending_accounts: accounts
        .filter(a => spendingIds.has(a.plaid_account_id))
        .map(a => ({ plaid_account_id: a.plaid_account_id, plaid_item_id: a.plaid_item_id })),
      context_type: activeContext.type,
      context_id: activeContext.id,
    };
    const res = await fetch("/api/goals/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const d = await res.json();
      setCreatedGoalId(d.goal_id as string);
      setSaving(false);
      if (skipBudgetStep) {
        onCreated(d.goal_id as string);
      } else {
        advance(6, "forward");
      }
    } else {
      const d: unknown = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "Something went wrong");
      setSaving(false);
    }
  }

  async function addBudget() {
    if (!budgetCategoryId || !createdGoalId) return;
    const limit = parseFloat(budgetAmount);
    if (isNaN(limit) || limit <= 0) return;
    setBudgetSaving(true);
    const { period_start, period_end } = computePeriodBounds(budgetPeriodType);
    const categoryMeta = CATEGORY_META[budgetCategoryId];
    await fetch("/api/budget/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: createdGoalId,
        category_id: budgetCategoryId,
        total_limit: limit,
        rollover_enabled: false,
        period_type: budgetPeriodType,
        period_start,
        period_end,
        recurring: true,
        context_type: activeContext.type,
        context_id: activeContext.id,
      }),
    });
    setAddedBudgets(prev => [...prev, {
      categoryId: budgetCategoryId,
      categoryName: categoryMeta?.label ?? budgetCategoryId,
      limit,
      periodType: budgetPeriodType,
    }]);
    setBudgetCategoryId(null);
    setBudgetAmount("");
    setBudgetSaving(false);
  }

  const stepClass =
    phase === "exiting"
      ? (direction === "forward" ? "wizard-exit-forward" : "wizard-exit-back")
      : phase === "entering"
        ? (direction === "forward" ? "wizard-enter-forward" : "wizard-enter-back")
        : "";

  const eligibleSavings  = accounts.filter(a => !isCredit(a));
  const eligibleSpending = accounts.filter(a => a.plaid_account_id !== savingsAccount?.plaid_account_id);

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="space-y-5">
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-3">Choose an icon</p>
              <div className="flex flex-wrap gap-2">
                {GOAL_ICONS.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIcon(e)}
                    className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center border transition-colors ${
                      icon === e ? "border-white/40 bg-white/10" : "border-[#2e2e38] hover:border-white/20"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Goal name</p>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Emergency fund, New car, Vacation"
                className="w-full bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => advance(2, "forward")}
                disabled={name.length < 2}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-1">What&apos;s your target?</p>
              <p className="text-xs text-[#7a7870]">Both are optional — skip if this is an ongoing goal.</p>
            </div>
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Target amount</p>
              <div className="flex items-center gap-2">
                <span className="text-[#7a7870]">$</span>
                <input
                  value={targetAmount}
                  onChange={e => setTargetAmount(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  min="1"
                  step="0.01"
                  className="flex-1 bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
                />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Target date</p>
              <input
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                type="date"
                min={today}
                className="w-full bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 scheme-dark"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => advance(1, "back")}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => advance(3, "forward")}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
              >
                {targetAmount || targetDate ? "Next →" : "Skip for now"}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Where are you saving to?</p>
              <p className="text-xs text-[#7a7870]">Pick the account where your savings will live.</p>
            </div>
            {accLoading ? (
              <div className="flex items-center gap-2 text-[#55534e] text-xs py-4">
                <RefreshCw size={12} className="animate-spin" /> Loading accounts…
              </div>
            ) : eligibleSavings.length === 0 ? (
              <p className="text-xs text-[#55534e] py-4">
                No eligible savings accounts found. Connect a checking or savings account first.
              </p>
            ) : (
              <div className="space-y-2">
                {eligibleSavings.map(a => (
                  <AccountRow
                    key={a.plaid_account_id}
                    account={a}
                    selected={savingsAccount?.plaid_account_id === a.plaid_account_id}
                    onToggle={() => {
                      setSavingsAccount(a);
                      setSpendingIds(prev => {
                        const next = new Set(prev);
                        next.delete(a.plaid_account_id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => advance(2, "back")}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => advance(4, "forward")}
                disabled={!savingsAccount}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        );

      case 4: {
        const allSelected = eligibleSpending.length > 0 &&
          eligibleSpending.every(a => spendingIds.has(a.plaid_account_id));
        return (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Which accounts track spending?</p>
              <p className="text-xs text-[#7a7870]">We&apos;ll watch these for transactions that count against your budgets.</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest">Accounts</p>
              {eligibleSpending.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (allSelected) {
                      setSpendingIds(new Set());
                    } else {
                      setSpendingIds(new Set(eligibleSpending.map(a => a.plaid_account_id)));
                    }
                  }}
                  className="text-[10px] text-[#7a7870] hover:text-white transition-colors"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            {accLoading ? (
              <div className="flex items-center gap-2 text-[#55534e] text-xs">
                <RefreshCw size={12} className="animate-spin" /> Loading…
              </div>
            ) : eligibleSpending.length === 0 ? (
              <p className="text-xs text-[#55534e]">No additional accounts available for spending tracking.</p>
            ) : (
              <div className="space-y-2">
                {eligibleSpending.map(a => (
                  <AccountRow
                    key={a.plaid_account_id}
                    account={a}
                    selected={spendingIds.has(a.plaid_account_id)}
                    onToggle={() => {
                      setSpendingIds(prev => {
                        const next = new Set(prev);
                        prev.has(a.plaid_account_id) ? next.delete(a.plaid_account_id) : next.add(a.plaid_account_id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => advance(3, "back")}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => advance(5, "forward")}
                disabled={spendingIds.size === 0}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors"
              >
                Review →
              </button>
            </div>
          </div>
        );
      }

      case 5: {
        const spendingAccounts = accounts.filter(a => spendingIds.has(a.plaid_account_id));
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Looks good?</p>
              <p className="text-xs text-[#7a7870]">Review your goal before creating it.</p>
            </div>

            <div className="bg-[#1a1a20] border border-[#2e2e38] rounded-xl divide-y divide-[#2e2e38]">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{name}</p>
                    {(targetAmount || targetDate) && (
                      <p className="text-xs text-[#7a7870]">
                        {targetAmount ? `$${formatMoney(Number(targetAmount))}` : ""}
                        {targetAmount && targetDate ? " · " : ""}
                        {targetDate
                          ? `by ${new Date(targetDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => advance(2, "back")}
                  className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Savings account</p>
                  <button
                    onClick={() => advance(3, "back")}
                    className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                  >
                    Edit <ChevronRight size={10} />
                  </button>
                </div>
                {savingsAccount && (
                  <div className="flex items-center gap-2">
                    <Building2 size={12} className="text-[#7a7870] shrink-0" />
                    <div>
                      <p className="text-xs text-white">{savingsAccount.account_name}</p>
                      <p className="text-[10px] text-[#55534e]">
                        {savingsAccount.institution_name}
                        {savingsAccount.account_subtype ? ` · ${savingsAccount.account_subtype}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest">
                    Spending accounts ({spendingAccounts.length})
                  </p>
                  <button
                    onClick={() => advance(4, "back")}
                    className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                  >
                    Edit <ChevronRight size={10} />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {spendingAccounts.map(a => (
                    <div key={a.plaid_account_id} className="flex items-center gap-2">
                      <Building2 size={12} className="text-[#7a7870] shrink-0" />
                      <div>
                        <p className="text-xs text-white">{a.account_name}</p>
                        <p className="text-[10px] text-[#55534e]">
                          {a.institution_name}
                          {a.account_subtype ? ` · ${a.account_subtype}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => advance(4, "back")}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={createdGoalId ? () => advance(6, "forward") : submit}
                disabled={saving || !!createdGoalId}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-50 hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                data-testid="wizard-create-btn"
              >
                {saving
                  ? <><RefreshCw size={13} className="animate-spin" /> Creating…</>
                  : createdGoalId ? "Goal created ✓" : "Create goal"}
              </button>
            </div>
          </div>
        );
      }

      case 6: {
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Add budgets to this goal</p>
              <p className="text-xs text-[#7a7870]">Leftover from each budget flows toward this goal. You can skip and set these up later.</p>
            </div>

            {addedBudgets.length > 0 && (
              <div className="space-y-1.5">
                {addedBudgets.map((b, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-[#1a1a20] border border-[#2e2e38] rounded-lg">
                    <span className="text-xs text-white">{b.categoryName}</span>
                    <div className="flex items-center gap-2 text-xs text-[#7a7870]">
                      <span className="capitalize">{b.periodType}</span>
                      <span className="font-(--font-mono) text-white">${formatMoney(b.limit)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                {STEP6_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setBudgetCategoryId(c.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      budgetCategoryId === c.id ? "text-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white"
                    }`}
                    style={budgetCategoryId === c.id ? { borderColor: c.color, background: c.color + "22" } : {}}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Period</p>
              <div className="flex gap-2">
                {(["daily", "weekly", "monthly", "quarterly"] as const).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setBudgetPeriodType(pt)}
                    className={`flex-1 py-1.5 text-xs rounded-full border transition-colors capitalize ${
                      budgetPeriodType === pt
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-[#2e2e38] text-[#7a7870] hover:text-white"
                    }`}
                  >
                    {pt.charAt(0).toUpperCase() + pt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Limit</p>
              <div className="flex items-center gap-2">
                <span className="text-[#7a7870]">$</span>
                <input
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  min="1"
                  step="0.01"
                  className="flex-1 bg-[#111115] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={addBudget}
              disabled={!budgetCategoryId || !budgetAmount || budgetSaving}
              className="w-full py-2 text-sm font-medium border border-[#2e2e38] rounded-xl text-[#7a7870] hover:text-white disabled:opacity-30 transition-colors"
            >
              {budgetSaving ? "Adding…" : "+ Add budget"}
            </button>

            <button
              type="button"
              data-testid="wizard-finish-btn"
              onClick={() => createdGoalId && onCreated(createdGoalId)}
              className="w-full py-2.5 text-sm font-semibold bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
            >
              {addedBudgets.length === 0 ? "Skip for now" : "Done →"}
            </button>
          </div>
        );
      }
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }} data-testid="goal-wizard">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative bg-[#111115] rounded-2xl w-full max-w-md max-h-[85vh] overflow-auto wizard-pop-in">

        {/* Discard overlay — not shown on step 6 since the goal is already saved */}
        {showDiscard && step !== 6 && (
          <div className="absolute inset-0 bg-[#111115] flex flex-col items-center justify-center z-10 rounded-2xl p-6">
            <p className="text-white font-semibold mb-2">Discard this goal?</p>
            <p className="text-sm text-[#7a7870] mb-6 text-center max-w-xs">
              Your progress won&apos;t be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiscard(false)}
                className="px-5 py-2 text-sm border border-[#2e2e38] rounded-lg text-[#7a7870] hover:text-white transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm bg-white text-black rounded-lg font-semibold hover:bg-white/90 transition-colors"
                data-testid="discard-confirm-btn"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-base font-semibold text-white">
            {step === 6 ? "One more thing…" : "New savings goal"}
          </p>
          <button
            onClick={handleClose}
            className="text-[#55534e] hover:text-white transition-colors"
            data-testid="wizard-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress dots — 6 steps */}
        <div className="flex items-center justify-center gap-2 py-4" data-testid="wizard-progress">
          {([1, 2, 3, 4, 5, 6] as const).map(n => (
            <div
              key={n}
              className="rounded-full bg-white transition-all duration-200"
              style={{
                width: n === step ? 8 : 4,
                height: n === step ? 8 : 4,
                opacity: n === step ? 1 : 0.25,
              }}
            />
          ))}
        </div>

        {/* Animated step content */}
        <div
          className={`px-5 pb-8 ${stepClass}`}
          onAnimationEnd={handleAnimEnd}
          data-testid="wizard-step-content"
        >
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
